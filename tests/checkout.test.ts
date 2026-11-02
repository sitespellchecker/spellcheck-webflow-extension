import assert from "node:assert/strict";
import test from "node:test";
import { buildCheckoutUrl, pickSiteDomain } from "../src/checkout.ts";

test("checkout url carries the site domain and webflow campaign", () => {
  assert.equal(
    buildCheckoutUrl("example.com"),
    "https://sitespellchecker.com/site-scans/checkout?domain=example.com&ref=webflow-app&utm_source=webflow&utm_medium=app&utm_campaign=designer-extension",
  );
});

test("checkout url omits an empty domain", () => {
  assert.equal(
    buildCheckoutUrl(""),
    "https://sitespellchecker.com/site-scans/checkout?ref=webflow-app&utm_source=webflow&utm_medium=app&utm_campaign=designer-extension",
  );
});

test("site domain prefers the default production host", () => {
  assert.equal(
    pickSiteDomain({
      shortName: "draft-site",
      domains: [
        { url: "https://draft-site.webflow.io", stage: "staging", default: true },
        { url: "www.example.com", stage: "production", default: false },
        { url: "https://shop.example.com/path", stage: "production", default: true },
      ],
    }),
    "shop.example.com",
  );
});

test("site domain falls back to staging, then the webflow.io short name", () => {
  assert.equal(
    pickSiteDomain({
      shortName: "draft-site",
      domains: [{ url: "https://draft-site.webflow.io", stage: "staging" }],
    }),
    "draft-site.webflow.io",
  );
  assert.equal(pickSiteDomain({ shortName: "draft-site", domains: [] }), "draft-site.webflow.io");
  assert.equal(pickSiteDomain({}), "");
});
