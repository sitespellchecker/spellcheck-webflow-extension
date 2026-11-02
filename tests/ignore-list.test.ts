import assert from "node:assert/strict";
import test from "node:test";
import { clearIgnored, readIgnored, rememberIgnored } from "../src/ignore-list.ts";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(data.keys())[index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
}

test("an unknown site does not share an ignore list", () => {
  const storage = memoryStorage();
  assert.throws(() => rememberIgnored(storage, "", "secret"));
  assert.equal(storage.length, 0);
});

test("ignored words are stored per site and normalized", () => {
  const storage = memoryStorage();
  rememberIgnored(storage, "site-a", "Fab\u2019lous");
  rememberIgnored(storage, "site-b", "other");
  assert.deepEqual(readIgnored(storage, "site-a"), ["fab'lous"]);
  assert.deepEqual(readIgnored(storage, "site-b"), ["other"]);
  clearIgnored(storage, "site-a");
  assert.deepEqual(readIgnored(storage, "site-a"), []);
  assert.deepEqual(readIgnored(storage, "site-b"), ["other"]);
});
