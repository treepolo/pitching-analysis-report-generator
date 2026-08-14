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
      { id: 'pitch', kind: 'video', sourcePath: sourceVideo, displayName: 'pitch clip.mp4' },
      { id: 'frame', kind: 'image', data: Buffer.from('image-fixture-content'), displayName: 'release frame.png' },
    ],
  });

  assert.match(result.safeName, /^[^<>:"/\\|?*]+$/u);
  assert.equal(result.validation.valid, true);
  assert.equal(result.validation.assetCount, 2);
  assert.ok(result.zipPath);
  assert.equal(await fs.stat(path.join(result.folderPath, 'index.html')).then((stats) => stats.isFile()), true);
  assert.equal(await fs.stat(path.join(result.folderPath, 'videos')).then((stats) => stats.isDirectory()), true);
  assert.equal(await fs.stat(path.join(result.folderPath, 'images')).then((stats) => stats.isDirectory()), true);

  const indexHtml = await fs.readFile(path.join(result.folderPath, 'index.html'), 'utf8');
  assert.match(indexHtml, /videos\/pitch-clip\.mp4/u);
  assert.match(indexHtml, /images\/release-frame\.png/u);
  const manifestText = await fs.readFile(path.join(result.folderPath, 'export-manifest.json'), 'utf8');
  assert.doesNotMatch(manifestText, new RegExp(sourceVideo.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.validation.valid, true);
  assert.equal(manifest.assets.length, 2);
  assert.equal(manifest.files.some((file) => file.relativePath === 'index.html'), true);

  const sourceVideoAfter = await fs.readFile(sourceVideo);
  assert.deepEqual(sourceVideoAfter, sourceVideoBefore);

  const zipBuffer = await fs.readFile(result.zipPath);
  const zipEntries = readZipEntries(zipBuffer);
  assert.equal(zipEntries.has('index.html'), true);
  assert.equal(zipEntries.has('export-manifest.json'), true);
  assert.equal(zipEntries.has('videos/pitch-clip.mp4'), true);
  assert.equal(zipEntries.has('images/release-frame.png'), true);
  assert.deepEqual(zipEntries.get('index.html'), Buffer.from(indexHtml));
  assert.deepEqual(zipEntries.get('videos/pitch-clip.mp4'), sourceVideoBefore);
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
        sections: [{ blocks: [{ type: 'image', mediaAssetId: 'outside' }] }],
      },
      assets: [{ id: 'outside', kind: 'image', sourcePath: path.join(repositoryRoot, 'package.json') }],
    }),
    (error) => error instanceof ExportValidationError && /outside the project root/i.test(error.message),
  );
  assert.deepEqual(await fs.readdir(outputRoot), []);
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
        sections: [{ blocks: [{ type: 'image', mediaAssetId: 'linked' }] }],
      },
      assets: [{ id: 'linked', kind: 'image', sourcePath: symlinkPath }],
    }),
    (error) => error instanceof ExportValidationError && /symlink|outside the project root/i.test(error.message),
  );
});
