'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const { exportReport } = require('../../src/export/exporter');
const {
  BRAND_SUFFIX,
  LEGACY_BRAND_SUFFIX,
} = require('../../src/export/tree-polo-package');
const { readZipArchive } = require('../../src/export/zip-archive');

const repositoryRoot = path.resolve(__dirname, '..', '..');
let testRoot;

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

test.before(async () => {
  await fs.mkdir(path.join(repositoryRoot, '.tmp'), { recursive: true });
  testRoot = await fs.mkdtemp(path.join(repositoryRoot, '.tmp', 'tree-polo-delivery-test-'));
});

test.after(async () => {
  if (testRoot) await fs.rm(testRoot, { recursive: true, force: true });
});

function reportDocument(title = '王小明') {
  return {
    schemaVersion: 1,
    title,
    sections: [{
      id: 'summary',
      title: '基本資料',
      blocks: [{ type: 'rich-text', content: '測試內容' }],
    }],
  };
}

test('delivers folder, HTML and ZIP with the canonical Tree Polo package contract', async () => {
  const projectRoot = path.join(testRoot, 'project');
  const outputDirectory = path.join(testRoot, 'output');
  await fs.mkdir(projectRoot, { recursive: true });

  const result = await exportReport({
    projectRoot,
    outputDirectory,
    outputKind: 'both',
    reportName: '王小明',
    reportDocument: reportDocument(),
    assets: [],
  });

  const canonicalName = `王小明${BRAND_SUFFIX}`;
  const legacyName = `王小明${LEGACY_BRAND_SUFFIX}`;
  assert.equal(result.safeName, canonicalName);
  assert.equal(path.basename(result.folderPath), canonicalName);
  assert.equal(result.reportFileName, `${canonicalName}.html`);
  assert.equal(path.basename(result.zipPath), `${canonicalName}_offline.zip`);
  assert.equal(result.validation.valid, true);
  assert.equal(result.zip.parity.valid, true);

  const outputEntries = await fs.readdir(outputDirectory);
  assert.equal(outputEntries.includes(canonicalName), true);
  assert.equal(outputEntries.includes(`${canonicalName}_offline.zip`), true);
  assert.equal(outputEntries.some((entry) => entry.includes(LEGACY_BRAND_SUFFIX)), false);
  await assert.rejects(fs.stat(path.join(outputDirectory, legacyName)), { code: 'ENOENT' });

  const html = await fs.readFile(path.join(result.folderPath, result.reportFileName), 'utf8');
  assert.match(html, new RegExp(`<title>王小明${BRAND_SUFFIX}<\\/title>`, 'u'));
  assert.match(html, /<h1>王小明投球分析報告<span class="tree-polo-signature">by<span class="tree-polo-signature-tree">小樹<\/span><span class="tree-polo-signature-polo">Polo<\/span><\/span><\/h1>/u);
  assert.doesNotMatch(html, /tree-polo-brand-logo|<img[^>]+tree-polo-logo/iu);
  assert.match(html, /<link rel="icon" type="image\/webp" href="images\/tree-polo-logo\.webp">/u);
  assert.match(html, /data-tree-polo-background="true"/u);
  assert.doesNotMatch(html, new RegExp(LEGACY_BRAND_SUFFIX, 'u'));
  assert.equal((html.match(/<style\b/gu) || []).length, 1);
  assert.match(html, /data-report-style-bundle/u);
  assert.match(html, /report-style-source:data-report-canonical-theme; role:canonical-visual/u);
  assert.match(html, /report-style-source:data-report-mobile-shell-refinement; role:functional-layout/u);
  assert.match(html, /report-style-source:data-report-entry-spotlight-style; role:component-style/u);
  assert.doesNotMatch(html, /data-tree-polo-brand-theme|data-tree-polo-refined-theme|legacy-visual|final-visual/u);

  const manifest = JSON.parse(await fs.readFile(path.join(result.folderPath, 'export-manifest.json'), 'utf8'));
  assert.equal(manifest.report.safeName, canonicalName);
  assert.equal(manifest.validation.valid, true);
  const htmlFile = manifest.files.find((file) => file.relativePath === `${canonicalName}.html`);
  assert.ok(htmlFile);
  const htmlBuffer = Buffer.from(html, 'utf8');
  assert.equal(htmlFile.byteLength, htmlBuffer.length);
  assert.equal(htmlFile.sha256, sha256(htmlBuffer));
  assert.equal(manifest.files.some((file) => file.relativePath === 'images/tree-polo-logo.webp'), true);
  assert.equal(manifest.files.some((file) => file.relativePath === 'images/tree-polo-report-background.jpg'), true);
  assert.equal(manifest.assets.some((asset) => asset.relativePath === 'images/tree-polo-logo.webp'), true);
  assert.equal(manifest.assets.some((asset) => asset.relativePath === 'images/tree-polo-report-background.jpg'), true);

  const zipEntries = await readZipArchive(result.zipPath);
  assert.equal(zipEntries.has(`${canonicalName}.html`), true);
  assert.equal(zipEntries.has('export-manifest.json'), true);
  assert.equal(zipEntries.has('images/tree-polo-logo.webp'), true);
  assert.equal(zipEntries.has('images/tree-polo-report-background.jpg'), true);
});

