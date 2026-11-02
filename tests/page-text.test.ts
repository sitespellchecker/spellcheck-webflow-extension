import assert from "node:assert/strict";
import test from "node:test";
import {
  collectPageText,
  textFromResolvedValue,
  type CopyElement,
  type PageSettingsSource,
} from "../src/designer/page-text.ts";

const element = (overrides: CopyElement): CopyElement => overrides;

test("resolved component values keep visitor copy and skip ids and decorative alt", () => {
  assert.equal(textFromResolvedValue("textContent", "Hello there"), "Hello there");
  assert.equal(textFromResolvedValue("id", "my-section"), null);
  assert.equal(textFromResolvedValue("altText", "decorative"), null);
  assert.equal(
    textFromResolvedValue("richText", { innerText: "A longer story" }),
    "A longer story",
  );
  assert.equal(textFromResolvedValue("video", { title: "Product tour" }), "Product tour");
});

test("collects page settings, canvas text, alt text, form copy, and component props", async () => {
  const page: PageSettingsSource = {
    getTitle: () => Promise.resolve("Recipie"),
    getDescription: () => Promise.resolve("Fresh bread"),
    usesTitleAsSearchTitle: () => Promise.resolve(true),
    getSearchTitle: () => Promise.resolve("Should not be read"),
    usesDescriptionAsSearchDescription: () => Promise.resolve(false),
    getSearchDescription: () => Promise.resolve("Custom search blurb"),
    usesTitleAsOpenGraphTitle: () => Promise.resolve(true),
    usesDescriptionAsOpenGraphDescription: () => Promise.resolve(true),
  };
  const elements: CopyElement[] = [
    element({
      id: { component: "page", element: "string-1" },
      type: "String",
      getText: () => Promise.resolve("Hello canvas"),
    }),
    element({
      id: { component: "page", element: "string-1" },
      type: "String",
      getText: () => Promise.resolve("Hello canvas duplicate"),
    }),
    element({
      id: { component: "page", element: "image-1" },
      type: "Image",
      getAltText: () => Promise.resolve("decorative"),
    }),
    element({
      id: { component: "page", element: "image-2" },
      type: "Image",
      getAltText: () => Promise.resolve("Sourdough loaf"),
    }),
    element({
      id: { component: "page", element: "form-1" },
      type: "FormTextInput",
      getSettings: () => Promise.resolve({ placeholder: "Your email" }),
      getResolvedAttributes: () =>
        Promise.resolve([{ name: "placeholder", value: "Your email" }]),
    }),
    element({
      id: { component: "page", element: "component-1" },
      type: "ComponentInstance",
      searchProps: () =>
        Promise.resolve([
          {
            valueType: "textContent",
            resolvedValue: "Hero headline",
            display: { label: "Heading" },
          },
          {
            valueType: "id",
            resolvedValue: "hero",
            display: { label: "ID" },
          },
        ]),
    }),
    element({
      type: "String",
      getText: () => Promise.reject(new Error("unreadable")),
    }),
  ];

  const collected = await collectPageText(
    {
      getCurrentPage: () => Promise.resolve(page),
      getAllElements: () => Promise.resolve(elements),
    },
    { includePageSettings: true },
  );

  assert.deepEqual(
    collected.segments.map((item) => [item.label, item.role, item.text]),
    [
      ["SEO title", "title", "Recipie"],
      ["SEO description", "body", "Fresh bread"],
      ["Search description", "body", "Custom search blurb"],
      ["On this page", "body", "Hello canvas"],
      ["Image alt text", "body", "Sourdough loaf"],
      ["Form", "body", "Your email"],
      ["Component: Heading", "body", "Hero headline"],
    ],
  );
  assert.equal(collected.unread, 1);
  assert.equal(collected.segments[3]?.element, elements[0]);
});

test("skips page settings while a component is open", async () => {
  const collected = await collectPageText(
    {
      getCurrentPage: () =>
        Promise.resolve({
          getTitle: () => Promise.resolve("Do not include"),
        }),
      getAllElements: () =>
        Promise.resolve([
          {
            type: "String",
            getText: () => Promise.resolve("Inside the component"),
          },
        ]),
    },
    { includePageSettings: false },
  );
  assert.deepEqual(
    collected.segments.map((item) => item.text),
    ["Inside the component"],
  );
});
