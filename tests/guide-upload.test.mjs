import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/guide-upload.js', import.meta.url), 'utf8');
const signature = [137, 80, 78, 71, 13, 10, 26, 10];

class FakeFile extends Blob {
  constructor(parts, name, options = {}) {
    super(parts, options);
    this.name = name;
    this.lastModified = options.lastModified ?? 1;
  }
}

function element(classes = []) {
  const classNames = new Set(classes);
  const listeners = new Map();
  return {
    classList: {
      add: (...names) => names.forEach((name) => classNames.add(name)),
      remove: (...names) => names.forEach((name) => classNames.delete(name)),
      contains: (name) => classNames.has(name)
    },
    dataset: {},
    disabled: false,
    files: [],
    value: '',
    textContent: '',
    alt: '',
    src: '',
    hidden: classes.includes('hidden'),
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeAttribute(name) { delete this[name]; },
    async dispatch(type) { return listeners.get(type)?.({ preventDefault() {} }); }
  };
}

function indexedDbHarness(initialRecord = null, autoOpenSuccess = true) {
  let record = initialRecord;
  let blockedRequest;
  const events = [];
  let lateDatabaseClosed = false;

  function request(result) {
    const target = { result, error: null };
    queueMicrotask(() => target.onsuccess?.());
    return target;
  }

  function database() {
    return {
      objectStoreNames: { contains: () => true },
      close() { lateDatabaseClosed = true; events.push('close'); },
      transaction() {
        let pendingWrite;
        const transaction = {
          objectStore() {
            return {
              get() { return request(record); },
              put(value) { pendingWrite = () => { record = value; events.push('commit'); }; },
              delete() { pendingWrite = () => { record = null; events.push('delete'); }; }
            };
          }
        };
        setTimeout(() => {
          pendingWrite?.();
          transaction.oncomplete?.();
        }, 0);
        return transaction;
      }
    };
  }

  return {
    events,
    get record() { return record; },
    get lateDatabaseClosed() { return lateDatabaseClosed; },
    indexedDB: {
      open() {
        const target = { result: database(), error: null };
        blockedRequest = target;
        if (autoOpenSuccess) queueMicrotask(() => target.onsuccess?.());
        return target;
      }
    },
    triggerBlockedThenSuccess() {
      blockedRequest.onblocked?.();
      blockedRequest.onsuccess?.();
    }
  };
}

function setup({ initialRecord = null, now = 1000, autoOpenSuccess = true, includeGuideForm = true } = {}) {
  let currentTime = now;
  const input = element();
  const preview = element(['hidden']);
  preview.removeAttribute('src');
  const status = element();
  const submit = element();
  const form = element();
  form.querySelector = (selector) => ({
    '.guide-upload-input': input,
    '.guide-upload-preview': preview,
    '.guide-upload-error': status,
    '.guide-upload-submit': submit
  }[selector]);

  const idb = indexedDbHarness(initialRecord, autoOpenSuccess);
  const timers = [];
  const pageListeners = new Map();
  const revokedUrls = [];
  let objectUrlCount = 0;
  const location = { navigations: [], assign(url) { this.navigations.push({ url, events: [...idb.events] }); } };
  const window = {
    indexedDB: idb.indexedDB,
    location,
    addEventListener(type, listener) { pageListeners.set(type, listener); },
    setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; }
  };
  const document = {
    readyState: 'complete',
    querySelectorAll: () => includeGuideForm ? [form] : [],
    addEventListener() {}
  };
  const context = vm.createContext({
    window, document, Blob, File: FakeFile, URL: {
      createObjectURL: () => `blob:preview-${++objectUrlCount}`,
      revokeObjectURL(url) { revokedUrls.push(url); }
    },
    Uint8Array, Promise, Error, Date: class extends Date { static now() { return currentTime; } }, Number, Math,
    setTimeout, queueMicrotask
  });
  vm.runInContext(source, context);
  return {
    api: window.PngTransfer, form, input, preview, status, submit, timers, location, idb, revokedUrls,
    dispatchPage(type) { pageListeners.get(type)?.(); },
    setNow(value) { currentTime = value; }
  };
}

