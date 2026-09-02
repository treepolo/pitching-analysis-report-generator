'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer.js'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
const retiredPatch = path.join(__dirname, '..', 'src', 'export-directory-memory.js');
const STORAGE_KEY = 'pitching-analysis-report-generator.last-export-directory.v1';

function sourceSlice(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

const directoryRuntimeSource = sourceSlice(
  renderer,
  'const EXPORT_DIRECTORY_STORAGE_KEY',
  'function exportResultLabel',
);

function runtimeWithOptions({
  remembered,
  initialDirectory = '',
  activeProject = true,
  status = 'idle',
  pickerAvailable = true,
  pickerResult = 'E:\\Reports',
  pickerError = null,
  readThrows = false,
  writeThrows = false,
} = {}) {
  const storage = new Map();
  if (remembered !== undefined) storage.set(STORAGE_KEY, remembered);
  const state = {
    activeProject: activeProject ? { id: 'project-1' } : null,
    projectRoot: 'C:\\Pitching',
    export: {
      outputDirectory: initialDirectory,
      directoryNotice: '',
      status,
    },
  };
  let renders = 0;
  let pickerCalls = 0;
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
  const pitchingApp = pickerAvailable
    ? {
      async pickExportDirectory() {
        pickerCalls += 1;
        if (pickerError) throw pickerError;
        return pickerResult;
      },
    }
    : {};
  const context = {
    state,
    window: { localStorage, pitchingApp },
    displayErrorMessage(error, fallbackCode = 'APP_ERROR') {
      return error?.code || fallbackCode;
    },
    renderExportControls() { renders += 1; },
  };
  vm.createContext(context);
  new vm.Script(directoryRuntimeSource).runInContext(context);
  return {
    context,
    state,
    storage,
    renders: () => renders,
    pickerCalls: () => pickerCalls,
  };
}

test('renderer owns export directory memory and the retired patch is no longer loaded', () => {
  assert.doesNotThrow(() => new vm.Script(directoryRuntimeSource));
  assert.match(renderer, /pitching-analysis-report-generator\.last-export-directory\.v1/u);
  assert.match(renderer, /function restoreRememberedExportDirectory\(\)/u);
  assert.match(renderer, /if \(restoreRememberedExportDirectory\(\)\) renderExportControls\(\);/u);
  assert.doesNotMatch(renderer, /resetExportSelectionWithMemory|chooseExportDirectoryWithMemory/u);
  assert.ok(index.includes('<script src="./renderer.js"></script>'));
  assert.doesNotMatch(index, /export-directory-memory\.js/u);
  assert.equal(fs.existsSync(retiredPatch), false);
});

test('remembered directory normalization preserves the v1 storage contract and fails soft', () => {
  const valid = runtimeWithOptions({ remembered: '  D:\\Pitching Exports  ' });
  assert.equal(valid.context.restoreRememberedExportDirectory(), true);
  assert.equal(valid.state.export.outputDirectory, 'D:\\Pitching Exports');

  for (const invalid of ['', '   ', `D:\\Bad${String.fromCharCode(1)}Path`, 'x'.repeat(4097)]) {
    const runtime = runtimeWithOptions({ remembered: invalid, initialDirectory: 'keep-me' });
    runtime.context.resetExportSelection();
    assert.equal(runtime.state.export.outputDirectory, '');
    assert.equal(runtime.state.export.directoryNotice, '');
  }

  const readFailure = runtimeWithOptions({ remembered: 'D:\\Pitching Exports', readThrows: true });
  assert.doesNotThrow(() => readFailure.context.resetExportSelection());
  assert.equal(readFailure.state.export.outputDirectory, '');
});

test('normal project reset restores the app-global remembered directory', () => {
  const runtime = runtimeWithOptions({ remembered: 'D:\\Pitching Exports' });
  runtime.context.resetExportSelection();
  assert.equal(runtime.state.export.outputDirectory, 'D:\\Pitching Exports');
  runtime.state.activeProject = { id: 'project-2' };
  runtime.state.export.outputDirectory = 'temporary';
  runtime.context.resetExportSelection();
  assert.equal(runtime.state.export.outputDirectory, 'D:\\Pitching Exports');
});

test('a valid picker result becomes the active and remembered directory', async () => {
  const runtime = runtimeWithOptions({
    remembered: 'D:\\Pitching Exports',
    pickerResult: 'E:\\Reports',
  });
  runtime.context.resetExportSelection();
  await runtime.context.chooseExportDirectory();
  assert.equal(runtime.state.export.outputDirectory, 'E:\\Reports');
  assert.equal(runtime.storage.get(STORAGE_KEY), 'E:\\Reports');
  assert.match(runtime.state.export.directoryNotice, /Reports/u);
  assert.equal(runtime.pickerCalls(), 1);
  assert.equal(runtime.renders(), 1);
});

test('cancel, invalid result, picker failure, and unavailable picker preserve the previous directory', async () => {
  const cases = [
    { pickerResult: null, expectedNotice: /已取消/u },
    { pickerResult: {}, expectedNotice: /EXPORT_PICKER_INVALID_RESULT/u },
    { pickerError: new Error('picker failed'), expectedNotice: /EXPORT_PICKER_FAILED/u },
    { pickerAvailable: false, expectedNotice: /EXPORT_PICKER_UNAVAILABLE/u },
  ];

  for (const options of cases) {
    const runtime = runtimeWithOptions({ remembered: 'D:\\Pitching Exports', ...options });
    runtime.context.resetExportSelection();
    await runtime.context.chooseExportDirectory();
    assert.equal(runtime.state.export.outputDirectory, 'D:\\Pitching Exports');
    assert.equal(runtime.storage.get(STORAGE_KEY), 'D:\\Pitching Exports');
    assert.match(runtime.state.export.directoryNotice, options.expectedNotice);
    assert.equal(runtime.renders(), 1);
  }
});

test('storage write failure does not discard a newly selected directory for the current session', async () => {
  const runtime = runtimeWithOptions({
    remembered: 'D:\\Pitching Exports',
    pickerResult: 'E:\\Reports',
    writeThrows: true,
  });
  runtime.context.resetExportSelection();
  await runtime.context.chooseExportDirectory();
  assert.equal(runtime.state.export.outputDirectory, 'E:\\Reports');
  assert.equal(runtime.storage.get(STORAGE_KEY), 'D:\\Pitching Exports');
});

test('guarded picker calls preserve the existing remembered directory without opening the picker', async () => {
  for (const options of [
    { activeProject: false },
    { status: 'running' },
    { status: 'cancelling' },
  ]) {
    const runtime = runtimeWithOptions({ remembered: 'D:\\Pitching Exports', ...options });
    runtime.context.resetExportSelection();
    await runtime.context.chooseExportDirectory();
    assert.equal(runtime.state.export.outputDirectory, 'D:\\Pitching Exports');
    assert.equal(runtime.storage.get(STORAGE_KEY), 'D:\\Pitching Exports');
    assert.equal(runtime.pickerCalls(), 0);
  }
});

test('export start still prefers the selected directory and falls back to the project output directory', () => {
  const exportStart = sourceSlice(
    renderer,
    'async function startReportExport()',
    'async function cancelReportExport',
  );
  assert.match(
    exportStart,
    /const outputDirectory = state\.export\.outputDirectory \|\| defaultExportDirectory\(\);/u,
  );
});
