'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const { createTestTemp } = require('../project-temp');
const {
  ExportJobController,
  assertSafeOutputRoot,
  serializeError,
  validatePickedExportDirectory,
} = require('../../src/export/app-bridge');
const { exportReport } = require('../../src/export/exporter');

let testRoot;

test.before(async () => {
  testRoot = await createTestTemp('pitch-report-export-bridge-test-');
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

test('runs a video-only empty-label report through the export bridge', async () => {
  const sourceVideo = path.join(testRoot, 'bridge-video-only.mp4');
  await fs.writeFile(sourceVideo, 'bridge-video-only-fixture', 'utf8');
  const outputDirectory = path.join(testRoot, 'bridge-video-only-output');
  const controller = new ExportJobController({ exporter: exportReport });
  const started = await controller.start({
    projectId: 'project-1',
    projectRoot: testRoot,
    reportDocument: {
      schemaVersion: 1,
      title: '',
      sections: [{
        title: '',
        blocks: [{ type: 'singleVideo', mediaAssetId: 'bridge-video', label: '' }],
      }],
    },
    assets: [{
      id: 'bridge-video',
      kind: 'video',
      sourceReference: { relativePath: path.relative(testRoot, sourceVideo).split(path.sep).join('/') },
      displayName: 'bridge-video-only.mp4',
    }],
    outputDirectory,
    reportName: '',
    outputKind: 'both',
  });
  const completed = await controller.wait(started.jobId);

  assert.equal(completed.status, 'completed');
  assert.equal(completed.result.validation.valid, true);
  assert.equal(completed.result.validation.assetCount, 1);
  assert.equal(completed.result.zip.parity.valid, true);
  assert.equal(await fs.stat(path.join(completed.result.folderPath, 'report.html')).then((stats) => stats.isFile()), true);
  assert.equal(await fs.stat(completed.result.zipPath).then((stats) => stats.isFile()), true);
});

test('exports renderer-shaped text-only, video-only, and mixed snapshots through jobs', async () => {
  const sourceVideo = path.join(testRoot, 'bridge-shape-video.mp4');
  await fs.writeFile(sourceVideo, 'bridge-shape-video-fixture', 'utf8');
  const relativeVideo = path.relative(testRoot, sourceVideo).split(path.sep).join('/');
  const videoAsset = {
    id: 'bridge-shape-video',
    kind: 'video',
    sourceReference: { relativePath: relativeVideo },
    displayName: 'bridge-shape-video.mp4',
  };
  const cases = [
    {
      name: 'text-only',
      document: {
        schemaVersion: 1,
        title: '純文字報告',
        sections: [{ title: '', blocks: [{ type: 'rich-text', content: '純文字內容' }] }],
      },
      assets: [],
    },
    {
      name: 'video-only',
      document: {
        schemaVersion: 1,
        title: '',
        sections: [{ title: '', blocks: [{ type: 'singleVideo', mediaAssetId: videoAsset.id, label: '' }] }],
      },
      assets: [videoAsset],
    },
    {
      name: 'mixed',
      document: {
        schemaVersion: 1,
        title: '混合報告',
        sections: [{
          title: '',
          blocks: [
            { type: 'rich-text', content: '影片前說明' },
            { type: 'singleVideo', mediaAssetId: videoAsset.id, label: '實測影片' },
          ],
        }],
      },
      assets: [videoAsset, {
        id: 'bridge-shape-unused',
        kind: 'video',
        sourceReference: { relativePath: 'https://example.test/not-copied.mp4' },
        displayName: 'not-copied.mp4',
      }],
    },
  ];

  for (const entry of cases) {
    const controller = new ExportJobController({ exporter: exportReport });
    const rendererRequest = {
      projectId: 'project-1',
      outputDirectory: path.join(testRoot, `bridge-shape-${entry.name}`),
      reportName: entry.document.title,
      outputKind: 'both',
    };
    const started = await controller.start({
      projectRoot: testRoot,
      ...rendererRequest,
      // Main adds these persisted snapshot fields after preload allowlisting.
      reportDocument: entry.document,
      assets: entry.assets,
    });
    const completed = await controller.wait(started.jobId);
    assert.equal(completed.status, 'completed', `${entry.name} export failed`);
    assert.equal(completed.result.validation.valid, true, `${entry.name} folder invalid`);
    assert.equal(completed.result.zip.parity.valid, true, `${entry.name} ZIP invalid`);
    assert.equal(await fs.stat(path.join(completed.result.folderPath, 'report.html')).then((stats) => stats.isFile()), true);
    assert.equal(await fs.stat(completed.result.zipPath).then((stats) => stats.isFile()), true);
    assert.equal(completed.result.manifest.assets.length, entry.name === 'text-only' ? 0 : 1);
  }
});

test('validates export output roots and permits safe external destinations', async () => {
  const nested = path.join(testRoot, 'nested', 'output');
  assert.equal(await assertSafeOutputRoot(testRoot, nested), path.resolve(nested));
  const external = await createTestTemp('pitch-report-external-root-');
  try {
    assert.equal(await assertSafeOutputRoot(testRoot, external), path.resolve(external));
  } finally {
    await fs.rm(external, { recursive: true, force: true });
  }
  await assert.rejects(
    assertSafeOutputRoot(testRoot, 'relative-output'),
    /absolute safe path/iu,
  );
});

test('validates native picker results as existing directories inside the project root', async () => {
  const selected = path.join(testRoot, 'selected-output');
  const external = await createTestTemp('pitch-report-external-output-');
  await fs.mkdir(selected, { recursive: true });
  try {
    assert.equal(await validatePickedExportDirectory(testRoot, selected), path.resolve(selected));
    assert.equal(await validatePickedExportDirectory(testRoot, external), path.resolve(external));
    assert.equal(await validatePickedExportDirectory(testRoot, null), null);
    assert.equal(await validatePickedExportDirectory(testRoot, undefined), null);

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
  } finally {
    await fs.rm(external, { recursive: true, force: true });
  }
});

test('preflights selected directory writes and preserves a safe diagnostic code', async () => {
  const selected = path.join(testRoot, 'write-probe-output');
  await fs.mkdir(selected, { recursive: true });
  const originalWriteFile = fs.writeFile;
  fs.writeFile = async (targetPath, ...args) => {
    if (String(targetPath).includes('pitching-report-write-')) {
      const error = new Error('simulated selected directory denial');
      error.code = 'EPERM';
      throw error;
    }
    return originalWriteFile(targetPath, ...args);
  };

  try {
    await assert.rejects(
      validatePickedExportDirectory(testRoot, selected),
      (error) => error.reasonCode === 'EXPORT_OUTPUT_NOT_WRITABLE'
        && error.cause?.code === 'EPERM',
    );
  } finally {
    fs.writeFile = originalWriteFile;
  }

  const serialized = serializeError(Object.assign(new Error('not writable'), {
    reasonCode: 'EXPORT_OUTPUT_NOT_WRITABLE',
    cause: Object.assign(new Error('denied'), { code: 'EPERM' }),
  }));
  assert.deepEqual(serialized, {
    code: 'EXPORT_OUTPUT_NOT_WRITABLE',
    message: 'not writable',
    systemCode: 'EPERM',
  });
});

test('exports a pure text report to default-style folder and ZIP destinations', async () => {
  const reportDocument = {
    schemaVersion: 1,
    title: '純文字報告',
    sections: [{ title: '', blocks: [{ type: 'rich-text', content: '純文字內容' }] }],
  };
  for (const outputKind of ['folder', 'zip']) {
    const controller = new ExportJobController({ exporter: exportReport });
    const started = await controller.start({
      projectId: 'project-1',
      projectRoot: testRoot,
      reportDocument,
      assets: [],
      outputDirectory: path.join(testRoot, `default-output-${outputKind}`),
      reportName: reportDocument.title,
      outputKind,
    });
    const completed = await controller.wait(started.jobId);
    assert.equal(completed.status, 'completed', `${outputKind} text export failed`);
    assert.equal(completed.result.validation.valid, true);
    assert.equal(completed.result.validation.assetCount, 0);
    if (outputKind === 'folder') {
      assert.equal(completed.result.zipPath, null);
      assert.equal(await fs.stat(path.join(completed.result.folderPath, 'report.html')).then((stats) => stats.isFile()), true);
    } else {
      assert.equal(await fs.stat(completed.result.zipPath).then((stats) => stats.isFile()), true);
    }
  }
});

test('exports ZIP after folder without overwriting the folder and preserves ZIP-to-folder policy', async () => {
  const sourceVideo = path.join(testRoot, 'sequence-video.mp4');
  await fs.writeFile(sourceVideo, 'sequence-video-fixture', 'utf8');
  const cases = [
    {
      name: 'text-only',
      reportName: 'Sequence text',
      reportDocument: {
        schemaVersion: 1,
        title: 'Sequence text',
        sections: [{ blocks: [{ type: 'rich-text', content: 'sequence text' }] }],
      },
      assets: [],
    },
    {
      name: 'mixed',
      reportName: 'Sequence mixed',
      reportDocument: {
        schemaVersion: 1,
        title: 'Sequence mixed',
        sections: [{ blocks: [
          { type: 'rich-text', content: 'sequence mixed' },
          { type: 'singleVideo', mediaAssetId: 'sequence-video' },
        ] }],
      },
      assets: [{
        id: 'sequence-video',
        kind: 'video',
        sourceReference: { relativePath: path.relative(testRoot, sourceVideo).split(path.sep).join('/') },
        displayName: 'sequence-video.mp4',
      }],
    },
  ];

  for (const entry of cases) {
    const outputDirectory = path.join(testRoot, `sequence-${entry.name}`);
    const folderController = new ExportJobController({ exporter: exportReport });
    const folderStarted = await folderController.start({
      projectId: 'project-1',
      projectRoot: testRoot,
      reportDocument: entry.reportDocument,
      assets: entry.assets,
      outputDirectory,
      reportName: entry.reportName,
      outputKind: 'folder',
    });
    const folderCompleted = await folderController.wait(folderStarted.jobId);
    assert.equal(folderCompleted.status, 'completed', `${entry.name} folder export failed`);
    const folderPath = folderCompleted.result.folderPath;
    const reportBeforeZip = await fs.readFile(path.join(folderPath, 'report.html'));

    const zipController = new ExportJobController({ exporter: exportReport });
    const zipStarted = await zipController.start({
      projectId: 'project-1',
      projectRoot: testRoot,
      reportDocument: entry.reportDocument,
      assets: entry.assets,
      outputDirectory,
      reportName: entry.reportName,
      outputKind: 'zip',
    });
    const zipCompleted = await zipController.wait(zipStarted.jobId);
    assert.equal(zipCompleted.status, 'completed', `${entry.name} ZIP-after-folder export failed`);
    assert.equal(zipCompleted.result.folderPath, null);
    assert.equal(await fs.stat(zipCompleted.result.zipPath).then((stats) => stats.isFile()), true);
    assert.deepEqual(await fs.readFile(path.join(folderPath, 'report.html')), reportBeforeZip);
    const outputEntries = await fs.readdir(outputDirectory);
    assert.deepEqual(outputEntries.filter((name) => name.startsWith('.report-export-')), []);
  }

  const zipFirstDirectory = path.join(testRoot, 'sequence-zip-first');
  const zipFirstController = new ExportJobController({ exporter: exportReport });
  const zipFirstStarted = await zipFirstController.start({
    projectId: 'project-1',
    projectRoot: testRoot,
    reportDocument: cases[0].reportDocument,
    assets: cases[0].assets,
    outputDirectory: zipFirstDirectory,
    reportName: cases[0].reportName,
    outputKind: 'zip',
  });
  const zipFirstCompleted = await zipFirstController.wait(zipFirstStarted.jobId);
  assert.equal(zipFirstCompleted.status, 'completed');

  const folderAfterZipController = new ExportJobController({ exporter: exportReport });
  const folderAfterZipStarted = await folderAfterZipController.start({
    projectId: 'project-1',
    projectRoot: testRoot,
    reportDocument: cases[0].reportDocument,
    assets: cases[0].assets,
    outputDirectory: zipFirstDirectory,
    reportName: cases[0].reportName,
    outputKind: 'folder',
  });
  const folderAfterZipCompleted = await folderAfterZipController.wait(folderAfterZipStarted.jobId);
  assert.equal(folderAfterZipCompleted.status, 'completed');
  assert.equal(await fs.stat(zipFirstCompleted.result.zipPath).then((stats) => stats.isFile()), true);
  assert.equal(await fs.stat(folderAfterZipCompleted.result.folderPath).then((stats) => stats.isDirectory()), true);

  const duplicateZipController = new ExportJobController({ exporter: exportReport });
  const duplicateZipStarted = await duplicateZipController.start({
    projectId: 'project-1',
    projectRoot: testRoot,
    reportDocument: cases[0].reportDocument,
    assets: cases[0].assets,
    outputDirectory: zipFirstDirectory,
    reportName: cases[0].reportName,
    outputKind: 'zip',
  });
  const duplicateZipCompleted = await duplicateZipController.wait(duplicateZipStarted.jobId);
  assert.equal(duplicateZipCompleted.status, 'completed');
  assert.equal(duplicateZipCompleted.result.safeName, 'Sequence text-2');
  assert.equal(duplicateZipCompleted.result.manifest.report.safeName, 'Sequence text-2');
  assert.match(duplicateZipCompleted.result.zipPath, /Sequence text-2_offline\.zip$/u);
  assert.equal(await fs.stat(zipFirstCompleted.result.zipPath).then((stats) => stats.isFile()), true);
});

test('reruns folder, ZIP, and both exports with collision-free names without overwriting prior outputs', async () => {
  const cases = [
    { outputKind: 'folder', name: 'Repeat folder' },
    { outputKind: 'zip', name: 'Repeat ZIP' },
    { outputKind: 'both', name: 'Repeat both' },
  ];

  for (const entry of cases) {
    const outputDirectory = path.join(testRoot, `rerun-${entry.outputKind}`);
    const requestBase = {
      projectId: 'project-1',
      projectRoot: testRoot,
      reportDocument: {
        schemaVersion: 1,
        title: entry.name,
        sections: [{ blocks: [{ type: 'rich-text', content: `first ${entry.name}` }] }],
      },
      assets: [],
      outputDirectory,
      reportName: entry.name,
      outputKind: entry.outputKind,
    };
    const controller = new ExportJobController({ exporter: exportReport });
    const first = await controller.start(requestBase);
    const firstCompleted = await controller.wait(first.jobId);
    assert.equal(firstCompleted.status, 'completed', `${entry.outputKind} first export failed`);
    const firstFolderPath = firstCompleted.result.folderPath;
    const firstZipPath = firstCompleted.result.zipPath;
    const second = await controller.start(requestBase);
    const secondCompleted = await controller.wait(second.jobId);

    assert.equal(secondCompleted.status, 'completed', `${entry.outputKind} rerun failed`);
    assert.equal(secondCompleted.result.safeName, `${entry.name}-2`);
    assert.equal(secondCompleted.result.manifest.report.safeName, `${entry.name}-2`);
    if (firstFolderPath) {
      assert.notEqual(secondCompleted.result.folderPath, firstFolderPath);
      assert.equal(await fs.stat(firstFolderPath).then((stats) => stats.isDirectory()), true);
    } else {
      assert.equal(secondCompleted.result.folderPath, null);
    }
    if (firstZipPath) {
      assert.notEqual(secondCompleted.result.zipPath, firstZipPath);
      assert.equal(await fs.stat(firstZipPath).then((stats) => stats.isFile()), true);
    } else {
      assert.equal(secondCompleted.result.zipPath, null);
    }
    if (secondCompleted.result.folderPath) {
      assert.equal(await fs.stat(secondCompleted.result.folderPath).then((stats) => stats.isDirectory()), true);
    }
    if (secondCompleted.result.zipPath) {
      assert.equal(await fs.stat(secondCompleted.result.zipPath).then((stats) => stats.isFile()), true);
    }
    assert.deepEqual(
      (await fs.readdir(outputDirectory)).filter((name) => name.startsWith('.report-export-')),
      [],
    );
  }
});

test('reuses a deleted output name and serializes overlapping exports per destination', async () => {
  for (const outputKind of ['folder', 'zip', 'both']) {
    const outputDirectory = path.join(testRoot, `repeat-delete-${outputKind}`);
    const requestBase = {
      projectId: 'project-1',
      projectRoot: testRoot,
      reportDocument: {
        schemaVersion: 1,
        title: `Delete and repeat ${outputKind}`,
        sections: [{ blocks: [{ type: 'rich-text', content: 'repeatable' }] }],
      },
      assets: [],
      outputDirectory,
      reportName: `Delete and repeat ${outputKind}`,
      outputKind,
    };
    const controller = new ExportJobController({ exporter: exportReport });
    const first = await controller.start(requestBase);
    const firstCompleted = await controller.wait(first.jobId);
    assert.equal(firstCompleted.status, 'completed', `${outputKind} initial export failed`);

    const second = await controller.start(requestBase);
    const secondCompleted = await controller.wait(second.jobId);
    assert.equal(secondCompleted.status, 'completed', `${outputKind} retained-output repeat failed`);
    assert.equal(secondCompleted.result.safeName, `${requestBase.reportName}-2`);

    for (const outputPath of [firstCompleted.result.folderPath, firstCompleted.result.zipPath]) {
      if (!outputPath) continue;
      await fs.rm(outputPath, { recursive: true, force: true });
      assert.equal(await fs.lstat(outputPath).catch((error) => error.code), 'ENOENT');
    }

    const third = await controller.start(requestBase);
    const thirdCompleted = await controller.wait(third.jobId);
    assert.equal(thirdCompleted.status, 'completed', `${outputKind} deleted-output repeat failed`);
    assert.equal(thirdCompleted.result.safeName, requestBase.reportName);
    if (thirdCompleted.result.folderPath) {
      assert.equal(await fs.stat(thirdCompleted.result.folderPath).then((stats) => stats.isDirectory()), true);
    }
    if (thirdCompleted.result.zipPath) {
      assert.equal(await fs.stat(thirdCompleted.result.zipPath).then((stats) => stats.isFile()), true);
    }
  }

  const outputDirectory = path.join(testRoot, 'repeat-overlap');
  const requestBase = {
    projectId: 'project-1',
    projectRoot: testRoot,
    reportDocument: {
      schemaVersion: 1,
      title: 'Overlapping exports',
      sections: [{ blocks: [{ type: 'rich-text', content: 'overlap' }] }],
    },
    assets: [],
    outputDirectory,
    reportName: 'Overlapping exports',
    outputKind: 'both',
  };
  const controller = new ExportJobController({ exporter: exportReport });
  const started = await Promise.all([
    controller.start(requestBase),
    controller.start(requestBase),
  ]);
  const completed = await Promise.all(started.map((job) => controller.wait(job.jobId)));
  assert.deepEqual(completed.map((job) => job.status), ['completed', 'completed']);
  assert.deepEqual(
    completed.map((job) => job.result.safeName).sort(),
    ['Overlapping exports', 'Overlapping exports-2'],
  );
  for (const job of completed) {
    assert.equal(await fs.stat(job.result.folderPath).then((stats) => stats.isDirectory()), true);
    assert.equal(await fs.stat(job.result.zipPath).then((stats) => stats.isFile()), true);
  }
  assert.deepEqual(
    (await fs.readdir(outputDirectory)).filter((name) => name.startsWith('.report-export-')),
    [],
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
  assert.match(mainSource, /webContents\.on\(['"]context-menu['"]/u);
  assert.match(mainSource, /Menu\.buildFromTemplate/u);
  assert.match(mainSource, /role:\s*['"]copy['"]/u);
  assert.match(preloadSource, /pickExportDirectory:\s*\(\)\s*=>\s*ipcRenderer\.invoke\(['"]export:pick-directory['"]\)/u);
  assert.doesNotMatch(preloadSource, /document\.querySelector|window\.addEventListener/iu);
});
