# PT-BR Content Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the first eight crawlable Brazilian Portuguese pages for pngparasvg.com, preserve the existing PNG-to-SVG converter, and let guide visitors carry a locally selected PNG into the homepage converter.

**Architecture:** Keep the site framework-free and statically generated as checked-in HTML. The homepage remains the only full converter; guide pages share a focused stylesheet and a small upload-transfer module that writes a short-lived PNG record to IndexedDB before navigating to the homepage. A Node built-in test suite parses the checked-in HTML and XML to guard URLs, metadata, links, language, sitemap coverage, and key copy.

**Tech Stack:** Static HTML5, existing Tailwind CDN and Alpine.js homepage assets, vanilla CSS, vanilla browser JavaScript, IndexedDB, existing ImageTracer.js, Node.js built-in `node:test`.

## Global Constraints

- All public copy and UI text are Brazilian Portuguese with `lang="pt-BR"`.
- Every public page is a real static HTML document; primary copy, headings, FAQ, and links cannot depend on JavaScript rendering.
- One page serves one distinct search intent; do not create synonym-only pages.
- The homepage remains focused on PNG-to-SVG and keeps its existing conversion behavior.
- Guide upload transfer stays inside the browser, expires after 15 minutes, is deleted after homepage consumption, and safely falls back to manual selection.
- Guide upload accepts PNG only, with a 10 MiB maximum; errors are visible Portuguese text and are not color-only.
- The first batch contains exactly eight canonical URLs and no PDF converter.
- Do not add a CMS, database, backend upload, analytics, contact form, Spanish pages, or English pages.
- Do not claim that every image converts without quality loss.

## File Structure

- `index.html` — existing homepage, full converter, simplified navigation, featured guides, transfer consumption, corrected footer and metadata.
- `assets/content-site.css` — shared responsive visual system for guide hub, guide pages, and trust pages.
- `assets/guide-upload.js` — PNG validation, preview, IndexedDB write, expiry, redirect, homepage read-and-delete helpers.
- `guias/index.html` — guide hub and topic directory.
- `guias/como-converter-png-para-svg/index.html` — complete conversion workflow guide.
- `guias/como-vetorizar-uma-imagem/index.html` — raster/vector and image tracing guide.
- `guias/converter-logo-png-em-svg/index.html` — logo preparation and tracing guide.
- `politica-de-privacidade/index.html` — privacy disclosures matching actual local processing.
- `termos-de-uso/index.html` — use terms and tracing limitations.
- `contato/index.html` — contact details and `mailto:` action.
- `tests/site-content.test.mjs` — dependency-free structural, metadata, content, link, and sitemap tests.
- `package.json` — root-level `npm test` command using Node's test runner.
- `sitemap.xml` — all eight canonical URLs and accurate last-modified date.
- `robots.txt` — retain crawl allowance and sitemap reference.
- `.gitignore` — ignore `.superpowers/` visual-companion session files.

---

### Task 1: Static SEO Contract and Test Harness

**Files:**
- Create: `package.json`
- Create: `tests/site-content.test.mjs`
- Create: `.gitignore`
- Test: `tests/site-content.test.mjs`

**Interfaces:**
- Consumes: the eight canonical URL definitions from the approved spec.
- Produces: `npm test`; exported test constants are not consumed by production code.

- [ ] **Step 1: Write the failing static-site tests**

Create `package.json`:

```json
{
  "name": "pngparasvg-site",
  "private": true,
  "scripts": {
    "test": "node --test tests/site-content.test.mjs"
  }
}
```

Create `tests/site-content.test.mjs` using only `node:test`, `node:assert/strict`, `node:fs`, and `node:path`. Define this exact page map:

```js
const pages = new Map([
  ['/', 'index.html'],
  ['/guias/', 'guias/index.html'],
  ['/guias/como-converter-png-para-svg/', 'guias/como-converter-png-para-svg/index.html'],
  ['/guias/como-vetorizar-uma-imagem/', 'guias/como-vetorizar-uma-imagem/index.html'],
  ['/guias/converter-logo-png-em-svg/', 'guias/converter-logo-png-em-svg/index.html'],
  ['/politica-de-privacidade/', 'politica-de-privacidade/index.html'],
  ['/termos-de-uso/', 'termos-de-uso/index.html'],
  ['/contato/', 'contato/index.html']
]);
```

