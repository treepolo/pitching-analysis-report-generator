'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { toReportDocument } = require('../src/report-contract');

test('exports single-video manual frame annotations without media time or editor state', () => {
  const document = toReportDocument({
    displayName: 'Annotation report',
    sections: [{
      title: 'Video',
      blocks: [{
        id: 'editor-only',
        type: 'singleVideo',
        mediaAssetId: 'pitch',
        annotations: {
          view: { showPoints: true, showLines: true },
          tracks: [{
            id: 'ball',
            name: '球',
            color: '#123456',
            visible: true,
            startFrame: 20,
            endFrame: 80,
            editorState: { selected: true },
            points: [
              { frame: 20, x: 0.25, y: 0.4, time: 1.234 },
              { frame: 24, x: 0.4, y: 0.42 },
            ],
          }],
        },
      }],
    }],
  });

  assert.deepEqual(document.sections[0].blocks[0].annotations, {
    view: { showPoints: true, showLines: true },
    tracks: [{
      id: 'ball',
      name: '球',
      color: '#123456',
      visible: true,
      startFrame: 20,
      endFrame: 80,
      points: [
        { frame: 20, x: 0.25, y: 0.4 },
        { frame: 24, x: 0.4, y: 0.42 },
      ],
    }],
  });
});

test('keeps dual-video annotation layers isolated by side', () => {
  const document = toReportDocument({
    displayName: 'Dual annotations',
    sections: [{
      blocks: [{
        type: 'comparisonVideo',
        left: {
          mediaAssetId: 'left',
          annotations: { tracks: [{ id: 'left-track', name: '左手', points: [{ frame: 1, x: 0.1, y: 0.2 }] }] },
        },
        right: {
          mediaAssetId: 'right',
          annotations: { tracks: [{ id: 'right-track', name: '球', points: [{ frame: 5, x: 0.8, y: 0.7 }] }] },
        },
      }],
    }],
  });
  const block = document.sections[0].blocks[0];
  assert.equal(block.left.annotations.tracks[0].id, 'left-track');
  assert.equal(block.right.annotations.tracks[0].id, 'right-track');
  assert.notDeepEqual(block.left.annotations, block.right.annotations);
});
