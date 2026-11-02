import { buildCheckoutUrl, pickSiteDomain } from "./checkout.js";
import { collectPageText, type TextSegment } from "./designer/page-text.js";
import { loadDictionary } from "./dictionary.js";
import { clearIgnored, readIgnored, rememberIgnored } from "./ignore-list.js";
import {
  findIssues,
  rankSuggestions,
  type Issue,
} from "./spellcheck/tokenizer.js";

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Site Spell Checker markup is missing ${selector}.`);
  }
  return element;
}

const pageName = required<HTMLElement>("#page-name");
const checkButton = required<HTMLButtonElement>("#check");
const status = required<HTMLElement>("#status");
const results = required<HTMLElement>("#results");
const cta = required<HTMLElement>("#cta");
const ctaCopy = required<HTMLElement>("#cta-copy");
const ctaLink = required<HTMLAnchorElement>("#cta-link");
const clearIgnoredButton = required<HTMLButtonElement>("#clear-ignored");

let siteId = "";
let busy = false;
let viewGeneration = 0;
let resultsTruncated = false;

function designerAvailable(): boolean {
  return typeof webflow !== "undefined" && typeof webflow.getAllElements === "function";
}

function setStatus(message: string): void {
  status.textContent = message;
}

function issueCountLabel(count: number): string {
  return count === 1 ? "1 possible issue on this page." : `${count} possible issues on this page.`;
}

function syncCheckButton(): void {
  checkButton.disabled = busy || !designerAvailable() || siteId === "";
}

async function loadSite(): Promise<boolean> {
  if (!designerAvailable()) {
    return false;
  }
  try {
    const site = await webflow.getSiteInfo();
    if (!site.siteId) {
      return false;
    }
    siteId = site.siteId;
    ctaLink.href = buildCheckoutUrl(pickSiteDomain(site));
    return true;
  } catch {
    return false;
  }
}

async function refreshLabel(): Promise<void> {
  if (!designerAvailable()) {
    pageName.textContent = "Open this app from the Webflow Designer. English (US).";
    return;
  }
  try {
    const component = await webflow.getCurrentComponent();
    if (component) {
      const settings = await component.getSettings();
      pageName.textContent = `Component: ${settings.name}. English (US).`;
    } else {
      const page = await webflow.getCurrentPage();
      const name = await page.getName();
      pageName.textContent = `${name}. English (US). This page only.`;
    }
  } catch {
    pageName.textContent = "English (US). This page only.";
  }
}

async function refreshHeader(): Promise<void> {
  syncCheckButton();
  await refreshLabel();
  if (!siteId) {
    await loadSite();
  }
  syncCheckButton();
}

function renderIssues(issues: Issue[], segments: TextSegment<AnyElement>[]): void {
  results.replaceChildren();
  if (issues.length === 0) {
    return;
  }
  const list = document.createElement("ul");
  list.className = "issues";
  for (const issue of issues) {
    list.append(renderIssue(issue, segments));
  }
  results.append(list);
}

function renderIssue(issue: Issue, segments: TextSegment<AnyElement>[]): HTMLLIElement {
  const item = document.createElement("li");
  const head = document.createElement("div");
  head.className = "issue-head";
  const word = document.createElement("strong");
  word.textContent = issue.word;
  head.append(word);
  if (issue.count > 1) {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = `×${issue.count}`;
    head.append(badge);
  }
  const location = issue.locations[0];
  if (location) {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = location.label;
    head.append(badge);
  }
  item.append(head);
  if (location?.context) {
    const context = document.createElement("p");
    context.className = "context";
    context.textContent = location.context;
    item.append(context);
  }
  const suggestionLine = document.createElement("p");
  suggestionLine.className = "suggestions";
  suggestionLine.hidden = true;
  const actions = document.createElement("div");
  actions.className = "actions";
  const suggest = document.createElement("button");
  suggest.type = "button";
  suggest.textContent = "Suggest";
  suggest.addEventListener("click", () => {
    suggestionLine.hidden = false;
    suggestionLine.textContent = "Finding suggestions…";
    window.setTimeout(() => {
      void loadDictionary()
        .then((checker) => {
          const list = rankSuggestions(issue.word, checker.suggest(issue.word, 10)).slice(0, 3);
          suggestionLine.textContent = list.length
            ? `Suggestions: ${list.join(", ")}`
            : "No suggestions";
        })
        .catch(() => {
          suggestionLine.textContent = "Suggestions could not be loaded.";
        });
    }, 30);
  });
  const ignore = document.createElement("button");
  ignore.type = "button";
  ignore.textContent = "Ignore";
  ignore.addEventListener("click", () => {
    if (!siteId) {
      setStatus("This site could not be identified, so the word was not ignored.");
      return;
    }
    try {
      rememberIgnored(window.localStorage, siteId, issue.word);
    } catch {
      setStatus("This browser could not store the ignored word.");
      return;
    }
    item.remove();
    const remaining = results.querySelectorAll(".issues li").length;
    if (remaining === 0 && resultsTruncated) {
      setStatus("Shown issues are ignored. This list was partial. Check spelling again for the rest.");
      updateCta(0, true);
    } else if (remaining === 0) {
      setStatus("No spelling issues left on this page.");
      updateCta(0, false);
    } else {
      setStatus(issueCountLabel(remaining));
    }
    clearIgnoredButton.hidden = readIgnored(window.localStorage, siteId).length === 0;
  });
  actions.append(suggest, ignore);
  const element = segments.find((entry) => entry.id === location?.segmentId)?.element;
  if (element && designerAvailable()) {
    const show = document.createElement("button");
    show.type = "button";
    show.textContent = "Show on canvas";
    show.addEventListener("click", () => {
      void webflow.setSelectedElement(element).catch(() => {
        void webflow.notify({
          type: "Error",
          message: "That text could not be selected on the canvas.",
        });
      });
    });
    actions.append(show);
  }
  item.append(actions, suggestionLine);
  return item;
}

function updateCta(issueCount: number | null, incomplete = false): void {
  cta.hidden = false;
  if (issueCount === null) {
    ctaCopy.textContent =
      "This check covers the page open in the Designer. A full-site scan checks every published page.";
    return;
  }
  if (incomplete) {
    ctaCopy.textContent =
      "This check is incomplete. A full-site scan checks every published page.";
    return;
  }
  ctaCopy.textContent =
    issueCount === 0
      ? "This page looks clean. A full-site scan checks every published page."
      : `${issueCountLabel(issueCount)} A full-site scan checks every published page.`;
}

function unreadNote(unread: number): string {
  if (unread === 0) {
    return "";
  }
  return unread === 1 ? " 1 field was not read." : ` ${unread} fields were not read.`;
}

async function checkSpelling(): Promise<void> {
  if (busy || !designerAvailable()) {
    return;
  }
  busy = true;
  const generation = viewGeneration;
  syncCheckButton();
  results.replaceChildren();
  resultsTruncated = false;
  setStatus("Reading this page…");
  try {
    if (!siteId) {
      const loaded = await loadSite();
      if (generation !== viewGeneration) {
        return;
      }
      if (!loaded) {
        setStatus("This site could not be identified, so spelling was not checked.");
        return;
      }
    }
    const component = await webflow.getCurrentComponent();
    if (generation !== viewGeneration) {
      return;
    }
    const collected = await collectPageText<AnyElement>(
      {
        getCurrentPage: () => webflow.getCurrentPage(),
        getAllElements: () => webflow.getAllElements(),
      },
      { includePageSettings: component === null },
    );
    if (generation !== viewGeneration) {
      return;
    }
    setStatus("Checking spelling…");
    const checker = await loadDictionary();
    if (generation !== viewGeneration) {
      return;
    }
    const ignored = readIgnored(window.localStorage, siteId);
    const scan = findIssues(
      collected.segments.map((entry) => ({
        id: entry.id,
        text: entry.text,
        role: entry.role,
        label: entry.label,
      })),
      checker,
      { ignore: ignored, suggestions: false },
    );
    if (generation !== viewGeneration) {
      return;
    }
    resultsTruncated = scan.truncated;
    const incomplete = scan.truncated || collected.unread > 0;
    renderIssues(scan.issues, collected.segments);
    const missed = unreadNote(collected.unread);
    if (scan.truncated) {
      setStatus(
        `${issueCountLabel(scan.issues.length)} This list is partial. Check spelling again after you review these.${missed}`,
      );
    } else if (collected.segments.length === 0 && collected.unread > 0) {
      setStatus(`Page text could not be read.${missed}`);
    } else if (collected.segments.length === 0) {
      setStatus("No text found in the open Designer view.");
    } else if (scan.issues.length === 0 && collected.unread > 0) {
      setStatus(`No spelling issues in the text that could be read.${missed}`);
    } else if (scan.issues.length === 0) {
      setStatus("No spelling issues found on this page.");
    } else {
      setStatus(`${issueCountLabel(scan.issues.length)}${missed}`);
    }
    updateCta(scan.issues.length, incomplete);
    clearIgnoredButton.hidden = ignored.length === 0;
  } catch (error) {
    if (generation !== viewGeneration) {
      return;
    }
    const message =
      error instanceof Error ? error.message : "Spell check could not be completed.";
    setStatus(message);
    if (designerAvailable()) {
      void webflow.notify({ type: "Error", message });
    }
  } finally {
    busy = false;
    syncCheckButton();
  }
}

checkButton.addEventListener("click", () => {
  void checkSpelling();
});

clearIgnoredButton.addEventListener("click", () => {
  if (!siteId) {
    setStatus("This site could not be identified, so ignored words were not cleared.");
    return;
  }
  clearIgnored(window.localStorage, siteId);
  clearIgnoredButton.hidden = true;
  setStatus("Ignored words cleared for this site in this browser.");
});

function leaveView(message: string): void {
  viewGeneration += 1;
  resultsTruncated = false;
  results.replaceChildren();
  setStatus(message);
  updateCta(null);
  void refreshHeader();
}

updateCta(null);
checkButton.disabled = true;
void refreshHeader();

if (designerAvailable()) {
  webflow.subscribe("currentpage", () => {
    leaveView("");
  });
  webflow.subscribe("currentcmsitem", () => {
    leaveView("The open CMS item changed. Check spelling again for this view.");
  });
}
