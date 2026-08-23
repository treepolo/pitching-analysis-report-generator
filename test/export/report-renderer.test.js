'use strict';

const vm = require('node:vm');

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
  assert.match(html, /<h3>Before<\/h3>/u);
  assert.match(html, /<h3>After<\/h3>/u);
  assert.doesNotMatch(html, /editor-left|editor-right|private\.tmp|editorState/iu);
  assert.doesNotMatch(html, /id="summary"|id="media"/u);
  assert.doesNotMatch(html, /<script\s+src=/iu);
  assert.doesNotMatch(html, /\bfetch\s*\(/iu);
  assert.doesNotMatch(html, /https?:\/\//iu);
  const inlineScripts = [...html.matchAll(/<script>\s*([\s\S]*?)\s*<\/script>/g)].map((match) => match[1]);
  assert.equal(inlineScripts.length, 1);
  assert.doesNotThrow(() => new vm.Script(inlineScripts[0]));

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

test('renders independent video playback, loop, and comparison layout settings into portable controls', () => {
  const html = renderReportHtml({
    schemaVersion: 1,
    title: '可攜式播放器設定',
    sections: [{
      blocks: [{
        type: 'singleVideo',
        mediaAssetId: 'pitch',
        label: '單一投球',
        sourceLabel: '單一來源',
        segment: { in: 1, out: 3 },
        playback: { rate: 64 },
        loop: { enabled: true },
        anchor: { observedTime: 1, precision: 'time-based' },
      }, {
        type: 'comparisonVideo',
        layout: 'stacked',
        sync: {
          mode: 'frame',
          startAnchor: { observedTime: 0.5, precision: 'frame-aware' },
          binding: {
            enabled: true,
            masterSide: 'right',
            mode: 'frame',
            fallbackPrecision: 'time-based',
            playbackRate: 1.1,
            anchors: {
              left: { observedTime: 2, precision: 'frame-aware' },
              right: { observedTime: 1.5, precision: 'time-based' },
            },
            sides: {
              right: { segment: { in: 0.5, out: 2.5 } },
            },
          },
        },
        left: {
          mediaAssetId: 'pitch',
          label: '前側',
          segment: { in: 2, out: 4 },
          playback: { rate: 0.75 },
          anchor: { observedTime: 2, precision: 'frame-aware' },
        },
        right: {
          mediaAssetId: 'comparison',
          label: '後側',
          segment: { in: 0, out: 2 },
          playback: { rate: 1.25 },
          loop: { enabled: true },
          anchor: { observedTime: 1.5, precision: 'time-based' },
        },
      }],
    }],
  }, {
    assetManifest: [
      { id: 'pitch', kind: 'video', relativePath: 'videos/pitch.mp4' },
      { id: 'comparison', kind: 'video', relativePath: 'videos/comparison.mp4' },
    ],
  });

  assert.match(html, /data-portable-player/iu);
  assert.match(html, /data-native-frame-player-block/iu);
  assert.match(html, /data-player-layout="stacked"/u);
  assert.match(html, /data-segment-in="1"[\s\S]*data-segment-out="3"/u);
  assert.match(html, /data-playback-rate="64"/u);
  assert.match(html, /data-loop-enabled="true"/u);
  assert.match(html, /data-frame-rate-input[^>]+min="0\.015625"[^>]+max="64"/u);
  assert.match(html, /data-frame-rate type="range" min="-6" max="6"/u);
  assert.match(html, /data-frame-action="reset-rate"/u);
  assert.match(html, /data-frame-selected="false"/u);
  assert.match(html, /data-frame-current/u);
  assert.match(html, /data-frame-total/u);
  assert.match(html, /data-frame-action="toggle"[^>]*>▶/u);
  assert.match(html, /data-frame-action="previous"[^>]*>←/u);
  assert.match(html, /data-frame-action="next"[^>]*>→/u);
  assert.match(html, /data-frame-shared-controls/u);
  assert.match(html, /data-frame-sync-info/u);
  assert.doesNotMatch(html, /data-frame-action="sync"/u);
  assert.doesNotMatch(html, /syncPoint|syncButton/u);
  assert.match(html, /nativeFramePlayerKeyboardBound/u);
  assert.doesNotMatch(html, /data-anchor-time|data-sync-offset|data-loop-start|data-loop-end|陷ｷ譴ｧ・ｭ・･|驍ｯ竏晢ｽｮ蝌ｶ鬪ｭ・ｨ魄溘・/u);
  assert.doesNotMatch(html, /portable-player-settings|portable-player-eyebrow|portable-player-layout/iu);
  assert.match(html, /data-frame-loop/iu);
  assert.match(html, /requestVideoFrameCallback/u);
  assert.match(html, /requestAnimationFrame/u);
  assert.match(html, /currentTime/u);
  assert.match(html, /ArrowLeft/u);
  assert.match(html, /ArrowRight/u);
  assert.doesNotMatch(html, /data-frame-player="/u);
  assert.doesNotMatch(html, /images\/frame-cache|frame-cache-status/u);
  assert.doesNotMatch(html, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b/iu);
  const inlineScripts = [...html.matchAll(/<script>\s*([\s\S]*?)\s*<\/script>/g)].map((match) => match[1]);
  assert.equal(inlineScripts.length, 1);
  assert.doesNotThrow(() => new vm.Script(inlineScripts[0]));});

test('forces single-video output to stacked while dual output honors layout', () => {
  const html = renderReportHtml({
    schemaVersion: 1,
    title: 'Layout contract',
    sections: [{
      blocks: [{
        type: 'singleVideo',
        layout: 'side-by-side',
        mediaAssetId: 'single',
      }, {
        type: 'comparisonVideo',
        layout: 'side-by-side',
        left: { mediaAssetId: 'left' },
        right: { mediaAssetId: 'right' },
      }],
    }],
  }, {
    assetManifest: [
      { id: 'single', kind: 'video', relativePath: 'videos/single.mp4' },
      { id: 'left', kind: 'video', relativePath: 'videos/left.mp4' },
      { id: 'right', kind: 'video', relativePath: 'videos/right.mp4' },
    ],
  });
  assert.deepEqual(
    [...html.matchAll(/data-player-layout="([^"]+)"/g)].map((match) => match[1]),
    ['stacked', 'side-by-side'],
  );
});
test('drops retired binding state without exposing editor-only fields', () => {
  const html = renderReportHtml({
    schemaVersion: 1,
    title: 'Canonical binding',
    sections: [{
      blocks: [{
        type: 'comparisonVideo',
        internalId: 'comparison-internal-id',
        temporaryPath: 'private/temporary.mp4',
        binding: {
          enabled: true,
          masterSide: 'right',
          mode: 'frame',
          fallbackPrecision: 'time',
          anchors: {
            left: { observedTime: 1, precision: 'frame-aware' },
            right: { observedTime: 2, precision: 'time-based' },
          },
          sides: {
            left: { segment: { in: 1, out: 3 } },
            right: { segment: { in: 2, out: 4 } },
          },
          segmentRelation: 'independent',
          loopRelation: 'independent',
        },
        left: {
          mediaAssetId: 'asset-left-internal',
          label: '左側',
          segment: { in: 1, out: 3 },
          temporaryPath: 'private/left.mp4',
        },
        right: {
          mediaAssetId: 'asset-right-internal',
          label: '右側',
          segment: { in: 2, out: 4 },
          temporaryPath: 'private/right.mp4',
        },
      }],
    }],
  }, {
    assetManifest: [
      { id: 'asset-left-internal', kind: 'video', relativePath: 'videos/left.mp4' },
      { id: 'asset-right-internal', kind: 'video', relativePath: 'videos/right.mp4' },
    ],
  });

  assert.doesNotMatch(html, /data-sync-offset|data-loop-start|data-loop-end|綁定|錨點/u);
  assert.doesNotMatch(html, /data-asset-id/iu);
  assert.doesNotMatch(html, /comparison-internal-id|asset-left-internal|asset-right-internal|private\/temporary\.mp4|private\/left\.mp4|private\/right\.mp4/u);
});
