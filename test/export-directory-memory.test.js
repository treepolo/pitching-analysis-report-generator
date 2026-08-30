'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'export-directory-memory.js'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');

function runtimeWithRememberedDirectory(initialDirectory = 'D:\\Pitching Exports') {
  const storage = new Map([
    ['pitching-analysis-report-generator.last-export-directory.v1', initialDirectory],
  ]);
  const state = { export: { outputDirectory: '', directoryNotice: '' } };
  let renders = 0;
  const context = {
    state,
    window: {
      localStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, String(value)),
      },
    },
    resetExportSelection() {
      state.export.outputDirectory = '';
      state.export.directoryNotice = '';
    },
    async chooseExportDirectory() {
      state.export.outputDirectory = 'E:\\Reports';
    },
    renderExportControls() { renders += 1; },
  };
  vm.createContext(context);
  new vm.Script(source).runInContext(context);
  return { context, state, storage, renders: () => renders };
}

test('export directory memory runtime compiles and loads after renderer', () => {
  assert.doesNotThrow(() => new vm.Script(source));
  assert.ok(index.indexOf('./export-directory-memory.js') > index.indexOf('./renderer.js'));
});

test('remembered export directory survives the normal project reset seam', () => {
  const runtime = runtimeWithRememberedDirectory();
  assert.equal(runtime.state.export.outputDirectory, 'D:\\Pitching Exports');
  runtime.context.resetExportSelection();
  assert.equal(runtime.state.export.outputDirectory, 'D:\\Pitching Exports');
  assert.ok(runtime.renders() >= 1);
});

test('a newly chosen export directory becomes the next remembered directory', async () => {
  const runtime = runtimeWithRememberedDirectory();
  await runtime.context.chooseExportDirectory();
  assert.equal(
    runtime.storage.get('pitching-analysis-report-generator.last-export-directory.v1'),
    'E:\\Reports',
  );
  runtime.context.resetExportSelection();
  assert.equal(runtime.state.export.outputDirectory, 'E:\\Reports');
});
