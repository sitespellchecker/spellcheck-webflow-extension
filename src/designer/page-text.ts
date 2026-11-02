export interface CopyAttribute {
  name: string | null;
  value: string | null;
}

export interface CopyProp {
  valueType: string;
  resolvedValue: unknown;
  display: { label: string };
}

export interface CopyElement {
  id?: { component?: string; element?: string };
  type: string;
  getText?: () => Promise<string | null>;
  getAltText?: () => Promise<string>;
  getResolvedAttributes?: () => Promise<CopyAttribute[]>;
  getSettings?: () => Promise<Record<string, unknown>>;
  searchProps?: () => Promise<CopyProp[]>;
}

export interface PageSettingsSource {
  getTitle?: () => Promise<string>;
  getDescription?: () => Promise<string>;
  usesTitleAsSearchTitle?: () => Promise<boolean>;
  getSearchTitle?: () => Promise<string>;
  usesDescriptionAsSearchDescription?: () => Promise<boolean>;
  getSearchDescription?: () => Promise<string>;
  usesTitleAsOpenGraphTitle?: () => Promise<boolean>;
  getOpenGraphTitle?: () => Promise<string>;
  usesDescriptionAsOpenGraphDescription?: () => Promise<boolean>;
  getOpenGraphDescription?: () => Promise<string>;
}

export interface PageTextSource<T extends CopyElement = CopyElement> {
  getCurrentPage: () => Promise<PageSettingsSource | null>;
  getAllElements: () => Promise<T[]>;
}

export interface TextSegment<T = CopyElement> {
  id: string;
  text: string;
  role: "title" | "body";
  label: string;
  element: T | null;
}

export interface CollectedPage<T = CopyElement> {
  segments: TextSegment<T>[];
  unread: number;
}

const FORM_TYPES = new Set(["FormButton", "FormTextInput", "FormTextarea"]);
const FORM_TEXT_KEYS = ["text", "placeholder", "waitingText", "buttonText"];
const COPY_ATTRIBUTES = new Set(["placeholder", "aria-label", "alt", "title"]);
const TEXT_PROP_TYPES = new Set(["string", "textContent", "altText"]);
const SKIP_ALT = new Set(["decorative", "inherit"]);

