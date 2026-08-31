'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const {
  BRAND_SUFFIX,
  LEGACY_BRAND_SUFFIX,
  addLogoColorSource,
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

test('shortens every legacy brand suffix without changing the report name', () => {
  assert.equal(shortenBrandSuffix(`王小明${LEGACY_BRAND_SUFFIX}`), `王小明${BRAND_SUFFIX}`);
  assert.equal(
    shortenBrandSuffix(`王小明${LEGACY_BRAND_SUFFIX}|王小明${LEGACY_BRAND_SUFFIX}`),
    `王小明${BRAND_SUFFIX}|王小明${BRAND_SUFFIX}`,
  );
  assert.equal(shortenBrandSuffix('王小明'), '王小明');
});

test('refined theme preserves the prior title bar, keeps the black logo field and uses rectangular fusion', () => {
  const css = refinedThemeCss();
  assert.match(css, /min-height:70px/u);
  assert.match(css, /padding:8px 12px 8px 76px/u);
  assert.match(css, /#2aa56e 0%,#188b5b 42%,#10754b 48%,#09593a 100%/u);
  assert.match(css, /tree-polo-report-header::before/u);
  assert.match(css, /var\(--tree-polo-logo\)/u);
  assert.match(css, /width:86px;height:64px/u);
  assert.match(css, /border-radius:11px/u);
  assert.doesNotMatch(css, /border-radius:50%/u);
  assert.doesNotMatch(css, /mask-image:radial-gradient/u);
  assert.match(css, /background:#000!important/u);
  assert.match(css, /mix-blend-mode:normal!important/u);
  assert.doesNotMatch(css, /mix-blend-mode:screen/u);
  assert.match(css, /font-family:Tahoma,"Segoe UI","Microsoft JhengHei","Microsoft YaHei",sans-serif!important/u);
});

test('help content is green, its h2 strip is explicitly green, and its header is not sticky', () => {
  const css = refinedThemeCss();
  assert.match(css, /\.report-help-dialog\{/u);
  assert.match(css, /\.report-help-header\{position:relative!important;top:auto!important/u);
  assert.match(css, /border:1px solid #668d78!important/u);
  assert.match(css, /\.report-help-header h2\{/u);
  assert.match(css, /background:linear-gradient\(180deg,#edf8f2 0%,#d7eee1 48%,#c2e2d0 100%\)!important/u);
  assert.match(css, /\.report-help-number/u);
  assert.doesNotMatch(css, /\.report-help-trigger\{/u);
  assert.doesNotMatch(css, /\.report-help-close\{/u);
  assert.doesNotMatch(css, /\.report-help-tutorial-button\{/u);
  assert.doesNotMatch(css, /\.report-help-tutorial-stop\{/u);
  assert.doesNotMatch(css, /\.report-help-tutorial-controls button\{/u);
});

test('logo source is reused as the rectangular molten color field around the raised logo', () => {
  const source = '<header class="report-header tree-polo-report-header"><img class="tree-polo-brand-logo" src="images/tree-polo-logo.webp" alt="小樹Polo"></header>';
  const html = addLogoColorSource(source);
  assert.match(html, /style="--tree-polo-logo:url\('images\/tree-polo-logo\.webp'\)"/u);
});

test('refineHtml shortens every visible title occurrence and appends the refinement layer', () => {
  const source = `<html><head><title>王小明${LEGACY_BRAND_SUFFIX}</title></head><body><main><header class="report-header tree-polo-report-header"><img class="tree-polo-brand-logo" src="images/tree-polo-logo.webp"><div class="tree-polo-brand-copy"><h1>王小明${LEGACY_BRAND_SUFFIX}</h1></div></header></main><button class="report-help-trigger">使用教學</button></body></html>`;
  const html = refineHtml(source);
  assert.equal((html.match(new RegExp(`王小明${BRAND_SUFFIX}`, 'gu')) || []).length, 2);
  assert.doesNotMatch(html, new RegExp(LEGACY_BRAND_SUFFIX, 'u'));
  assert.match(html, /data-tree-polo-refined-theme/u);
  assert.match(html, /--tree-polo-logo:url\('images\/tree-polo-logo\.webp'\)/u);
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
  assert.match(html, /mix-blend-mode:normal!important/u);
  assert.match(html, /background:#000!important/u);
  assert.match(html, /--tree-polo-logo:url\('images\/tree-polo-logo\.webp'\)/u);
  assert.match(html, /\.report-help-header h2\{/u);
  assert.match(html, /position:relative!important;top:auto!important/u);

  const manifest = JSON.parse(await fs.readFile(path.join(result.folderPath, 'export-manifest.json'), 'utf8'));
  assert.equal(manifest.report.safeName, result.safeName);
  assert.equal(manifest.files.some((file) => file.relativePath === result.reportFileName), true);
  assert.equal(manifest.validation.valid, true);

  const zipEntries = await readZipArchive(result.zipPath);
  assert.equal(zipEntries.has(result.reportFileName), true);
  assert.equal(zipEntries.has('export-manifest.json'), true);
  assert.equal(zipEntries.has('images/tree-polo-logo.webp'), true);
});