Add tests that assert:

1. Every mapped file exists and contains `<html lang="pt-BR">`.
2. Each document has exactly one non-empty `<title>` and exactly one `<h1` opening tag.
3. Each document has one absolute self-referencing canonical matching `https://pngparasvg.com${url}`.
4. Titles, meta descriptions, and canonicals are unique across all eight pages.
5. All internal root-relative `<a href="/...">` values resolve to a mapped page or to a mapped page plus fragment; reject `href="#"`.
6. Every guide page contains a visible link to `/`, `/guias/`, and at least one sibling guide.
7. The three article guides contain a `.guide-upload` form, `accept="image/png,.png"`, and a visible `.guide-upload-error` live region.
8. `index.html` contains links to all three article guides and a script reference to `/assets/guide-upload.js`.
9. `sitemap.xml` contains exactly the eight canonical locations and no duplicate `<loc>`.
10. `robots.txt` allows `/` and references `https://pngparasvg.com/sitemap.xml`.
11. No HTML contains the banned promises `sem perder qualidade`, `qualquer imagem sem perda`, or `resultado perfeito garantido` (case-insensitive).
12. Privacy copy mentions local browser processing, IndexedDB temporary transfer, 15-minute expiry, and `contato@pngparasvg.com`.
13. Contact copy contains `mailto:contato@pngparasvg.com`.

Use small local helpers with these signatures:

```js
function read(relativePath) { /* return UTF-8 text from repository root */ }
function matches(html, regex) { /* return every non-overlapping regex match */ }
function canonicalFor(url) { return `https://pngparasvg.com${url}`; }
```

- [ ] **Step 2: Ignore visual-companion sessions**

Create `.gitignore` with:

```gitignore
.superpowers/
```

- [ ] **Step 3: Run the tests and verify the new page contract fails**

Run: `npm test`

Expected: FAIL because seven new HTML documents, guide upload markup, shared script, and expanded sitemap do not exist yet. The failure must be an assertion failure rather than a test syntax error.

- [ ] **Step 4: Commit the test contract**

```bash
git add package.json tests/site-content.test.mjs .gitignore
git commit -m "test: define pt-BR static site contract"
```

---

### Task 2: Shared Content-Page Visual System and Guide Hub

**Files:**
- Create: `assets/content-site.css`
- Create: `guias/index.html`
- Test: `tests/site-content.test.mjs`

**Interfaces:**
- Consumes: canonical URL and navigation contract from Task 1.
- Produces: reusable classes `.site-header`, `.site-nav`, `.content-shell`, `.breadcrumbs`, `.guide-grid`, `.guide-card`, `.article-body`, `.guide-upload`, `.related-guides`, `.site-footer`, `.notice`, and responsive breakpoints used by Tasks 3 and 5.

- [ ] **Step 1: Add a focused hub test before the page exists**

Extend `tests/site-content.test.mjs` to assert `/guias/` has:

```js
for (const label of ['Conversão básica', 'Vetorização de imagens', 'Logos']) {
  assert.match(hubHtml, new RegExp(label, 'i'));
}
for (const url of articleGuideUrls) {
  assert.match(hubHtml, new RegExp(`href=["']${url}["']`));
}
```

Run: `npm test`

Expected: FAIL because `guias/index.html` does not exist.

- [ ] **Step 2: Implement the shared stylesheet**

Create `assets/content-site.css` with:

- the current site's neo-brutalist black borders, strong shadow, indigo primary action, yellow accent, white content surfaces, and pale page background;
- system font for body and a strong condensed display fallback without adding a render-blocking font dependency;
- a centered maximum content width of 1120px and article measure near 760px;
- mobile-first navigation that wraps without hiding crawlable links;
- visible `:focus-visible` outlines;
- semantic cards that use links rather than click handlers;
- a two-column guide grid above 760px and one column below it;
- `.guide-upload-error` and `.notice` styles that combine icon/text with color;
- no horizontal scrolling at 320px width;
- `prefers-reduced-motion` handling for hover transitions.

- [ ] **Step 3: Implement the static guide hub**

Create `guias/index.html` with:

- title `Guias de PNG, SVG e Vetorização | pngparasvg.com`;
- canonical `https://pngparasvg.com/guias/`;
- description explaining practical Brazilian Portuguese guides;
- main navigation links `/`, `/guias/`, and `/#faq`;
- breadcrumb `Início › Guias`;
- H1 `Guias de PNG, SVG e vetorização`;
- a concise purpose statement;
- three unique cards with titles and summaries linking to the three article guides;
- visible category sections named `Conversão básica`, `Vetorização de imagens`, and `Logos`;
- footer groups `Ferramentas`, `Guias`, and `Sobre`, with all eight first-batch URLs discoverable;
- self-contained visible content with no JavaScript requirement.

