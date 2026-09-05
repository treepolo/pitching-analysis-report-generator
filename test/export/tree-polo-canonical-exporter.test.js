'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const {
  BRAND_SUFFIX,
  LEGACY_BRAND_SUFFIX,
  exportReport,
} = require('../../src/export/tree-polo-canonical-exporter');
const { readZipArchive } = require('../../src/export/zip-archive');

const repositoryRoot = path.resolve(__dirname, '..', '..');
let testRoot;

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

test.before(async () => {
  await fs.mkdir(path.join(repositoryRoot, '.tmp'), { recursive: true });
  testRoot = await fs.mkdtemp(path.join(repositoryRoot, '.tmp', 'tree-polo-canonical-test-'));
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

test('delivers folder, HTML and ZIP with one bundled canonical visual theme', async () => {
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
  assert.match(html, new RegExp(`王小明${BRAND_SUFFIX}`, 'u'));
  assert.doesNotMatch(html, new RegExp(LEGACY_BRAND_SUFFIX, 'u'));
  assert.equal((html.match(/<style\b/gu) || []).length, 1);
  assert.match(html, /data-report-style-bundle/u);
  assert.match(html, /report-style-source:data-report-canonical-theme/u);
  assert.match(html, /report-style-source:data-report-mobile-shell-refinement; role:functional-layout/u);
  assert.doesNotMatch(html, /data-tree-polo-brand-theme|data-tree-polo-refined-theme|legacy-visual|final-visual/u);
  assert.match(html, /data-tree-polo-background="true"/u);

  const manifest = JSON.parse(await fs.readFile(path.join(result.folderPath, 'export-manifest.json'), 'utf8'));
  assert.equal(manifest.report.safeName, canonicalName);
  const htmlFile = manifest.files.find((file) => file.relativePath === `${canonicalName}.html`);
  assert.ok(htmlFile);
  const htmlBuffer = Buffer.from(html, 'utf8');
  assert.equal(htmlFile.byteLength, htmlBuffer.length);
  assert.equal(htmlFile.sha256, sha256(htmlBuffer));

  const zipEntries = await readZipArchive(result.zipPath);
  assert.equal(zipEntries.has(`${canonicalName}.html`), true);
  assert.equal(zipEntries.has('export-manifest.json'), true);
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
