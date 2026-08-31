'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const {
  BRAND_SUFFIX,
  LEGACY_BRAND_SUFFIX,
  exportReport,
  refineHtml,
  refinedThemeCss,
  shortenBrandSuffix,
} = require('../../src/export/tree-polo-refined-exporter');
const { readZipArchive } = require('../../src/export/zip-archive');

const repositoryRoot = path.resolve(__dirname, '..', '..');
let testRoot;

test.before(async () => {
  await fs.mkdir(path.join(repositoryRoot, '.tmp'), { recursive: true });
  testRoot = await fs.mkdtemp(path.join(repositoryRoot, '.tmp', 'tree-polo-refined-test-'));
});

test.after(async () => {
  if (testRoot) await fs.rm(testRoot, { recursive: true, force: true });
});

test('shortens the brand suffix without changing the report name', () => {
  assert.equal(shortenBrandSuffix(`王小明${LEGACY_BRAND_SUFFIX}`), `王小明${BRAND_SUFFIX}`);
  assert.equal(shortenBrandSuffix('王小明'), '王小明');
});

test('refined theme creates a fused raised glass logo and recolors help content without touching the launcher', () => {
  const css = refinedThemeCss();
  assert.match(css, /mix-blend-mode:screen/u);
  assert.match(css, /mask-image:radial-gradient/u);
  assert.match(css, /tree-polo-report-header::before/u);
  assert.match(css, /radial-gradient\(ellipse at 51% 47%/u);
  assert.match(css, /drop-shadow/u);
  assert.match(css, /\.report-help-dialog\{/u);
  assert.match(css, /\.report-help-header\{/u);
  assert.match(css, /border:1px solid #668d78!important/u);
  assert.match(css, /\.report-help-number/u);
  assert.doesNotMatch(css, /\.report-help-trigger\{/u);
});

test('refineHtml shortens visible title text and appends the refinement layer', () => {
  const source = `<html><head><title>王小明${LEGACY_BRAND_SUFFIX}</title></head><body><main><header class="report-header tree-polo-report-header"><img class="tree-polo-brand-logo"><div class="tree-polo-brand-copy"><h1>王小明${LEGACY_BRAND_SUFFIX}</h1></div></header></main><button class="report-help-trigger">使用教學</button></body></html>`;
  const html = refineHtml(source);
  assert.match(html, new RegExp(`王小明${BRAND_SUFFIX}`, 'u'));
  assert.doesNotMatch(html, new RegExp(LEGACY_BRAND_SUFFIX, 'u'));
  assert.match(html, /data-tree-polo-refined-theme/u);
  assert.match(html, /report-help-trigger/u);
});

test('refined exporter uses the shorter folder and HTML suffix and rebuilds ZIP parity', async () => {
  const projectRoot = path.join(testRoot, 'project');
  const outputDirectory = path.join(testRoot, 'output');
  await fs.mkdir(projectRoot, { recursive: true });

  const result = await exportReport({
    projectRoot,
    outputDirectory,
    outputKind: 'both',
    reportName: '王小明',
    reportDocument: {
      schemaVersion: 1,
      title: '王小明',
      sections: [{
        id: 'summary',
        title: '基本資料',
        blocks: [{ type: 'rich-text', content: '測試內容' }],
      }],
    },
    assets: [],
  });

  assert.equal(result.safeName, `王小明${BRAND_SUFFIX}`);
  assert.equal(path.basename(result.folderPath), result.safeName);
  assert.equal(result.reportFileName, `${result.safeName}.html`);
  assert.equal(path.basename(result.zipPath), `${result.safeName}_offline.zip`);
  assert.equal(result.validation.valid, true);
  assert.equal(result.zip.parity.valid, true);

  const html = await fs.readFile(path.join(result.folderPath, result.reportFileName), 'utf8');
  assert.match(html, new RegExp(`王小明${BRAND_SUFFIX}`, 'u'));
  assert.doesNotMatch(html, new RegExp(LEGACY_BRAND_SUFFIX, 'u'));
  assert.match(html, /data-tree-polo-refined-theme/u);
  assert.match(html, /mix-blend-mode:screen/u);
  assert.match(html, /\.report-help-dialog\{/u);

  const manifest = JSON.parse(await fs.readFile(path.join(result.folderPath, 'export-manifest.json'), 'utf8'));
  assert.equal(manifest.report.safeName, result.safeName);
  assert.equal(manifest.files.some((file) => file.relativePath === result.reportFileName), true);
  assert.equal(manifest.validation.valid, true);

  const zipEntries = await readZipArchive(result.zipPath);
  assert.equal(zipEntries.has(result.reportFileName), true);
  assert.equal(zipEntries.has('export-manifest.json'), true);
  assert.equal(zipEntries.has('images/tree-polo-logo.webp'), true);
});
