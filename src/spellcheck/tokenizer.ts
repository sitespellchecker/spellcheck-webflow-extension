export interface SpellChecker {
  check(word: string): boolean;
  suggest(word: string, limit: number): string[];
}

export interface Token {
  word: string;
  index: number;
  sentenceStart: boolean;
}

export interface TokenizeOptions {
  ignoreAllCaps?: boolean;
}

export interface IssueSegment {
  id: string;
  text: string;
  role: "title" | "body";
  label: string;
}

export interface IssueLocation {
  segmentId: string;
  label: string;
  context: string;
}

export interface Issue {
  word: string;
  count: number;
  locations: IssueLocation[];
  suggestions: string[];
}

export interface FindIssuesOptions {
  ignore?: readonly string[];
  skipCapitalized?: boolean;
  ignoreAllCaps?: boolean;
  suggestions?: number | false;
  max?: number;
}

export interface IssueScan {
  issues: Issue[];
  truncated: boolean;
}

const CLITIC = /'(?:s|d|ll|ve|re|m)$/i;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"\u2019\u201d]+$/;

export function normalizeWord(word: string): string {
  return word.trim().replace(/\u2019/g, "'").toLowerCase();
}

function maskMatch(match: string, isAddress?: (core: string) => boolean): string {
  const trail = TRAILING_PUNCTUATION.exec(match);
  const core = trail ? match.slice(0, match.length - trail[0].length) : match;
  if (isAddress && !isAddress(core)) {
    return match;
  }
  let masked = "";
  for (const char of core) {
    masked += char.length > 1 ? "  " : " ";
  }
  return masked + (trail ? trail[0] : "");
}