- [ ] **Step 4: Run focused and full tests**

Run: `npm test`

Expected: The hub/category assertions PASS. The suite still FAILS only for the remaining missing pages and homepage/sitemap changes.

- [ ] **Step 5: Commit the guide hub**

```bash
git add assets/content-site.css guias/index.html tests/site-content.test.mjs
git commit -m "feat: add pt-BR guide hub"
```

---

### Task 3: Three Distinct Practical Guides

**Files:**
- Create: `guias/como-converter-png-para-svg/index.html`
- Create: `guias/como-vetorizar-uma-imagem/index.html`
- Create: `guias/converter-logo-png-em-svg/index.html`
- Test: `tests/site-content.test.mjs`

**Interfaces:**
- Consumes: visual classes from `assets/content-site.css`; upload DOM interface reserved for Task 4.
- Produces: three forms matching `.guide-upload`, containing `.guide-upload-input`, `.guide-upload-preview`, `.guide-upload-submit`, and `.guide-upload-error[role="status"][aria-live="polite"]`.

- [ ] **Step 1: Add content-distinctness tests**

Extend `tests/site-content.test.mjs` with per-page required phrases:

```js
const guideRequirements = new Map([
  ['/guias/como-converter-png-para-svg/', ['Passo a passo', 'Escolha uma imagem', 'Baixe o SVG']],
  ['/guias/como-vetorizar-uma-imagem/', ['imagem raster', 'caminhos vetoriais', 'fotografias']],
  ['/guias/converter-logo-png-em-svg/', ['cores chapadas', 'fundo transparente', 'gradientes']]
]);
```

Also strip tags, normalize whitespace, calculate pairwise word-set Jaccard similarity for the three article bodies, and require each pair to be below `0.65`. This guards against keyword-swapped copies without imposing a word count.

Run: `npm test`

Expected: FAIL because the three guides do not exist.

- [ ] **Step 2: Create the PNG-to-SVG workflow guide**

Create `guias/como-converter-png-para-svg/index.html` with:

- title `Como converter PNG para SVG: passo a passo | pngparasvg.com`;
- canonical matching its URL;
- breadcrumb and H1 `Como converter PNG para SVG`;
- a direct answer explaining local automatic tracing;
- preparation advice, the shared upload form, 3–5 numbered conversion steps, an example contrasting a simple icon with a detailed photo, failure fixes, FAQ, and related links;
- visible disclosure that automatic tracing may simplify detail and increase path count;
- `BreadcrumbList` plus an `Article` JSON-LD object whose headline and dates match visible metadata; use the site name as publisher and do not invent a person author.

- [ ] **Step 3: Create the image-vectorization guide**

Create `guias/como-vetorizar-uma-imagem/index.html` with:

- title `Como vetorizar uma imagem online | pngparasvg.com`;
- canonical matching its URL;
- breadcrumb and H1 `Como vetorizar uma imagem`;
- an original explanation of raster pixels versus vector paths;
- suitable and unsuitable source-image examples;
- the shared upload form;
- a process centered on color layers, edge clarity, noise, and output inspection;
- FAQ and semantic related links;
- matching visible metadata and JSON-LD without claims of guaranteed quality.

- [ ] **Step 4: Create the logo conversion guide**

Create `guias/converter-logo-png-em-svg/index.html` with:

- title `Como converter logo PNG em SVG | pngparasvg.com`;
- canonical matching its URL;
- breadcrumb and H1 `Como converter logo PNG em SVG`;
- preparation guidance for flat colors, clean edges, transparent background, resolution, gradients, shadows, and photo-like marks;
- the shared upload form;
- a practical logo-specific process, quality checks at multiple sizes, failure fixes, FAQ, and related links;
- an explicit statement that users must have rights to the logo they process.

- [ ] **Step 5: Run the site tests**

Run: `npm test`

