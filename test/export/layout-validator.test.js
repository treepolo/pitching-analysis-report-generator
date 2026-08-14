'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const { ExportValidationError } = require('../../src/export/asset-paths');
const { validateExportLayout } = require('../../src/export/layout-validator');

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
