'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const test = require('node:test');
const { ExportValidationError } = require('../../src/export/asset-paths');
const { exportReport } = require('../../src/export/exporter');

const repositoryRoot = path.resolve(__dirname, '..', '..');
let testRoot;

test.before(async () => {
  await fs.mkdir(path.join(repositoryRoot, '.tmp'), { recursive: true });
  testRoot = await fs.mkdtemp(path.join(repositoryRoot, '.tmp', 'export-exporter-test-'));
});

test.after(async () => {
  if (testRoot) await fs.rm(testRoot, { recursive: true, force: true });
});

function readZipEntries(buffer) {
  const entries = new Map();
  let offset = 0;
  while (offset + 4 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8');
    const dataStart = nameStart + nameLength + extraLength;
    const payload = buffer.subarray(dataStart, dataStart + compressedSize);
    const data = method === 8 ? zlib.inflateRawSync(payload) : payload;
    entries.set(name, data);
    offset = dataStart + compressedSize;
  }
  return entries;
}

test('exports a self-contained folder and deterministic ZIP seam without leaking source paths', async () => {
  const sourceVideo = path.join(testRoot, 'private-source', 'pitch clip.mp4');
  await fs.mkdir(path.dirname(sourceVideo), { recursive: true });
  await fs.writeFile(sourceVideo, 'video-fixture-content', 'utf8');
  const sourceVideoBefore = await fs.readFile(sourceVideo);
  const relativeSourceVideo = path.relative(testRoot, sourceVideo).split(path.sep).join('/');
  const outputRoot = path.join(testRoot, 'output');

  const result = await exportReport({
    projectRoot: testRoot,
    outputDirectory: outputRoot,
    reportName: 'Pitch / Review: August',
    createZip: true,
    reportDocument: {
      schemaVersion: 1,
      title: 'Pitch <Review>',
      sections: [{
        id: 'summary',
        title: 'Summary',
        blocks: [{ type: 'rich-text', content: 'Exported text' }],
      }, {
        id: 'media',
        title: 'Media',
        blocks: [{
          type: 'singleVideo',
          mediaAssetId: 'pitch',
          posterAssetId: 'frame',
          label: 'Pitch clip',
        }],
      }],
    },
    assets: [
      {
        id: 'pitch',
        kind: 'video',
        sourceReference: { role: 'source', relativePath: relativeSourceVideo },
        displayName: 'pitch clip.mp4',
      },
      { id: 'frame', kind: 'image', data: Buffer.from('image-fixture-content'), displayName: 'release frame.png' },
      { id: 'unused', kind: 'video', data: Buffer.from('unused-fixture-content'), displayName: 'unused.mp4' },
    ],
  });

  assert.match(result.safeName, /^[^<>:"/\\|?*]+$/u);
  assert.equal(result.validation.valid, true);
  assert.equal(result.validation.assetCount, 2);
  assert.equal(result.validation.fileUrlValidation.valid, true);
  assert.equal(result.validation.fileUrlValidation.htmlFileName, 'report.html');
  assert.match(result.validation.fileUrlValidation.htmlFileUrl, /^file:\/\//u);
  assert.match(result.validation.fileUrlValidation.indexFileUrl, /^file:\/\//u);
  assert.equal(result.validation.manifestValidation.valid, true);
  assert.ok(result.zipPath);
  assert.equal(result.zip.parity.valid, true);
  assert.equal(await fs.stat(path.join(result.folderPath, 'report.html')).then((stats) => stats.isFile()), true);
  assert.equal(await fs.stat(path.join(result.folderPath, 'videos')).then((stats) => stats.isDirectory()), true);
  assert.equal(await fs.stat(path.join(result.folderPath, 'images')).then((stats) => stats.isDirectory()), true);

  const reportHtml = await fs.readFile(path.join(result.folderPath, 'report.html'), 'utf8');
  assert.match(reportHtml, /videos\/pitch-clip\.mp4/u);
  assert.match(reportHtml, /images\/release-frame\.png/u);
  assert.doesNotMatch(reportHtml, /unused\.mp4/u);
  const manifestText = await fs.readFile(path.join(result.folderPath, 'export-manifest.json'), 'utf8');
  assert.doesNotMatch(manifestText, new RegExp(sourceVideo.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.validation.valid, true);
  assert.equal(manifest.assets.length, 2);
  assert.equal(manifest.files.some((file) => file.relativePath === 'report.html'), true);
  assert.equal(manifest.assets.some((asset) => asset.id === 'unused'), false);

  const sourceVideoAfter = await fs.readFile(sourceVideo);
  assert.deepEqual(sourceVideoAfter, sourceVideoBefore);

  const zipBuffer = await fs.readFile(result.zipPath);
  const zipEntries = readZipEntries(zipBuffer);
  assert.equal(zipEntries.has('report.html'), true);
  assert.equal(zipEntries.has('export-manifest.json'), true);
  assert.equal(zipEntries.has('videos/pitch-clip.mp4'), true);
  assert.equal(zipEntries.has('images/release-frame.png'), true);
  assert.equal(zipEntries.has('videos/unused.mp4'), false);
  assert.deepEqual(zipEntries.get('report.html'), Buffer.from(reportHtml));
  assert.deepEqual(zipEntries.get('videos/pitch-clip.mp4'), sourceVideoBefore);
});

test('exports a video-only document with empty report and section labels', async () => {
  const sourceVideo = path.join(testRoot, 'video-only-source.mp4');
  await fs.writeFile(sourceVideo, 'video-only-fixture', 'utf8');
  const sourceBefore = await fs.readFile(sourceVideo);
  const outputRoot = path.join(testRoot, 'video-only-output');

  const result = await exportReport({
    projectRoot: testRoot,
    outputDirectory: outputRoot,
    reportName: '',
    outputKind: 'both',
    reportDocument: {
      schemaVersion: 1,
      title: '',
      sections: [{
        title: '',
        blocks: [{ type: 'singleVideo', mediaAssetId: 'video-only', label: '' }],
      }],
    },
    assets: [
      {
        id: 'video-only',
        kind: 'video',
        sourceReference: { relativePath: path.relative(testRoot, sourceVideo).split(path.sep).join('/') },
        displayName: 'video-only.mp4',
      },
      {
        id: 'unused-library-video',
        kind: 'video',
        sourceReference: { relativePath: 'https://example.test/unused.mp4' },
        displayName: 'unused.mp4',
      },
    ],
  });

  assert.equal(result.validation.valid, true);
  assert.equal(result.validation.assetCount, 1);
  assert.equal(result.zip.parity.valid, true);
  const reportHtml = await fs.readFile(path.join(result.folderPath, 'report.html'), 'utf8');
  assert.match(reportHtml, /<video[^>]+src="videos\/video-only\.mp4"/u);
  assert.doesNotMatch(reportHtml, /No content/u);
  const zipEntries = readZipEntries(await fs.readFile(result.zipPath));
  assert.equal(zipEntries.has('videos/video-only.mp4'), true);
  assert.equal(zipEntries.has('videos/unused.mp4'), false);
  assert.deepEqual(await fs.readFile(sourceVideo), sourceBefore);
});

test('does not create a final folder when a referenced asset is missing', async () => {
  const outputRoot = path.join(testRoot, 'missing-output');
  await assert.rejects(
    exportReport({
      projectRoot: testRoot,
      outputDirectory: outputRoot,
      reportName: 'Missing asset report',
      reportDocument: {
        schemaVersion: 1,
        title: 'Missing asset report',
        sections: [{ blocks: [{ type: 'singleVideo', mediaAssetId: 'missing' }] }],
      },
      assets: [],
    }),
    (error) => error instanceof ExportValidationError && /missing asset references/i.test(error.message),
  );
  const entries = await fs.readdir(outputRoot);
  assert.deepEqual(entries, []);
});

test('ignores unused library descriptors, including invalid source paths', async () => {
  const outputRoot = path.join(testRoot, 'unused-descriptor-output');
  const result = await exportReport({
    projectRoot: testRoot,
    outputDirectory: outputRoot,
    reportName: 'Used asset only',
    reportDocument: {
      schemaVersion: 1,
      title: 'Used asset only',
      sections: [{ blocks: [{ type: 'singleVideo', mediaAssetId: 'used' }] }],
    },
    assets: [
      { id: 'used', kind: 'video', data: Buffer.from('used-video'), displayName: 'used.mp4' },
      { id: 'unused', kind: 'video', sourcePath: 'https://example.test/private.mp4' },
    ],
  });

  assert.deepEqual(result.manifest.assets.map((asset) => asset.id), ['used']);
  assert.equal(await fs.stat(path.join(result.folderPath, 'videos', 'used.mp4')).then((stats) => stats.isFile()), true);
  await assert.rejects(fs.stat(path.join(result.folderPath, 'videos', 'private.mp4')), /ENOENT/u);
});

test('generates portable unique filenames for case-insensitive name collisions', () => {
  const { prepareAssetDescriptors } = require('../../src/export/exporter');
  const descriptors = prepareAssetDescriptors([
    { id: 'first', kind: 'video', data: Buffer.from('first'), displayName: 'Clip.mp4' },
    { id: 'second', kind: 'video', data: Buffer.from('second'), displayName: 'clip.mp4' },
  ]);
  assert.deepEqual(descriptors.map((asset) => asset.relativePath), ['videos/Clip.mp4', 'videos/clip-2.mp4']);
});

test('honors cancellation before staging and leaves no partial export', async () => {
  const outputRoot = path.join(testRoot, 'cancelled-output');
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    exportReport({
      projectRoot: testRoot,
      outputDirectory: outputRoot,
      reportName: 'Cancelled report',
      reportDocument: {
        schemaVersion: 1,
        title: 'Cancelled report',
        sections: [{ blocks: [{ type: 'rich-text', content: 'cancel' }] }],
      },
      assets: [],
      signal: controller.signal,
    }),
    (error) => error.code === 'EXPORT_CANCELLED',
  );
  assert.deepEqual(await fs.readdir(outputRoot), []);
});

test('does not turn a transient staging cleanup lock into an export failure', async () => {
  const outputRoot = path.join(testRoot, 'transient-cleanup-output');
  const originalRm = fs.rm;
  let injected = false;
  fs.rm = async (targetPath, options) => {
    if (!injected && String(targetPath).includes('.report-export-')) {
      injected = true;
      const error = new Error('simulated temporary staging lock');
      error.code = 'EPERM';
      throw error;
    }
    return originalRm(targetPath, options);
  };

  let result;
  try {
    result = await exportReport({
      projectRoot: testRoot,
      outputDirectory: outputRoot,
      reportName: 'Transient cleanup report',
      reportDocument: {
        schemaVersion: 1,
        title: 'Transient cleanup report',
        sections: [{ blocks: [{ type: 'rich-text', content: 'cleanup retry' }] }],
      },
      assets: [],
    });
  } finally {
    fs.rm = originalRm;
  }

  assert.equal(injected, true);
  assert.equal(result.validation.valid, true);
  assert.deepEqual(result.warnings, []);
  assert.equal(await fs.stat(result.folderPath).then((stats) => stats.isDirectory()), true);
  assert.deepEqual(
    (await fs.readdir(outputRoot)).filter((name) => name.startsWith('.report-export-')),
    [],
  );
});

test('keeps the completed output when staging cleanup remains locked', async () => {
  const outputRoot = path.join(testRoot, 'persistent-cleanup-output');
  const originalRm = fs.rm;
  fs.rm = async (targetPath, options) => {
    if (String(targetPath).includes('.report-export-')) {
      const error = new Error('simulated persistent temporary staging lock');
      error.code = 'EPERM';
      throw error;
    }
    return originalRm(targetPath, options);
  };

  let result;
  try {
    result = await exportReport({
      projectRoot: testRoot,
      outputDirectory: outputRoot,
      reportName: 'Persistent cleanup report',
      reportDocument: {
        schemaVersion: 1,
        title: 'Persistent cleanup report',
        sections: [{ blocks: [{ type: 'rich-text', content: 'cleanup warning' }] }],
      },
      assets: [],
    });
  } finally {
    fs.rm = originalRm;
  }

  assert.equal(result.validation.valid, true);
  assert.match(result.warnings.join(' '), /暫存檔清理稍後重試/u);
  assert.equal(await fs.stat(result.folderPath).then((stats) => stats.isDirectory()), true);
  for (const entry of await fs.readdir(outputRoot)) {
    if (entry.startsWith('.report-export-')) {
      await fs.rm(path.join(outputRoot, entry), { recursive: true, force: true });
    }
  }
});

test('keeps repeated folder and ZIP exports byte-identical for the same canonical document', async () => {
  const reportDocument = {
    schemaVersion: 1,
    title: 'Deterministic report',
    sections: [{
      title: 'Summary',
      blocks: [{ type: 'rich-text', content: 'Stable output' }],
    }, {
      title: 'Frame',
      blocks: [{ type: 'singleVideo', mediaAssetId: 'frame', label: 'Stable frame' }],
    }],
  };
  const assets = [{
    id: 'frame',
    kind: 'video',
    data: Buffer.from('stable-image-fixture'),
    displayName: 'stable-frame.mp4',
  }];
  const first = await exportReport({
    projectRoot: testRoot,
    outputDirectory: path.join(testRoot, 'deterministic-one'),
    createZip: true,
    reportDocument,
    assets,
  });
  const second = await exportReport({
    projectRoot: testRoot,
    outputDirectory: path.join(testRoot, 'deterministic-two'),
    createZip: true,
    reportDocument,
    assets,
  });

  assert.deepEqual(await fs.readFile(first.zipPath), await fs.readFile(second.zipPath));
  assert.deepEqual(first.manifest, second.manifest);
  assert.equal(first.zip.parity.fileCount, second.zip.parity.fileCount);
});

test('rejects source assets outside the project root before export', async () => {
  const outputRoot = path.join(testRoot, 'outside-source-output');
  await assert.rejects(
    exportReport({
      projectRoot: testRoot,
      outputDirectory: outputRoot,
      reportName: 'Outside source report',
      reportDocument: {
        schemaVersion: 1,
        title: 'Outside source report',
        sections: [{ blocks: [{ type: 'singleVideo', mediaAssetId: 'outside' }] }],
      },
      assets: [{ id: 'outside', kind: 'image', sourcePath: path.join(repositoryRoot, 'package.json') }],
    }),
    (error) => error instanceof ExportValidationError && /project-relative|outside the project root/i.test(error.message),
  );
  assert.deepEqual(await fs.readdir(outputRoot), []);
});

test('rejects absolute and external source references before staging', async () => {
  for (const [name, sourcePath] of [
    ['absolute', path.join(testRoot, 'private-source', 'absolute.png')],
    ['external', 'https://example.test/frame.png'],
    ['file-url', 'file:///private/frame.png'],
  ]) {
    const outputRoot = path.join(testRoot, `${name}-source-output`);
    await assert.rejects(
      exportReport({
        projectRoot: testRoot,
        outputDirectory: outputRoot,
        reportName: `${name} source report`,
        reportDocument: {
          schemaVersion: 1,
          title: `${name} source report`,
          sections: [{ blocks: [{ type: 'singleVideo', mediaAssetId: name }] }],
        },
        assets: [{ id: name, kind: 'image', sourcePath }],
      }),
      (error) => error instanceof ExportValidationError && /project-relative/i.test(error.message),
    );
    assert.deepEqual(await fs.readdir(outputRoot), []);
  }
});

test('rejects symlink source assets when the platform permits symlink creation', async (t) => {
  const symlinkPath = path.join(testRoot, 'linked-source.png');
  try {
    await fs.symlink(path.join(repositoryRoot, 'package.json'), symlinkPath);
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) {
      t.skip(`symlink creation unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  const outputRoot = path.join(testRoot, 'symlink-source-output');
  await assert.rejects(
    exportReport({
      projectRoot: testRoot,
      outputDirectory: outputRoot,
      reportName: 'Symlink source report',
      reportDocument: {
        schemaVersion: 1,
        title: 'Symlink source report',
        sections: [{ blocks: [{ type: 'singleVideo', mediaAssetId: 'linked' }] }],
      },
      assets: [{ id: 'linked', kind: 'video', sourcePath: symlinkPath }],
    }),
    (error) => error instanceof ExportValidationError && /symlink|project-relative|outside the project root/i.test(error.message),
  );
});

test('rejects a symlink used as the ZIP source root', async (t) => {
  const outsideRoot = path.join(testRoot, 'zip-root-outside');
  const linkedRoot = path.join(testRoot, 'zip-root-link');
  const zipPath = path.join(testRoot, 'zip-root-link.zip');
  await fs.mkdir(outsideRoot, { recursive: true });
  await fs.writeFile(path.join(outsideRoot, 'index.html'), '<p>outside</p>', 'utf8');
  try {
    await fs.symlink(outsideRoot, linkedRoot, 'junction');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) {
      t.skip(`symlink creation unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  await assert.rejects(
    require('../../src/export/zip-archive').createZipArchive(linkedRoot, zipPath),
    /symbolic link/iu,
  );
});

test('rejects ZIP source and target paths that traverse symlink parents', async (t) => {
  const outsideRoot = path.join(testRoot, 'zip-parent-outside');
  const linkedParent = path.join(testRoot, 'zip-parent-link');
  const sourceRoot = path.join(linkedParent, 'source');
  const targetPath = path.join(linkedParent, 'output.zip');
  const normalSource = path.join(testRoot, 'zip-parent-normal-source');
  const normalTargetParent = path.join(testRoot, 'zip-parent-target');
  await fs.mkdir(outsideRoot, { recursive: true });
  await fs.mkdir(normalSource, { recursive: true });
  await fs.mkdir(normalTargetParent, { recursive: true });
  await fs.writeFile(path.join(normalSource, 'report.html'), '<p>source</p>', 'utf8');
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
    require('../../src/export/zip-archive').createZipArchive(sourceRoot, path.join(normalTargetParent, 'source.zip')),
    /symbolic link/iu,
  );
  await assert.rejects(
    require('../../src/export/zip-archive').createZipArchive(normalSource, targetPath),
    /symbolic link/iu,
  );
  assert.equal(await fs.lstat(path.join(normalTargetParent, 'source.zip')).catch((error) => error.code), 'ENOENT');
});
