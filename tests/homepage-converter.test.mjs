import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import zlib from 'node:zlib';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const converterSource = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .find((script) => script.includes("const fileInput = document.getElementById('file-input')"));

assert.ok(converterSource, 'homepage converter script must exist');

const importSource = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .find((script) => script.includes('consumePendingFile'));

assert.ok(importSource, 'homepage import script must exist');

function element(initialClasses = []) {
  const classes = new Set(initialClasses);
  const listeners = new Map();
  return {
    value: '',
    textContent: '',
    alt: '',
    src: '',
    style: {},
    files: [],
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name)
    },
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeAttribute(name) { delete this[name]; },
    querySelector() { return null; },
    click() {},
    dispatch(type, event = {}) { return listeners.get(type)?.({ preventDefault() {}, ...event }); }
  };
}

function setup() {
  const ids = [
    'file-input', 'drop-zone', 'select-file-btn', 'remove-file-btn', 'start-convert-btn',
    'upload-prompt', 'file-selected', 'loading', 'result-container', 'svg-preview',
    'download-btn', 'reset-btn', 'file-name', 'file-size', 'thumb-img', 'progress-bar',
    'loading-text', 'transfer-status', 'cta-start-btn'
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, element()]));
  elements['file-selected'].classList.add('hidden');
  elements.loading.classList.add('hidden');
  elements['result-container'].classList.add('hidden');

  class DelayedFileReader {
    static instances = [];

    constructor() {
      this.aborted = false;
      DelayedFileReader.instances.push(this);
    }

    readAsDataURL(file) { this.file = file; }
    abort() { this.aborted = true; }
    complete(result) { this.onload?.({ target: { result } }); }
  }

  const createdElements = [];
  const appendedElements = [];
  const removedElements = [];
  const canvasOperations = [];
  const canvasOutputs = [];
  const tracedInputs = [];
  const alerts = [];
  const imagePixelsByUrl = new Map();
  let conversionImage;

  const document = {
    getElementById: (id) => elements[id],
    addEventListener() {},
    createElement: (tagName) => {
      const created = element();
      created.tagName = tagName.toUpperCase();
      createdElements.push(created);
      if (tagName === 'canvas') {
        const context2d = {
          filter: '',
          imageSmoothingEnabled: false,
          fillRect(...args) {
            canvasOperations.push({ type: 'fillRect', args });
            created.pixelData = new Uint8ClampedArray(created.width * created.height * 4).fill(255);
          },
          clearRect(...args) { canvasOperations.push({ type: 'clearRect', args }); },
          drawImage(image, ...args) {
            canvasOperations.push({ type: 'drawImage', args: [image, ...args] });
            created.pixelData = image.pixelData ? new Uint8ClampedArray(image.pixelData) : null;
          }
        };
        created.getContext = () => context2d;
        created.toDataURL = () => {
          canvasOutputs.push(created.pixelData && new Uint8ClampedArray(created.pixelData));
          return 'data:image/png;base64,preprocessed';
        };
      }
      return created;
    },
    body: {
      appendChild(node) { appendedElements.push(node); },
      removeChild(node) { removedElements.push(node); }
    }
  };
  class ConversionImage {
    constructor() {
      this.width = 2;
      this.height = 1;
      conversionImage = this;
    }
    set src(value) {
      this._src = value;
      const imageData = imagePixelsByUrl.get(value);
      if (imageData) {
        this.width = imageData.width;
        this.height = imageData.height;
        this.pixelData = imageData.pixels;
      }
    }
    get src() { return this._src; }
    completeLoad() { this.onload?.(); }
  }
  const objectUrls = [];
  const revokedUrls = [];
  const ImageTracer = {
    imageToSVG(dataUrl, success, options) {
      tracedInputs.push({ dataUrl, options, argumentCount: arguments.length });
      success('<svg viewBox="0 0 2 1"><path fill="none" d="M0 0"/></svg>');
    }
  };
  const window = {
    location: { search: '' },
    matchMedia: () => ({ matches: false })
  };
  const context = vm.createContext({
    window,
    document,
    FileReader: DelayedFileReader,
    Image: ConversionImage,
    ImageTracer,
    Blob,
    URL: {
      createObjectURL(blob) { objectUrls.push(blob); return `blob:test-${objectUrls.length}`; },
      revokeObjectURL(url) { revokedUrls.push(url); }
    },
    alert(message) { alerts.push(message); },
    console,
    setInterval: () => 1,
    clearInterval() {},
    Math,
    URLSearchParams
  });
  new vm.Script(converterSource).runInContext(context);

  function choose(file) {
    elements['file-input'].files = [file];
    elements['file-input'].onchange({ target: elements['file-input'] });
  }

  return {
    elements,
    readers: DelayedFileReader.instances,
    choose,
    canvasOperations,
    canvasOutputs,
    tracedInputs,
    createdElements,
    appendedElements,
    removedElements,
    objectUrls,
    revokedUrls,
    alerts,
    context,
    window,
    registerImagePixels(url, imageData) { imagePixelsByUrl.set(url, imageData); },
    get conversionImage() { return conversionImage; }
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function decodeRgbaPng(bytes) {
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  assert.equal(bytes[24], 8, 'fixture decoder supports 8-bit PNGs');
  assert.equal(bytes[25], 6, 'fixture decoder supports RGBA PNGs');
  assert.equal(bytes[28], 0, 'fixture decoder supports non-interlaced PNGs');
  const chunks = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') chunks.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const encoded = zlib.inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  const decoded = Buffer.alloc(stride * height);
  for (let row = 0; row < height; row += 1) {
    const filter = encoded[row * (stride + 1)];
    const scanline = encoded.subarray(row * (stride + 1) + 1, (row + 1) * (stride + 1));
    for (let column = 0; column < stride; column += 1) {
      const left = column >= 4 ? decoded[row * stride + column - 4] : 0;
      const above = row > 0 ? decoded[(row - 1) * stride + column] : 0;
      const upperLeft = row > 0 && column >= 4 ? decoded[(row - 1) * stride + column - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = above;
      else if (filter === 3) predictor = Math.floor((left + above) / 2);
      else if (filter === 4) {
        const candidate = left + above - upperLeft;
        const leftDistance = Math.abs(candidate - left);
        const aboveDistance = Math.abs(candidate - above);
        const upperLeftDistance = Math.abs(candidate - upperLeft);
        predictor = leftDistance <= aboveDistance && leftDistance <= upperLeftDistance
          ? left
          : aboveDistance <= upperLeftDistance ? above : upperLeft;
      } else assert.equal(filter, 0, `unsupported PNG filter ${filter}`);
      decoded[row * stride + column] = (scanline[column] + predictor) & 255;
    }
  }
  const alphaValues = [];
  for (let index = 3; index < decoded.length; index += 4) alphaValues.push(decoded[index]);
  return { width, height, pixels: decoded, alphaValues };
}

function setupWithImport({ search = '?import=guide' } = {}) {
  const harness = setup();
  const pending = deferred();
  harness.context.window.PngTransfer = { consumePendingFile: () => pending.promise };
  harness.context.window.location.search = search;
  new vm.Script(importSource).runInContext(harness.context);
  return Object.assign(harness, { pending });
}

test('reset before preview load keeps the cleared upload state', () => {
  const { elements, readers, choose } = setup();
  choose({ name: 'primeira.png', size: 100 });

  elements['remove-file-btn'].onclick({ stopPropagation() {} });
  readers[0].complete('data:image/png;base64,stale');

  assert.equal(elements['thumb-img'].src, undefined);
  assert.equal(elements['thumb-img'].alt, '');
  assert.equal(elements['file-selected'].classList.contains('hidden'), true);
  assert.equal(elements['upload-prompt'].classList.contains('hidden'), false);
});

test('first selection callback cannot overwrite a newer preview', () => {
  const { elements, readers, choose } = setup();
  choose({ name: 'primeira.png', size: 100 });
  choose({ name: 'segunda.png', size: 200 });

  readers[1].complete('data:image/png;base64,newer');
  readers[0].complete('data:image/png;base64,older');

  assert.equal(elements['thumb-img'].src, 'data:image/png;base64,newer');
  assert.equal(elements['thumb-img'].alt, 'Pré-visualização de segunda.png');
  assert.equal(elements['file-name'].textContent, 'segunda.png');
});

test('real transparent PNG fixture reaches tracing without a white preprocessing fill', () => {
  const fixture = fs.readFileSync(new URL('../package/testimages/12.png', import.meta.url));
  assert.deepEqual([...fixture.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(fixture[25], 6, 'fixture must be an RGBA PNG');
  const decoded = decodeRgbaPng(fixture);
  assert.ok(decoded.alphaValues.some((alpha) => alpha === 0), 'fixture must contain fully transparent pixels');
  assert.ok(decoded.alphaValues.some((alpha) => alpha === 255), 'fixture must contain fully opaque pixels');

  const harness = setup();
  harness.registerImagePixels('data:image/png;base64,fixture-conversion', decoded);
  const file = { name: 'transparente.png', size: fixture.length, bytes: fixture };
  harness.choose(file);
  harness.readers[0].complete('data:image/png;base64,fixture-preview');
  harness.elements['start-convert-btn'].onclick({ stopPropagation() {} });
  harness.readers[1].complete('data:image/png;base64,fixture-conversion');
  harness.conversionImage.completeLoad();

  assert.equal(harness.canvasOperations.some(({ type }) => type === 'fillRect'), false);
  assert.equal(harness.canvasOperations.filter(({ type }) => type === 'drawImage').length, 1);
  const outputAlpha = [...harness.canvasOutputs[0]].filter((_value, index) => index % 4 === 3);
  assert.ok(outputAlpha.some((alpha) => alpha === 0), 'preprocessed canvas must retain transparent fixture pixels');
  assert.ok(outputAlpha.some((alpha) => alpha === 255), 'preprocessed canvas must retain opaque fixture pixels');
  assert.equal(harness.tracedInputs.length, 1);
  assert.equal(harness.tracedInputs[0].dataUrl, 'data:image/png;base64,preprocessed');
  assert.equal(harness.tracedInputs[0].argumentCount, 3);
  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.tracedInputs[0].options)),
    {
      numberofcolors: 32,
      colorquantcycles: 2,
      pathomit: 1,
      mincolorratio: 0,
      ltres: 0.5,
      qtres: 0.5
    }
  );
  assert.match(harness.elements['svg-preview'].innerHTML, /<svg/);
  assert.equal(harness.elements.loading.classList.contains('hidden'), true);
  assert.equal(harness.elements['result-container'].classList.contains('hidden'), false);
});

test('conversion download uses the selected basename and reset clears the result', () => {
  const harness = setup();
  harness.choose({ name: 'marca.final.png', size: 123 });
  harness.readers[0].complete('data:image/png;base64,preview');
  harness.elements['start-convert-btn'].onclick({ stopPropagation() {} });
  harness.readers[1].complete('data:image/png;base64,conversion');
  harness.conversionImage.completeLoad();

  harness.elements['download-btn'].onclick();
  const anchor = harness.createdElements.find(({ tagName }) => tagName === 'A');
  assert.equal(anchor.download, 'marca.final-vectorizado.svg');
  assert.equal(anchor.href, 'blob:test-1');
  assert.deepEqual(harness.appendedElements, [anchor]);
  assert.deepEqual(harness.removedElements, [anchor]);
  assert.deepEqual(harness.revokedUrls, ['blob:test-1']);

  harness.elements['reset-btn'].onclick();
  assert.equal(harness.elements['result-container'].classList.contains('hidden'), true);
  assert.equal(harness.elements['upload-prompt'].classList.contains('hidden'), false);
  assert.equal(harness.elements['thumb-img'].alt, '');
  assert.equal(harness.elements['thumb-img'].src, undefined);
});

test('delayed guide import cannot replace a manual picker selection', async () => {
  const harness = setupWithImport();
  harness.choose({ name: 'manual.png', size: 50 });
  harness.pending.resolve({ name: 'guia.png', size: 60 });
  await harness.pending.promise;
  await Promise.resolve();

  assert.equal(harness.elements['file-name'].textContent, 'manual.png');
  assert.equal(harness.elements['transfer-status'].textContent, '');
});

test('delayed guide import cannot repopulate the converter after a reset', async () => {
  const harness = setupWithImport();
  harness.elements['reset-btn'].onclick();
  harness.pending.resolve({ name: 'guia.png', size: 60 });
  await harness.pending.promise;
  await Promise.resolve();

  assert.equal(harness.elements['upload-prompt'].classList.contains('hidden'), false);
  assert.equal(harness.elements['file-selected'].classList.contains('hidden'), true);
  assert.equal(harness.elements['file-name'].textContent, '');
});

test('delayed guide import cannot repopulate after the remove action', async () => {
  const harness = setupWithImport();
  harness.elements['remove-file-btn'].onclick({ stopPropagation() {} });
  harness.pending.resolve({ name: 'guia.png', size: 60 });
  await harness.pending.promise;
  await Promise.resolve();

  assert.equal(harness.elements['upload-prompt'].classList.contains('hidden'), false);
  assert.equal(harness.elements['file-selected'].classList.contains('hidden'), true);
  assert.equal(harness.elements['file-name'].textContent, '');
});

test('delayed guide import cannot alter a conversion already started', async () => {
  const harness = setupWithImport();
  harness.choose({ name: 'manual.png', size: 50 });
  harness.elements['start-convert-btn'].onclick({ stopPropagation() {} });
  harness.pending.resolve({ name: 'guia.png', size: 60 });
  await harness.pending.promise;
  await Promise.resolve();

  harness.readers.at(-1).complete('data:image/png;base64,manual-conversion');
  assert.equal(harness.elements['file-name'].textContent, 'manual.png');
  harness.conversionImage.completeLoad();
  harness.elements['download-btn'].onclick();

  const anchor = harness.createdElements.find(({ tagName }) => tagName === 'A');
  assert.equal(anchor.download, 'manual-vectorizado.svg');
  assert.equal(harness.elements.loading.classList.contains('hidden'), true);
  assert.equal(harness.elements['result-container'].classList.contains('hidden'), false);
});

test('successful manual and imported selections clear stale transfer status', async () => {
  const manual = setup();
  manual.elements['transfer-status'].textContent = 'A transferência expirou.';
  manual.choose({ name: 'manual.png', size: 50 });
  assert.equal(manual.elements['transfer-status'].textContent, '');

  const imported = setupWithImport();
  imported.elements['transfer-status'].textContent = 'Falha antiga.';
  imported.pending.resolve({ name: 'guia.png', size: 60 });
  await imported.pending.promise;
  await Promise.resolve();
  assert.equal(imported.elements['transfer-status'].textContent, '');
  assert.equal(imported.elements['file-name'].textContent, 'guia.png');
});

test('successful drop selection clears stale transfer status', () => {
  const harness = setup();
  harness.elements['transfer-status'].textContent = 'A transferência expirou.';

  harness.elements['drop-zone'].dispatch('drop', {
    dataTransfer: { files: [{ name: 'solto.png', size: 75, type: 'image/png' }] }
  });

  assert.equal(harness.elements['transfer-status'].textContent, '');
  assert.equal(harness.elements['file-name'].textContent, 'solto.png');
});

test('drop accepts a valid image with a generic browser MIME type', () => {
  const harness = setup();
  harness.elements['drop-zone'].dispatch('drop', {
    dataTransfer: { files: [{ name: 'captura.png', size: 75, type: 'application/octet-stream' }] }
  });

  assert.equal(harness.elements['file-name'].textContent, 'captura.png');
});

test('guide-marked startup reports a missing transfer but ordinary startup stays quiet', async () => {
  const guide = setupWithImport();
  guide.pending.resolve(null);
  await guide.pending.promise;
  await Promise.resolve();
  assert.match(guide.elements['transfer-status'].textContent, /expirou|não est[áa] mais dispon[ií]vel/i);

  const ordinary = setupWithImport({ search: '' });
  ordinary.pending.resolve(null);
  await ordinary.pending.promise;
  await Promise.resolve();
  assert.equal(ordinary.elements['transfer-status'].textContent, '');
});

test('CTA disables smooth scrolling when reduced motion is requested', () => {
  const normal = setup();
  let normalOptions;
  normal.elements['drop-zone'].scrollIntoView = (options) => { normalOptions = options; };
  normal.elements['cta-start-btn'].onclick();
  assert.equal(normalOptions.behavior, 'smooth');

  const reduced = setup();
  reduced.window.matchMedia = () => ({ matches: true });
  let reducedOptions;
  reduced.elements['drop-zone'].scrollIntoView = (options) => { reducedOptions = options; };
  reduced.elements['cta-start-btn'].onclick();
  assert.equal(reducedOptions.behavior, 'auto');
});
