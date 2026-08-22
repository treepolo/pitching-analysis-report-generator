'use strict';

const vm = require('node:vm');

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { ExportValidationError } = require('../../src/export/asset-paths');
const { exportReport } = require('../../src/export/exporter');
const { extractZipArchive } = require('../../src/export/zip-archive');

let testRoot;

test.before(async () => {
  testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pitch-report-frame-export-'));
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

test('exports referenced ready frame cache index and PNGs into folder and ZIP', async () => {
  const root = path.join(testRoot, 'ready');
  await fs.mkdir(root, { recursive: true });
  const used = await createReadyCache(root, 'used', 'media/used.mp4', 3);
  const unused = await createReadyCache(root, 'unused', 'media/unused.mp4', 2);
  const sourceBefore = await fs.readFile(used.sourcePath);
  const cacheIndexBefore = await fs.readFile(path.join(root, ...used.response.cache.indexRelativePath.split('/')));
  const result = await exportReport({
    projectRoot: root,
    outputDirectory: path.join(root, 'output'),
    reportName: 'Ready frame cache',
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
  assert.match(html, /data-frame-player/u);
  assert.match(html, /data-frame-action="toggle"/u);
  assert.match(html, /data-frame-action="previous"/u);
  assert.match(html, /data-frame-action="next"/u);
  assert.doesNotMatch(html, /<video\b/iu);
  assert.doesNotMatch(html, /currentTime/u);
  assert.match(html, /let playbackTime = null;/u);
  assert.match(html, /const frameIndexAtTime =/u);
  assert.match(html, /performance\.now\(\)/u);
  assert.doesNotMatch(html, /Math\.max\(16,/u);
  assert.doesNotMatch(html, /fetch\s*\(/iu);
  const inlineScripts = [...html.matchAll(/<script>\s*([\s\S]*?)\s*<\/script>/g)].map((match) => match[1]);
  assert.equal(inlineScripts.length, 1);
  assert.doesNotThrow(() => new vm.Script(inlineScripts[0]));
  assert.match(html, /images\/frame-cache\/used\/frames\/frame-00000000\.png/u);
  assert.doesNotMatch(html, /unused/u);

  const outputFiles = result.manifest.files.map((file) => file.relativePath);
  assert.ok(outputFiles.includes('images/frame-cache/used/index.json'));
  assert.ok(outputFiles.includes('images/frame-cache/used/frames/frame-00000002.png'));
  assert.equal(outputFiles.some((file) => file.includes('/unused/')), false);
  assert.equal(result.manifest.frameCaches[0].assetId, 'used');

  const extractedPath = path.join(root, 'extracted');
  await extractZipArchive(result.zipPath, extractedPath);
  assert.equal(
    await fs.stat(path.join(extractedPath, 'images/frame-cache/used/index.json')).then((stats) => stats.isFile()),
    true,
  );
  assert.equal(await fs.stat(path.join(extractedPath, 'images/frame-cache/unused')).catch(() => null), null);
});

test('falls back to video output when ready frame-cache staging runs out of space', async () => {
  const root = path.join(testRoot, 'enospc-fallback');
  await fs.mkdir(root, { recursive: true });
  const ready = await createReadyCache(root, 'pitch', 'media/pitch.mp4', 3);
  const report = reportFor({ type: 'singleVideo', mediaAssetId: 'pitch' });
  const outputDirectory = path.join(root, 'output');
  const originalWriteFile = fs.writeFile;
  let injected = false;
  fs.writeFile = async (targetPath, ...args) => {
    if (!injected && String(targetPath).includes(`${path.sep}images${path.sep}frame-cache${path.sep}`)) {
      injected = true;
      const error = new Error('simulated output disk full');
      error.code = 'ENOSPC';
      throw error;
    }
    return originalWriteFile(targetPath, ...args);
  };

  let result;
  try {
    result = await exportReport({
      projectRoot: root,
      outputDirectory,
      reportDocument: report,
      assets: [{ id: 'pitch', kind: 'video', sourcePath: 'media/pitch.mp4', displayName: 'pitch.mp4' }],
      frameCaches: [{ assetId: 'pitch', response: ready.response }],
    });
  } finally {
    fs.writeFile = originalWriteFile;
  }

  assert.equal(injected, true);
  assert.equal(result.validation.valid, true);
  assert.match(result.warnings.join(' '), /輸出磁碟空間不足/u);
  assert.equal(result.manifest.frameCaches[0].status, 'skipped-insufficient-disk-space');
  const html = await fs.readFile(path.join(result.folderPath, 'report.html'), 'utf8');
  assert.match(html, /<video\b/iu);
  assert.doesNotMatch(html, /images\/frame-cache\/pitch/u);
  assert.equal(result.manifest.files.some((file) => file.relativePath.includes('frame-cache')), false);
});

test('does not downgrade a strict ready frame-cache export after ENOSPC', async () => {
  const root = path.join(testRoot, 'enospc-strict');
  await fs.mkdir(root, { recursive: true });
  const ready = await createReadyCache(root, 'pitch', 'media/pitch.mp4', 2);
  const report = reportFor({ type: 'singleVideo', mediaAssetId: 'pitch' });
  const outputDirectory = path.join(root, 'output');
  const originalWriteFile = fs.writeFile;
  fs.writeFile = async (targetPath, ...args) => {
    if (String(targetPath).includes(`${path.sep}images${path.sep}frame-cache${path.sep}`)) {
      const error = new Error('simulated strict output disk full');
      error.code = 'ENOSPC';
      throw error;
    }
    return originalWriteFile(targetPath, ...args);
  };

  try {
    await assert.rejects(
      exportReport({
        projectRoot: root,
        outputDirectory,
        reportDocument: report,
        assets: [{ id: 'pitch', kind: 'video', sourcePath: 'media/pitch.mp4', displayName: 'pitch.mp4' }],
        frameCaches: [{ assetId: 'pitch', response: ready.response }],
        requireReadyFrameCache: true,
      }),
      (error) => error.code === 'ENOSPC' && error.exportPhase === 'stage-frame-cache',
    );
  } finally {
    fs.writeFile = originalWriteFile;
  }

  assert.equal(await fs.stat(path.join(outputDirectory, 'Frame cache export')).catch(() => null), null);
});

test('downgrades a non-ready cache explicitly and can require ready cache', async () => {
  const root = path.join(testRoot, 'non-ready');
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
  const report = reportFor({ type: 'singleVideo', mediaAssetId: 'pitch' });
  const result = await exportReport({
    projectRoot: root,
    outputDirectory: path.join(root, 'output'),
    reportDocument: report,
    assets: [{ id: 'pitch', kind: 'video', sourcePath: 'media/pitch.mp4', displayName: 'pitch.mp4' }],
    frameCaches: [{ assetId: 'pitch', response }],
  });
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /cache-miss/u);
  const html = await fs.readFile(path.join(result.folderPath, 'report.html'), 'utf8');
  assert.match(html, /data-frame-cache-status="cache-miss"/u);
  assert.match(html, /<video\b/iu);

  await assert.rejects(
    exportReport({
      projectRoot: root,
      outputDirectory: path.join(root, 'strict-output'),
      reportDocument: report,
      assets: [{ id: 'pitch', kind: 'video', sourcePath: 'media/pitch.mp4', displayName: 'pitch.mp4' }],
      frameCaches: [{ assetId: 'pitch', response }],
      requireReadyFrameCache: true,
    }),
    (error) => error instanceof ExportValidationError && /not ready/u.test(error.message),
  );
  assert.equal(await fs.stat(path.join(root, 'strict-output', 'Frame cache export')).catch(() => null), null);
});

test('rejects a ready cache whose index or frame escapes its cache root', async () => {
  const root = path.join(testRoot, 'invalid');
  await fs.mkdir(root, { recursive: true });
  const ready = await createReadyCache(root, 'pitch', 'media/pitch.mp4', 1);
  ready.response.frames[0].relativePath = 'media/pitch.mp4';
  await assert.rejects(
    exportReport({
      projectRoot: root,
      outputDirectory: path.join(root, 'output'),
      reportDocument: reportFor({ type: 'singleVideo', mediaAssetId: 'pitch' }),
      assets: [{ id: 'pitch', kind: 'video', sourcePath: 'media/pitch.mp4', displayName: 'pitch.mp4' }],
      frameCaches: [{ assetId: 'pitch', response: ready.response }],
    }),
    (error) => error instanceof ExportValidationError && /outside its frame directory|mapping is invalid/u.test(error.message),
  );
  assert.equal(await fs.stat(path.join(root, 'output', 'Frame cache export')).catch(() => null), null);
});