Expected: All guide existence, metadata, form-contract, phrase, and distinctness checks PASS. Remaining failures relate only to transfer behavior, homepage, trust pages, and sitemap.

- [ ] **Step 6: Commit the three guides**

```bash
git add guias/como-converter-png-para-svg guias/como-vetorizar-uma-imagem guias/converter-logo-png-em-svg tests/site-content.test.mjs
git commit -m "feat: publish three pt-BR vectorization guides"
```

---

### Task 4: Local PNG Transfer from Guides to Homepage

**Files:**
- Create: `assets/guide-upload.js`
- Modify: `index.html` in the existing file-selection initialization and before `</body>`
- Modify: all three article-guide HTML files to load `/assets/guide-upload.js`
- Test: `tests/site-content.test.mjs`

**Interfaces:**
- Consumes: guide form selectors from Task 3 and the existing homepage `showFileSelected(file)`, `selectedFile`, `originalFileName`, and `#file-input` flow.
- Produces:

```js
window.PngTransfer = {
  MAX_BYTES: 10 * 1024 * 1024,
  TTL_MS: 15 * 60 * 1000,
  initGuideUploads(): void,
  consumePendingFile(): Promise<File|null>
};
```

- [ ] **Step 1: Add source-level transfer contract tests**

Extend `tests/site-content.test.mjs` to read `assets/guide-upload.js` and assert it contains:

- database name `pngparasvg-transfer`;
- object store name `pending-files`;
- `MAX_BYTES` equal to `10 * 1024 * 1024`;
- `TTL_MS` equal to `15 * 60 * 1000`;
- PNG checks for MIME `image/png` and a `.png` extension fallback;
- calls that delete the record on consume and on expiry;
- Portuguese messages for invalid format, oversize file, storage failure, and expired transfer;
- exported `window.PngTransfer` methods with the exact signatures above.

Run: `npm test`

Expected: FAIL because `assets/guide-upload.js` does not exist.

- [ ] **Step 2: Implement IndexedDB storage and validation**

Create `assets/guide-upload.js` as a classic deferred script, not an ES module, so it works on static hosting and `file:` previews. Implement:

```js
const DB_NAME = 'pngparasvg-transfer';
const STORE_NAME = 'pending-files';
const RECORD_KEY = 'pending-png';
const MAX_BYTES = 10 * 1024 * 1024;
const TTL_MS = 15 * 60 * 1000;
```

Store `{ key, name, type, lastModified, blob, createdAt, expiresAt }`. Validate the selected file before preview. Use `URL.createObjectURL` for preview and revoke the previous URL when replacing a selection or leaving the page. On submit, write the record, then navigate to `/?import=guide#converter`. On failure, keep the file selected and show `Não foi possível preparar a imagem neste navegador. Abra o conversor e selecione o arquivo novamente.`

`consumePendingFile()` must open the database, read the single record, delete it before returning, reject expired or invalid records, and reconstruct:

```js
new File([record.blob], record.name, {
  type: record.type || 'image/png',
  lastModified: record.lastModified || Date.now()
});
```

- [ ] **Step 3: Wire all guide forms**

Add `<script src="/assets/guide-upload.js" defer></script>` to each article guide. Ensure every form uses a button with `type="submit"`, a real file input, a preview image with useful alt text updated after selection, and a persistent status region.

- [ ] **Step 4: Consume the transfer on the homepage**

Add `id="converter"` to the homepage converter container if absent. Load `/assets/guide-upload.js` after the existing converter code. After the existing DOM references and `showFileSelected` function are ready, call:

```js
window.PngTransfer.consumePendingFile()
  .then((file) => {
    if (!file) return;
    selectedFile = file;
    originalFileName = file.name.replace(/\.[^/.]+$/, '');
    showFileSelected(file);
  })
  .catch(() => {
    // Keep the normal homepage file picker usable; no blocking alert.
  });
```

Do not programmatically start conversion. The user must still review parameters and press the existing conversion button.

- [ ] **Step 5: Run automated and browser transfer checks**

Run: `npm test`

Expected: Transfer source contract and script-reference checks PASS.

Manual browser checks:

1. Select a PNG under 10 MiB on each guide; confirm thumbnail and filename.
2. Submit; confirm navigation to `/#converter` and the homepage selected-file state.
3. Refresh the homepage; confirm the record does not repopulate a second time.
4. Select a JPG renamed and not renamed; confirm clear rejection.
5. Select a file over 10 MiB; confirm clear rejection.
6. Block IndexedDB in browser settings; confirm fallback message and working homepage picker.

