'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { ExportValidationError } = require('../../src/export/asset-paths');
const { exportReport } = require('../../src/export/exporter');
const { validateExportLayout } = require('../../src/export/layout-validator');
const { runLocalFileRuntimeSmoke } = require('../../src/export/runtime-smoke');
const { extractZipArchive, validateZipParity } = require('../../src/export/zip-archive');

let testRoot;

test.before(async () => {
  testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pitch-report-export-smoke-test-'));
});

test.after(async () => {
  if (testRoot) await fs.rm(testRoot, { recursive: true, force: true });
});

function fixtureReport() {
  return {
    schemaVersion: 1,
    title: 'Runtime smoke report',
    sections: [{
      title: 'Media',
      blocks: [
        { type: 'rich-text', content: 'file:// smoke' },
        { type: 'image', imageAssetId: 'frame', alt: 'Synthetic frame' },
        {
          type: 'singleVideo',
          mediaAssetId: 'pitch',
          posterAssetId: 'frame',
          label: 'Synthetic pitch',
          segment: { in: 0.25, out: 1.5 },
          playback: { rate: 1.25 },
          loop: { enabled: true, start: 0.25, end: 1.5 },
          sync: { mode: 'time', startAnchor: { observedTime: 0.25, precision: 'time-based' } },
          anchor: { observedTime: 0.25, precision: 'time-based' },
        },
      ],
    }],
  };
}

function fixtureAssets() {
  return [
    {
      id: 'frame',
      kind: 'image',
      displayName: 'frame.png',
      data: Buffer.from('synthetic-image-fixture'),
    },
    {
      id: 'pitch',
      kind: 'video',
      displayName: 'pitch.mp4',
      data: Buffer.from('synthetic-video-fixture'),
    },
  ];
}

function mediaSignature(runtimeResult) {
  return runtimeResult.mediaElements.map((media) => ({
    kind: media.kind,
    tagName: media.tagName,
    sourceAttribute: media.sourceAttribute,
    posterAttribute: media.posterAttribute,
  }));
}

test('accepts text-only folder and ZIP extraction without empty media directories', async () => {
  const outputRoot = path.join(testRoot, 'text-only-output');
  const result = await exportReport({
    projectRoot: testRoot,
    outputDirectory: outputRoot,
    reportName: 'Text Only Runtime',
    createZip: true,
    reportDocument: {
      schemaVersion: 1,
      title: 'Text Only Runtime',
      sections: [{
        title: 'Summary',
        blocks: [{ type: 'rich-text', content: 'Synthetic text-only report' }],
      }],
    },
    assets: [],
  });

  assert.equal(result.validation.valid, true);
  assert.equal(result.manifest.assets.length, 0);
  assert.equal(result.zip.parity.valid, true);

  const extractedPath = path.join(testRoot, 'text-only-extracted');
  await extractZipArchive(result.zipPath, extractedPath);
  const extractedLayout = await validateExportLayout(extractedPath, {
    assetManifest: result.manifest.assets,
    verifyManifest: true,
  });
  assert.equal(extractedLayout.valid, true);
  assert.equal(extractedLayout.manifestValidation.valid, true);
  assert.equal(await fs.stat(path.join(extractedPath, 'report.html')).then((stats) => stats.isFile()), true);
  assert.equal(await fs.stat(path.join(extractedPath, 'videos')).catch(() => null), null);
  assert.equal(await fs.stat(path.join(extractedPath, 'images')).catch(() => null), null);
});

