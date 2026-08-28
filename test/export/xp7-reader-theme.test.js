'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { renderReportHtml } = require('../../src/export/report-renderer');
const { renderXp7ReaderTheme } = require('../../src/export/xp7-reader-theme');

test('renders the exported report as an XP to Windows 7 companion reader', () => {
  const css = renderXp7ReaderTheme();

  assert.match(css, /font-family: Tahoma, "Segoe UI", "Microsoft JhengHei", sans-serif/u);
  assert.match(css, /--reader-face: #ece9d8/u);
  assert.match(css, /\.report-header \{[^}]*linear-gradient\(180deg, #72b6ec/u);
  assert.match(css, /\.report-section \{[^}]*border: 1px solid var\(--reader-line\)[^}]*border-radius: 0[^}]*box-shadow: none/u);
  assert.match(css, /\.portable-frame-controls button[^}]*linear-gradient\(180deg, #fff/u);
  assert.doesNotMatch(css, /backdrop-filter|filter:\s*blur|@font-face/iu);
});

test('keeps text at two visible levels and video at three without nested card chrome', () => {
  const css = renderXp7ReaderTheme();

  assert.match(css, /\.report-text \{[^}]*padding: 2px 3px 5px/u);
  assert.match(css, /\.portable-player \{[^}]*border: 1px solid #8fa9c1[^}]*box-shadow: none/u);
  assert.match(css, /\.portable-player-side \{[^}]*border: 0[^}]*background: transparent[^}]*box-shadow: none/u);
  assert.match(css, /\.portable-frame-surface \{[^}]*border: 1px solid #4d4d4d[^}]*border-radius: 0[^}]*box-shadow: none/u);
  assert.match(css, /\.portable-player\[data-frame-selected="true"\] \{[^}]*outline: none[^}]*box-shadow: none/u);
  assert.match(css, /portable-player-side \+ \.portable-player-side[^}]*border-left: 1px solid #c2bfb5/u);
});

test('embeds the reader theme inline and preserves responsive offline output', () => {
  const html = renderReportHtml({
    schemaVersion: 1,
    title: '年代風格輸出報告',
    sections: [{
      title: '投球摘要',
      blocks: [{ type: 'rich-text', content: '內容' }, {
        type: 'singleVideo',
        mediaAssetId: 'pitch',
        label: '投球影片',
      }],
    }],
  }, {
    assetManifest: [{ id: 'pitch', kind: 'video', relativePath: 'videos/pitch.mp4' }],
  });

  assert.match(html, /<style>[\s\S]*--reader-face: #ece9d8[\s\S]*<\/style>/u);
  assert.match(html, /@media \(max-width: 700px\)/u);
  assert.match(html, /@media \(max-width: 480px\)/u);
  assert.match(html, /data-native-frame-player-block/u);
  assert.doesNotMatch(html, /<link[^>]+stylesheet|generator-xp7\.css|@import|url\s*\(|https?:\/\//iu);
});
