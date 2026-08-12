import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

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

const guideRequirements = new Map([
  ['/guias/como-converter-png-para-svg/', ['Passo a passo', 'Escolha uma imagem', 'Baixe o SVG']],
  ['/guias/como-vetorizar-uma-imagem/', ['imagem raster', 'caminhos vetoriais', 'fotografias']],
  ['/guias/converter-logo-png-em-svg/', ['cores chapadas', 'fundo transparente', 'gradientes']]
]);

function read(relativePath) {
  assert.ok(fs.existsSync(path.join(root, relativePath)), `required file must exist: ${relativePath}`);
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function matches(html, regex) {
  return [...html.matchAll(regex)];
}

function canonicalFor(url) {
  return `https://pngparasvg.com${url}`;
}

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}=(["'])(.*?)\\1`, 'i'))?.[2];
}

function pageDocuments() {
  return [...pages].map(([url, file]) => ({ url, file }));
}

function hasVisibleLink(html, href) {
  const escapedHref = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const anchors = matches(
    html,
    new RegExp(`<a\\b[^>]*\\bhref=(["'])${escapedHref}\\1[^>]*>([\\s\\S]*?)<\\/a>`, 'gi')
  );

  return anchors.some((anchor) => anchor[2].replace(/<[^>]*>/g, '').trim().length > 0);
}

function articleText(html) {
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ?? '';
  return article
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordSet(text) {
  return new Set(text.toLocaleLowerCase('pt-BR').match(/[\p{L}\p{N}]+/gu) ?? []);
}

function jaccardSimilarity(left, right) {
  const shared = [...left].filter((word) => right.has(word)).length;
  return shared / new Set([...left, ...right]).size;
}

function openingTagsWithClass(html, className) {
  return matches(html, /<([a-z][\w-]*)\b[^>]*>/gi)
    .map((match) => match[0])
    .filter((tag) => attribute(tag, 'class')?.split(/\s+/).includes(className));
}

function jsonLdObjects(value) {
  if (Array.isArray(value)) return value.flatMap(jsonLdObjects);
  if (!value || typeof value !== 'object') return [];
  return [value, ...Object.values(value).flatMap(jsonLdObjects)];
}

function jsonLdFor(html, url) {
  return matches(
    html,
    /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  ).map((match, index) => {
    assert.doesNotThrow(() => JSON.parse(match[1]), `${url} JSON-LD block ${index + 1} must parse`);
    return JSON.parse(match[1]);
  });
}

test('every mapped page exists and declares Brazilian Portuguese', () => {
  for (const { url, file } of pageDocuments()) {
    assert.ok(fs.existsSync(path.join(root, file)), `${url} must exist at ${file}`);
    const html = read(file);
    assert.match(html, /<html\s+lang=["']pt-BR["']\s*>/i, `${url} must declare pt-BR`);
  }
});

test('guide hub lists the article guides in their visible categories', () => {
  const hubHtml = read('guias/index.html');
  const articleGuideUrls = [
    '/guias/como-converter-png-para-svg/',
    '/guias/como-vetorizar-uma-imagem/',
    '/guias/converter-logo-png-em-svg/'
  ];

  for (const label of ['Conversão básica', 'Vetorização de imagens', 'Logos']) {
    assert.match(hubHtml, new RegExp(label, 'i'));
  }
  for (const url of articleGuideUrls) {
    assert.match(hubHtml, new RegExp(`href=["']${url}["']`));
  }
});

test('each page has one non-empty title and one h1 opening tag', () => {
  for (const { url, file } of pageDocuments()) {
    const html = read(file);
    const titles = matches(html, /<title\b[^>]*>([\s\S]*?)<\/title>/gi);
    assert.equal(titles.length, 1, `${url} must have exactly one title`);
    assert.notEqual(titles[0][1].trim(), '', `${url} title must not be empty`);
    assert.equal(matches(html, /<h1\b[^>]*>/gi).length, 1, `${url} must have exactly one h1`);
  }
});

test('each page has its absolute self-referencing canonical', () => {
  for (const { url, file } of pageDocuments()) {
    const html = read(file);
    const canonicals = matches(html, /<link\b[^>]*>/gi)
      .map((match) => match[0])
      .filter((tag) => attribute(tag, 'rel')?.toLowerCase() === 'canonical');
    assert.equal(canonicals.length, 1, `${url} must have exactly one canonical link`);
    assert.equal(attribute(canonicals[0], 'href'), canonicalFor(url), `${url} canonical must self-reference`);
  }
});

test('titles, meta descriptions, and canonicals are unique', () => {
  const documents = pageDocuments();
  const titles = documents.map(({ file }) => matches(read(file), /<title\b[^>]*>([\s\S]*?)<\/title>/gi)[0]?.[1].trim());
  const descriptions = documents.map(({ url, file }) => {
    const html = read(file);
    const tags = matches(html, /<meta\b[^>]*>/gi)
      .map((match) => match[0])
      .filter((tag) => attribute(tag, 'name')?.toLowerCase() === 'description');
    assert.equal(tags.length, 1, `${url} must have exactly one meta description`);
    const content = attribute(tags[0], 'content')?.trim();
    assert.ok(content, `${url} meta description must not be empty`);
    return content;
  });
  const canonicals = documents.map(({ url }) => canonicalFor(url));

  assert.equal(new Set(titles).size, pages.size, 'titles must be unique');
  assert.equal(new Set(descriptions).size, pages.size, 'meta descriptions must be unique');
  assert.equal(new Set(canonicals).size, pages.size, 'canonicals must be unique');
});

test('internal root-relative links resolve to mapped pages and never use a bare hash', () => {
  for (const { url, file } of pageDocuments()) {
    const html = read(file);
    assert.equal(matches(html, /<a\b[^>]*\bhref=["']#["'][^>]*>/gi).length, 0, `${url} cannot link to #`);
    for (const link of matches(html, /<a\b[^>]*\bhref=(["'])(\/[^"']*)\1[^>]*>/gi)) {
      const href = link[2];
      const target = href.split('#', 1)[0];
      assert.ok(pages.has(target), `${url} links to unmapped page ${href}`);
    }
  }
});

test('every guide page visibly links to home, the guide hub, and a sibling guide', () => {
  const guideUrls = [...pages.keys()].filter((url) => url.startsWith('/guias/'));
  for (const url of guideUrls) {
    const html = read(pages.get(url));
    assert.ok(hasVisibleLink(html, '/'), `${url} must visibly link to home`);
    assert.ok(hasVisibleLink(html, '/guias/'), `${url} must visibly link to the guide hub`);
    const siblingUrls = guideUrls.filter((candidate) => candidate !== url);
    assert.ok(siblingUrls.some((sibling) => hasVisibleLink(html, sibling)), `${url} must visibly link to a sibling guide`);
  }
});

test('article guides include the PNG upload form and visible live error region', () => {
  const articles = [...pages.entries()].filter(([url]) => url !== '/guias/' && url.startsWith('/guias/'));
  for (const [url, file] of articles) {
    const html = read(file);
    const forms = matches(
      html,
      /<form\b[^>]*\bclass=["'][^"']*\bguide-upload\b[^"']*["'][^>]*>[\s\S]*?<\/form>/gi
    );
    assert.equal(forms.length, 1, `${url} needs one guide-upload form`);

    const form = forms[0][0];
    const inputTags = openingTagsWithClass(form, 'guide-upload-input');
    const previewTags = openingTagsWithClass(form, 'guide-upload-preview');
    const submitTags = openingTagsWithClass(form, 'guide-upload-submit');
    const errorRegions = matches(
      form,
      /<([a-z][\w-]*)\b[^>]*\bclass=["'][^"']*\bguide-upload-error\b[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi
    );

    assert.equal(inputTags.length, 1, `${url} needs exactly one guide-upload-input descendant`);
    assert.match(inputTags[0], /^<input\b/i, `${url} guide-upload-input must be an input`);
    assert.equal(attribute(inputTags[0], 'type')?.toLowerCase(), 'file', `${url} upload input type must be file`);
    assert.equal(attribute(inputTags[0], 'accept')?.toLowerCase(), 'image/png,.png', `${url} upload input must accept PNG only`);
    assert.match(inputTags[0], /\srequired(?:\s|=|>)/i, `${url} upload input must be required`);

    assert.equal(previewTags.length, 1, `${url} needs exactly one guide-upload-preview descendant`);
    assert.match(previewTags[0], /^<img\b/i, `${url} guide-upload-preview must be an image`);

    assert.equal(submitTags.length, 1, `${url} needs exactly one guide-upload-submit descendant`);
    assert.match(submitTags[0], /^<button\b/i, `${url} guide-upload-submit must be a button`);
    assert.equal(attribute(submitTags[0], 'type')?.toLowerCase(), 'submit', `${url} upload button type must be submit`);

    assert.equal(errorRegions.length, 1, `${url} upload form needs one guide-upload-error region`);

    const [errorRegion] = errorRegions;
    const openingTag = errorRegion[0].slice(0, errorRegion[0].indexOf('>') + 1);
    const fallbackText = errorRegion[2].replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim();
    assert.equal(attribute(openingTag, 'role')?.toLowerCase(), 'status', `${url} error region role must be status`);
    assert.equal(attribute(openingTag, 'aria-live')?.toLowerCase(), 'polite', `${url} error region must announce politely`);
    assert.doesNotMatch(openingTag, /\baria-hidden=["']true["']/i, `${url} error region cannot be aria-hidden`);
    assert.doesNotMatch(openingTag, /\bhidden\b/i, `${url} error region must be visible`);
    assert.doesNotMatch(openingTag, /\bstyle=["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)[^"']*["']/i, `${url} error region cannot be hidden inline`);
    assert.notEqual(fallbackText, '', `${url} error region needs useful fallback or status text`);
  }
});

test('guide upload transfer keeps the private PNG handoff bounded and disposable', () => {
  const script = read('assets/guide-upload.js');

  assert.match(script, /['"]pngparasvg-transfer['"]/);
  assert.match(script, /['"]pending-files['"]/);
  assert.match(script, /MAX_BYTES\s*=\s*10\s*\*\s*1024\s*\*\s*1024/);
  assert.match(script, /TTL_MS\s*=\s*15\s*\*\s*60\s*\*\s*1000/);
  assert.match(script, /image\/png/);
  assert.match(script, /\.png/i);
  assert.match(script, /137\s*,\s*80\s*,\s*78\s*,\s*71\s*,\s*13\s*,\s*10\s*,\s*26\s*,\s*10/, 'transfer must verify the PNG byte signature');
  assert.match(script, /delete\s*\(\s*RECORD_KEY\s*\)/, 'transfer must delete its single-use record');
  assert.match(script, /expir/i, 'transfer must handle expiry explicitly');
  assert.match(script, /setTimeout\s*\(/, 'transfer must schedule expiry cleanup');
  assert.match(script, /purgeExpiredRecord\s*\(/, 'guide initialization must purge stale records');

  for (const message of [
    /arquivo PNG v[aá]lido/i,
    /10\s*MiB/i,
    /N[aã]o foi poss[ií]vel preparar a imagem neste navegador/i,
    /transfer[eê]ncia expirou/i
  ]) {
    assert.match(script, message);
  }

  assert.match(script, /window\.PngTransfer\s*=\s*\{/);
  assert.match(script, /MAX_BYTES\s*:/);
  assert.match(script, /TTL_MS\s*:/);
  assert.match(script, /initGuideUploads\s*:/);
  assert.match(script, /consumePendingFile\s*:/);
});

test('guide pages load the deferred transfer script', () => {
  for (const [url, file] of [...pages].filter(([candidate]) => candidate !== '/guias/' && candidate.startsWith('/guias/'))) {
    const html = read(file);
    const script = matches(html, /<script\b[^>]*\bsrc=["']\/assets\/guide-upload\.js["'][^>]*>/gi);
    assert.equal(script.length, 1, `${url} must load the guide upload script once`);
    assert.match(script[0][0], /\bdefer\b/i, `${url} transfer script must be deferred`);
  }
});

test('home exposes the converter target and consumes a guide transfer without auto-converting', () => {
  const html = read('index.html');
  assert.match(html, /<[^>]+\bid=["']converter["'][^>]*>/i);
  assert.match(html, /window\.PngTransfer\.consumePendingFile\(\)/);
  assert.match(html, /selectedFile\s*=\s*file/);
  assert.match(html, /originalFileName\s*=\s*file\.name\.replace/);
  assert.match(html, /showFileSelected\(file\)/);
  assert.doesNotMatch(
    html.match(/window\.PngTransfer\.consumePendingFile\(\)[\s\S]*?\.catch\([\s\S]*?\);/)?.[0] ?? '',
    /startConversion\s*\(/,
    'guide import must not start conversion automatically'
  );
});

test('article guide structured data matches visible metadata and canonical identity', () => {
  for (const url of guideRequirements.keys()) {
    const html = read(pages.get(url));
    const canonicalTag = matches(html, /<link\b[^>]*>/gi)
      .map((match) => match[0])
      .find((tag) => attribute(tag, 'rel')?.toLowerCase() === 'canonical');
    const canonical = attribute(canonicalTag, 'href');
    const h1 = matches(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)[0]?.[1].replace(/<[^>]*>/g, '').trim();
    const publishedTag = openingTagsWithClass(html, 'article-published')[0];
    const modifiedTag = openingTagsWithClass(html, 'article-modified')[0];
    const objects = jsonLdFor(html, url).flatMap(jsonLdObjects);
    const breadcrumbs = objects.filter((object) => object['@type'] === 'BreadcrumbList');
    const articles = objects.filter((object) => object['@type'] === 'Article');

    assert.equal(breadcrumbs.length, 1, `${url} needs one BreadcrumbList object`);
    assert.equal(articles.length, 1, `${url} needs one Article object`);
    assert.ok(publishedTag, `${url} needs visible published metadata`);
    assert.ok(modifiedTag, `${url} needs visible modified metadata`);

    const article = articles[0];
    const terminalCrumb = breadcrumbs[0].itemListElement.at(-1);
    assert.equal(article.headline, h1, `${url} Article headline must match its visible h1`);
    assert.equal(article.datePublished, attribute(publishedTag, 'datetime'), `${url} published date must match visible metadata`);
    assert.equal(article.dateModified, attribute(modifiedTag, 'datetime'), `${url} modified date must match visible metadata`);
    assert.equal(terminalCrumb.item, canonical, `${url} terminal breadcrumb must match canonical`);
    assert.equal(article.mainEntityOfPage, canonical, `${url} Article mainEntityOfPage must match canonical`);
    assert.equal(article.publisher?.['@type'], 'Organization', `${url} publisher must be an Organization`);
    assert.equal(article.publisher?.name, 'pngparasvg.com', `${url} publisher must use the site name`);
    assert.equal(
      objects.filter((object) => object['@type'] === 'Person').length,
      0,
      `${url} cannot invent a Person author`
    );
  }
});

test('each practical guide covers the phrases required by its reader intent', () => {
  for (const [url, phrases] of guideRequirements) {
    const text = articleText(read(pages.get(url)));
    for (const phrase of phrases) {
      assert.match(text, new RegExp(phrase, 'i'), `${url} must cover "${phrase}"`);
    }
  }
});

test('practical guides have distinct article copy instead of keyword-swapped text', () => {
  const guides = [...guideRequirements.keys()].map((url) => ({
    url,
    words: wordSet(articleText(read(pages.get(url))))
  }));

  for (let left = 0; left < guides.length; left += 1) {
    for (let right = left + 1; right < guides.length; right += 1) {
      const similarity = jaccardSimilarity(guides[left].words, guides[right].words);
      assert.ok(
        similarity < 0.65,
        `${guides[left].url} and ${guides[right].url} must stay distinct (Jaccard ${similarity.toFixed(3)})`
      );
    }
  }
});

test('home links to every article guide and loads the guide upload script', () => {
  const html = read('index.html');
  for (const url of [...pages.keys()].filter((url) => url !== '/guias/' && url.startsWith('/guias/'))) {
    assert.ok(hasVisibleLink(html, url), `home must visibly link to ${url}`);
  }
  assert.match(html, /<script\b[^>]*\bsrc=["']\/assets\/guide-upload\.js["'][^>]*>/i);
});

test('sitemap contains exactly the eight unique canonical locations', () => {
  const locations = matches(read('sitemap.xml'), /<loc>([^<]+)<\/loc>/gi).map((match) => match[1]);
  const expected = [...pages.keys()].map(canonicalFor);
  assert.equal(locations.length, pages.size, 'sitemap must contain eight locations');
  assert.equal(new Set(locations).size, locations.length, 'sitemap locations must not be duplicated');
  assert.deepEqual(new Set(locations), new Set(expected), 'sitemap locations must match the canonical pages');
});

test('robots allows the site and names the canonical sitemap', () => {
  const robots = read('robots.txt');
  assert.match(robots, /^Allow:\s*\/$/mi);
  assert.match(robots, /Sitemap:\s*https:\/\/pngparasvg\.com\/sitemap\.xml/i);
});

test('public HTML does not make banned quality promises', () => {
  const banned = /sem perder qualidade|qualquer imagem sem perda|resultado perfeito garantido/i;
  for (const { url, file } of pageDocuments()) {
    const html = read(file);
    assert.doesNotMatch(html, banned, `${url} contains a banned promise`);
  }
});

test('privacy copy covers local processing, temporary IndexedDB transfer, expiry, and contact', () => {
  const privacy = read('politica-de-privacidade/index.html');
  assert.match(privacy, /processamento local/i);
  assert.match(privacy, /navegador/i);
  assert.match(privacy, /IndexedDB/i);
  assert.match(privacy, /tempor.r/i);
  assert.match(privacy, /15\s*minutos/i);
  assert.match(privacy, /expir/i);
  assert.match(privacy, /contato@pngparasvg\.com/i);
});

test('contact copy provides the contact email link', () => {
  assert.match(read('contato/index.html'), /mailto:contato@pngparasvg\.com/i);
});
