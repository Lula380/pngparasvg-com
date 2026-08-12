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
    assert.match(form, /<input\b[^>]*\baccept=["']image\/png,\.png["'][^>]*>/i, `${url} upload form must accept PNG files`);
    const errorRegions = matches(
      form,
      /<([a-z][\w-]*)\b[^>]*\bclass=["'][^"']*\bguide-upload-error\b[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi
    );
    assert.equal(errorRegions.length, 1, `${url} upload form needs one guide-upload-error region`);

    const [errorRegion] = errorRegions;
    const openingTag = errorRegion[0].slice(0, errorRegion[0].indexOf('>') + 1);
    const fallbackText = errorRegion[2].replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim();
    assert.match(openingTag, /\baria-live=["'](?:polite|assertive)["']/i, `${url} error region must be live`);
    assert.doesNotMatch(openingTag, /\baria-hidden=["']true["']/i, `${url} error region cannot be aria-hidden`);
    assert.doesNotMatch(openingTag, /\bhidden\b/i, `${url} error region must be visible`);
    assert.doesNotMatch(openingTag, /\bstyle=["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)[^"']*["']/i, `${url} error region cannot be hidden inline`);
    assert.notEqual(fallbackText, '', `${url} error region needs useful fallback or status text`);
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
