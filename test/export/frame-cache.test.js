'use strict';

const vm = require('node:vm');

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const { createTestTemp } = require('../project-temp');
const { ExportValidationError } = require('../../src/export/asset-paths');
const { exportReport } = require('../../src/export/exporter');
const { extractZipArchive } = require('../../src/export/zip-archive');

let testRoot;

test.before(async () => {
  testRoot = await createTestTemp('pitch-report-frame-export-');
});

test.after(async () => {
  await fs.rm(testRoot, { recursive: true, force: true });
});

function digest(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function createReadyCache(root, assetId, sourceRelativePath, frameCount = 3) {
  const sourcePath = path.join(root, ...sourceRelativePath.split('/'));
  const sourceData = Buffer.from(`${assetId}-source`);
  await fs.mkdir(path.dirname(sourcePath), { recursive: true });
  await fs.writeFile(sourcePath, sourceData);

  const key = digest(Buffer.from(`${assetId}-cache-key`));
  const cacheRoot = `.cache/frame-cache/${key}`;
  const frameDirectory = `${cacheRoot}/frames`;
  await fs.mkdir(path.join(root, ...frameDirectory.split('/')), { recursive: true });
  const frames = [];
  for (let index = 0; index < frameCount; index += 1) {
    const relativePath = `${frameDirectory}/frame-${String(index).padStart(8, '0')}.png`;
    await fs.writeFile(path.join(root, ...relativePath.split('/')), Buffer.from(`${assetId}-frame-${index}`));
    frames.push({
      frameNumber: index,
      pts: index,
      time: index / 30,
      width: 2,
      height: 2,
      relativePath,
    });
  }
  const sourceStats = await fs.stat(sourcePath);
  const response = {
    schemaVersion: 1,
    requestId: `request-${assetId}`,
    projectId: 'project-1',
    assetId,
    status: 'ready',
    sourceIdentity: {
      relativePath: sourceRelativePath,
      checksumSha256: digest(sourceData),
      byteSize: sourceData.length,
      mtimeMs: sourceStats.mtimeMs,
    },
    cache: {
      key,
      rootRelativePath: cacheRoot,
      indexRelativePath: `${cacheRoot}/index.json`,
      frameDirectoryRelativePath: frameDirectory,
      format: 'png',
    },
    metadata: {
      durationSeconds: frameCount / 30,
      width: 2,
      height: 2,
      fps: 30,
      averageFps: 30,
      rawFps: 30,
      frameTiming: 'cfr',
      timebase: '1/30',
      frameCount,
    },
    frames,
  };
  await fs.writeFile(
    path.join(root, ...response.cache.indexRelativePath.split('/')),
    `${JSON.stringify(response, null, 2)}\n`,
    'utf8',
  );
  return { response, sourcePath };
}

function reportFor(...blocks) {
  return {
    schemaVersion: 1,
    title: 'Frame cache export',
    sections: [{ title: 'Media', blocks }],
  };
}

test('exports referenced videos through the native player and never stages frame-cache PNGs', async () => {
  const root = path.join(testRoot, 'native-only');
  await fs.mkdir(root, { recursive: true });
  const used = await createReadyCache(root, 'used', 'media/used.mp4', 3);
  const unused = await createReadyCache(root, 'unused', 'media/unused.mp4', 2);
  const sourceBefore = await fs.readFile(used.sourcePath);
  const cacheIndexBefore = await fs.readFile(path.join(root, ...used.response.cache.indexRelativePath.split('/')));
  const result = await exportReport({
    projectRoot: root,
    outputDirectory: path.join(root, 'output'),
    reportName: 'Native video export',
    createZip: true,
    reportDocument: reportFor({ type: 'singleVideo', mediaAssetId: 'used', label: 'Used clip' }),
    assets: [
      { id: 'used', kind: 'video', sourcePath: 'media/used.mp4', displayName: 'used.mp4' },
      { id: 'unused', kind: 'video', sourcePath: 'media/unused.mp4', displayName: 'unused.mp4' },
    ],
    frameCaches: [
      { assetId: 'used', response: used.response },
      { assetId: 'unused', response: unused.response },
    ],
    requireReadyFrameCache: true,
  });

  assert.equal(result.warnings.length, 0);
  assert.equal(result.validation.valid, true);
  assert.equal(result.zip.parity.valid, true);
  assert.deepEqual(await fs.readFile(used.sourcePath), sourceBefore);
  assert.deepEqual(
    await fs.readFile(path.join(root, ...used.response.cache.indexRelativePath.split('/'))),
    cacheIndexBefore,
  );

  const html = await fs.readFile(path.join(result.folderPath, 'report.html'), 'utf8');
  assert.match(html, /<video\b[^>]*data-player-video/iu);
  assert.match(html, /data-native-frame-player\b/u);
  assert.match(html, /currentTime/u);
  assert.match(html, /requestVideoFrameCallback/u);
  assert.doesNotMatch(html, /data-frame-player="/u);
  assert.doesNotMatch(html, /images\/frame-cache|frame-cache-status|cache-miss/u);
  assert.doesNotMatch(html, /unused/u);
  const inlineScripts = [...html.matchAll(/<script>\s*([\s\S]*?)\s*<\/script>/g)].map((match) => match[1]);
  assert.equal(inlineScripts.length, 1);
  assert.doesNotThrow(() => new vm.Script(inlineScripts[0]));

  const outputFiles = result.manifest.files.map((file) => file.relativePath);
  assert.ok(outputFiles.includes('videos/used.mp4'));
  assert.equal(outputFiles.some((file) => file.includes('frame-cache')), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result.manifest, 'frameCaches'), false);

  const extractedPath = path.join(root, 'extracted');
  await extractZipArchive(result.zipPath, extractedPath);
  assert.equal(
    await fs.stat(path.join(extractedPath, 'videos/used.mp4')).then((stats) => stats.isFile()),
    true,
  );
  assert.equal(await fs.stat(path.join(extractedPath, 'images/frame-cache')).catch(() => null), null);
});

test('ignores missing or invalid frame-cache responses instead of changing native export behavior', async () => {
  const root = path.join(testRoot, 'native-cache-ignored');
  await fs.mkdir(root, { recursive: true });
  const source = path.join(root, 'media', 'pitch.mp4');
  await fs.mkdir(path.dirname(source), { recursive: true });
  await fs.writeFile(source, 'video');
  const response = {
    schemaVersion: 1,
    requestId: 'request-pitch',
    projectId: 'project-1',
    assetId: 'pitch',
    status: 'cache-miss',
    sourceIdentity: null,
    cache: null,
    metadata: null,
    frames: [],
    reused: false,
    progress: null,
    error: null,
  };
  const result = await exportReport({
    projectRoot: root,
    outputDirectory: path.join(root, 'output'),
    reportDocument: reportFor({ type: 'singleVideo', mediaAssetId: 'pitch' }),
    assets: [{ id: 'pitch', kind: 'video', sourcePath: 'media/pitch.mp4', displayName: 'pitch.mp4' }],
    frameCaches: [{ assetId: 'pitch', response }],
    requireReadyFrameCache: true,
  });
  assert.equal(result.warnings.length, 0);
  assert.equal(result.validation.valid, true);
  const html = await fs.readFile(path.join(result.folderPath, 'report.html'), 'utf8');
  assert.match(html, /<video\b[^>]*data-player-video/iu);
  assert.doesNotMatch(html, /data-frame-cache-status|images\/frame-cache|cache-miss/u);
  assert.equal(result.manifest.files.some((file) => file.relativePath.includes('frame-cache')), false);
});