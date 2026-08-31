'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');

const { renderReportHtml } = require('../../src/export/report-renderer');

function annotatedReportHtml() {
  return renderReportHtml({
    schemaVersion: 1,
    title: '標註輸出整合',
    sections: [{
      id: 'section-1',
      title: '投球',
      blocks: [{
        id: 'video-1',
        type: 'singleVideo',
        mediaAssetId: 'pitch',
        segment: { in: 0, out: 60 },
        annotations: {
          view: { showPoints: true, showLines: true },
          tracks: [{
            id: 'track-1',
            name: '手腕',
            color: '#e53935',
            visible: true,
            startFrame: 4,
            endFrame: 40,
            points: [
              { frame: 4, x: 0.2, y: 0.3 },
              { frame: 12, x: 0.3, y: 0.4 },
              { frame: 28, x: 0.4, y: 0.5 },
            ],
          }],
        },
      }],
    }],
  }, {
    assetManifest: [{
      id: 'pitch',
      kind: 'video',
      relativePath: 'videos/pitch.mp4',
      metadata: { fps: 30, frameCount: 90 },
    }],
  });
}

test('rendered annotated report contains all requested reader enhancements together', () => {
  const html = annotatedReportHtml();
  assert.match(html, /data-annotation-reader-runtime/u);
  assert.match(html, /data-annotation-navigation-runtime/u);
  assert.match(html, /← 上一標註幀/u);
  assert.match(html, /下一標註幀 →/u);
  assert.match(html, /event\.code === 'KeyA'/u);
  assert.match(html, /event\.code === 'KeyD'/u);
  assert.match(html, /data-xp7-range-theme/u);
  assert.match(html, /::-webkit-slider-runnable-track/u);
  assert.match(html, /::-webkit-slider-thumb/u);
  assert.match(html, /data-report-help-style/u);
  assert.match(html, /data-report-help-open/u);
  assert.match(html, /data-report-help-runtime/u);
  assert.match(html, /在報告中顯示教學標記/u);
});

test('rendered report uses the fixed extended clock and mode-aware rate transition runtime', () => {
  const html = annotatedReportHtml();
  assert.match(html, /const targetFrame = frameIndexForTime\(nextTime\)/u);
  assert.match(html, /const readyToPresent = videos\.every\(\(video\) => !video\?\.seeking\)/u);
  assert.match(html, /if \(!wasManual\) startManual\(\)/u);
  assert.match(html, /if \(!wasManual\) startSharedManual\(\)/u);
  assert.doesNotMatch(html, /Math\.abs\(displayed - nextTime\) > 0\.0005/u);
});

test('every inline script in the enhanced annotated report compiles', () => {
  const html = annotatedReportHtml();
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>\s*([\s\S]*?)\s*<\/script>/gu)]
    .map((match) => match[1]);
  assert.ok(scripts.length >= 4);
  scripts.forEach((script) => assert.doesNotThrow(() => new vm.Script(script)));
});