export function hasCopy(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function textFromResolvedValue(
  valueType: string,
  value: unknown,
): string | null {
  if (TEXT_PROP_TYPES.has(valueType) && typeof value === "string") {
    if (valueType === "altText" && SKIP_ALT.has(value.trim().toLowerCase())) {
      return null;
    }
    return hasCopy(value) ? value : null;
  }
  if (
    valueType === "richText" &&
    value &&
    typeof value === "object" &&
    "innerText" in value &&
    typeof value.innerText === "string" &&
    hasCopy(value.innerText)
  ) {
    return value.innerText;
  }
  if (
    valueType === "video" &&
    value &&
    typeof value === "object" &&
    "title" in value &&
    typeof value.title === "string" &&
    hasCopy(value.title)
  ) {
    return value.title;
  }
  return null;
}

export function stringsFromFormSettings(
  settings: Record<string, unknown>,
): string[] {
  const found: string[] = [];
  for (const key of FORM_TEXT_KEYS) {
    const value = settings[key];
    if (typeof value === "string" && hasCopy(value)) {
      found.push(value);
    }
  }
  return found;
}

export function stringsFromAttributes(attributes: readonly CopyAttribute[]): string[] {
  const found: string[] = [];
  for (const attribute of attributes) {
    const name = attribute.name?.toLowerCase() ?? "";
    if (COPY_ATTRIBUTES.has(name) && hasCopy(attribute.value)) {
      if (name === "alt" && SKIP_ALT.has(attribute.value.trim().toLowerCase())) {
        continue;
      }
      found.push(attribute.value);
    }
  }
  return found;
}

function elementKey(element: CopyElement, index: number): string {
  const id = element.id;
  if (id && typeof id.element === "string") {
    return `${id.component ?? ""}:${id.element}`;
  }
  return `${element.type}:${index}`;
}

function segment<T extends CopyElement>(
  id: string,
  text: string,
  role: "title" | "body",
  label: string,
  element: T | null,
): TextSegment<T> {
  return { id, text, role, label, element };
}

async function readOptional(read: (() => Promise<string>) | undefined): Promise<string> {
  if (!read) {
    return "";
  }
  try {
    return (await read()) ?? "";
  } catch {
    return "";
  }
}

async function readFlag(read: (() => Promise<boolean>) | undefined): Promise<boolean> {
  if (!read) {
    return true;
  }
  try {
    return await read();
  } catch {
    return true;
  }
}

async function pageSegments<T extends CopyElement>(
  page: PageSettingsSource | null,
): Promise<TextSegment<T>[]> {
  if (!page) {
    return [];
  }
  const segments: TextSegment<T>[] = [];
  const title = await readOptional(page.getTitle);
  if (hasCopy(title)) {
    segments.push(segment<T>("page:title", title, "title", "SEO title", null));
  }
  const description = await readOptional(page.getDescription);
  if (hasCopy(description)) {
    segments.push(
      segment<T>("page:description", description, "body", "SEO description", null),
    );
  }
  if (!(await readFlag(page.usesTitleAsSearchTitle))) {
    const searchTitle = await readOptional(page.getSearchTitle);
    if (hasCopy(searchTitle) && searchTitle.trim() !== title.trim()) {
      segments.push(
        segment<T>("page:search-title", searchTitle, "title", "Search title", null),
      );
    }
  }
  if (!(await readFlag(page.usesDescriptionAsSearchDescription))) {
    const searchDescription = await readOptional(page.getSearchDescription);
    if (hasCopy(searchDescription) && searchDescription.trim() !== description.trim()) {
      segments.push(
        segment<T>(
          "page:search-description",
          searchDescription,
          "body",
          "Search description",
          null,
        ),
      );
    }
  }
  if (!(await readFlag(page.usesTitleAsOpenGraphTitle))) {
    const openGraphTitle = await readOptional(page.getOpenGraphTitle);
    if (hasCopy(openGraphTitle) && openGraphTitle.trim() !== title.trim()) {
      segments.push(
        segment<T>("page:og-title", openGraphTitle, "title", "Social title", null),
      );
    }
  }
  if (!(await readFlag(page.usesDescriptionAsOpenGraphDescription))) {
    const openGraphDescription = await readOptional(page.getOpenGraphDescription);
    if (
      hasCopy(openGraphDescription) &&
      openGraphDescription.trim() !== description.trim()
    ) {
      segments.push(
        segment<T>(
          "page:og-description",
          openGraphDescription,
          "body",
          "Social description",
          null,
        ),
      );
    }
  }
  return segments;
}

async function elementSegments<T extends CopyElement>(
  element: T,
  index: number,
  seen: Set<string>,
): Promise<TextSegment<T>[]> {
  const key = elementKey(element, index);
  const segments: TextSegment<T>[] = [];
  if (element.type === "String" && element.getText) {
    if (seen.has(key)) {
      return segments;
    }
    seen.add(key);
    const text = await element.getText();
    if (hasCopy(text)) {
      segments.push(segment<T>(key, text, "body", "On this page", element));
    }
    return segments;
  }
  if (element.type === "Image" && element.getAltText) {
    const alt = await element.getAltText();
    if (hasCopy(alt) && !SKIP_ALT.has(alt.trim().toLowerCase())) {
      segments.push(segment<T>(`${key}:alt`, alt, "body", "Image alt text", element));
    }
  }
  if (element.type === "ComponentInstance" && element.searchProps) {
    const props = await element.searchProps();
    props.forEach((prop, propIndex) => {
      const text = textFromResolvedValue(prop.valueType, prop.resolvedValue);
      if (!text) {
        return;
      }
      const label = prop.display.label
        ? `Component: ${prop.display.label}`
        : "Component text";
      segments.push(
        segment<T>(`${key}:prop:${propIndex}`, text, "body", label, element),
      );
    });
  }
  if (FORM_TYPES.has(element.type)) {
    const pieces: string[] = [];
    const seenText = new Set<string>();
    const addPiece = (text: string) => {
      const normalized = text.trim();
      if (seenText.has(normalized)) {
        return;
      }
      seenText.add(normalized);
      pieces.push(text);
    };
    if (element.getSettings) {
      stringsFromFormSettings(await element.getSettings()).forEach(addPiece);
    }
    if (element.getResolvedAttributes) {
      stringsFromAttributes(await element.getResolvedAttributes()).forEach(addPiece);
    }
    pieces.forEach((text, pieceIndex) => {
      segments.push(
        segment<T>(`${key}:form:${pieceIndex}`, text, "body", "Form", element),
      );
    });
  }
  return segments;
}

async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const current = next;
        next += 1;
        results[current] = await fn(items[current], current);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export async function collectPageText<T extends CopyElement>(
  source: PageTextSource<T>,
  options: { includePageSettings: boolean },
): Promise<CollectedPage<T>> {
  const segments: TextSegment<T>[] = [];
  let unread = 0;
  if (options.includePageSettings) {
    try {
      const page = await source.getCurrentPage();
      segments.push(...(await pageSegments<T>(page)));
    } catch {
      unread += 1;
    }
  }
  const elements = await source.getAllElements();
  const seen = new Set<string>();
  const reads = await mapPool(elements, 8, async (element, index) => {
    try {
      return {
        segments: await elementSegments(element, index, seen),
        failed: false,
      };
    } catch {
      return { segments: [] as TextSegment<T>[], failed: true };
    }
  });
  for (const read of reads) {
    if (read.failed) {
      unread += 1;
    }
    segments.push(...read.segments);
  }
  return { segments, unread };
}
