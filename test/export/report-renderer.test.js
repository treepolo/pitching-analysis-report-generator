'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { extractHtmlAssetReferences } = require('../../src/export/layout-validator');
const { renderReportHtml } = require('../../src/export/report-renderer');

test('renders escaped text, inline styles, and relative media paths into self-contained HTML', () => {
  const html = renderReportHtml({
    schemaVersion: 1,
    title: '<Pitching & Review>',
    sections: [{
      id: 'summary',
      title: 'Summary',
      blocks: [{ type: 'rich-text', content: 'Safe <script>alert(1)</script> & text' }],
    }, {
      id: 'media',
      title: 'Media',
      blocks: [{
        type: 'singleVideo',
        mediaAssetId: 'pitch',
        posterAssetId: 'poster',
        label: 'Pitch clip',
      }, {
        type: 'image',
        imageAssetId: 'poster',
        label: 'Release frame',
      }, {
        type: 'comparisonVideo',
        left: { id: 'editor-left', mediaAssetId: 'pitch', label: 'Before', temporaryPath: 'private.tmp' },
        right: { id: 'editor-right', mediaAssetId: 'comparison', label: 'After', temporaryPath: 'private.tmp' },
        editorState: { selected: true },
      }],
    }],
  }, {
    assetManifest: [
      { id: 'pitch', kind: 'video', relativePath: 'videos/pitch clip.mp4' },
      { id: 'comparison', kind: 'video', relativePath: 'videos/comparison.mp4' },
      { id: 'poster', kind: 'image', relativePath: 'images/release frame.png' },
    ],
  });

  assert.match(html, /<style>/u);
  assert.match(html, /&lt;Pitching &amp; Review&gt;/u);
  assert.match(html, /Safe &lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; text/u);
  assert.match(html, /src="videos\/pitch%20clip\.mp4"/u);
  assert.match(html, /poster="images\/release%20frame\.png"/u);
  assert.match(html, /src="images\/release%20frame\.png"/u);
  assert.match(html, /<figcaption>Before<\/figcaption>/u);
  assert.match(html, /<figcaption>After<\/figcaption>/u);
  assert.doesNotMatch(html, /editor-left|editor-right|private\.tmp|editorState/iu);
  assert.doesNotMatch(html, /id="summary"|id="media"/u);
  assert.doesNotMatch(html, /<script\s+src=/iu);
  assert.doesNotMatch(html, /\bfetch\s*\(/iu);
  assert.doesNotMatch(html, /https?:\/\//iu);

  const references = extractHtmlAssetReferences(html);
  assert.deepEqual(
    [...new Set(references.map((reference) => reference.relativePath))].sort(),
    ['images/release frame.png', 'videos/comparison.mp4', 'videos/pitch clip.mp4'],
  );
});

test('fails before rendering when a block contains an empty asset reference', () => {
  assert.throws(
    () => renderReportHtml({
      sections: [{ blocks: [{ type: 'singleVideo', mediaAssetId: '' }] }],
    }),
    /invalid or missing asset references/i,
  );
});
