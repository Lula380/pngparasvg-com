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

const innerPageOpenGraph = new Map([
  ['/guias/', {
    title: 'Guias de PNG, SVG e Vetorização | pngparasvg.com',
    description: 'Guias práticos em português brasileiro para converter PNG em SVG, vetorizar imagens e preparar logos.',
    type: 'website',
    url: 'https://pngparasvg.com/guias/',
    locale: 'pt_BR'
  }],
  ['/guias/como-converter-png-para-svg/', {
    title: 'Como converter PNG para SVG: passo a passo | pngparasvg.com',
    description: 'Aprenda a converter PNG para SVG no navegador, preparar a imagem, conferir o traçado automático e corrigir resultados com detalhes demais.',
    type: 'article',
    url: 'https://pngparasvg.com/guias/como-converter-png-para-svg/',
    locale: 'pt_BR'
  }],
  ['/guias/como-vetorizar-uma-imagem/', {
    title: 'Como vetorizar uma imagem online | pngparasvg.com',
    description: 'Entenda pixels e vetores, descubra quais imagens são boas candidatas e avalie cores, bordas e ruído ao vetorizar online.',
    type: 'article',
    url: 'https://pngparasvg.com/guias/como-vetorizar-uma-imagem/',
    locale: 'pt_BR'
  }],
  ['/guias/converter-logo-png-em-svg/', {
    title: 'Como converter logo PNG em SVG | pngparasvg.com',
    description: 'Prepare um logo PNG para SVG, preserve transparência e cores úteis e revise contornos, tipografia e legibilidade em vários tamanhos.',
    type: 'article',
    url: 'https://pngparasvg.com/guias/converter-logo-png-em-svg/',
    locale: 'pt_BR'
  }],
  ['/politica-de-privacidade/', {
    title: 'Política de privacidade | pngparasvg.com',
    description: 'Entenda o processamento local de imagens, o armazenamento temporário no navegador e os registros técnicos do pngparasvg.com.',
    type: 'website',
    url: 'https://pngparasvg.com/politica-de-privacidade/',
    locale: 'pt_BR'
  }],
  ['/termos-de-uso/', {
    title: 'Termos de uso | pngparasvg.com',
    description: 'Conheça as condições de uso do conversor PNG para SVG, suas limitações técnicas e as responsabilidades sobre os arquivos selecionados.',
    type: 'website',
    url: 'https://pngparasvg.com/termos-de-uso/',
    locale: 'pt_BR'
  }],
  ['/contato/', {
    title: 'Contato | pngparasvg.com',
    description: 'Fale com o pngparasvg.com sobre falhas de conversão, privacidade, direitos autorais ou sugestões para o site.',
    type: 'website',
    url: 'https://pngparasvg.com/contato/',
    locale: 'pt_BR'
  }]
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

function visibleText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function tagsWithAttribute(html, tagName, attributeName, expectedValue) {
  return matches(html, new RegExp(`<${tagName}\\b[^>]*>`, 'gi'))
    .map((match) => match[0])
    .filter((tag) => attribute(tag, attributeName)?.toLowerCase() === expectedValue.toLowerCase());
}

function attributeNames(openingTag) {
  return matches(openingTag, /\s([^\s=/>]+)(?:\s*=\s*(?:["'][^"']*["']|[^\s>]+))?/gi)
    .map((match) => match[1].toLowerCase());
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

function cssDeclarations(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const body = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, 'i'))?.[1] ?? '';
  assert.notEqual(body, '', `${selector} must have its own CSS rule`);
  return new Map(
    body
      .split(';')
      .map((declaration) => declaration.trim())
      .filter(Boolean)
      .map((declaration) => {
        const separator = declaration.indexOf(':');
        return [
          declaration.slice(0, separator).trim().toLowerCase(),
          declaration.slice(separator + 1).trim().toLowerCase()
        ];
      })
  );
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

test('each inner page exposes its exact page-specific Open Graph metadata', () => {
  for (const [url, expected] of innerPageOpenGraph) {
    const html = read(pages.get(url));
    for (const [field, value] of Object.entries(expected)) {
      const property = `og:${field}`;
      const tags = tagsWithAttribute(html, 'meta', 'property', property);
      assert.equal(tags.length, 1, `${url} must have exactly one ${property}`);
      assert.equal(attribute(tags[0], 'content'), value, `${url} ${property} must be page-specific`);
    }
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
  const canonicals = documents.map(({ url, file }) => {
    const tags = matches(read(file), /<link\b[^>]*>/gi)
      .map((match) => match[0])
      .filter((tag) => attribute(tag, 'rel')?.toLowerCase() === 'canonical');
    assert.equal(tags.length, 1, `${url} must have exactly one canonical link for uniqueness checks`);
    return attribute(tags[0], 'href');
  });

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

test('article guide previews start hidden, sourceless, and decorative', () => {
  for (const url of guideRequirements.keys()) {
    const html = read(pages.get(url));
    const previewTags = openingTagsWithClass(html, 'guide-upload-preview');
    assert.equal(previewTags.length, 1, `${url} needs exactly one guide preview`);
    const preview = previewTags[0];
    assert.match(preview, /^<img\b/i, `${url} guide preview must be an image`);
    assert.match(preview, /\shidden(?:\s|=|>)/i, `${url} empty guide preview must start hidden`);
    assert.equal(attribute(preview, 'src'), undefined, `${url} empty guide preview cannot have a source`);
    assert.equal(attribute(preview, 'alt'), '', `${url} empty guide preview must start decorative`);
  }
});

test('guide preview CSS keeps selected images responsive and bounded', () => {
  const declarations = cssDeclarations(read('assets/content-site.css'), '.guide-upload-preview');
  assert.equal(declarations.get('max-width'), '100%');
  assert.equal(declarations.get('max-height'), '18rem');
  assert.equal(declarations.get('object-fit'), 'contain');
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
  assert.match(html, /<[^>]+\bid=["']transfer-status["'][^>]*\brole=["']status["'][^>]*>/i);
  assert.match(html, /\bclass=["'][^"']*\btransfer-status\b[^"']*["']/i);
  assert.match(html, /window\.PngTransfer\.consumePendingFile\(\)/);
  assert.match(html, /selectedFile\s*=\s*file/);
  assert.match(html, /originalFileName\s*=\s*file\.name\.replace/);
  assert.match(html, /showFileSelected\(file\)/);
  assert.match(html, /transferStatus\.textContent\s*=\s*error\.message/);
  assert.doesNotMatch(
    html.match(/window\.PngTransfer\.consumePendingFile\(\)[\s\S]*?\.catch\([\s\S]*?\);/)?.[0] ?? '',
    /startConversion\s*\(/,
    'guide import must not start conversion automatically'
  );
});

test('homepage metadata describes the local PNG to SVG converter without duplicate keyword metadata', () => {
  const html = read('index.html');
  const title = matches(html, /<title\b[^>]*>([\s\S]*?)<\/title>/gi)[0]?.[1].trim();
  const descriptions = tagsWithAttribute(html, 'meta', 'name', 'description');
  const canonicals = tagsWithAttribute(html, 'link', 'rel', 'canonical');

  assert.match(title, /PNG para SVG/i);
  assert.equal((title.match(/PNG para SVG/gi) ?? []).length, 1, 'homepage title must not repeat its primary phrase');
  assert.equal(descriptions.length, 1, 'homepage needs one description');
  assert.match(attribute(descriptions[0], 'content'), /gr[áa]tis|gratuit[oa]/i);
  assert.match(attribute(descriptions[0], 'content'), /(?:local|navegador)/i);
  assert.equal(canonicals.length, 1, 'homepage needs one canonical');
  assert.equal(attribute(canonicals[0], 'href'), 'https://pngparasvg.com/');
  assert.equal(tagsWithAttribute(html, 'meta', 'name', 'keywords').length, 0, 'homepage must not maintain meta keywords');

  const openGraph = new Map(
    matches(html, /<meta\b[^>]*>/gi)
      .map((match) => match[0])
      .filter((tag) => attribute(tag, 'property')?.toLowerCase().startsWith('og:'))
      .map((tag) => [attribute(tag, 'property').toLowerCase(), attribute(tag, 'content')])
  );
  assert.equal(openGraph.get('og:title'), title);
  assert.equal(openGraph.get('og:description'), attribute(descriptions[0], 'content'));
  assert.equal(openGraph.get('og:type'), 'website');
  assert.equal(openGraph.get('og:url'), 'https://pngparasvg.com/');
});

test('homepage navigation and converter section expose the primary tasks', () => {
  const html = read('index.html');
  const headerNav = html.match(/<nav\b[^>]*\baria-label=["']Navega[cç][aã]o principal["'][^>]*>([\s\S]*?)<\/nav>/i)?.[1] ?? '';
  assert.notEqual(headerNav, '', 'homepage needs a labelled primary navigation');
  assert.ok(hasVisibleLink(headerNav, '/'), 'primary navigation must visibly link to home');
  assert.ok(hasVisibleLink(headerNav, '#converter'), 'primary navigation must link to the converter');
  assert.ok(hasVisibleLink(headerNav, '/guias/'), 'primary navigation must link to the guide hub');
  assert.ok(hasVisibleLink(headerNav, '#faq'), 'primary navigation must link to the FAQ');

  const converter = html.match(/<section\b[^>]*\bid=["']converter["'][^>]*>([\s\S]*?)<\/section>/i)?.[1] ?? '';
  assert.notEqual(converter, '', 'converter must be a bounded section');
  for (const id of ['drop-zone', 'file-input', 'file-selected', 'loading', 'result-container']) {
    assert.match(converter, new RegExp(`\\bid=["']${id}["']`, 'i'), `converter section must contain #${id}`);
  }
});

test('homepage features the guide hub and all article guides before the footer', () => {
  const html = read('index.html');
  const footerOffset = html.search(/<footer\b/i);
  assert.ok(footerOffset > 0, 'homepage must have a footer');
  const beforeFooter = html.slice(0, footerOffset);
  for (const href of [
    '/guias/',
    '/guias/como-converter-png-para-svg/',
    '/guias/como-vetorizar-uma-imagem/',
    '/guias/converter-logo-png-em-svg/'
  ]) {
    assert.ok(hasVisibleLink(beforeFooter, href), `homepage must visibly feature ${href} before the footer`);
  }
});

test('homepage footer groups real tool, guide, and trust links', () => {
  const html = read('index.html');
  const footer = html.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/i)?.[1] ?? '';
  assert.notEqual(footer, '', 'homepage needs a footer');
  for (const heading of ['Ferramentas', 'Guias', 'Sobre']) {
    assert.match(footer, new RegExp(`<h[2-6]\\b[^>]*>\\s*${heading}\\s*<\\/h[2-6]>`, 'i'));
  }
  for (const href of [
    '#converter',
    '/guias/',
    '/guias/como-converter-png-para-svg/',
    '/guias/como-vetorizar-uma-imagem/',
    '/guias/converter-logo-png-em-svg/',
    '/politica-de-privacidade/',
    '/termos-de-uso/',
    '/contato/'
  ]) {
    assert.ok(hasVisibleLink(footer, href), `footer must visibly link to ${href}`);
  }
  assert.doesNotMatch(html, /<a\b[^>]*\bhref=["']#["'][^>]*>/i);
});

test('homepage visible FAQ exactly matches its FAQPage structured data', () => {
  const html = read('index.html');
  const faqSection = html.match(/<section\b[^>]*\bid=["']faq["'][^>]*>([\s\S]*?)<\/section>/i)?.[1] ?? '';
  const questions = matches(faqSection, /<summary\b[^>]*>([\s\S]*?)<\/summary>/gi)
    .map((item) => visibleText(item[1]));
  const answers = matches(
    faqSection,
    /<div\b[^>]*\bclass=["'][^"']*\bfaq-answer\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi
  ).map((item) => visibleText(item[1]));
  assert.equal(questions.length, answers.length, 'each visible FAQ question needs one visible answer');
  const visibleItems = questions.map((question, index) => ({ question, answer: answers[index] }));
  const faqPages = jsonLdFor(html, '/').flatMap(jsonLdObjects).filter((object) => object['@type'] === 'FAQPage');
  assert.equal(faqPages.length, 1, 'homepage needs one FAQPage object');
  const schemaItems = faqPages[0].mainEntity.map((item) => ({
    question: item.name,
    answer: item.acceptedAnswer?.text
  }));
  assert.ok(visibleItems.length > 0, 'homepage needs visible FAQ items');
  assert.deepEqual(visibleItems, schemaItems);
});

test('homepage copy accurately scopes local tracing without size or universal quality promises', () => {
  const copy = visibleText(read('index.html'));
  assert.match(copy, /processamento local/i);
  assert.match(copy, /navegador/i);
  assert.match(copy, /tempo de convers[aã]o varia/i, 'speed copy must explain its dependency on image and device');
  assert.doesNotMatch(
    copy,
    /sem limites? de tamanho|sem restri[cç][oõ]es? de tamanho|qualquer resolu[cç][aã]o|arquivos maiores tamb[eé]m|resultado perfeito|SVG perfeito|preserva (?:todas|toda) as cores|mantendo (?:todas|toda) as cores|caminhos vetoriais precisos|\b(?:ultra\s+)?r[áa]pid[oa]\b|\bsegur[oa]\b/i
  );
});

test('homepage converter controls expose accessible names and preview state', () => {
  const html = read('index.html');
  const removeButton = html.match(/<button\b[^>]*\bid=["']remove-file-btn["'][^>]*>/i)?.[0] ?? '';
  const preview = html.match(/<img\b[^>]*\bid=["']thumb-img["'][^>]*>/i)?.[0] ?? '';

  assert.equal(attribute(removeButton, 'type')?.toLowerCase(), 'button');
  assert.equal(attribute(removeButton, 'aria-label'), 'Remover arquivo selecionado');
  assert.equal(attribute(preview, 'alt'), '', 'empty preview must start decorative');
  assert.match(html, /showFileSelected\(file\)[\s\S]*?thumbImg\.alt\s*=\s*`Pr[eé]-visualiza[cç][aã]o de \$\{file\.name\}`/);
  assert.match(html, /resetToUploadPrompt\(\)[\s\S]*?thumbImg\.removeAttribute\(['"]src['"]\)[\s\S]*?thumbImg\.alt\s*=\s*['"]['"]/);
});

test('homepage FAQ uses native disclosure controls and needs no executable CDN', () => {
  const html = read('index.html');
  const faqSection = html.match(/<section\b[^>]*\bid=["']faq["'][^>]*>([\s\S]*?)<\/section>/i)?.[1] ?? '';
  assert.equal(matches(faqSection, /<details\b[^>]*>/gi).length, 6);
  assert.equal(matches(faqSection, /<summary\b[^>]*>/gi).length, 6);
  const remoteExecutableAssets = matches(html, /<(?:script|link)\b[^>]*>/gi)
    .map((match) => match[0])
    .filter((tag) => /(?:src|href)=["']https?:\/\//i.test(tag) && !/\brel=["']canonical["']/i.test(tag));
  assert.deepEqual(remoteExecutableAssets, [], 'homepage cannot execute or load remote assets');
  assert.doesNotMatch(html, /\bx-(?:data|show|cloak|collapse)\b|@click|:aria-expanded|:class/i);
});

test('all local public assets referenced by formal pages exist', () => {
  for (const { url, file } of pageDocuments()) {
    const html = read(file);
    const assets = matches(html, /<(?:script|link)\b[^>]*>/gi)
      .map((match) => match[0])
      .map((tag) => attribute(tag, 'src') || attribute(tag, 'href'))
      .filter((asset) => asset && asset.startsWith('/') && !asset.endsWith('/'));
    for (const asset of assets) {
      assert.ok(fs.existsSync(path.join(root, asset.slice(1))), `${url} references missing asset ${asset}`);
    }
  }
});

test('self-hosted homepage CSS covers every class used in homepage markup', () => {
  const html = read('index.html');
  const css = `${read('assets/home.css')}\n${matches(html, /<style\b[^>]*>([\s\S]*?)<\/style>/gi).map((match) => match[1]).join('\n')}`;
  const ignored = new Set([
    'brutal-btn', 'brutal-btn-secondary', 'brutal-card', 'brutal-cta', 'brutal-dropzone',
    'brutal-faq', 'brutal-footer', 'brutal-progress', 'brutal-progress-bar', 'brutal-tag',
    'brutal-tag-blue', 'brutal-tag-green', 'brutal-tag-pink', 'brutal-tag-yellow', 'faq-answer',
    'font-bebas', 'rounded-none', 'transfer-status'
  ]);
  const classNames = new Set(matches(html, /\bclass=["']([^"']*)["']/gi)
    .flatMap((match) => match[1].split(/\s+/))
    .filter(Boolean));
  for (const className of classNames) {
    if (ignored.has(className)) continue;
    const selector = className.replaceAll(':', '\\:');
    assert.ok(css.includes(`.${selector}`), `homepage class .${className} needs a self-hosted CSS rule`);
  }
});

test('homepage CTA chooses instant scrolling for reduced-motion users', () => {
  const html = read('index.html');
  assert.match(html, /matchMedia\(['"]\(prefers-reduced-motion: reduce\)['"]\)\.matches/);
  assert.match(html, /scrollIntoView\(\{\s*behavior:\s*reduceMotion\s*\?\s*['"]auto['"]\s*:\s*['"]smooth['"]\s*\}\)/);
});

test('homepage opening tags never repeat an attribute or declare duplicate ids', () => {
  const html = read('index.html');
  const ids = [];

  for (const match of matches(html, /<[a-z][\w-]*\b[^>]*>/gi)) {
    const tag = match[0];
    const names = attributeNames(tag);
    assert.equal(new Set(names).size, names.length, `opening tag repeats an attribute: ${tag}`);
    const id = attribute(tag, 'id');
    if (id) ids.push(id);
  }

  assert.equal(new Set(ids).size, ids.length, 'homepage ids must be unique');
});

test('homepage guide import handler never invokes conversion', () => {
  const html = read('index.html');
  const importHandler = html.match(/window\.PngTransfer\.consumePendingFile\(\)[\s\S]*?\.catch\([\s\S]*?\);/)?.[0] ?? '';
  assert.notEqual(importHandler, '', 'homepage must have an import handler');
  assert.doesNotMatch(importHandler, /startConversion|startConvertBtn|\.click\s*\(/);
});

test('homepage keeps picker, drop, conversion, named download, and reset behavior wired', () => {
  const html = read('index.html');

  assert.match(html, /fileInput\.onchange\s*=\s*\(e\)\s*=>[\s\S]*?showFileSelected\(selectedFile\)/);
  assert.match(html, /dropZone\.addEventListener\(['"]drop['"][\s\S]*?showFileSelected\(file\)/);
  assert.match(html, /startConvertBtn\.onclick\s*=\s*\(e\)\s*=>[\s\S]*?startConversion\(\)/);
  assert.match(html, /ImageTracer\.imageToSVG\([\s\S]*?svgPreview\.innerHTML\s*=\s*svgstr/);
  assert.match(html, /a\.download\s*=\s*originalFileName\s*\+\s*['"]-vectorizado\.svg['"]/);
  assert.match(html, /resetBtn\.onclick\s*=\s*\(\)\s*=>[\s\S]*?resetToUploadPrompt\(\)/);
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

test('article guide footers use the standard groups and visibly expose all eight routes', () => {
  const expectedHeadings = ['Ferramentas', 'Guias', 'Sobre'];
  const expectedRoutes = [...pages.keys()];

  for (const url of guideRequirements.keys()) {
    const html = read(pages.get(url));
    const footer = html.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/i)?.[1] ?? '';
    assert.notEqual(footer, '', `${url} needs a footer`);
    const headings = matches(footer, /<h[2-6]\b[^>]*>([\s\S]*?)<\/h[2-6]>/gi)
      .map((heading) => visibleText(heading[1]));
    assert.deepEqual(headings, expectedHeadings, `${url} footer groups must be standardized`);

    for (const route of expectedRoutes) {
      assert.ok(hasVisibleLink(footer, route), `${url} footer must visibly link to ${route}`);
    }
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

test('privacy copy covers browser processing, single-use transfer, operational logs, analytics, and contact', () => {
  const privacy = read('politica-de-privacidade/index.html');
  assert.match(privacy, /processamento local/i);
  assert.match(privacy, /navegador/i);
  assert.match(privacy, /IndexedDB/i);
  assert.match(privacy, /tempor.r/i);
  assert.match(privacy, /15\s*minutos/i);
  assert.match(privacy, /expir/i);
  assert.match(privacy, /uso único/i);
  assert.match(privacy, /excluíd[oa].*consom/is);
  assert.match(privacy, /logs de hospedagem e segurança/i);
  assert.match(privacy, /endereço IP/i);
  assert.match(privacy, /analytics[^.]*intencionalmente configurad|intencionalmente configurad[^.]*analytics/i);
  assert.match(privacy, /contato@pngparasvg\.com/i);
  assert.doesNotMatch(
    privacy,
    /(?:não|nunca)\s+(?:coletamos|coleta|tratamos|registramos|armazenamos)\s+(?:(?:nenhum|qualquer)\s+)?(?:dados?\b|nada\b)|não há coleta (?:de dados|alguma)|nenhuma coleta|coleta zero/i
  );
});

test('terms explain source-file responsibility and automatic tracing limits without a quality guarantee', () => {
  const terms = read('termos-de-uso/index.html');
  assert.match(terms, /fornecida no estado em que se encontra/i);
  assert.match(terms, /direitos.*arquivo.*fonte|arquivo.*fonte.*direitos/is);
  assert.match(terms, /traçado automático/i);
  assert.match(terms, /não (?:há|oferecemos|existe) garantia.*qualidade|qualidade.*não (?:é|está) garantida/is);
  assert.doesNotMatch(terms, /arquivos enviados/i);
});

test('contact copy provides email guidance for conversion, privacy, and copyright subjects', () => {
  const contact = read('contato/index.html');
  assert.match(contact, /contato@pngparasvg\.com/i);
  assert.match(contact, /mailto:contato@pngparasvg\.com/i);
  assert.match(contact, /falhas de conversão/i);
  assert.match(contact, /privacidade/i);
  assert.match(contact, /direitos autorais/i);
});

test('trust pages contain neither guide upload forms nor unsupported structured data', () => {
  const expectedMailto = 'mailto:contato@pngparasvg.com';
  for (const [url, file] of [...pages].filter(([candidate]) =>
    ['/politica-de-privacidade/', '/termos-de-uso/', '/contato/'].includes(candidate)
  )) {
    const html = read(file);
    const mailtos = matches(html, /mailto:[^"'\s<>]+/gi).map((match) => match[0].toLowerCase());
    assert.ok(mailtos.length > 0, `${url} needs the public contact mailto`);
    assert.ok(mailtos.every((href) => href === expectedMailto), `${url} can expose only ${expectedMailto}`);
    assert.doesNotMatch(html, /<form\b/i, `${url} cannot contain a form`);
    assert.doesNotMatch(
      html,
      /application\/ld\+json|\bitemscope\b|\bitemtype\b|\bvocab\b|\btypeof\b/i,
      `${url} cannot contain unsupported structured-data markers`
    );
  }
});