function pngFile({ size = signature.length, name = 'image.png', type = 'image/png' } = {}) {
  return new FakeFile([new Uint8Array(signature), new Uint8Array(Math.max(0, size - signature.length))], name, { type });
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 5));
}

test('accepts PNG magic bytes and rejects a renamed JPEG before preview', async () => {
  const valid = setup();
  valid.input.files = [pngFile()];
  await valid.input.dispatch('change');
  assert.equal(valid.preview.src, 'blob:preview-1');

  const disguised = setup();
  disguised.input.files = [new FakeFile([new Uint8Array([255, 216, 255])], 'photo.png', { type: 'image/png' })];
  await disguised.input.dispatch('change');
  assert.equal(disguised.preview.src, undefined);
  assert.match(disguised.status.textContent, /PNG válido/);
});

test('accepts a byte-valid PNG even when the browser reports a generic MIME type', async () => {
  const harness = setup();
  harness.input.files = [pngFile({ name: 'export.bin', type: 'application/octet-stream' })];

  await harness.input.dispatch('change');

  assert.equal(harness.preview.src, 'blob:preview-1');
  assert.equal(harness.status.textContent, 'export.bin selecionado. Revise a prévia e continue.');
});

test('accepts exactly 10 MiB and rejects one byte more', async () => {
  const boundary = setup();
  boundary.input.files = [pngFile({ size: boundary.api.MAX_BYTES })];
  await boundary.input.dispatch('change');
  assert.equal(boundary.preview.src, 'blob:preview-1');

  const over = setup();
  over.input.files = [pngFile({ size: over.api.MAX_BYTES + 1 })];
  await over.input.dispatch('change');
  assert.match(over.status.textContent, /10 MiB/);
});

test('commits storage before navigation and recovers UI after storage failure', async () => {
  const success = setup();
  success.input.files = [pngFile()];
  await success.input.dispatch('change');
  await success.form.dispatch('submit');
  assert.equal(success.location.navigations.length, 1);
  assert.ok(success.location.navigations[0].events.includes('commit'));

  const failure = setup();
  failure.api.consumePendingFile = undefined;
  failure.input.files = [pngFile()];
  await failure.input.dispatch('change');
  failure.idb.indexedDB.open = () => { const request = {}; queueMicrotask(() => request.onerror?.()); return request; };
  await failure.form.dispatch('submit');
  assert.equal(failure.input.disabled, false);
  assert.equal(failure.submit.disabled, false);
  assert.equal(failure.input.files[0].name, 'image.png');
  assert.equal(failure.preview.src, 'blob:preview-1');
  assert.match(failure.status.textContent, /selecione o arquivo novamente/i);
});

test('consume is single-use and deletes expired or malformed records', async () => {
  const validRecord = { key: 'pending-png', name: 'ok.png', type: 'image/png', blob: pngFile(), expiresAt: 2000 };
  const valid = setup({ initialRecord: validRecord });
  assert.equal((await valid.api.consumePendingFile()).name, 'ok.png');
  assert.equal(await valid.api.consumePendingFile(), null);
  assert.ok(valid.idb.events.includes('delete'));

  for (const record of [
    { ...validRecord, expiresAt: 999 },
    { ...validRecord, blob: new Blob([new Uint8Array([1, 2, 3])]) }
  ]) {
    const invalid = setup({ initialRecord: record });
    await assert.rejects(invalid.api.consumePendingFile());
    assert.equal(invalid.idb.record, null);
  }
});

test('initialization schedules valid-record cleanup for remaining TTL', async () => {
  const record = { key: 'pending-png', name: 'ok.png', type: 'image/png', blob: pngFile(), expiresAt: 1600 };
  const harness = setup({ initialRecord: record, now: 1000 });
  await settle();
  const cleanup = harness.timers.find(({ delay }) => delay === 600);
  assert.ok(cleanup);
  harness.setNow(1600);
  cleanup.callback();
  await settle();
  assert.equal(harness.idb.record, null);
});

