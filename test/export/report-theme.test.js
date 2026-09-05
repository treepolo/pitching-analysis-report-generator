'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { renderReportTheme } = require('../../src/export/report-theme');
const { renderReportHtml } = require('../../src/export/report-renderer');

const repositoryRoot = path.resolve(__dirname, '..', '..');

function renderedHtml() {
  return renderReportHtml({
    schemaVersion: 1,
    title: 'Canonical theme',
    sections: [{
      title: '投球摘要',
      blocks: [{ type: 'singleVideo', mediaAssetId: 'pitch', label: '投球影片' }],
    }],
  }, {
    assetManifest: [{ id: 'pitch', kind: 'video', relativePath: 'videos/pitch.mp4' }],
  });
}

test('canonical report theme owns the final reader and player skin', () => {
  const css = renderReportTheme();
  assert.match(css, /--reader-face: #fff/u);
  assert.match(css, /--reader-accent: #1a8917/u);
  assert.match(css, /\.portable-player \{[^}]*border: 1px solid #e6e6e6[^}]*border-radius: 8px[^}]*background: #fafafa/u);
  assert.match(css, /section\.report-section>h2[^}]*max-width:560px/u);
  assert.match(css, /\.portable-player-header h3\{[^}]*font-size:21px!important/u);
  assert.doesNotMatch(css, /#ece9d8|#72b6ec|#1764aa 48%|XP to Windows 7/iu);
});

test('canonical report theme owns selection and range affordances', () => {
  const css = renderReportTheme();
  assert.match(css, /\.portable-player\[data-frame-selected="true"\][^}]*0 0 9px 2px rgba\(66,211,146,\.40\)/u);
  assert.match(css, /report-help-live-preview \.portable-player\[data-frame-selected="true"\]/u);
  assert.match(css, /input\[data-frame-timeline\]\[type="range"\]/u);
  assert.match(css, /width:12px!important;height:12px/u);
  assert.match(css, /input\[data-frame-rate\]\[type="range"\]/u);
  assert.match(css, /width:8px!important;height:16px/u);
  assert.match(css, /report-help-live-preview input\[data-frame-timeline\]/u);
  assert.match(css, /report-help-live-preview input\[data-frame-rate\]/u);
});

test('canonical report theme owns help, annotation and Tree Polo typography skin', () => {
  const css = renderReportTheme();
  assert.match(css, /\.report-help-dialog\{[^}]*border:1px solid #e6e6e6!important[^}]*background:#fff!important/u);
  assert.match(css, /\.report-help-header h2\{[^}]*font-size:28px!important[^}]*font-weight:700!important/u);
  assert.match(css, /\.report-help-guide p\{[^}]*font-size:13px!important/u);
  assert.match(css, /\.report-help-live-preview \.portable-player-header h3\{[^}]*font-size:18px!important/u);
  assert.match(css, /\.report-annotation-controls[^}]*font-size:10px!important/u);
  assert.match(css, /\.report-annotation-track-toggle[^}]*background:#fff!important/u);
  assert.match(css, /tree-polo-signature\{[^}]*font-size:\.84em!important[^}]*font-weight:500!important/u);
  assert.match(css, /tree-polo-signature-tree,body>main \.tree-polo-signature-polo\{color:#1a8917!important/u);
});

test('renderer emits the canonical theme once and no retired visual owner', () => {
  const html = renderedHtml();
  assert.equal((html.match(/data-report-canonical-theme/g) || []).length, 1);
  assert.doesNotMatch(html, /data-medium-reader-detail-refinement|data-report-player-selection-refinement/u);
  assert.match(html, /data-native-frame-player-block/u);
  assert.match(html, /@media \(max-width: 700px\)/u);
  assert.doesNotMatch(html, /<link[^>]+stylesheet|generator-xp7\.css|@import|https?:\/\//iu);
});

test('retired renderer visual modules are absent from the production tree', () => {
  for (const name of [
    'xp7-reader-theme.js',
    'medium-reader-detail-refinement.js',
    'report-player-selection-refinement.js',
  ]) {
    assert.equal(fs.existsSync(path.join(repositoryRoot, 'src', 'export', name)), false);
  }
  const renderer = fs.readFileSync(path.join(repositoryRoot, 'src', 'export', 'report-renderer.js'), 'utf8');
  assert.doesNotMatch(renderer, /xp7-reader-theme|medium-reader-detail-refinement|report-player-selection-refinement/u);
});
