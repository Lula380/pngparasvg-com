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
  const listeners = new Map();
  return {
    classList: { contains: (name) => classes.includes(name) },
    dataset: {},
    disabled: false,
    files: [],
    value: '',
    textContent: '',
    alt: '',
    src: '',
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

function setup({ initialRecord = null, now = 1000, autoOpenSuccess = true } = {}) {
  let currentTime = now;
  const input = element();
  const preview = element();
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
  const location = { navigations: [], assign(url) { this.navigations.push({ url, events: [...idb.events] }); } };
  const window = {
    indexedDB: idb.indexedDB,
    location,
    addEventListener() {},
    setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; }
  };
  const document = {
    readyState: 'complete',
    querySelectorAll: () => [form],
    addEventListener() {}
  };
  const context = vm.createContext({
    window, document, Blob, File: FakeFile, URL: { createObjectURL: () => 'blob:preview', revokeObjectURL() {} },
    Uint8Array, Promise, Error, Date: class extends Date { static now() { return currentTime; } }, Number, Math,
    setTimeout, queueMicrotask
  });
  vm.runInContext(source, context);
  return {
    api: window.PngTransfer, form, input, preview, status, submit, timers, location, idb,
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
  assert.equal(valid.preview.src, 'blob:preview');

  const disguised = setup();
  disguised.input.files = [new FakeFile([new Uint8Array([255, 216, 255])], 'photo.png', { type: 'image/png' })];
  await disguised.input.dispatch('change');
  assert.equal(disguised.preview.src, undefined);
  assert.match(disguised.status.textContent, /PNG válido/);
});

test('accepts exactly 10 MiB and rejects one byte more', async () => {
  const boundary = setup();
  boundary.input.files = [pngFile({ size: boundary.api.MAX_BYTES })];
  await boundary.input.dispatch('change');
  assert.equal(boundary.preview.src, 'blob:preview');

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
  assert.equal(failure.preview.src, 'blob:preview');
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

test('blocked open rejects and closes a database that succeeds late', async () => {
  const harness = setup({ autoOpenSuccess: false });
  const promise = harness.api.consumePendingFile();
  await Promise.resolve();
  harness.idb.triggerBlockedThenSuccess();
  await assert.rejects(promise);
  assert.equal(harness.idb.lateDatabaseClosed, true);
});
