'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const test = require('node:test');
const {
  BRAND_LOGO_ASSET_ID,
  BRAND_LOGO_RELATIVE_PATH,
  BRAND_LOGO_SOURCE_PATH,
  BRAND_SUFFIX,
  LEGACY_BRAND_SUFFIX,
  REPORT_BACKGROUND_RELATIVE_PATH,
  applyTreePoloPackageHtml,
  brandedDisplayTitle,
  brandedReportName,
  canonicalReportName,
  createTreePoloPackageAssets,
  enableTreePoloBackground,
  shortenBrandSuffix,
  stylizeBrandSignature,
} = require('../../src/export/tree-polo-package');

test('Tree Polo naming preserves the long visible title and short delivery suffix', () => {
  assert.equal(brandedDisplayTitle('王小明'), `王小明${LEGACY_BRAND_SUFFIX}`);
  assert.equal(shortenBrandSuffix(`王小明${LEGACY_BRAND_SUFFIX}`), `王小明${BRAND_SUFFIX}`);
  assert.equal(canonicalReportName('王小明'), `王小明${BRAND_SUFFIX}`);
  assert.ok(brandedReportName('王'.repeat(200)).length <= 80);
  assert.ok(canonicalReportName('王'.repeat(200)).length <= 80);
});

test('Tree Polo HTML transform keeps text branding and uses the logo only as document icon', () => {
  const source = '<html><head><title>王小明</title><style data-report-canonical-theme>body{color:#242424}</style></head><body><main><header class="report-header"><p class="eyebrow">Pitching analysis report</p><h1>王小明</h1></header></main><p>以下圖解直接使用這份報告中的實際播放器介面。</p><h3>實際播放器圖解</h3></body></html>';
  const html = applyTreePoloPackageHtml(source, {
    title: '王小明',
    logoRelativePath: BRAND_LOGO_RELATIVE_PATH,
  });
  assert.match(html, new RegExp(`<title>王小明${BRAND_SUFFIX}<\\/title>`, 'u'));
  assert.match(html, /class="report-header tree-polo-report-header"/u);
  assert.doesNotMatch(html, /tree-polo-brand-logo|<img[^>]+tree-polo-logo/iu);
  assert.match(html, /<link rel="icon" type="image\/webp" href="images\/tree-polo-logo\.webp">/u);
  assert.match(html, /<h1>王小明投球分析報告<span class="tree-polo-signature">by<span class="tree-polo-signature-tree">小樹<\/span><span class="tree-polo-signature-polo">Polo<\/span><\/span><\/h1>/u);
  assert.match(html, /<body data-tree-polo-background="true">/u);
  assert.doesNotMatch(html, /Pitching analysis report|以下圖解直接使用|<h3>實際播放器圖解<\/h3>/u);
  assert.equal((html.match(/<style\b/gu) || []).length, 1);
  assert.doesNotMatch(html, /data-tree-polo-brand-theme|data-tree-polo-refined-theme/u);
});

test('Tree Polo semantic helpers remain idempotent at their owned seam', () => {
  const background = enableTreePoloBackground('<body class="report"></body>');
  assert.equal((enableTreePoloBackground(background).match(/data-tree-polo-background/g) || []).length, 1);
  const signature = stylizeBrandSignature('<h1>王小明投球分析報告by小樹Polo</h1>');
  assert.equal((stylizeBrandSignature(signature).match(/tree-polo-signature/g) || []).length, 3);
});

test('Tree Polo package assets are explicit required assets and keep logo identity collision-safe', async () => {
  const sourceLogo = await fs.readFile(BRAND_LOGO_SOURCE_PATH);
  assert.ok(sourceLogo.length > 1000);

  const packageAssets = await createTreePoloPackageAssets([
    {
      id: BRAND_LOGO_ASSET_ID,
      kind: 'image',
      relativePath: BRAND_LOGO_RELATIVE_PATH,
      data: Buffer.from('user-logo-collision'),
    },
  ]);
  assert.equal(packageAssets.assets.length, 2);
  const background = packageAssets.assets.find((asset) => asset.relativePath === REPORT_BACKGROUND_RELATIVE_PATH);
  const logo = packageAssets.assets.find((asset) => asset.label === '小樹Polo Logo');
  assert.ok(background);
  assert.ok(logo);
  assert.equal(background.requiredForExport, true);
  assert.equal(logo.requiredForExport, true);
  assert.equal(logo.id, '__tree_polo_brand_logo_2__');
  assert.equal(logo.relativePath, 'images/tree-polo-logo-2.webp');
  assert.deepEqual(logo.data, sourceLogo);
  assert.equal(packageAssets.logoRelativePath, logo.relativePath);
});
