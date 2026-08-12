import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const converterSource = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .find((script) => script.includes("const fileInput = document.getElementById('file-input')"));

assert.ok(converterSource, 'homepage converter script must exist');

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
    'loading-text', 'transfer-status'
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

  const document = {
    getElementById: (id) => elements[id],
    addEventListener() {},
    createElement: () => element(),
    body: { appendChild() {}, removeChild() {} }
  };
  const context = vm.createContext({
    document,
    FileReader: DelayedFileReader,
    Image: class {},
    ImageTracer: {},
    Blob,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    alert() {},
    console,
    setInterval: () => 1,
    clearInterval() {},
    Math
  });
  new vm.Script(converterSource).runInContext(context);

  function choose(file) {
    elements['file-input'].files = [file];
    elements['file-input'].onchange({ target: elements['file-input'] });
  }

  return { elements, readers: DelayedFileReader.instances, choose };
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
