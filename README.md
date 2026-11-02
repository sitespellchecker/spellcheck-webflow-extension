# Site Spell Checker for Webflow

Designer Extension that spell-checks the page currently open in Webflow Designer. Locale is English (US) only. The check runs in the browser with [Typo.js](https://github.com/cfinke/Typo.js) and the SCOWL en_US Hunspell dictionary, the same approach as the [WordPress plugin](https://github.com/sitespellchecker/spellcheck-wordpress-plugin).

v1 does not scan other pages, read or write CMS items, send email, or check links. It is not submitted to the Webflow Marketplace.

## What the check covers

On the open page:

- SEO title and SEO description
- Search title, search description, social title, and social description, when they are custom rather than copies of the SEO fields
- Text on the canvas, including text inside elements
- Image alt text
- Component instance text, rich text, and alt props that are visible on the instance
- Form button text, placeholders, and `aria-label` / `title` attributes when the Designer exposes them

While a component is open, the check is that component's canvas instead of the page SEO fields.

Words are tokenized the same way as the WordPress plugin: contractions and possessives stay whole, URLs and email addresses are skipped, ALL-CAPS acronyms are skipped, and a capitalized word in the middle of a sentence is treated as a name. SEO and search titles are checked word by word, because they are often Title Case. A capitalized word in a title is still skipped when that word also appears mid-sentence in the body.

Ignore stores the word in this browser for this site (`localStorage`). It does not write to Webflow.

Text inside a component that is not exposed as an instance prop is checked when that component is open. Bound CMS field values are not read. Other pages and other CMS items are not scanned.

## Upgrade link

The panel links to the full-site scan checkout. The link is followed only when someone clicks it. Nothing else contacts sitespellchecker.com.

```
https://sitespellchecker.com/site-scans/checkout?domain={SITE_DOMAIN}&ref=webflow-app&utm_source=webflow&utm_medium=app&utm_campaign=designer-extension
```

`{SITE_DOMAIN}` is the hostname of the site open in the Designer:

1. The default production domain, or the first production domain
2. Otherwise the default staging domain, or the first staging domain
3. Otherwise `{shortName}.webflow.io` when the site has no published domain yet

Privacy: https://sitespellchecker.com/privacy

Terms: https://sitespellchecker.com/terms

## Project layout

This repo follows the current Webflow CLI Designer Extension scaffold (`webflow extension init`, `@webflow/webflow-cli` 2.15, Designer API `apiVersion` 2). `webflow.json` points `publicDir` at `public`. `npm run build` compiles `src/` into `public/` with TypeScript, then `webflow extension bundle` writes `bundle.zip`.

| Path | Role |
| --- | --- |
| `src/index.ts` | Panel UI |
| `src/spellcheck/tokenizer.ts` | Tokenizer and issue list |
| `src/designer/page-text.ts` | Reads the open page through the Designer API |
| `src/checkout.ts` | Checkout URL |
| `public/index.html`, `public/styles.css` | Extension shell |
| `public/vendor/typo.js` | Typo.js (BSD-3-Clause) |
| `public/dictionaries/en_US.aff.txt`, `en_US.dic.txt` | SCOWL en_US dictionary. `.txt` so the Webflow bundle accepts them |
| `webflow.json` | Extension manifest. Display name: Site Spell Checker |

`bundle.zip` and compiled `public/**/*.js` from `src/` are build output. Do not commit them. Do not commit a Webflow client secret. This app does not use the Data API, so it does not need one.

## Scripts

Requires Node.js 22 or later.

```sh
npm install
npm test          # tokenizer, dictionary, page-text collection, checkout URL
npm run typecheck
npm run lint
npm run dev       # serves the extension at http://localhost:1337
npm run build     # writes bundle.zip for a workspace upload
```

`npm run dev` compiles first, then serves `public/` and recompiles on save. The page at `http://localhost:1337` only previews the panel. Designer API calls work after Launch development app inside the Designer.

## Set up a workspace and test site

This repository does not include a Webflow workspace or a published `webflow.io` site. The extension cannot be opened in the Designer until those exist. You need a Webflow account with Workspace Admin, email verification, and two-factor authentication.

1. Sign in at [webflow.com](https://webflow.com). Create a Workspace if you do not have one, and use one where you are an Admin. Webflow documents a free Developer Workspace for building apps. Their troubleshooting page also says app development shows up on Team and Enterprise plans, and only for an Admin with a verified email and two-factor authentication. If **Apps & Integrations** is missing, check those four things before anything else.
2. In that workspace, create a site. A blank site is enough. You do not have to buy a custom domain. Publishing once gives the site a `*.webflow.io` staging hostname, which the checkout link uses when no production domain exists. The Designer can open the site before it is published; the link then falls back to `{shortName}.webflow.io`.
3. Register the app. Workspace settings (left sidebar) → **Apps & Integrations** → **App development** → **Create an App**.
   - Name: `Site Spell Checker` (also the `name` in `webflow.json`)
   - Description: `Check spelling on the page open in the Designer. English (US), in the browser.`
   - Homepage URL: `https://sitespellchecker.com`
   - Add an icon in the dashboard. The extension bundle does not include a marketplace icon.
   - Leave **Restrict app installation to a specific site** off unless you want to install it on one site at a time.
4. On the building-blocks step, select **Designer Extension** only. Do not add **Data Client**. That avoids OAuth, redirect URIs, scopes, and a client secret. If Webflow still shows a client secret, leave it in the dashboard.
5. Create the app. It stays private to this workspace until someone submits it to the Marketplace. Do not submit it.
6. Install it on the test site: **Apps & Integrations** → **Develop** → the app's **...** menu → **Install**. Choose the test site.
7. On your computer, in this repo:

   ```sh
   npm install
   npm run dev
   ```

   Leave that process running. It listens on port 1337. The Designer loads `http://localhost:1337` from the same computer, so the dev server has to run on the machine whose browser has the Designer open.
8. Open the test site in the Designer. Press `E` to open Apps. Select **Site Spell Checker** and click **Launch development app**. Refresh the Designer if the app is missing. Use the refresh control on the extension panel after code changes.
9. Put a known typo in a paragraph, such as `recieve`, and click **Check spelling**. The word should appear in the list. **Suggest** offers corrections. **Show on canvas** selects the element when the Designer allows it. **Scan every page of your site** opens the checkout URL with that site's domain.

To share a build inside the workspace without Marketplace review:

```sh
npm run build
```

Workspace settings → **Apps & Integrations** → **Develop** → the app → **Publish extension version**, and upload `bundle.zip` (under 5MB). In the Designer, use **Launch App** for the uploaded bundle. **Launch development app** still loads localhost. Publishing a bundle is not a Marketplace submission.

## Third-party notices

Typo.js is BSD-3-Clause. See `public/vendor/LICENSE-typo.txt`. The en_US word list is from SCOWL. See `public/dictionaries/README_en_US.txt`.
