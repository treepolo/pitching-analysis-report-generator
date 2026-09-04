'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const exportApi = require('../../src/export');
const mediaApi = require('../../src/media');
const { renderReportHtml } = require('../../src/export/report-renderer');

const repositoryRoot = path.resolve(__dirname, '..', '..');

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

test('legacy export frame-cache plumbing is absent while the generator frame-cache bridge remains live', async () => {
  const [rendererBase, exporter, appBridge, main, layoutValidator] = await Promise.all([
    fs.readFile(path.join(repositoryRoot, 'src', 'export', 'report-renderer-base.js'), 'utf8'),
    fs.readFile(path.join(repositoryRoot, 'src', 'export', 'exporter.js'), 'utf8'),
    fs.readFile(path.join(repositoryRoot, 'src', 'export', 'app-bridge.js'), 'utf8'),
    fs.readFile(path.join(repositoryRoot, 'src', 'main.js'), 'utf8'),
    fs.readFile(path.join(repositoryRoot, 'src', 'export', 'layout-validator.js'), 'utf8'),
  ]);

  for (const retired of [
    'frameCacheManifest',
    'frameCacheWarnings',
    'normalizeRendererFrameCaches',
    'frameCacheForSide',
    'frameCacheFallbackStatus',
    'frameCacheJson',
    'renderFramePlayerSide',
    'renderFramePlayer',
    'renderFramePlayerScript',
    'renderLegacyPlayerScript',
  ]) {
    assert.doesNotMatch(rendererBase, new RegExp(`\\b${retired}\\b`, 'u'));
  }
  for (const retired of ['frameCaches', 'requireReadyFrameCache', 'frameCacheFallbackReason']) {
    assert.doesNotMatch(exporter, new RegExp(`\\b${retired}\\b`, 'u'));
    assert.doesNotMatch(appBridge, new RegExp(`\\b${retired}\\b`, 'u'));
  }
  assert.doesNotMatch(main, /\breadExportFrameCaches\b/u);
  assert.doesNotMatch(main, /\bcollectReferencedVideoAssetIds\b/u);
  assert.doesNotMatch(main, /\brandomUUID\b/u);
  assert.doesNotMatch(layoutValidator, /FRAME_INDEX_ATTRIBUTE_PATTERN|data-frame-index|Portable frame index/u);

  for (const channel of [
    'frame-cache:prepare',
    'frame-cache:read',
    'frame-cache:cleanup',
    'frame-cache:cancel',
    'frame-cache:frame',
  ]) {
    assert.match(main, new RegExp(channel, 'u'));
  }
  assert.match(main, /\bprepareFrameCache\b/u);
  assert.match(main, /\breadFrameCache\b/u);
  assert.match(main, /\bcleanupFrameCache\b/u);
});
