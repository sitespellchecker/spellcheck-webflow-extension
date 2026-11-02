import assert from "node:assert/strict";
import test from "node:test";
import { tokenize } from "../src/spellcheck/tokenizer.ts";

const words = (text: string, ignoreAllCaps?: boolean) =>
  tokenize(text, ignoreAllCaps === undefined ? {} : { ignoreAllCaps }).map(
    (token) => token.word,
  );

test("keeps contractions and possessives together", () => {
  assert.deepEqual(words("I don't think it's the dog's bone and the dogs' toys"), [
    "I",
    "don't",
    "think",
    "it's",
    "the",
    "dog's",
    "bone",
    "and",
    "the",
    "dogs",
    "toys",
  ]);
  assert.deepEqual(words("You don\u2019t know it\u2019s mine"), [
    "You",
    "don't",
    "know",
    "it's",
    "mine",
  ]);
});

test("drops surrounding quotes and splits hyphenated words", () => {
  assert.deepEqual(words("He said 'hello' and \u2018goodbye\u2019"), [
    "He",
    "said",
    "hello",
    "and",
    "goodbye",
  ]);
  assert.deepEqual(words("a well-known state-of-the-art tool"), [
    "a",
    "well",
    "known",
    "state",
    "of",
    "the",
    "art",
    "tool",
  ]);
});

test("keeps accented letters and skips numbers, urls, emails, and acronyms", () => {
  assert.deepEqual(words("A naïve café owner from Zürich"), [
    "A",
    "naïve",
    "café",
    "owner",
    "from",
    "Zürich",
  ]);
  assert.deepEqual(
    words(
      "Call 555-1234 about mp3 files at https://example.com/path?x=1 or www.exmple.org or mail bob@exmaple.com today",
    ),
    ["Call", "about", "files", "at", "or", "or", "mail", "today"],
  );
  assert.deepEqual(words("The NASA API is fine"), ["The", "is", "fine"]);
  assert.deepEqual(words("The NASA API is fine", false), [
    "The",
    "NASA",
    "API",
    "is",
    "fine",
  ]);
});

test("marks a new sentence after punctuation that follows a url", () => {
  const tokens = tokenize("See https://example.com. Teh cat sat.");
  const teh = tokens.find((token) => token.word === "Teh");
  assert.equal(teh?.sentenceStart, true);
  assert.deepEqual(
    tokenize("Hello there. Again! Why?").map((token) => token.sentenceStart),
    [true, false, true, true],
  );
});