test('homepage initialization does not purge before the import consumer runs', async () => {
  const record = { key: 'pending-png', name: 'ok.png', type: 'image/png', blob: pngFile(), expiresAt: 1600 };
  const harness = setup({ initialRecord: record, now: 1000, includeGuideForm: false });

  await settle();

  assert.deepEqual(harness.idb.events, []);
  assert.equal((await harness.api.consumePendingFile()).name, 'ok.png');
});

test('blocked open rejects and closes a database that succeeds late', async () => {
  const harness = setup({ autoOpenSuccess: false });
  const promise = harness.api.consumePendingFile();
  await Promise.resolve();
  harness.idb.triggerBlockedThenSuccess();
  await assert.rejects(promise);
  assert.equal(harness.idb.lateDatabaseClosed, true);
});

test('exports only the exact transfer interface', () => {
  const harness = setup();
  assert.deepEqual(Object.keys(harness.api).sort(), ['MAX_BYTES', 'TTL_MS', 'consumePendingFile', 'initGuideUploads']);
});

test('consume normalizes native storage errors while preserving domain errors', async () => {
  const native = setup();
  native.idb.indexedDB.open = () => {
    const request = { error: new DOMException('Internal database detail', 'QuotaExceededError') };
    queueMicrotask(() => request.onerror?.());
    return request;
  };
  await assert.rejects(native.api.consumePendingFile(), (error) => {
    assert.match(error.message, /Não foi possível preparar/);
    assert.doesNotMatch(error.message, /Internal database detail/);
    return true;
  });

  const expired = setup({ initialRecord: { key: 'pending-png', name: 'ok.png', type: 'image/png', blob: pngFile(), expiresAt: 999 } });
  await assert.rejects(expired.api.consumePendingFile(), /transferência expirou/);
});

test('revokes preview object URLs on replacement and pagehide', async () => {
  const harness = setup();
  harness.input.files = [pngFile({ name: 'first.png' })];
  await harness.input.dispatch('change');
  harness.input.files = [pngFile({ name: 'second.png' })];
  await harness.input.dispatch('change');
  assert.deepEqual(harness.revokedUrls, ['blob:preview-1']);
  harness.dispatchPage('pagehide');
  assert.deepEqual(harness.revokedUrls, ['blob:preview-1', 'blob:preview-2']);
});

test('preview accessibility state follows selection, rejection, and page exit', async () => {
  const harness = setup();
  assert.equal(harness.preview.src, undefined);
  assert.equal(harness.preview.alt, '');
  assert.equal(harness.preview.classList.contains('hidden'), true);
  assert.equal(harness.preview.hidden, true);

  harness.input.files = [pngFile({ name: 'logo.png' })];
  await harness.input.dispatch('change');
  assert.equal(harness.preview.src, 'blob:preview-1');
  assert.equal(harness.preview.alt, 'Prévia de logo.png');
  assert.equal(harness.preview.classList.contains('hidden'), false);
  assert.equal(harness.preview.hidden, false);

  harness.input.files = [new FakeFile([new Uint8Array([255, 216, 255])], 'fake.png', { type: 'image/png' })];
  await harness.input.dispatch('change');
  assert.equal(harness.preview.src, undefined);
  assert.equal(harness.preview.alt, '');
  assert.equal(harness.preview.classList.contains('hidden'), true);
  assert.equal(harness.preview.hidden, true);

  harness.input.files = [pngFile({ name: 'again.png' })];
  await harness.input.dispatch('change');
  harness.dispatchPage('pagehide');
  assert.equal(harness.preview.src, undefined);
  assert.equal(harness.preview.alt, '');
  assert.equal(harness.preview.classList.contains('hidden'), true);
  assert.equal(harness.preview.hidden, true);
});
