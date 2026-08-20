'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  FRAME_CACHE_BRIDGE_METHODS,
  FRAME_CACHE_CONTRACT_VERSION,
  FRAME_CACHE_RESPONSE_STATUS,
  FrameCacheContractError,
  createCancelResponse,
  createCleanupResponse,
  normalizeFrameCacheRequest,
  normalizeFrameCacheResponse,
} = require('../../src/media/frame-cache-contract');

const CHECKSUM = 'a'.repeat(64);

function readyResponse(overrides = {}) {
  return normalizeFrameCacheResponse({
    schemaVersion: FRAME_CACHE_CONTRACT_VERSION,
    requestId: 'request-1',
    projectId: 'project-1',
    assetId: 'asset-1',
    status: FRAME_CACHE_RESPONSE_STATUS.READY,
    sourceIdentity: {
      relativePath: 'media/original/pitch.mp4',
      checksumSha256: CHECKSUM,
      byteSize: 12,
      mtimeMs: 1234,
    },
    cache: {
      key: CHECKSUM,
      rootRelativePath: '.cache/frame-cache/cache-1',
      indexRelativePath: '.cache/frame-cache/cache-1/index.json',
      frameDirectoryRelativePath: '.cache/frame-cache/cache-1/frames',
      format: 'png',
    },
    metadata: {
      durationSeconds: 1,
      width: 1920,
      height: 1080,
      fps: 29.97,
      averageFps: 29.97,
      rawFps: 29.97,
      frameTiming: 'cfr',
      timebase: '1/90000',
      frameCount: 1,
    },
    frames: [{
      frameNumber: 0,
      pts: 9000,
      time: 0.1,
      width: 1920,
      height: 1080,
      relativePath: '.cache/frame-cache/cache-1/frames/frame-00000000.png',
    }],
    reused: false,
    error: null,
    ...overrides,
  });
}

test('fixes the v1 bridge method names and request shape without absolute paths', () => {
  assert.deepEqual(FRAME_CACHE_BRIDGE_METHODS, {
    PREPARE: 'prepareFrameCache',
    READ: 'readFrameCache',
    CLEANUP: 'cleanupFrameCache',
    CANCEL: 'cancelFrameCache',
  });
  const request = normalizeFrameCacheRequest({
    operation: 'prepareFrameCache',
    requestId: 'request-1',
    projectId: 'project-1',
    assetId: 'asset-1',
    sourceReference: { relativePath: 'media/original/pitch.mp4', checksumSha256: CHECKSUM, byteSize: 12 },
  });
  assert.deepEqual(request.sourceReference, {
    relativePath: 'media/original/pitch.mp4',
    checksumSha256: CHECKSUM,
    byteSize: 12,
  });
  assert.throws(
    () => normalizeFrameCacheRequest({
      operation: 'prepareFrameCache',
      requestId: 'request-1',
      projectId: 'project-1',
      assetId: 'asset-1',
      sourceReference: { relativePath: 'C:/private/pitch.mp4' },
    }),
    (error) => error instanceof FrameCacheContractError && error.code === 'CACHE_REFERENCE_INVALID',
  );
});

test('preserves frame index, PTS/time, cache-relative roots, dimensions, and source identity', () => {
  const response = readyResponse();
  assert.equal(response.status, 'ready');
  assert.equal(response.frames[0].frameNumber, 0);
  assert.equal(response.frames[0].pts, 9000);
  assert.equal(response.frames[0].time, 0.1);
  assert.equal(response.frames[0].width, 1920);
  assert.equal(response.cache.rootRelativePath, '.cache/frame-cache/cache-1');
  assert.equal(response.frames[0].relativePath.startsWith('.cache/frame-cache/'), true);
  assert.equal(response.sourceIdentity.relativePath, 'media/original/pitch.mp4');
  assert.equal(response.sourceIdentity.checksumSha256, CHECKSUM);
  assert.equal(JSON.stringify(response).includes('C:/'), false);
  assert.equal(JSON.stringify(response).includes('temporaryPath'), false);
});

test('requires explicit preparation/error states and forbids partial frames', () => {
  const missing = normalizeFrameCacheResponse({
    schemaVersion: 1,
    requestId: 'request-1',
    projectId: 'project-1',
    assetId: 'asset-1',
    status: 'tool-missing',
    sourceIdentity: null,
    cache: null,
    metadata: null,
    frames: [],
    error: { code: 'FFMPEG_UNAVAILABLE', message: 'ffmpeg is unavailable' },
  });
  assert.equal(missing.status, 'tool-missing');
  assert.equal(missing.error.code, 'FFMPEG_UNAVAILABLE');
  assert.throws(
    () => normalizeFrameCacheResponse({
      ...readyResponse(),
      status: 'process-failed',
      frames: [{ frameNumber: 0, pts: 0, time: 0, width: 1, height: 1, relativePath: 'cache/frame.png' }],
      error: { code: 'FAIL', message: 'failed' },
    }),
    /non-ready response cannot expose frames/u,
  );
  assert.throws(
    () => normalizeFrameCacheResponse({ ...readyResponse(), error: { code: 'BAD', message: 'not ready' } }),
    /ready response cannot contain an error/u,
  );
});

test('fixes cleanup and cancellation response shapes', () => {
  assert.deepEqual(createCleanupResponse({
    schemaVersion: 1,
    requestId: 'request-1',
    projectId: 'project-1',
    assetId: 'asset-1',
    status: 'cleaned',
  }), {
    schemaVersion: 1,
    requestId: 'request-1',
    projectId: 'project-1',
    assetId: 'asset-1',
    status: 'cleaned',
    error: null,
  });
  assert.deepEqual(createCancelResponse({
    schemaVersion: 1,
    requestId: 'request-1',
    accepted: true,
  }), {
    schemaVersion: 1,
    requestId: 'request-1',
    accepted: true,
  });
});