- [ ] **Step 6: Commit local transfer behavior**

```bash
git add assets/guide-upload.js index.html guias/*/index.html tests/site-content.test.mjs
git commit -m "feat: carry guide PNGs into homepage converter"
```

---

### Task 5: Privacy, Terms, and Contact Pages

**Files:**
- Create: `politica-de-privacidade/index.html`
- Create: `termos-de-uso/index.html`
- Create: `contato/index.html`
- Test: `tests/site-content.test.mjs`

**Interfaces:**
- Consumes: header/footer and article classes from `assets/content-site.css`; exact transfer behavior from Task 4.
- Produces: public policy copy that later analytics, storage, or backend changes must keep current.

- [ ] **Step 1: Add trust-page disclosure tests**

Extend `tests/site-content.test.mjs` to assert:

- privacy includes `processamento local`, `IndexedDB`, `15 minutos`, `logs`, and the contact address;
- terms include `fornecida no estado em que se encontra`, source-file rights, automatic tracing limitations, and no quality guarantee;
- contact includes the address, `mailto:`, and the subjects `falhas de conversão`, `privacidade`, and `direitos autorais`;
- none contains a guide upload form or unsupported structured data.

Run: `npm test`

Expected: FAIL because the three trust pages do not exist.

- [ ] **Step 2: Implement the privacy policy**

Create `politica-de-privacidade/index.html` with unique metadata, self-canonical, breadcrumb, visible effective date `12 de agosto de 2026`, and sections for local image processing, 15-minute IndexedDB transfer, hosting/security logs, cookies and analytics (state that no analytics is intentionally configured in this batch), retention, user choices, policy changes, and contact. Do not say the site collects nothing under all circumstances.

- [ ] **Step 3: Implement the terms of use**

Create `termos-de-uso/index.html` with unique metadata, self-canonical, effective date, allowed use, user responsibility for source-file rights, automatic-tracing limitations, no warranty, availability changes, prohibited abuse, and contact. Use clear Brazilian Portuguese rather than copied legal boilerplate.

- [ ] **Step 4: Implement the contact page**

Create `contato/index.html` with unique metadata, self-canonical, breadcrumb, `mailto:contato@pngparasvg.com`, and concise guidance for conversion failures, privacy questions, copyright requests, and general feedback. State an expected response target as `normalmente em até 5 dias úteis` without guaranteeing it. Do not add a form or expose the forwarding destination.

- [ ] **Step 5: Run tests and commit**

Run: `npm test`

Expected: Trust-page tests PASS. Remaining failures concern homepage navigation/featured guides and sitemap only.

```bash
git add politica-de-privacidade termos-de-uso contato tests/site-content.test.mjs
git commit -m "feat: add privacy terms and contact pages"
```

---

### Task 6: Homepage Information Architecture and Metadata

**Files:**
- Modify: `index.html` navigation, metadata, hero copy, converter section ID, featured guide section, FAQ consistency, and footer
- Test: `tests/site-content.test.mjs`

**Interfaces:**
- Consumes: all URLs from Tasks 2, 3, and 5; transfer hook from Task 4.
- Produces: the primary crawl path from `/` to the guide hub, three guides, and trust pages.

- [ ] **Step 1: Add homepage information-architecture tests**

Extend `tests/site-content.test.mjs` to assert the homepage:

- has main navigation links `/`, `/guias/`, and `#faq` or `/#faq`;
- has `id="converter"` on the full tool section;
- links visibly to the guide hub and all three article guides before the footer;
- footer has visible headings `Ferramentas`, `Guias`, and `Sobre`;
- contains no `href="#"`;
- has visible FAQ questions that exactly match every JSON-LD FAQ question;
- describes local processing without stating unsupported size or universal-quality promises.

Run: `npm test`

Expected: FAIL on the current homepage navigation, featured guides, empty footer links, and any copy mismatch.

- [ ] **Step 2: Update homepage head metadata**

Keep one H1 and set:

- title focused on `PNG para SVG` without keyword repetition;
- unique Portuguese description explaining free local browser tracing;
- absolute self-canonical `https://pngparasvg.com/`;
- `lang="pt-BR"`;
- basic Open Graph title, description, type, and URL;
- FAQ JSON-LD text exactly equal to visible FAQ text.

