'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  ExportJobController,
  assertSafeOutputRoot,
  validatePickedExportDirectory,
} = require('../../src/export/app-bridge');

let testRoot;

test.before(async () => {
  testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pitch-report-export-bridge-test-'));
});

test.after(async () => {
  if (testRoot) await fs.rm(testRoot, { recursive: true, force: true });
});

function request(outputKind = 'folder') {
  return {
    projectId: 'project-1',
    projectRoot: testRoot,
    reportDocument: {
      schemaVersion: 1,
      title: 'Bridge fixture',
      sections: [{ blocks: [{ type: 'rich-text', content: 'fixture' }] }],
    },
    assets: [],
    outputDirectory: path.join(testRoot, 'output'),
    reportName: 'Bridge fixture',
    outputKind,
  };
}

test('validates export output roots lexically and through realpath ancestors', async () => {
  const nested = path.join(testRoot, 'nested', 'output');
  assert.equal(await assertSafeOutputRoot(testRoot, nested), path.resolve(nested));
  await assert.rejects(
    assertSafeOutputRoot(testRoot, path.join(testRoot, '..', 'outside')),
    /outside the project root/iu,
  );
  await assert.rejects(
    assertSafeOutputRoot(testRoot, 'relative-output'),
    /absolute safe path/iu,
  );
});

test('validates native picker results as existing directories inside the project root', async () => {
  const selected = path.join(testRoot, 'selected-output');
  await fs.mkdir(selected, { recursive: true });
  assert.equal(await validatePickedExportDirectory(testRoot, selected), path.resolve(selected));
  assert.equal(await validatePickedExportDirectory(testRoot, null), null);
  assert.equal(await validatePickedExportDirectory(testRoot, undefined), null);

  await assert.rejects(
    validatePickedExportDirectory(testRoot, path.join(testRoot, '..', 'outside')),
    /outside the project root/iu,
  );
  const filePath = path.join(testRoot, 'not-a-directory');
  await fs.writeFile(filePath, 'fixture');
  await assert.rejects(
    validatePickedExportDirectory(testRoot, filePath),
    /must be a directory/iu,
  );
  await assert.rejects(
    validatePickedExportDirectory(testRoot, path.join(testRoot, 'missing-output')),
    /unavailable/iu,
  );
});

test('exposes running, failure, retry, and completion states with a stable job id contract', async () => {
  let attempts = 0;
  const calls = [];
  const controller = new ExportJobController({
    exporter: async (input) => {
      calls.push(input);
      attempts += 1;
      if (attempts === 1) throw new Error('fixture export failure');
      return { folderPath: path.join(input.outputDirectory, 'Bridge fixture'), zipPath: null };
    },
  });

  const started = await controller.start(request('zip'));
  assert.match(started.jobId, /^[0-9a-f-]{36}$/iu);
  assert.equal(started.status, 'running');
  const failed = await controller.wait(started.jobId);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error.code, 'EXPORT_FAILED');

  const retried = await controller.retry(started.jobId);
  assert.notEqual(retried.jobId, started.jobId);
  const completed = await controller.wait(retried.jobId);
  assert.equal(completed.status, 'completed');
  assert.equal(completed.result.zipPath, null);
  assert.equal(calls[1].createZip, true);
  assert.equal(calls[1].signal.aborted, false);
  assert.equal(controller.status(retried.jobId).status, 'completed');
});

test('cancels an in-flight export and permits retry without leaving controller state running', async () => {
  let attempts = 0;
  const controller = new ExportJobController({
    exporter: ({ signal }) => {
      attempts += 1;
      if (attempts > 1) return Promise.resolve({ folderPath: 'recovered', zipPath: null });
      return new Promise((resolve, reject) => {
        const abort = () => {
          const error = new Error('aborted fixture');
          error.code = 'EXPORT_CANCELLED';
          reject(error);
        };
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort, { once: true });
      });
    },
  });

  const started = await controller.start(request());
  const cancelling = controller.cancel(started.jobId);
  assert.equal(cancelling.status, 'cancelling');
  const cancelled = await controller.wait(started.jobId);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.error.code, 'EXPORT_CANCELLED');

  const retried = await controller.retry(started.jobId);
  const recovered = await controller.wait(retried.jobId);
  assert.equal(recovered.status, 'completed');
});

test('main/preload keep export lifecycle channels renderer-independent', async () => {
  const mainSource = await fs.readFile(path.join(__dirname, '..', '..', 'src', 'main.js'), 'utf8');
  const preloadSource = await fs.readFile(path.join(__dirname, '..', '..', 'src', 'preload.js'), 'utf8');
  for (const channel of [
    'export:pick-directory',
    'export:start',
    'export:status',
    'export:wait',
    'export:cancel',
    'export:retry',
  ]) {
    assert.match(mainSource, new RegExp(`['"]${channel}['"]`, 'u'));
  }
  for (const method of [
    'pickExportDirectory',
    'startExport',
    'getExportStatus',
    'waitForExport',
    'cancelExport',
    'retryExport',
  ]) {
    assert.match(preloadSource, new RegExp(String.raw`\b${method}\s*:`, 'u'));
  }
  assert.match(mainSource, /dialog\.showOpenDialog\(senderWindow[\s\S]*openDirectory/iu);
  assert.match(mainSource, /validatePickedExportDirectory\(PROJECT_ROOT, result\.filePaths\[0\]\)/u);
  assert.match(preloadSource, /pickExportDirectory:\s*\(\)\s*=>\s*ipcRenderer\.invoke\(['"]export:pick-directory['"]\)/u);
  assert.doesNotMatch(preloadSource, /document\.querySelector|window\.addEventListener/iu);
});
