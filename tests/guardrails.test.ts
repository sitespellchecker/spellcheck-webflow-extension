import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(relative));
    } else if (entry.name.endsWith(".ts")) {
      found.push(relative);
    }
  }
  return found;
}

test("extension source does not call third-party hosts", () => {
  const allowed = new Set(["src/checkout.ts"]);
  for (const file of sourceFiles("src")) {
    const code = read(file);
    assert.doesNotMatch(code, /sendBeacon|gtag|analytics|XMLHttpRequest|WebSocket/i, file);
    if (!allowed.has(file.replaceAll("\\", "/"))) {
      assert.doesNotMatch(code, /https?:\/\//, file);
    }
  }
  const checkout = read("src/checkout.ts");
  assert.match(checkout, /https:\/\/sitespellchecker\.com\/site-scans\/checkout/);
  assert.match(checkout, /https:\/\/sitespellchecker\.com\/privacy/);
  assert.match(checkout, /https:\/\/sitespellchecker\.com\/terms/);
});

test("the manifest is the open-page designer extension", () => {
  const manifest = JSON.parse(read("webflow.json")) as {
    name: string;
    apiVersion: string;
    publicDir: string;
  };
  assert.equal(manifest.name, "Site Spell Checker");
  assert.equal(manifest.apiVersion, "2");
  assert.equal(manifest.publicDir, "public");
});
