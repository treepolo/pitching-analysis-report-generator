'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const preferenceSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'export-kind-preference.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
const STORAGE_KEY = 'pitching-analysis-report-generator.last-export-kind.v1';

function runPreference({ remembered, initial = 'folder', readThrows = false, writeThrows = false } = {}) {
  const storage = new Map();
  if (remembered !== undefined) storage.set(STORAGE_KEY, remembered);
  const listeners = new Map();
  const select = {
    value: initial,
    options: [
      { value: 'folder' },
      { value: 'zip' },
      { value: 'single-html' },
    ],
    addEventListener(name, listener) {
      listeners.set(name, listener);
    },
  };
  const localStorage = {
    getItem(key) {
      if (readThrows) throw new Error('storage read failed');
      return storage.get(key) ?? null;
    },
    setItem(key, value) {
      if (writeThrows) throw new Error('storage write failed');
      storage.set(key, String(value));
    },
  };
  const context = {
    document: {
      querySelector(selector) {
        return selector === '#export-kind' ? select : null;
      },
    },
    window: { localStorage },
  };
  vm.createContext(context);
  assert.doesNotThrow(() => new vm.Script(preferenceSource).runInContext(context));
  return { select, storage, listeners };
}

test('export kind preference loads before renderer and owns only the export-kind selection', () => {
  const preferenceIndex = indexSource.indexOf('<script src="./export-kind-preference.js"></script>');
  const rendererIndex = indexSource.indexOf('<script src="./renderer.js"></script>');
  assert.ok(preferenceIndex >= 0);
  assert.ok(rendererIndex > preferenceIndex);
  assert.match(preferenceSource, /last-export-kind\.v1/u);
  assert.doesNotMatch(preferenceSource, /outputDirectory|pickExportDirectory/u);
});

test('valid remembered export kinds are restored', () => {
  for (const kind of ['folder', 'zip', 'single-html']) {
    const runtime = runPreference({ remembered: kind });
    assert.equal(runtime.select.value, kind);
  }
});

test('invalid or stale remembered export kinds leave the current selection unchanged', () => {
  for (const remembered of ['', 'both', 'unknown', ' single-html-extra ']) {
    const runtime = runPreference({ remembered, initial: 'folder' });
    assert.equal(runtime.select.value, 'folder');
  }
});

test('changing export kind persists the selected value', () => {
  const runtime = runPreference({ remembered: 'folder' });
  runtime.select.value = 'single-html';
  runtime.listeners.get('change')();
  assert.equal(runtime.storage.get(STORAGE_KEY), 'single-html');
  runtime.select.value = 'zip';
  runtime.listeners.get('change')();
  assert.equal(runtime.storage.get(STORAGE_KEY), 'zip');
});

test('storage failures fail soft without changing a usable current selection', () => {
  const readFailure = runPreference({ remembered: 'single-html', initial: 'zip', readThrows: true });
  assert.equal(readFailure.select.value, 'zip');

  const writeFailure = runPreference({ remembered: 'folder', writeThrows: true });
  writeFailure.select.value = 'single-html';
  assert.doesNotThrow(() => writeFailure.listeners.get('change')());
  assert.equal(writeFailure.storage.get(STORAGE_KEY), 'folder');
  assert.equal(writeFailure.select.value, 'single-html');
});