Remove the obsolete meta keywords tag because it does not add ranking value and creates a maintenance duplicate.

- [ ] **Step 3: Update navigation and homepage copy**

Implement visible links:

```html
<a href="#converter">Converter</a>
<a href="/guias/">Guias</a>
<a href="#faq">FAQ</a>
```

Keep the converter as the dominant first-screen action. Correct any Portuguese typos or mixed-language fragments, including `restrictions`. Ensure privacy and quality claims match actual ImageTracer behavior.

- [ ] **Step 4: Add featured guides and replace the footer**

Add a static section after the core benefits and before FAQ with three semantic linked cards and a `Ver todos os guias` link. Replace empty footer anchors with grouped real links to the tool, guide hub, guides, privacy, terms, and contact.

- [ ] **Step 5: Regress the existing converter**

Run: `npm test`

Expected: All homepage static assertions PASS.

Manual browser checks with one simple icon PNG and one multi-color PNG:

1. Drag/drop and file-picker selection both show the selected state.
2. Conversion completes and preview renders.
3. SVG download retains the original base filename.
4. Reset returns to the upload state.
5. Guide transfer still populates the same selected state.
6. At 320px, 768px, and 1440px the hero, converter, guide cards, FAQ, and footer do not overlap or create horizontal scrolling.

- [ ] **Step 6: Commit homepage architecture**

```bash
git add index.html tests/site-content.test.mjs
git commit -m "feat: connect homepage to pt-BR guide structure"
```

---

### Task 7: Sitemap, Final Validation, and Release Readiness

**Files:**
- Modify: `sitemap.xml`
- Verify: `robots.txt`
- Verify: all files created or modified in Tasks 1–6
- Test: `tests/site-content.test.mjs`

**Interfaces:**
- Consumes: final eight-page URL set.
- Produces: crawl discovery files and a verified first-batch release candidate.

- [ ] **Step 1: Update sitemap with all eight URLs**

Use one `<url>` per canonical URL with `<lastmod>2026-08-12</lastmod>`. Keep homepage priority highest if priorities remain, but do not assign misleading per-page change frequency promises. The expected `<loc>` set is exactly:

```text
https://pngparasvg.com/
https://pngparasvg.com/guias/
https://pngparasvg.com/guias/como-converter-png-para-svg/
https://pngparasvg.com/guias/como-vetorizar-uma-imagem/
https://pngparasvg.com/guias/converter-logo-png-em-svg/
https://pngparasvg.com/politica-de-privacidade/
https://pngparasvg.com/termos-de-uso/
https://pngparasvg.com/contato/
```

- [ ] **Step 2: Run the complete automated suite**

Run: `npm test`

Expected: PASS with zero failed tests.

Run: `git diff --check`

Expected: no output and exit code 0.

- [ ] **Step 3: Run a local HTTP crawl**

Start a local static server from the repository root using an available local runtime. Request each of the eight paths over HTTP and assert status 200, `text/html`, the expected H1, and no accidental directory listing. Do not validate routes with `file://` alone because production uses directory URLs.

Expected: all eight URLs return their matching HTML document.

- [ ] **Step 4: Complete final visual and functional QA**

Render or open all eight pages at 1440×900, 768×1024, and 390×844. Confirm navigation wrapping, readable article measure, visible focus, upload error layout, card reflow, footer grouping, and no clipped Portuguese text. Repeat the homepage conversion and one guide-transfer flow after the final sitemap change.

- [ ] **Step 5: Inspect final repository state**

Run:

```bash
git status --short
git diff --stat HEAD
git log --oneline -8
```

Expected: only intentional first-batch files are changed or newly committed; `.superpowers/` is ignored; no personal forwarding address, credentials, or generated preview artifacts are tracked.

- [ ] **Step 6: Commit crawl files**

```bash
git add sitemap.xml robots.txt
git commit -m "seo: publish first pt-BR page sitemap"
```

- [ ] **Step 7: Prepare deployment handoff**

Report the eight published paths, automated test result, manual browser checks, remaining deployment step to configure free forwarding for `contato@pngparasvg.com`, and the post-deploy GSC actions. Do not claim pages are live or indexed until deployment and Search Console verification actually occur.
