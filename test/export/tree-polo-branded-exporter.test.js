'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const {
  BRAND_SUFFIX,
  applyTreePoloBrandHtml,
  brandThemeCss,
  brandedDisplayTitle,
  brandedReportName,
  exportReport,
} = require('../../src/export/tree-polo-branded-exporter');
const { runLocalFileRuntimeSmoke } = require('../../src/export/runtime-smoke');
const { readZipArchive } = require('../../src/export/zip-archive');

const repositoryRoot = path.resolve(__dirname, '..', '..');
let testRoot;

test.before(async () => {
  await fs.mkdir(path.join(repositoryRoot, '.tmp'), { recursive: true });
  testRoot = await fs.mkdtemp(path.join(repositoryRoot, '.tmp', 'tree-polo-brand-test-'));
});

test.after(async () => {
  if (testRoot) await fs.rm(testRoot, { recursive: true, force: true });
});

test('brand naming appends the required suffix while preserving the 80-character export limit', () => {
  assert.equal(brandedDisplayTitle('王小明'), `王小明${BRAND_SUFFIX}`);
  assert.equal(brandedReportName('王小明'), `王小明${BRAND_SUFFIX}`);
  const longName = brandedReportName('王'.repeat(200));
  assert.ok(longName.length <= 80);
  assert.ok(longName.endsWith(BRAND_SUFFIX));
  assert.equal(brandedReportName(`王小明${BRAND_SUFFIX}`), `王小明${BRAND_SUFFIX}`);
});

test('brand theme is green but does not restyle the help shell', () => {
  const css = brandThemeCss();
  assert.match(css, /#188b5a/u);
  assert.match(css, /\.report-help-live-preview/u);
  assert.doesNotMatch(css, /\.report-help-trigger\{/u);
  assert.doesNotMatch(css, /\.report-help-dialog\{/u);
  assert.doesNotMatch(css, /\.report-help-guide\{/u);
});

test('brand HTML replaces the old two-line header and keeps help styling intact', () => {
  const source = '<html><head><title>王小明</title><style data-report-help-style>.report-help-trigger{background:#245f94}</style></head><body><main><header class="report-header"><p class="eyebrow">Pitching analysis report</p><h1>王小明</h1></header></main></body></html>';
  const html = applyTreePoloBrandHtml(source, {
    title: '王小明',
    logoRelativePath: 'images/tree-polo-logo.webp',
  });
  assert.match(html, /<title>王小明投球分析報告by小樹Polo<\/title>/u);
  assert.match(html, /class="tree-polo-brand-logo"/u);
  assert.match(html, /src="images\/tree-polo-logo\.webp"/u);
  assert.match(html, /<h1>王小明投球分析報告by小樹Polo<\/h1>/u);
  assert.doesNotMatch(html, /Pitching analysis report/u);
  assert.match(html, /\.report-help-trigger\{background:#245f94\}/u);
  assert.match(html, /data-tree-polo-brand-theme/u);
});

test('desktop package routes Electron through the non-mutating branded entry', async () => {
  const packageJson = JSON.parse(await fs.readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const mainEntry = await fs.readFile(path.join(repositoryRoot, 'src', 'main-entry.js'), 'utf8');
  assert.equal(packageJson.main, 'src/main-entry.js');
  assert.match(mainEntry, /class TreePoloExportJobController extends BaseExportJobController/u);
  assert.match(mainEntry, /appBridge\.ExportJobController = TreePoloExportJobController/u);
  assert.doesNotMatch(mainEntry, /exporterModule\.exportReport\s*=/u);
});

test('branded exporter renames folder and HTML, stages the logo, revalidates manifest and rebuilds ZIP', async () => {
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
  assert.equal(result.validation.valid, true);
  assert.equal(result.zip.parity.valid, true);

  const htmlPath = path.join(result.folderPath, result.reportFileName);
  const html = await fs.readFile(htmlPath, 'utf8');
  assert.match(html, /王小明投球分析報告by小樹Polo/u);
  assert.match(html, /images\/tree-polo-logo\.webp/u);
  assert.match(html, /data-tree-polo-brand-theme/u);
  assert.match(html, /data-report-help-style/u);
  assert.match(html, /#245f94/u);
  await assert.rejects(fs.stat(path.join(result.folderPath, 'report.html')), { code: 'ENOENT' });

  const logoPath = path.join(result.folderPath, 'images', 'tree-polo-logo.webp');
  assert.ok((await fs.stat(logoPath)).size > 1000);

  const manifest = JSON.parse(await fs.readFile(path.join(result.folderPath, 'export-manifest.json'), 'utf8'));
  assert.equal(manifest.validation.valid, true);
  assert.equal(manifest.files.some((file) => file.relativePath === result.reportFileName), true);
  assert.equal(manifest.files.some((file) => file.relativePath === 'report.html'), false);
  assert.equal(manifest.files.some((file) => file.relativePath === 'images/tree-polo-logo.webp'), true);
  assert.equal(manifest.assets.some((asset) => asset.label === '小樹Polo Logo'), true);

  const runtime = await runLocalFileRuntimeSmoke({
    folderPath: result.folderPath,
    electronPath: path.join(testRoot, 'missing-electron.exe'),
  });
  assert.equal(runtime.status, 'unavailable');
  assert.equal(decodeURIComponent(runtime.fileUrl).endsWith(`/${result.reportFileName}`), true);

  const zipEntries = await readZipArchive(result.zipPath);
  assert.equal(zipEntries.has(result.reportFileName), true);
  assert.equal(zipEntries.has('report.html'), false);
  assert.equal(zipEntries.has('images/tree-polo-logo.webp'), true);
  assert.equal(zipEntries.has('export-manifest.json'), true);
});