test('keeps collision suffixes on the canonical name without exposing a legacy-name folder', async () => {
  const projectRoot = path.join(testRoot, 'collision-project');
  const outputDirectory = path.join(testRoot, 'collision-output');
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.mkdir(outputDirectory, { recursive: true });
  const canonicalName = `王小明${BRAND_SUFFIX}`;
  await fs.mkdir(path.join(outputDirectory, canonicalName), { recursive: true });

  const result = await exportReport({
    projectRoot,
    outputDirectory,
    outputKind: 'folder',
    reportName: '王小明',
    reportDocument: reportDocument(),
    assets: [],
  });

  assert.equal(result.safeName, `${canonicalName}-2`);
  assert.equal(path.basename(result.folderPath), `${canonicalName}-2`);
  assert.equal(result.reportFileName, `${canonicalName}-2.html`);
  const outputEntries = await fs.readdir(outputDirectory);
  assert.equal(outputEntries.some((entry) => entry.includes(LEGACY_BRAND_SUFFIX)), false);
});

test('keeps only referenced media and produces deterministic canonical HTML and manifest content', async () => {
  const projectRoot = path.join(testRoot, 'media-project');
  const firstOutput = path.join(testRoot, 'media-output-a');
  const secondOutput = path.join(testRoot, 'media-output-b');
  await fs.mkdir(projectRoot, { recursive: true });

  const document = {
    schemaVersion: 1,
    title: '王小明',
    sections: [{
      id: 'media',
      title: '影片',
      blocks: [{
        type: 'singleVideo',
        mediaAssetId: 'used-video',
        label: '使用影片',
      }],
    }],
  };
  const assets = [
    {
      id: 'used-video',
      kind: 'video',
      data: Buffer.from('used-video-fixture'),
      displayName: 'used.mp4',
    },
    {
      id: 'unused-video',
      kind: 'video',
      data: Buffer.from('unused-video-fixture'),
      displayName: 'unused.mp4',
    },
  ];
  const options = {
    projectRoot,
    outputKind: 'both',
    reportName: '王小明',
    reportDocument: document,
    assets,
  };

  const first = await exportReport({ ...options, outputDirectory: firstOutput });
  const second = await exportReport({ ...options, outputDirectory: secondOutput });

  assert.equal(first.safeName, `王小明${BRAND_SUFFIX}`);
  assert.equal(second.safeName, first.safeName);
  assert.equal(first.validation.valid, true);
  assert.equal(first.zip.parity.valid, true);

  const firstHtml = await fs.readFile(path.join(first.folderPath, first.reportFileName), 'utf8');
  const secondHtml = await fs.readFile(path.join(second.folderPath, second.reportFileName), 'utf8');
  assert.equal(secondHtml, firstHtml);
  assert.match(firstHtml, /videos\/used\.mp4/u);
  assert.doesNotMatch(firstHtml, /unused\.mp4/u);

  const firstManifestText = await fs.readFile(path.join(first.folderPath, 'export-manifest.json'), 'utf8');
  const secondManifestText = await fs.readFile(path.join(second.folderPath, 'export-manifest.json'), 'utf8');
  assert.equal(secondManifestText, firstManifestText);
  const manifest = JSON.parse(firstManifestText);
  assert.equal(manifest.assets.some((asset) => asset.id === 'used-video'), true);
  assert.equal(manifest.assets.some((asset) => asset.id === 'unused-video'), false);
  assert.equal(manifest.files.some((file) => file.relativePath === 'videos/used.mp4'), true);
  assert.equal(manifest.files.some((file) => file.relativePath === 'videos/unused.mp4'), false);

  const zipEntries = await readZipArchive(first.zipPath);
  assert.equal(zipEntries.has(first.reportFileName), true);
  assert.equal(zipEntries.has('videos/used.mp4'), true);
  assert.equal(zipEntries.has('videos/unused.mp4'), false);
  assert.equal(zipEntries.has('images/tree-polo-logo.webp'), true);
  assert.equal(zipEntries.has('images/tree-polo-report-background.jpg'), true);
});

test('desktop package enters main directly and app bridge defaults to the sole exporter', async () => {
  const packageJson = JSON.parse(await fs.readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const appBridge = await fs.readFile(path.join(repositoryRoot, 'src', 'export', 'app-bridge.js'), 'utf8');
  assert.equal(packageJson.main, 'src/main.js');
  assert.match(appBridge, /const \{ exportReport \} = require\('\.\/exporter'\);/u);
  assert.match(appBridge, /constructor\(\{ exporter = exportReport \} = \{\}\)/u);
  await assert.rejects(fs.stat(path.join(repositoryRoot, 'src', 'main-entry.js')), { code: 'ENOENT' });
  await assert.rejects(fs.stat(path.join(repositoryRoot, 'src', 'export', 'tree-polo-canonical-exporter.js')), { code: 'ENOENT' });
});
