(function () {
  'use strict';

  const DB_NAME = 'pngparasvg-transfer';
  const STORE_NAME = 'pending-files';
  const RECORD_KEY = 'pending-png';
  const MAX_BYTES = 10 * 1024 * 1024;
  const TTL_MS = 15 * 60 * 1000;
  const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

  const INVALID_FORMAT_MESSAGE = 'Selecione um arquivo PNG válido.';
  const OVERSIZE_MESSAGE = 'O arquivo deve ter no máximo 10 MiB.';
  const STORAGE_FAILURE_MESSAGE = 'Não foi possível preparar a imagem neste navegador. Abra o conversor e selecione o arquivo novamente.';
  const EXPIRED_MESSAGE = 'A transferência expirou. Selecione o arquivo novamente.';

  function requestResult(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error(STORAGE_FAILURE_MESSAGE)); };
    });
  }

  function transactionDone(transaction) {
    return new Promise(function (resolve, reject) {
      transaction.oncomplete = function () { resolve(); };
      transaction.onabort = function () { reject(transaction.error || new Error(STORAGE_FAILURE_MESSAGE)); };
      transaction.onerror = function () { reject(transaction.error || new Error(STORAGE_FAILURE_MESSAGE)); };
    });
  }

  function openDatabase() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error(STORAGE_FAILURE_MESSAGE));
        return;
      }

      const request = window.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = function () {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error(STORAGE_FAILURE_MESSAGE)); };
      request.onblocked = function () { reject(new Error(STORAGE_FAILURE_MESSAGE)); };
    });
  }

  function isPng(file) {
    return Boolean(file) && (
      file.type === 'image/png' ||
      (!file.type && /\.png$/i.test(file.name || ''))
    );
  }

  function validationMessage(file) {
    if (!isPng(file)) return INVALID_FORMAT_MESSAGE;
    if (file.size > MAX_BYTES) return OVERSIZE_MESSAGE;
    return '';
  }

  async function hasPngSignature(blob) {
    if (!(blob instanceof Blob) || blob.size < PNG_SIGNATURE.length) return false;
    const bytes = new Uint8Array(await blob.slice(0, PNG_SIGNATURE.length).arrayBuffer());
    return PNG_SIGNATURE.every(function (value, index) { return bytes[index] === value; });
  }

  async function purgeExpiredRecord() {
    let database;
    try {
      database = await openDatabase();
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const record = await requestResult(store.get(RECORD_KEY));
      if (record && (!Number.isFinite(record.expiresAt) || record.expiresAt <= Date.now())) {
        store.delete(RECORD_KEY);
      }
      await transactionDone(transaction);
    } catch (error) {
      // Best-effort privacy cleanup; the normal picker must remain usable.
    } finally {
      if (database) database.close();
    }
  }

  function scheduleExpiryCleanup(expiresAt) {
    const delay = Math.max(0, Math.min(expiresAt - Date.now(), 2147483647));
    window.setTimeout(purgeExpiredRecord, delay);
  }

  async function storeFile(file) {
    const database = await openDatabase();
    try {
      const now = Date.now();
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put({
        key: RECORD_KEY,
        name: file.name,
        type: file.type,
        lastModified: file.lastModified,
        blob: file,
        createdAt: now,
        expiresAt: now + TTL_MS
      });
      await transactionDone(transaction);
      scheduleExpiryCleanup(now + TTL_MS);
    } finally {
      database.close();
    }
  }

  function initGuideUploads() {
    purgeExpiredRecord();
    const forms = document.querySelectorAll('.guide-upload');

    forms.forEach(function (form) {
      if (form.dataset.pngTransferReady === 'true') return;
      form.dataset.pngTransferReady = 'true';

      const input = form.querySelector('.guide-upload-input');
      const preview = form.querySelector('.guide-upload-preview');
      const status = form.querySelector('.guide-upload-error');
      const submit = form.querySelector('.guide-upload-submit');
      if (!input || !preview || !status || !submit) return;

      let selectedFile = null;
      let submitting = false;
      let previewUrl = '';
      let selectionVersion = 0;

      function clearPreview() {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = '';
        preview.removeAttribute('src');
      }

      input.addEventListener('change', async function () {
        if (submitting) return;
        const version = ++selectionVersion;
        const file = input.files && input.files[0];
        const message = validationMessage(file);
        clearPreview();
        selectedFile = null;

        const hasValidSignature = !message && await hasPngSignature(file);
        if (version !== selectionVersion) return;
        if (message || !hasValidSignature) {
          status.textContent = message || INVALID_FORMAT_MESSAGE;
          input.value = '';
          return;
        }

        selectedFile = file;
        previewUrl = URL.createObjectURL(file);
        preview.src = previewUrl;
        preview.alt = 'Prévia de ' + file.name;
        status.textContent = file.name + ' selecionado. Revise a prévia e continue.';
      });

      form.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (submitting) return;
        const message = validationMessage(selectedFile);
        if (message) {
          status.textContent = message;
          return;
        }

        submitting = true;
        submit.disabled = true;
        input.disabled = true;
        status.textContent = 'Preparando a imagem no navegador…';
        try {
          await storeFile(selectedFile);
          window.location.assign('/?import=guide#converter');
        } catch (error) {
          submitting = false;
          submit.disabled = false;
          input.disabled = false;
          status.textContent = STORAGE_FAILURE_MESSAGE;
        }
      });

      window.addEventListener('pagehide', clearPreview, { once: true });
    });
  }

  async function consumePendingFile() {
    const database = await openDatabase();
    let record;

    try {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      record = await requestResult(store.get(RECORD_KEY));
      if (record) store.delete(RECORD_KEY);
      await transactionDone(transaction);
    } finally {
      database.close();
    }

    if (!record) return null;
    if (!Number.isFinite(record.expiresAt) || record.expiresAt <= Date.now()) {
      throw new Error(EXPIRED_MESSAGE);
    }
    if (!(record.blob instanceof Blob) || !isPng(record) || record.blob.size > MAX_BYTES || !(await hasPngSignature(record.blob))) {
      throw new Error(INVALID_FORMAT_MESSAGE);
    }

    return new File([record.blob], record.name, {
      type: record.type || 'image/png',
      lastModified: record.lastModified || Date.now()
    });
  }

  window.PngTransfer = {
    MAX_BYTES: MAX_BYTES,
    TTL_MS: TTL_MS,
    initGuideUploads: initGuideUploads,
    consumePendingFile: consumePendingFile
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGuideUploads, { once: true });
  } else {
    initGuideUploads();
  }
}());
