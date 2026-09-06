'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { renderReportHtml } = require('../../src/export/report-renderer');
const { applyTreePoloPackageHtml } = require('../../src/export/tree-polo-package');
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
  const packaged = applyTreePoloPackageHtml(rendererHtml(), {
    title: '王小明',
    logoRelativePath: 'images/tree-polo-logo.webp',
  });
  return bundleReportStyles(packaged);
}

test('current report visual contract keeps readable text width and editorial player hierarchy', () => {
  const html = rendererHtml();

  assert.match(html, /section\.report-section>h2[^}]*max-width:560px/u);
  assert.match(html, /section\.report-section>\.report-text[^}]*max-width:560px/u);
  assert.match(html, /section\.report-section\{[^}]*padding:0 5px 22px!important[^}]*border:0!important[^}]*background:transparent!important/u);
  assert.match(html, /main \{[^}]*border-radius: 3px[^}]*background: #fff/u);
  assert.match(html, /\.portable-player \{[^}]*position: relative[^}]*width: calc\(100% - 28px\)[^}]*margin: 0 14px 14px[^}]*padding: 18px 8px[^}]*border: 0[^}]*border-radius: 0[^}]*background: transparent/u);
  assert.match(html, /\.portable-player::before, \.portable-player::after \{[^}]*right: 0[^}]*left: 0[^}]*height: 1px[^}]*background: var\(--reader-line\)/u);
  assert.match(html, /body>main \.report-annotation-controls\{[^}]*border-top:1px solid var\(--reader-line\)!important/u);
  assert.match(html, /\.portable-player-header \{[^}]*margin: 0 0 13px[^}]*border: 0/u);
  assert.match(html, /\.portable-player-header h3 \{[^}]*font-family: "Microsoft JhengHei UI", "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif[^}]*font-size: 17px[^}]*font-style: italic[^}]*font-weight: 700/u);
  assert.match(html, /\.portable-player-header h3::after \{[^}]*width: 48px[^}]*height: 3px[^}]*background: var\(--reader-accent\)/u);
  assert.match(html, /\.portable-player-side-heading h3 \{[^}]*color: #6b6b6b[^}]*font-size: 13px[^}]*font-weight: 500/u);
  assert.match(html, /\.portable-player-grid \{[^}]*gap: 14px/u);
  assert.match(html, /\.portable-frame-surface \{[^}]*border: 0[^}]*border-radius: 0/u);
  assert.doesNotMatch(html, /portable-player-grid-side-by-side[^\n]*border-left|portable-player-grid-stacked[^\n]*border-top/u);
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

test('current Tree Polo canonical surface keeps header text branding, branded footer and background', () => {
  const html = brandedCanonicalHtml();

  assert.equal((html.match(/<style\b/gu) || []).length, 1);
  assert.match(html, /data-report-style-bundle/u);
  assert.match(html, /data-report-canonical-theme/u);
  assert.doesNotMatch(html, /tree-polo-brand-logo/u);
  assert.match(html, /<img class="tree-polo-footer-logo" src="images\/tree-polo-logo\.webp"/u);
  assert.doesNotMatch(html, /<link\b[^>]*\brel=["']icon["'][^>]*tree-polo-logo/iu);
  assert.match(html, /tree-polo-signature-tree/u);
  assert.match(html, /tree-polo-signature-polo/u);
  assert.match(html, /data-tree-polo-promotion/u);
  assert.match(html, /data-tree-polo-footer/u);
  assert.match(html, /希望我的洞察，能在你追求卓越的路上幫上忙。/u);
  assert.match(html, /<body data-tree-polo-background="true">/u);
  assert.match(html, /body\[data-tree-polo-background="true"\]::before\{[^}]*tree-polo-report-background\.jpg/u);
  assert.match(html, /main \{[^}]*background: #fff[^}]*box-shadow: 0 2px 12px/u);
  assert.match(html, /tree-polo-report-header\{[^}]*min-height:54px[^}]*margin:0 -8px 0[^}]*padding:10px 12px[^}]*background:#fff/u);
  assert.match(html, /tree-polo-report-header::before,body>main \.tree-polo-report-header::after\{display:none!important\}/u);
  assert.match(html, /tree-polo-signature-tree,body>main \.tree-polo-signature-polo\{color:#1a8917!important/u);
  assert.match(html, /report-style-source:data-report-entry-intro-style; role:component-style/u);
  assert.match(html, /report-style-source:data-report-promotion-footer-style; role:component-style/u);
  assert.doesNotMatch(html, /data-tree-polo-brand-theme|data-tree-polo-refined-theme|--tree-polo-logo/u);
});
