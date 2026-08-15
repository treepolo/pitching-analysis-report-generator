'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const test = require('node:test');
const { ExportValidationError } = require('../../src/export/asset-paths');
const {
  validateExportLayout,
  validateExportManifest,
  validateFileUrlContract,
  validateNetworkIsolation,
} = require('../../src/export/layout-validator');

const repositoryRoot = path.resolve(__dirname, '..', '..');
let testRoot;

test.before(async () => {
  await fs.mkdir(path.join(repositoryRoot, '.tmp'), { recursive: true });
  testRoot = await fs.mkdtemp(path.join(repositoryRoot, '.tmp', 'export-layout-test-'));
});

test.after(async () => {
  if (testRoot) await fs.rm(testRoot, { recursive: true, force: true });
});

async function createLayout(name, html) {
  const root = path.join(testRoot, name);
  await fs.mkdir(path.join(root, 'videos'), { recursive: true });
  await fs.mkdir(path.join(root, 'images'), { recursive: true });
  await fs.writeFile(path.join(root, 'index.html'), html, 'utf8');
  return root;
}

test('validates index, required asset directories, relative references, and files', async () => {
  const root = await createLayout('valid', '<!doctype html><img src="images/frame.png"><video src="videos/pitch.mp4"></video>');
  await fs.writeFile(path.join(root, 'images', 'frame.png'), 'frame');
  await fs.writeFile(path.join(root, 'videos', 'pitch.mp4'), 'pitch');

  const result = await validateExportLayout(root, {
    assetManifest: [
      { id: 'frame', kind: 'image', relativePath: 'images/frame.png' },
      { id: 'pitch', kind: 'video', relativePath: 'videos/pitch.mp4' },
    ],
    requireAllManifestAssetsUsed: true,
  });
  assert.equal(result.valid, true);
  assert.equal(result.assetCount, 2);
  assert.equal(result.referencedAssetCount, 2);
  assert.equal(result.fileUrlValidation.valid, true);
  assert.match(result.fileUrlValidation.indexFileUrl, /^file:\/\//u);
  assert.equal(result.fileUrlValidation.networkIsolation.valid, true);
});

test('still requires a media directory when the manifest references an asset', async () => {
  const root = path.join(testRoot, 'missing-media-directory');
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, 'report.html'), '<video src="videos/pitch.mp4"></video>', 'utf8');

  await assert.rejects(
    validateExportLayout(root, {
      assetManifest: [{ id: 'pitch', kind: 'video', relativePath: 'videos/pitch.mp4' }],
    }),
    /Export videos directory is missing/u,
  );
});

test('blocks an unmanifested or external asset reference', async () => {
  const root = await createLayout('invalid-reference', '<img src="images/not-in-manifest.png">');
  await fs.writeFile(path.join(root, 'images', 'not-in-manifest.png'), 'frame');
  await assert.rejects(
    validateExportLayout(root, {
      assetManifest: [],
    }),
    (error) => error instanceof ExportValidationError && /unmanifested asset/i.test(error.message),
  );

  const externalRoot = await createLayout('external-reference', '<img src="https://example.test/frame.png">');
  await assert.rejects(
    validateExportLayout(externalRoot),
    (error) => error instanceof ExportValidationError && /relative|external|scheme/i.test(error.message),
  );
});

test('detects missing staged files and unused manifest entries', async () => {
  const missingRoot = await createLayout('missing-file', '<img src="images/frame.png">');
  await assert.rejects(
    validateExportLayout(missingRoot, {
      assetManifest: [{ id: 'frame', kind: 'image', relativePath: 'images/frame.png' }],
    }),
    /missing/i,
  );

  const unusedRoot = await createLayout('unused-asset', '<p>no media</p>');
  await fs.writeFile(path.join(unusedRoot, 'images', 'frame.png'), 'frame');
  await assert.rejects(
    validateExportLayout(unusedRoot, {
      assetManifest: [{ id: 'frame', kind: 'image', relativePath: 'images/frame.png' }],
      requireAllManifestAssetsUsed: true,
    }),
    /not referenced/i,
  );
});

test('performs static file:// and network-isolation checks', async () => {
  const root = await createLayout('file-url', '<!doctype html><img src="images/frame.png">');
  await fs.writeFile(path.join(root, 'images', 'frame.png'), 'frame');
  const result = await validateFileUrlContract(root, {
    assetManifest: [{ id: 'frame', kind: 'image', relativePath: 'images/frame.png' }],
  });
  assert.match(result.indexFileUrl, /^file:\/\//u);
  assert.deepEqual(result.assetFileUrls.map((value) => new URL(value).protocol), ['file:']);
  assert.equal(validateNetworkIsolation('<html><body>static</body></html>').valid, true);
  assert.throws(
    () => validateNetworkIsolation('<script>fetch("https://example.test")</script>'),
    /network APIs/i,
  );
  assert.throws(
    () => validateNetworkIsolation('<style>@import url("https://example.test/style.css")</style>'),
    /external style resources/i,
  );
});

test('verifies manifest checksums against the staged folder', async () => {
  const root = await createLayout('manifest-checksum', '<!doctype html><p>manifest</p>');
  const index = await fs.readFile(path.join(root, 'index.html'));
  const frame = Buffer.from('frame');
  await fs.writeFile(path.join(root, 'images', 'frame.png'), frame);
  const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
  await fs.writeFile(path.join(root, 'export-manifest.json'), `${JSON.stringify({
    format: 'pitching-analysis-report-export',
    schemaVersion: 1,
    assets: [{
      id: 'frame',
      kind: 'image',
      relativePath: 'images/frame.png',
      byteLength: frame.length,
      sha256: digest(frame),
    }],
    files: [
      { relativePath: 'index.html', byteLength: index.length, sha256: digest(index) },
      { relativePath: 'images/frame.png', byteLength: frame.length, sha256: digest(frame) },
    ],
  }, null, 2)}\n`, 'utf8');

  const result = await validateExportManifest(root);
  assert.equal(result.valid, true);
  await fs.writeFile(path.join(root, 'images', 'frame.png'), 'tampered');
  await assert.rejects(validateExportManifest(root), /checksum mismatch/i);
});