async function assertRuntimeResult(t, result) {
  if (result.status === 'unavailable') {
    t.skip(`Electron file:// runtime unavailable: ${result.reason}`);
    return false;
  }
  assert.equal(result.status, 'passed', JSON.stringify(result, null, 2));
  assert.equal(result.runtime, 'electron');
  assert.match(result.fileUrl, /^file:\/\//u);
  assert.equal(result.externalRequests.length, 0);
  assert.equal(result.navigationAttempts.length, 0);
  assert.equal(result.nonFileMedia.length, 0);
  assert.deepEqual(new Set(result.mediaElements.map((media) => media.kind)), new Set(['image', 'video']));
  for (const media of result.mediaElements) {
    assert.match(media.sourceUrl, /^file:\/\//u);
    if (media.posterUrl) assert.match(media.posterUrl, /^file:\/\//u);
  }
  return true;
}

test('loads exported folder and extracted ZIP through Electron file:// with no external requests', async (t) => {
  const outputRoot = path.join(testRoot, 'runtime-output');
  const result = await exportReport({
    projectRoot: testRoot,
    outputDirectory: outputRoot,
    reportName: 'Runtime Smoke',
    createZip: true,
    reportDocument: fixtureReport(),
    assets: fixtureAssets(),
  });

  const folderHtml = await fs.readFile(path.join(result.folderPath, 'report.html'), 'utf8');
  assert.match(folderHtml, /data-segment-in="0\.25"/u);
  assert.match(folderHtml, /data-segment-out="1\.5"/u);
  assert.match(folderHtml, /data-playback-rate="1\.25"/u);
  assert.match(folderHtml, /data-loop-enabled="true"/u);
  assert.match(folderHtml, /data-player-action="play"/u);
  assert.match(folderHtml, /時間同步：可在離線 HTML 中運作/u);
  assert.doesNotMatch(folderHtml, /\bfetch\s*\(/iu);

  const folderRuntime = await runLocalFileRuntimeSmoke({
    folderPath: result.folderPath,
    expectedKinds: ['image', 'video'],
  });
  const folderRuntimeAvailable = await assertRuntimeResult(t, folderRuntime);

  const extractedPath = path.join(testRoot, 'runtime-extracted');
  const extracted = await extractZipArchive(result.zipPath, extractedPath);
  assert.equal(extracted.entries.length, result.zip.parity.fileCount);
  const zipParity = await validateZipParity(extractedPath, result.zipPath);
  assert.equal(zipParity.valid, true);
  const extractedHtml = await fs.readFile(path.join(extractedPath, 'report.html'), 'utf8');
  assert.equal(extractedHtml, folderHtml);
  const extractedLayout = await validateExportLayout(extractedPath, {
    assetManifest: result.manifest.assets,
    verifyManifest: true,
  });
  assert.equal(extractedLayout.valid, true);
  assert.equal(extractedLayout.manifestValidation.valid, true);

  const extractedRuntime = await runLocalFileRuntimeSmoke({
    folderPath: extractedPath,
    expectedKinds: ['image', 'video'],
  });
  const extractedRuntimeAvailable = await assertRuntimeResult(t, extractedRuntime);
  if (folderRuntimeAvailable && extractedRuntimeAvailable) {
    assert.deepEqual(mediaSignature(extractedRuntime), mediaSignature(folderRuntime));
  }

  const outputEntries = await fs.readdir(outputRoot);
  assert.deepEqual(outputEntries.sort(), ['Runtime Smoke', 'Runtime Smoke_offline.zip'].sort());
  assert.equal(outputEntries.some((entry) => entry.startsWith('.report-export-')), false);
});

test('reports unavailable explicitly when an Electron executable is not available', async () => {
  const outputRoot = path.join(testRoot, 'unavailable-output');
  const result = await exportReport({
    projectRoot: testRoot,
    outputDirectory: outputRoot,
    reportName: 'Unavailable Runtime',
    reportDocument: fixtureReport(),
    assets: fixtureAssets(),
  });
  const runtime = await runLocalFileRuntimeSmoke({
    folderPath: result.folderPath,
    electronPath: path.join(testRoot, 'missing-electron.exe'),
    expectedKinds: ['image', 'video'],
  });
  assert.equal(runtime.status, 'unavailable');
  assert.match(runtime.reason, /Electron runtime executable is unavailable/u);
});

test('extracts only into a fresh target and cleans atomic staging after a bad archive', async () => {
  const archivePath = path.join(testRoot, 'invalid-runtime.zip');
  const targetPath = path.join(testRoot, 'invalid-runtime-extracted');
  await fs.writeFile(archivePath, Buffer.from('not a zip archive'));
  await assert.rejects(
    extractZipArchive(archivePath, targetPath),
    (error) => error instanceof ExportValidationError,
  );
  assert.equal(await fs.stat(targetPath).catch(() => null), null);
  const leftovers = (await fs.readdir(testRoot)).filter((entry) => (
    entry.startsWith('.invalid-runtime-extracted.') && entry.includes('.extract-')
  ));
  assert.deepEqual(leftovers, []);
});

test('rejects extraction through a symbolic-link parent when supported', async (t) => {
  const outsideRoot = path.join(testRoot, 'extract-parent-outside');
  const linkedParent = path.join(testRoot, 'extract-parent-link');
  const target = path.join(linkedParent, 'target');
  const archivePath = path.join(testRoot, 'extract-parent.zip');
  await fs.mkdir(outsideRoot, { recursive: true });
  await fs.writeFile(path.join(outsideRoot, 'report.html'), '<p>outside</p>', 'utf8');
  await fs.writeFile(archivePath, Buffer.from('not a zip archive'));
  try {
    await fs.symlink(outsideRoot, linkedParent, 'junction');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) {
      t.skip(`symlink creation unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  await assert.rejects(
    extractZipArchive(archivePath, target),
    (error) => error instanceof ExportValidationError && /symbolic link|zip archive/i.test(error.message),
  );
  assert.equal(await fs.lstat(target).catch((error) => error.code), 'ENOENT');
});

test('cleans temporary staging after an atomic export failure and permits recovery', async () => {
  const outputRoot = path.join(testRoot, 'recovery-output');
  await assert.rejects(
    exportReport({
      projectRoot: testRoot,
      outputDirectory: outputRoot,
      reportName: 'Recovery Report',
      reportDocument: fixtureReport(),
      assets: [{
        id: 'pitch',
        kind: 'video',
        sourcePath: 'missing/private-source.mp4',
      }],
    }),
    (error) => error instanceof ExportValidationError && /source asset is unavailable|missing asset references/iu.test(error.message),
  );
  assert.deepEqual(await fs.readdir(outputRoot), []);

  const recovered = await exportReport({
    projectRoot: testRoot,
    outputDirectory: outputRoot,
    reportName: 'Recovery Report',
    reportDocument: fixtureReport(),
    assets: fixtureAssets(),
  });
  assert.equal(await fs.stat(recovered.folderPath).then((stats) => stats.isDirectory()), true);
  assert.equal((await fs.readdir(outputRoot)).some((entry) => entry.startsWith('.report-export-')), false);
});
