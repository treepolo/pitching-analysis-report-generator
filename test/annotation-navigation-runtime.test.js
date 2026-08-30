'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');

const {
  injectAnnotationNavigationHtml,
  navigationScript,
} = require('../src/export/annotation-navigation-runtime');

const records = [{
  videoIndex: 0,
  sides: {
    single: {
      view: { showPoints: true, showLines: false },
      tracks: [{
        id: 'track-1',
        name: '手腕',
        color: '#e53935',
        visible: true,
        startFrame: 3,
        endFrame: 20,
        points: [
          { frame: 3, x: 0.2, y: 0.2 },
          { frame: 8, x: 0.3, y: 0.3 },
          { frame: 15, x: 0.4, y: 0.4 },
        ],
      }],
    },
  },
}];

function scriptBody(html) {
  const start = html.indexOf('>') + 1;
  const end = html.lastIndexOf('</script>');
  return html.slice(start, end);
}

test('exported annotation navigation runtime compiles as browser JavaScript', () => {
  assert.doesNotThrow(() => new vm.Script(scriptBody(navigationScript(records))));
});

test('reader exposes explicit previous and next annotation-frame buttons', () => {
  const source = navigationScript(records);
  assert.match(source, /← 上一標註幀/u);
  assert.match(source, /下一標註幀 →/u);
  assert.match(source, /data-annotation-jump/u);
  assert.match(source, /previousFrame === null/u);
  assert.match(source, /nextFrame === null/u);
});

test('A and D move strictly to the nearest previous or next annotation frame', () => {
  const source = navigationScript(records);
  assert.match(source, /event\.code === 'KeyA'/u);
  assert.match(source, /event\.code === 'KeyD'/u);
  assert.match(source, /frames\[index\] < frame/u);
  assert.match(source, /candidate > frame/u);
  assert.match(source, /event\.stopImmediatePropagation\(\)/u);
});

test('dual-video annotation navigation maps a side frame onto the shared player timeline', () => {
  const source = navigationScript(records);
  assert.match(source, /sharedMapping\(entry\.player\)/u);
  assert.match(source, /frame - mapping\.starts\[index\]/u);
  assert.match(source, /data-frame-shared-controls/u);
  assert.match(source, /sharedTimeline\.dispatchEvent\(new Event\('input'/u);
});

test('navigation injection only appears when the report actually has annotations', () => {
  const annotated = injectAnnotationNavigationHtml('<html><head></head><body></body></html>', {
    sections: [{ blocks: [{
      type: 'singleVideo',
      mediaAssetId: 'video-1',
      annotations: records[0].sides.single,
    }] }],
  });
  assert.match(annotated, /data-annotation-navigation-runtime/u);
  assert.match(annotated, /data-annotation-navigation-style/u);

  const plain = '<html><head></head><body></body></html>';
  assert.equal(injectAnnotationNavigationHtml(plain, { sections: [] }), plain);
});
