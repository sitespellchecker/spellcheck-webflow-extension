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

function designerAvailable(): boolean {
  return typeof webflow !== "undefined" && typeof webflow.getAllElements === "function";
}

function setStatus(message: string): void {
  status.textContent = message;
}

function issueCountLabel(count: number): string {
  return count === 1 ? "1 possible issue on this page." : `${count} possible issues on this page.`;
}

async function refreshHeader(): Promise<void> {
  if (!designerAvailable()) {
    pageName.textContent = "Open this app from the Webflow Designer. English (US).";
    checkButton.disabled = true;
    return;
  }
  checkButton.disabled = false;
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
    const site = await webflow.getSiteInfo();
    siteId = site.siteId;
    ctaLink.href = buildCheckoutUrl(pickSiteDomain(site));
  } catch {
    pageName.textContent = "English (US). This page only.";
  }
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
    try {
      rememberIgnored(window.localStorage, siteId, issue.word);
    } catch {
      setStatus("This browser could not store the ignored word.");
    }
    item.remove();
    const remaining = results.querySelectorAll(".issues li").length;
    setStatus(
      remaining === 0
        ? "No spelling issues left on this page."
        : issueCountLabel(remaining),
    );
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

function updateCta(issueCount: number | null): void {
  cta.hidden = false;
  if (issueCount === null) {
    ctaCopy.textContent =
      "This check covers the page open in the Designer. A full-site scan checks every published page.";
    return;
  }
  ctaCopy.textContent =
    issueCount === 0
      ? "This page looks clean. A full-site scan checks every published page."
      : `${issueCountLabel(issueCount)} A full-site scan checks every published page.`;
}

async function checkSpelling(): Promise<void> {
  if (busy || !designerAvailable()) {
    return;
  }
  busy = true;
  checkButton.disabled = true;
  results.replaceChildren();
  setStatus("Reading this page…");
  try {
    const component = await webflow.getCurrentComponent();
    const collected = await collectPageText<AnyElement>(
      {
        getCurrentPage: () => webflow.getCurrentPage(),
        getAllElements: () => webflow.getAllElements(),
      },
      { includePageSettings: component === null },
    );
    setStatus("Checking spelling…");
    const checker = await loadDictionary();
    const ignored = readIgnored(window.localStorage, siteId);
    const issues = findIssues(
      collected.segments.map((entry) => ({
        id: entry.id,
        text: entry.text,
        role: entry.role,
        label: entry.label,
      })),
      checker,
      { ignore: ignored, suggestions: false },
    );
    renderIssues(issues, collected.segments);
    const unread =
      collected.unread > 0 ? ` ${collected.unread} elements could not be read.` : "";
    if (collected.segments.length === 0) {
      setStatus(`No text found in the open Designer view.${unread}`);
    } else if (issues.length === 0) {
      setStatus(`No spelling issues found on this page.${unread}`);
    } else {
      setStatus(`${issueCountLabel(issues.length)}${unread}`);
    }
    updateCta(issues.length);
    clearIgnoredButton.hidden = ignored.length === 0;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Spell check could not be completed.";
    setStatus(message);
    if (designerAvailable()) {
      void webflow.notify({ type: "Error", message });
    }
  } finally {
    busy = false;
    checkButton.disabled = false;
  }
}

checkButton.addEventListener("click", () => {
  void checkSpelling();
});

clearIgnoredButton.addEventListener("click", () => {
  clearIgnored(window.localStorage, siteId);
  clearIgnoredButton.hidden = true;
  setStatus("Ignored words cleared for this site in this browser.");
});

updateCta(null);
void refreshHeader();

if (designerAvailable()) {
  webflow.subscribe("currentpage", () => {
    results.replaceChildren();
    setStatus("");
    updateCta(null);
    void refreshHeader();
  });
  webflow.subscribe("currentcmsitem", () => {
    results.replaceChildren();
    setStatus("The open CMS item changed. Check spelling again for this view.");
    updateCta(null);
  });
}
