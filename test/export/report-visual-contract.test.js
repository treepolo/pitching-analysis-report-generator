'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { renderReportHtml } = require('../../src/export/report-renderer');
const { applyTreePoloBrandHtml } = require('../../src/export/tree-polo-branded-exporter');
const { refineHtml } = require('../../src/export/tree-polo-refined-exporter');
const { bundleReportStyles } = require('../../src/export/report-style-bundler');

function reportDocument() {
  return {
    schemaVersion: 1,
    title: '王小明',
    sections: [{
      id: 'summary',
      title: '投球摘要',
      blocks: [
        { type: 'rich-text', content: '測試內容' },
        { type: 'singleVideo', mediaAssetId: 'single', label: '單影片' },
        {
          type: 'comparisonVideo',
          leftMediaAssetId: 'left',
          rightMediaAssetId: 'right',
          label: '雙影片',
        },
      ],
    }],
  };
}

function assetManifest() {
  return [
    { id: 'single', kind: 'video', relativePath: 'videos/single.mp4' },
    { id: 'left', kind: 'video', relativePath: 'videos/left.mp4' },
    { id: 'right', kind: 'video', relativePath: 'videos/right.mp4' },
  ];
}

function rendererHtml() {
  return renderReportHtml(reportDocument(), { assetManifest: assetManifest() });
}

function brandedCanonicalHtml() {
  const branded = applyTreePoloBrandHtml(rendererHtml(), {
    title: '王小明',
    logoRelativePath: 'images/tree-polo-logo.webp',
  });
  return bundleReportStyles(refineHtml(branded));
}

test('current report visual contract keeps readable text width and full-width media geometry', () => {
  const html = rendererHtml();

  assert.match(html, /section\.report-section>h2[^}]*max-width:560px/u);
  assert.match(html, /section\.report-section>\.report-text[^}]*max-width:560px/u);
  assert.match(html, /section\.report-section\{[^}]*border:0!important[^}]*background:transparent!important/u);
  assert.match(html, /\.portable-player-header h3\{[^}]*font-size:21px!important/u);
  assert.match(html, /\.portable-player-side-heading h3\{[^}]*font-size:17px!important/u);
});

test('current player visual contract keeps desktop and phone control geometry', () => {
  const html = rendererHtml();

  assert.match(html, /grid-template-columns: 25px 25px max-content minmax\(0, 1fr\) max-content 25px !important/u);
  assert.match(html, /grid-template-columns: 32px 32px max-content minmax\(0, 1fr\) max-content 32px !important/u);
  assert.match(html, /grid-template-columns: 30px 30px max-content minmax\(0, 1fr\) max-content 30px !important/u);
  assert.match(html, /width:12px!important;height:12px/u);
  assert.match(html, /width:8px!important;height:16px/u);
  assert.match(html, /0 0 9px 2px rgba\(66,211,146,\.40\)/u);
});

test('current Tree Polo canonical surface keeps the final white reader, branding and background treatment', () => {
  const html = brandedCanonicalHtml();

  assert.equal((html.match(/<style\b/gu) || []).length, 1);
  assert.match(html, /data-report-style-bundle/u);
  assert.match(html, /data-report-canonical-theme/u);
  assert.match(html, /tree-polo-brand-logo/u);
  assert.match(html, /tree-polo-signature-tree/u);
  assert.match(html, /tree-polo-signature-polo/u);
  assert.match(html, /<body data-tree-polo-background="true">/u);
  assert.match(html, /body\[data-tree-polo-background="true"\]::before\{[^}]*tree-polo-report-background\.jpg/u);
  assert.match(html, /main \{[^}]*background: #fff[^}]*box-shadow: 0 2px 12px/u);
  assert.match(html, /tree-polo-report-header\{[^}]*border-bottom:1px solid #e6e6e6[^}]*background:#fff/u);
  assert.match(html, /tree-polo-report-header::before,body>main \.tree-polo-report-header::after\{display:none!important\}/u);
  assert.match(html, /tree-polo-signature-tree,body>main \.tree-polo-signature-polo\{color:#1a8917!important/u);
  assert.doesNotMatch(html, /data-tree-polo-brand-theme|data-tree-polo-refined-theme|--tree-polo-logo/u);
});