function isDomainLike(core: string): boolean {
  return (
    /[a-z0-9]\.[a-z]{2,}(?:[/?#:]|\.[a-z]|$)/i.test(core) || /[/?#=]/.test(core)
  );
}

function stripNonWords(text: string): string {
  return text
    .replace(/\b(?:https?:\/\/|ftp:\/\/|www\.)[^\s<>"]+/gi, (match) =>
      maskMatch(match),
    )
    .replace(/[^\s<>"@]+@[^\s<>"@]+\.[a-z]{2,}/gi, (match) => maskMatch(match))
    .replace(/[^\s<>"]*[a-z0-9]\.[a-z]{2,}[^\s<>"]*/gi, (match) =>
      maskMatch(match, isDomainLike),
    );
}

export function tokenize(text: string, options: TokenizeOptions = {}): Token[] {
  const ignoreAllCaps = options.ignoreAllCaps !== false;
  const source = stripNonWords(String(text ?? ""));
  const expression =
    /[\p{L}\p{M}\p{N}_]+(?:['\u2019][\p{L}\p{M}\p{N}_]+)*/gu;
  const tokens: Token[] = [];
  let lastEnd = 0;
  let sentenceStart = true;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(source)) !== null) {
    const between = source.slice(lastEnd, match.index);
    if (/[.!?\n]/.test(between)) {
      sentenceStart = true;
    }
    lastEnd = match.index + match[0].length;
    const raw = match[0];
    const atStart = sentenceStart;
    sentenceStart = false;
    if (/[\p{N}_]/u.test(raw)) {
      continue;
    }
    if (/[\p{Ll}][\p{Lu}]/u.test(raw)) {
      continue;
    }
    if (ignoreAllCaps && /^\p{Lu}{2,}(?:'?s)?$/u.test(raw)) {
      continue;
    }
    tokens.push({
      word: raw.replace(/\u2019/g, "'"),
      index: match.index,
      sentenceStart: atStart,
    });
  }
  return tokens;
}

function stripDiacritics(word: string): string {
  return word.normalize("NFD").replace(/\p{M}/gu, "");
}

function isValid(checker: SpellChecker, word: string): boolean {
  if (checker.check(word)) {
    return true;
  }
  const plain = stripDiacritics(word);
  if (plain !== word && checker.check(plain)) {
    return true;
  }
  let base = plain;
  while (CLITIC.test(base)) {
    base = base.replace(CLITIC, "");
    if (checker.check(base)) {
      return true;
    }
  }
  return false;
}

function typoDistance(left: string, right: string): number {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const distance: number[][] = Array.from({ length: rows }, () =>
    Array<number>(cols).fill(0),
  );
  for (let i = 0; i < rows; i += 1) {
    distance[i][0] = i;
  }
  for (let j = 1; j < cols; j += 1) {
    distance[0][j] = j * 0.9;
  }
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      distance[i][j] = Math.min(
        distance[i - 1][j] + 1,
        distance[i][j - 1] + 0.9,
        distance[i - 1][j - 1] + cost,
      );
      if (
        i > 1 &&
        j > 1 &&
        left[i - 1] === right[j - 2] &&
        left[i - 2] === right[j - 1]
      ) {
        distance[i][j] = Math.min(distance[i][j], distance[i - 2][j - 2] + 0.8);
      }
    }
  }
  return distance[left.length][right.length];
}

export function rankSuggestions(word: string, list: readonly string[]): string[] {
  const lower = word.toLowerCase();
  const seen = new Set<string>();
  return list
    .filter((suggestion) => {
      const key = suggestion.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .map((suggestion, index) => ({
      suggestion,
      index,
      distance: typoDistance(lower, suggestion.toLowerCase()),
    }))
    .sort((left, right) => left.distance - right.distance || left.index - right.index)
    .map((entry) => entry.suggestion);
}

function contextFor(segment: IssueSegment, index: number, word: string): string {
  if (segment.role === "title") {
    return segment.text.replace(/\s+/g, " ").trim();
  }
  const start = Math.max(0, index - 30);
  const end = Math.min(segment.text.length, index + word.length + 30);
  return segment.text.slice(start, end).replace(/\s+/g, " ").trim();
}

export function findIssues(
  segments: readonly IssueSegment[],
  checker: SpellChecker,
  options: FindIssuesOptions = {},
): IssueScan {
  const skipCapitalized = options.skipCapitalized !== false;
  const max = options.max ?? 200;
  const maxSuggestions = options.suggestions === false ? 0 : options.suggestions ?? 3;
  const ignore = new Set((options.ignore ?? []).map(normalizeWord));
  const prepared = segments.map((segment) => ({
    segment,
    tokens: tokenize(segment.text, options).map((token) => ({
      ...token,
      sentenceStart: segment.role === "title" ? true : token.sentenceStart,
    })),
  }));
  const namesMidSentence = new Set<string>();
  for (const entry of prepared) {
    if (entry.segment.role === "title") {
      continue;
    }
    for (const token of entry.tokens) {
      if (!token.sentenceStart && /^\p{Lu}/u.test(token.word)) {
        namesMidSentence.add(token.word.toLowerCase());
      }
    }
  }

  const verdicts = new Map<string, boolean>();
  const found = new Map<string, Issue>();
  for (const entry of prepared) {
    for (const token of entry.tokens) {
      const key = token.word.toLowerCase();
      if (token.word.replace(/'/g, "").length < 2 || ignore.has(key)) {
        continue;
      }
      const existing = found.get(key);
      if (existing) {
        existing.count += 1;
        if (
          existing.locations.length < 3 &&
          !existing.locations.some((location) => location.segmentId === entry.segment.id)
        ) {
          existing.locations.push({
            segmentId: entry.segment.id,
            label: entry.segment.label,
            context: contextFor(entry.segment, token.index, token.word),
          });
        }
        continue;
      }
      if (
        skipCapitalized &&
        /^\p{Lu}/u.test(token.word) &&
        (!token.sentenceStart || namesMidSentence.has(key))
      ) {
        continue;
      }
      if (!verdicts.has(token.word)) {
        verdicts.set(token.word, isValid(checker, token.word));
      }
      if (verdicts.get(token.word)) {
        continue;
      }
      if (found.size >= max) {
        return { issues: finish(found, checker, maxSuggestions), truncated: true };
      }
      found.set(key, {
        word: token.word,
        count: 1,
        locations: [
          {
            segmentId: entry.segment.id,
            label: entry.segment.label,
            context: contextFor(entry.segment, token.index, token.word),
          },
        ],
        suggestions: [],
      });
    }
  }
  return { issues: finish(found, checker, maxSuggestions), truncated: false };
}

function finish(
  found: Map<string, Issue>,
  checker: SpellChecker,
  maxSuggestions: number,
): Issue[] {
  const issues = Array.from(found.values());
  if (maxSuggestions > 0) {
    for (const issue of issues) {
      issue.suggestions = rankSuggestions(
        issue.word,
        checker.suggest(issue.word, 10),
      ).slice(0, maxSuggestions);
    }
  }
  return issues;
}
