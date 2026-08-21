'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { toReportDocument } = require('../src/report-contract');

test('builds a renderer/export document seam without mutating the project', () => {
  const project = {
    displayName: 'Contract test',
    reportTitle: 'Student-facing title',
    sections: [{
      id: 'editor-section-id',
      title: 'Summary',
      editorState: { selected: true },
      blocks: [{
        id: 'editor-block-id',
        type: 'rich-text',
        content: 'Keep this text',
        temporaryPath: 'D:\\private\\draft.tmp',
        editorState: { dirty: true },
        jobState: { status: 'running' },
      }],
    }],
  };

  const document = toReportDocument(project);
  assert.deepEqual(document, {
    schemaVersion: 1,
    title: 'Student-facing title',
    sections: [{
      title: 'Summary',
      blocks: [{ type: 'rich-text', content: 'Keep this text' }],
    }],
  });
  assert.equal('id' in document.sections[0], false);
  assert.equal('id' in document.sections[0].blocks[0], false);
  assert.equal('temporaryPath' in document.sections[0].blocks[0], false);
  assert.equal('editorState' in document.sections[0].blocks[0], false);
  assert.equal('jobState' in document.sections[0].blocks[0], false);
  assert.deepEqual(project.sections[0].blocks[0].content, 'Keep this text');
});

test('keeps allowlisted media-facing fields while dropping editor-only block state', () => {
  const document = toReportDocument({
    displayName: 'Media contract',
    sections: [{
      id: 'section-id',
      title: 'Media',
      blocks: [{
        id: 'video-block-id',
    type: 'singleVideo',
    mediaAssetId: 'asset-1',
    label: 'Front view',
    segment: { in: 1, out: 2 },
    playback: { rate: 0.5, controls: true, internalState: 'drop' },
    loop: { start: 1, end: 2, temporaryPath: 'drop.tmp' },
        temporaryPath: 'drop.tmp',
        internalId: 'drop',
      }, {
        id: 'comparison-block-id',
        type: 'comparisonVideo',
        left: {
          mediaAssetId: 'asset-1',
          label: 'Front',
          anchor: {
            observedTime: 1.25,
            frameIndex: 30,
            precision: 'frame-aware',
            internalState: 'drop',
          },
          editorState: { dirty: true },
        },
        right: {
          mediaAssetId: 'asset-2',
          label: 'Side',
          loop: { start: 0, end: 3 },
        },
        temporaryPath: 'drop.tmp',
      }],
    }],
  });

  assert.deepEqual(document.sections[0].blocks, [{
    type: 'singleVideo',
    mediaAssetId: 'asset-1',
    label: 'Front view',
    segment: { in: 1, out: 2 },
    playback: { rate: 0.5, controls: true },
    loop: { enabled: true },
  }, {
    type: 'comparisonVideo',
    left: {
      mediaAssetId: 'asset-1',
      label: 'Front',
    },
    right: {
      mediaAssetId: 'asset-2',
      label: 'Side',
      segment: { in: 0, out: 3 },
      loop: { enabled: true },
    },
  }]);
});

test('preserves block-local video settings in the shared report contract', () => {
  const document = toReportDocument({
    displayName: 'Block settings',
    sections: [{
      title: 'Video analysis',
      blocks: [{
        type: 'singleVideo',
        mediaAssetId: 'asset-front',
        label: 'Front view',
        segment: { in: 0.25, out: 2.5, editorOnly: 'drop' },
        playback: { rate: 0.75 },
        sync: { mode: 'frame', startAnchor: { observedTime: 0.5, frameIndex: 15, editorOnly: 'drop' } },
        anchor: { observedTime: 1.25, frameIndex: 38, precision: 'frame-aware' },
      }, {
        type: 'comparisonVideo',
        layout: 'side-by-side',
        sync: { mode: 'time', startAnchor: { observedTime: 0.75 } },
        binding: {
          enabled: true,
          masterSide: 'right',
          mode: 'time',
          anchors: {
            left: { observedTime: 1.1, frameIndex: 33, precision: 'time', editorOnly: 'drop' },
            right: { observedTime: 1.4, frameIndex: 42, precision: 'frame', temporaryPath: 'drop.tmp' },
          },
          fallbackPrecision: 'estimated',
          segmentRelation: 'independent',
          loopRelation: 'shared',
          editorState: { dirty: true },
        },
        left: {
          mediaAssetId: 'asset-front',
          segment: { in: 0, out: 3 },
          playback: { rate: 0.5 },
          anchor: { observedTime: 1.1 },
        },
        right: {
          mediaAssetId: 'asset-side',
          segment: { in: 0.1, out: 2.9 },
          playback: { rate: 0.5 },
          anchor: { observedTime: 1.4 },
        },
      }],
    }],
  });

  assert.deepEqual(document.sections[0].blocks, [{
    type: 'singleVideo',
    mediaAssetId: 'asset-front',
    label: 'Front view',
    segment: { in: 0.25, out: 2.5 },
    playback: { rate: 0.75 },
  }, {
    type: 'comparisonVideo',
    layout: 'side-by-side',
    left: {
      mediaAssetId: 'asset-front',
      segment: { in: 0, out: 3 },
      playback: { rate: 0.5 },
    },
    right: {
      mediaAssetId: 'asset-side',
      segment: { in: 0.1, out: 2.9 },
      playback: { rate: 0.5 },
    },
  }]);
});
