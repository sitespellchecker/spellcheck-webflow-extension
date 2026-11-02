import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import {
  findIssues,
  rankSuggestions,
  type SpellChecker,
} from "../src/spellcheck/tokenizer.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const sandbox: { module: { exports: unknown }; exports: unknown } = {
  module: { exports: {} },
  exports: {},
};
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(root, "public/vendor/typo.js"), "utf8"),
  sandbox,
);
const Typo = sandbox.module.exports as new (
  locale: string,
  affData: string,
  wordsData: string,
) => SpellChecker;

const dictionary = new Typo(
  "en_US",
  fs.readFileSync(path.join(root, "public/dictionaries/en_US.aff.txt"), "utf8"),
  fs.readFileSync(path.join(root, "public/dictionaries/en_US.dic.txt"), "utf8"),
);

const words = (text: string) =>
  findIssues([{ id: "body", text, role: "body", label: "On this page" }], dictionary).map(
    (issue) => issue.word,
  );

test("real misspellings are flagged and ranked suggestions prefer the typo", () => {
  const found = findIssues(
    [
      {
        id: "body",
        text: "We recieve teh package tommorow.",
        role: "body",
        label: "On this page",
      },
    ],
    dictionary,
  );
  assert.deepEqual(
    found.map((issue) => issue.word),
    ["recieve", "teh", "tommorow"],
  );
  assert.ok(found[0]?.suggestions.includes("receive"));
  assert.equal(rankSuggestions("recieve", ["relieve", "receive", "recipe"])[0], "receive");
});

test("contractions, possessives, and accented spellings are accepted", () => {
  assert.deepEqual(
    words("I don\u2019t know if it's Sarah's or the dogs' food. The naïve café served a résumé."),
    [],
  );
});

test("sentence-start typos are flagged and mid-sentence capitalized words are skipped", () => {
  assert.deepEqual(words("Teh cat sat."), ["Teh"]);
  assert.deepEqual(words("We met Zorblax at the office."), []);
});

test("a capitalized word is still skipped in a title when the body uses it as a name", () => {
  const found = findIssues(
    [
      {
        id: "title",
        text: "Our Sourdough Recipie for Begginers and Kubernetes",
        role: "title",
        label: "SEO title",
      },
      {
        id: "body",
        text: "Kubernetes is great. We use Kubernetes daily.",
        role: "body",
        label: "On this page",
      },
    ],
    dictionary,
    { suggestions: false },
  );
  assert.deepEqual(
    found.map((issue) => issue.word),
    ["Recipie", "Begginers"],
  );
  assert.ok(found.every((issue) => issue.locations[0]?.label === "SEO title"));
});

test("repeated misspellings are one issue, and the ignore list is case-insensitive", () => {
  const found = findIssues(
    [{ id: "body", text: "wrod wrod Wrod", role: "body", label: "On this page" }],
    dictionary,
    { suggestions: false },
  );
  assert.equal(found.length, 1);
  assert.equal(found[0]?.count, 3);
  assert.deepEqual(
    findIssues(
      [{ id: "body", text: "Our Gutenbergy blocks are fab\u2019lous.", role: "body", label: "On this page" }],
      dictionary,
      { ignore: ["gutenbergy", "fab'lous"], suggestions: false },
    ),
    [],
  );
});
