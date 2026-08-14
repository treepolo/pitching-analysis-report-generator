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
    playback: { rate: 0.5, controls: true },
    loop: { start: 1, end: 2 },
  }, {
    type: 'comparisonVideo',
    left: {
      mediaAssetId: 'asset-1',
      label: 'Front',
      anchor: { observedTime: 1.25, frameIndex: 30, precision: 'frame-aware' },
    },
    right: {
      mediaAssetId: 'asset-2',
      label: 'Side',
      loop: { start: 0, end: 3 },
    },
  }]);
});
