'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const {
  BRAND_SUFFIX,
  LEGACY_BRAND_SUFFIX,
  enableTreePoloBackground,
  exportReport,
  refineHtml,
  shortenBrandSuffix,
  stylizeBrandSignature,
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

test('shortens every legacy brand suffix without changing the report name', () => {
  assert.equal(shortenBrandSuffix(`王小明${LEGACY_BRAND_SUFFIX}`), `王小明${BRAND_SUFFIX}`);
  assert.equal(
    shortenBrandSuffix(`王小明${LEGACY_BRAND_SUFFIX}|王小明${LEGACY_BRAND_SUFFIX}`),
    `王小明${BRAND_SUFFIX}|王小明${BRAND_SUFFIX}`,
  );
  assert.equal(shortenBrandSuffix('王小明'), '王小明');
});

test('brand signature transform supplies semantic spans without visual styling', () => {
  const html = stylizeBrandSignature('<h1>王小明報告by小樹Polo</h1>');
  assert.equal(
    html,
    '<h1>王小明報告<span class="tree-polo-signature">by<span class="tree-polo-signature-tree">小樹</span><span class="tree-polo-signature-polo">Polo</span></span></h1>',
  );
  assert.doesNotMatch(html, /style=/u);
});

test('background context is a body data flag rather than a visual override', () => {
  const source = '<html><head></head><body class="report"><main></main></body></html>';
  const once = enableTreePoloBackground(source);
  const twice = enableTreePoloBackground(once);
  assert.match(once, /<body class="report" data-tree-polo-background="true">/u);
  assert.equal((twice.match(/data-tree-polo-background/g) || []).length, 1);
  assert.doesNotMatch(twice, /<style|--tree-polo-logo/u);
});

test('refineHtml changes content and data context without appending a theme', () => {
  const source = `<html><head><title>王小明${LEGACY_BRAND_SUFFIX}</title><style data-report-canonical-theme>body{color:#242424}</style></head><body><main><header class="report-header tree-polo-report-header"><img class="tree-polo-brand-logo" src="images/tree-polo-logo.webp"><div class="tree-polo-brand-copy"><h1>王小明${LEGACY_BRAND_SUFFIX}</h1></div></header></main><button class="report-help-trigger">使用教學</button></body></html>`;
  const html = refineHtml(source);
  assert.match(html, new RegExp(`<title>王小明${BRAND_SUFFIX}<\\/title>`, 'u'));
  assert.match(html, /<h1>王小明報告<span class="tree-polo-signature">by<span class="tree-polo-signature-tree">小樹<\/span><span class="tree-polo-signature-polo">Polo<\/span><\/span><\/h1>/u);
  assert.match(html, /<body data-tree-polo-background="true">/u);
  assert.doesNotMatch(html, new RegExp(LEGACY_BRAND_SUFFIX, 'u'));
  assert.doesNotMatch(html, /data-tree-polo-refined-theme|data-tree-polo-brand-theme|--tree-polo-logo/u);
  assert.equal((html.match(/<style\b/gu) || []).length, 1);
  assert.match(html, /data-report-canonical-theme/u);
  assert.match(html, /report-help-trigger/u);
});

test('refined exporter keeps naming and ZIP parity while canonical theme owns appearance', async () => {
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
  assert.match(html, /tree-polo-signature/u);
  assert.match(html, /data-tree-polo-background="true"/u);
  assert.match(html, /data-report-canonical-theme/u);
  assert.doesNotMatch(html, /data-tree-polo-brand-theme|data-tree-polo-refined-theme|--tree-polo-logo/u);

  const manifest = JSON.parse(await fs.readFile(path.join(result.folderPath, 'export-manifest.json'), 'utf8'));
  assert.equal(manifest.report.safeName, result.safeName);
  assert.equal(manifest.files.some((file) => file.relativePath === result.reportFileName), true);
  assert.equal(manifest.validation.valid, true);

  const zipEntries = await readZipArchive(result.zipPath);
  assert.equal(zipEntries.has(result.reportFileName), true);
  assert.equal(zipEntries.has('export-manifest.json'), true);
  assert.equal(zipEntries.has('images/tree-polo-logo.webp'), true);
});
