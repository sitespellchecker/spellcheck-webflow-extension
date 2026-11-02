const STORAGE_PREFIX = "site-spell-checker:ignored:";
const MAX_WORDS = 2000;
const MAX_LENGTH = 64;

function normalizeWord(word: string): string {
  return word.trim().replace(/\u2019/g, "'").toLowerCase();
}

export function ignoreStorageKey(siteId: string): string {
  if (!siteId) {
    throw new Error("Site id is required to store ignored words.");
  }
  return STORAGE_PREFIX + siteId;
}

export function readIgnored(storage: Storage, siteId: string): string[] {
  try {
    const raw = storage.getItem(ignoreStorageKey(siteId));
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

export function rememberIgnored(
  storage: Storage,
  siteId: string,
  word: string,
): string[] {
  const key = normalizeWord(word).replace(/^'+|'+$/g, "");
  if (!key || key.length > MAX_LENGTH) {
    return readIgnored(storage, siteId);
  }
  const next = Array.from(new Set(readIgnored(storage, siteId).concat(key))).slice(
    0,
    MAX_WORDS,
  );
  storage.setItem(ignoreStorageKey(siteId), JSON.stringify(next));
  return next;
}

export function clearIgnored(storage: Storage, siteId: string): void {
  storage.removeItem(ignoreStorageKey(siteId));
}
