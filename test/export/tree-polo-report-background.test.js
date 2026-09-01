'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const {
  REPORT_BACKGROUND_ASSET_ID,
  REPORT_BACKGROUND_MEDIA_TYPE,
  REPORT_BACKGROUND_RELATIVE_PATH,
  REPORT_BACKGROUND_SOURCE_PATH,
  exportReport,
  refinedThemeCss,
} = require('../../src/export/tree-polo-refined-exporter');
const { readZipArchive } = require('../../src/export/zip-archive');

const repositoryRoot = path.resolve(__dirname, '..', '..');
let testRoot;

test.before(async () => {
  await fs.mkdir(path.join(repositoryRoot, '.tmp'), { recursive: true });
  testRoot = await fs.mkdtemp(path.join(repositoryRoot, '.tmp', 'tree-polo-background-test-'));
});

test.after(async () => {
  if (testRoot) await fs.rm(testRoot, { recursive: true, force: true });
});

test('report background uses a fixed viewport layer so scrolling does not move or vertically crop the landscape photo', () => {
  const css = refinedThemeCss();
  assert.match(css, /body\{background:transparent!important;position:relative;isolation:isolate\}/u);
  assert.match(css, /body::before\{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none/u);
  assert.match(css, /background-image:url\("images\/tree-polo-report-background\.jpg"\)/u);
  assert.match(css, /background-size:cover/u);
  assert.match(css, /background-position:center/u);
  assert.match(css, /background-repeat:no-repeat/u);
  assert.doesNotMatch(css, /html,body\{[^}]*background-image/iu);
  assert.doesNotMatch(css, /background-attachment\s*:/iu);
  assert.doesNotMatch(css, /data:image\/jpeg;base64/iu);
});

test('refined export stages the original JPEG through the normal asset pipeline and includes it in folder, manifest and ZIP', async () => {
  const projectRoot = path.join(testRoot, 'project');
  const outputDirectory = path.join(testRoot, 'output');
  await fs.mkdir(projectRoot, { recursive: true });

  const result = await exportReport({
    projectRoot,
    outputDirectory,
    outputKind: 'both',
    reportName: '背景測試',
    reportDocument: {
      schemaVersion: 1,
      title: '背景測試',
      sections: [{
        id: 'summary',
        title: '基本資料',
        blocks: [{ type: 'rich-text', content: '測試內容' }],
      }],
    },
    assets: [{
      id: 'unused-image',
      kind: 'image',
      relativePath: 'images/unused.png',
      data: Buffer.from('unused'),
    }],
  });

  const source = await fs.readFile(REPORT_BACKGROUND_SOURCE_PATH);
  const exported = await fs.readFile(path.join(result.folderPath, ...REPORT_BACKGROUND_RELATIVE_PATH.split('/')));
  assert.deepEqual(exported, source);

  const html = await fs.readFile(path.join(result.folderPath, result.reportFileName), 'utf8');
  assert.match(html, /body::before\{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none/u);
  assert.match(html, /background-image:url\("images\/tree-polo-report-background\.jpg"\)/u);
  assert.doesNotMatch(html, /html,body\{[^}]*background-image/iu);
  assert.doesNotMatch(html, /data:image\/jpeg;base64/iu);
  assert.doesNotMatch(html, /background-attachment\s*:/iu);

  const manifest = JSON.parse(await fs.readFile(path.join(result.folderPath, 'export-manifest.json'), 'utf8'));
  const sourceSha256 = crypto.createHash('sha256').update(source).digest('hex');
  const asset = manifest.assets.find((entry) => entry.id === REPORT_BACKGROUND_ASSET_ID);
  const file = manifest.files.find((entry) => entry.relativePath === REPORT_BACKGROUND_RELATIVE_PATH);

  assert.deepEqual(asset, {
    id: REPORT_BACKGROUND_ASSET_ID,
    kind: 'image',
    relativePath: REPORT_BACKGROUND_RELATIVE_PATH,
    label: '小樹Polo 報告背景',
    mediaType: REPORT_BACKGROUND_MEDIA_TYPE,
    byteLength: source.length,
    sha256: sourceSha256,
  });
  assert.deepEqual(file, {
    relativePath: REPORT_BACKGROUND_RELATIVE_PATH,
    byteLength: source.length,
    sha256: sourceSha256,
  });
  assert.equal(manifest.assets.some((entry) => entry.id === 'unused-image'), false);
  assert.equal(result.validation.valid, true);
  assert.equal(result.zip.parity.valid, true);

  const zipEntries = await readZipArchive(result.zipPath);
  assert.equal(zipEntries.has(REPORT_BACKGROUND_RELATIVE_PATH), true);
  assert.equal(zipEntries.has('images/unused.png'), false);
});
