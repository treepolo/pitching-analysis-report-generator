'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const model = require('../src/annotation-model');

test('normalizes manual frame annotations and keeps at most one point per frame', () => {
  const annotations = model.normalizeAnnotations({
    view: { showPoints: false, showLines: true },
    tracks: [{
      id: 'ball',
      name: '球',
      color: '#FF0000',
      visible: true,
      startFrame: 10,
      endFrame: 30,
      points: [
        { frame: 10, x: 0.1, y: 0.2, time: 99 },
        { frame: 12, x: 0.2, y: 0.3 },
        { frame: 10, x: 0.4, y: 0.5 },
        { frame: 11, x: 2, y: 0.5 },
      ],
    }],
  });

  assert.deepEqual(annotations, {
    view: { showPoints: false, showLines: true },
    tracks: [{
      id: 'ball',
      name: '球',
      color: '#ff0000',
      visible: true,
      startFrame: 10,
      endFrame: 30,
      points: [
        { frame: 10, x: 0.4, y: 0.5 },
        { frame: 12, x: 0.2, y: 0.3 },
      ],
    }],
  });
  assert.equal('time' in annotations.tracks[0].points[0], false);
});

test('keeps an unbounded end frame and validates the persisted annotation step', () => {
  const annotations = model.normalizeAnnotations({
    tracks: [{ id: 'wrist', name: '手腕', startFrame: null, endFrame: '', points: [] }],
  });
  assert.equal(annotations.tracks[0].startFrame, null);
  assert.equal(annotations.tracks[0].endFrame, null);
  assert.equal(model.normalizeStepFrames(7), 7);
  assert.equal(model.normalizeStepFrames(0), 1);
  assert.equal(model.normalizeStepFrames('3'), 3);
});
