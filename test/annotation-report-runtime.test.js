'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { collectAnnotationPayload, injectAnnotationReportHtml } = require('../src/export/annotation-report-runtime');

test('maps annotation data to rendered video block indexes without counting text or empty video blocks', () => {
  const payload = collectAnnotationPayload({
    sections: [{ blocks: [
      { type: 'rich-text', content: 'x' },
      { type: 'singleVideo', mediaAssetId: 'video-a', annotations: { tracks: [{ id: 'a', name: 'A', points: [{ frame: 1, x: .1, y: .2 }] }] } },
      { type: 'singleVideo' },
      { type: 'comparisonVideo', left: { mediaAssetId: 'video-b', annotations: { tracks: [{ id: 'b', name: 'B', points: [{ frame: 2, x: .3, y: .4 }] }] } } },
    ] }],
  });
  assert.deepEqual(payload.map((entry) => entry.videoIndex), [0, 1]);
  assert.ok(payload[0].sides.single);
  assert.ok(payload[1].sides.left);
});

test('injects a self-contained reader overlay runtime only when annotations exist', () => {
  const base = '<html><head></head><body><figure class="report-video"></figure></body></html>';
  const unchanged = injectAnnotationReportHtml(base, { sections: [{ blocks: [{ type: 'singleVideo' }] }] });
  assert.equal(unchanged, base);

  const html = injectAnnotationReportHtml(base, {
    sections: [{ blocks: [{
      type: 'singleVideo',
      mediaAssetId: 'video-a',
      annotations: {
        view: { showPoints: true, showLines: false },
        tracks: [{ id: 'ball', name: '</script><b>球</b>', color: '#ff0000', points: [{ frame: 1, x: .2, y: .3 }] }],
      },
    }] }],
  });
  assert.match(html, /data-annotation-reader-style/u);
  assert.match(html, /data-annotation-reader-runtime/u);
  assert.match(html, /showPoints/u);
  assert.match(html, /showLines/u);
  assert.match(html, /track\.visible/u);
  assert.match(html, /point\.frame <= frame/u);
  assert.match(html, /polyline/u);
  assert.doesNotMatch(html, /<\/script><b>球<\/b>/u);
  const script = html.match(/<script data-annotation-reader-runtime>\s*([\s\S]*?)\s*<\/script>/u)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new vm.Script(script));
});
