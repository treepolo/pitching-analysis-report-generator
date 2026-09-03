'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const exportApi = require('../../src/export');
const mediaApi = require('../../src/media');
const { renderReportHtml } = require('../../src/export/report-renderer');

test('retires export PNG frame-cache packaging while preserving the live media frame cache', () => {
  assert.equal(exportApi.FRAME_CACHE_OUTPUT_ROOT, undefined);
  assert.equal(exportApi.frameCacheWarning, undefined);
  assert.equal(exportApi.indexFrameCaches, undefined);
  assert.equal(exportApi.normalizeCacheResponse, undefined);
  assert.equal(exportApi.resolveFrameCacheForAsset, undefined);
  assert.equal(exportApi.stageFrameCache, undefined);

  assert.equal(typeof mediaApi.prepareFrameCache, 'function');
  assert.equal(typeof mediaApi.readFrameCache, 'function');
  assert.equal(typeof mediaApi.cleanupFrameCache, 'function');
});

test('portable reports use native video assets and contain no packaged frame-cache runtime', () => {
  const html = renderReportHtml({
    schemaVersion: 1,
    title: 'Native export contract',
    sections: [{
      blocks: [{ type: 'singleVideo', mediaAssetId: 'pitch' }],
    }],
  }, {
    assetManifest: [{
      id: 'pitch',
      kind: 'video',
      relativePath: 'videos/pitch.mp4',
      metadata: { fps: 30, frameCount: 90 },
    }],
  });

  assert.match(html, /<video\b[^>]*data-player-video[^>]*src="videos\/pitch\.mp4"/u);
  assert.match(html, /data-native-frame-player\b/u);
  assert.doesNotMatch(html, /data-frame-player="/u);
  assert.doesNotMatch(html, /images\/frame-cache|data-frame-index|frame-cache-status|cache-miss/u);
});
