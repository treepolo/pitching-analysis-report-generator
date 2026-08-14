'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
  ASSET_LIFECYCLE_STATUS,
  COMPATIBILITY,
  MediaContractError,
  NORMALIZATION_JOB_STATUS,
  advanceNormalizationJob,
  applyVerifiedNormalization,
  cancelNormalizationJob,
  completeNormalizationJob,
  createMediaAsset,
  createNormalizationJob,
  detectMediaType,
  failNormalizationJob,
  isProjectRelativePath,
  normalizeProjectRelativePath,
  requestNormalizationCancellation,
  resolveProjectRelativePath,
  retryNormalizationJob,
  startNormalizationJob,
  toProjectRelativePath,
  updateNormalizationJobProgress,
} = require('../../src/media');

const TEST_TIME = '2026-08-14T00:00:00.000Z';
const PROJECT_ROOT = path.resolve('virtual-media-project-root');

test('detects MP4 and common image formats without inspecting private media bytes', () => {
  assert.deepEqual(detectMediaType('Pitch.MP4'), {
    kind: 'video',
    format: 'mp4',
    extension: '.mp4',
    mimeType: 'video/mp4',
    supported: true,
    compatibilityHint: 'unknown',
    source: 'extension',
    reason: null,
  });

  for (const [fileName, mimeType] of [
    ['frame.jpg', 'image/jpeg'],
    ['frame.jpeg', 'image/jpeg'],
    ['frame.png', 'image/png'],
    ['frame.gif', 'image/gif'],
    ['frame.webp', 'image/webp'],
    ['frame.avif', 'image/avif'],
  ]) {
    const detected = detectMediaType({ fileName, mimeType });
    assert.equal(detected.kind, 'image');
    assert.equal(detected.supported, true);
    assert.equal(detected.compatibilityHint, COMPATIBILITY.DIRECT);
  }

  assert.equal(detectMediaType('clip.mov').compatibilityHint, COMPATIBILITY.UNSUPPORTED);
  assert.equal(detectMediaType('notes.txt').kind, 'unknown');
  assert.equal(detectMediaType({ fileName: 'frame.jpg', mimeType: 'video/mp4' }).reason, 'metadata-conflict');
});

test('enforces portable project-relative media paths', () => {
  assert.equal(isProjectRelativePath('media/original/pitch.mp4'), true);
  assert.equal(isProjectRelativePath('../outside.mp4'), false);
  assert.equal(isProjectRelativePath('C:\\outside.mp4'), false);
  assert.equal(isProjectRelativePath('/outside.mp4'), false);

  assert.throws(() => normalizeProjectRelativePath('media\\original\\pitch.mp4'), /forward slashes/iu);
  assert.throws(() => normalizeProjectRelativePath('media/../outside.mp4'), /invalid path segment/iu);
  assert.throws(() => normalizeProjectRelativePath('\\\\server\\share\\pitch.mp4'), /forward slashes/iu);
  assert.throws(() => normalizeProjectRelativePath('file:///outside.mp4'), /project-relative/iu);
  assert.throws(() => normalizeProjectRelativePath('media/pitch?.mp4'), /unsafe filename/iu);

  const resolved = resolveProjectRelativePath(PROJECT_ROOT, 'media/original/pitch.mp4');
  assert.equal(resolved, path.join(PROJECT_ROOT, 'media', 'original', 'pitch.mp4'));
  assert.equal(
    toProjectRelativePath(PROJECT_ROOT, resolved),
    'media/original/pitch.mp4',
  );
  assert.throws(
    () => toProjectRelativePath(PROJECT_ROOT, path.resolve(PROJECT_ROOT, '..', 'outside.mp4')),
    /outside the project root/iu,
  );
});

test('creates a processing asset with source reference and no unverified normalized state', () => {
  const asset = createMediaAsset({
    id: 'asset-1',
    projectId: 'project-1',
    displayName: 'pitch.mp4',
    fileName: 'pitch.mp4',
    sourceReference: 'media/original/pitch.mp4',
    metadata: {
      byteSize: 1024,
      durationSeconds: 2.5,
      width: 1920,
      height: 1080,
      fps: 59.94,
      frameTiming: 'vfr',
      codec: 'h264',
      container: 'mp4',
    },
  });

  assert.equal(asset.lifecycleStatus, ASSET_LIFECYCLE_STATUS.PROCESSING);
  assert.equal(asset.compatibility, COMPATIBILITY.UNKNOWN);
  assert.deepEqual(asset.sourceReference, {
    role: 'source',
    relativePath: 'media/original/pitch.mp4',
    byteSize: null,
    checksumSha256: null,
    mediaType: null,
  });
  assert.equal(asset.normalizedReference, null);
  assert.equal(asset.metadata.frameTiming, 'vfr');
  assert.equal(asset.metadata.fps, 59.94);
  assert.equal(asset.derived.referenceCount, 0);

  assert.throws(
    () => createMediaAsset({
      id: 'asset-2',
      projectId: 'project-1',
      displayName: 'outside.mp4',
      sourceReference: 'C:\\private\\outside.mp4',
    }),
    /forward slashes/iu,
  );
});

test('normalization result requires explicit verification evidence before ready state', () => {
  const asset = createMediaAsset({
    id: 'asset-3',
    projectId: 'project-1',
    displayName: 'pitch.mp4',
    sourceReference: 'media/original/pitch.mp4',
    compatibility: COMPATIBILITY.NEEDS_NORMALIZATION,
  });

  assert.throws(
    () => applyVerifiedNormalization(asset, {
      normalizedReference: 'media/normalized/pitch.mp4',
      verification: { verified: false, verifiedAt: TEST_TIME, metadata: { width: 1 } },
    }),
    /explicitly verified/iu,
  );

  const normalized = applyVerifiedNormalization(asset, {
    normalizedReference: 'media/normalized/pitch.mp4',
    metadata: { durationSeconds: 2, width: 1280, height: 720, frameTiming: 'cfr', fps: 60 },
    verification: {
      verified: true,
      verifiedAt: TEST_TIME,
      metadata: { durationSeconds: 2, width: 1280, height: 720 },
    },
  });
  assert.equal(normalized.compatibility, COMPATIBILITY.NORMALIZED);
  assert.equal(normalized.lifecycleStatus, ASSET_LIFECYCLE_STATUS.READY);
  assert.equal(normalized.normalizedReference.relativePath, 'media/normalized/pitch.mp4');
  assert.equal(normalized.sourceReference.relativePath, 'media/original/pitch.mp4');
});

test('normalization job starts in inspect phase and advances only with explicit progress', () => {
  const job = createNormalizationJob({
    id: 'job-1',
    projectId: 'project-1',
    assetId: 'asset-1',
    sourceReference: 'media/original/pitch.mp4',
    createdAt: TEST_TIME,
  });
  assert.equal(job.status, NORMALIZATION_JOB_STATUS.QUEUED);
  assert.equal(job.phase, 'inspect');
  assert.equal(job.processed, 0);
  assert.equal(job.total, 1);
  assert.equal(job.normalizedReference, null);
  assert.deepEqual(job.sourceReference.relativePath, 'media/original/pitch.mp4');

  let running = startNormalizationJob(job, { at: TEST_TIME });
  running = updateNormalizationJobProgress(running, {
    at: '2026-08-14T00:00:01.000Z',
    processed: 0,
    warnings: ['Codec inspection is pending'],
  });
  running = advanceNormalizationJob(running, { at: '2026-08-14T00:00:02.000Z' });
  running = advanceNormalizationJob(running, { at: '2026-08-14T00:00:03.000Z' });
  running = advanceNormalizationJob(running, { at: '2026-08-14T00:00:04.000Z' });
  assert.equal(running.phase, 'register');
  assert.equal(running.status, NORMALIZATION_JOB_STATUS.RUNNING);
  assert.equal(running.history.length, 5);
  assert.throws(
    () => completeNormalizationJob(running, {
      at: '2026-08-14T00:00:05.000Z',
      normalizedReference: 'media/normalized/pitch.mp4',
      verification: { verified: true, verifiedAt: TEST_TIME },
    }),
    /verification metadata/iu,
  );
});

test('success and recovery states preserve source reference and append attempt history', () => {
  let job = createNormalizationJob({
    id: 'job-2',
    projectId: 'project-1',
    assetId: 'asset-2',
    sourceReference: 'media/original/pitch.mp4',
    createdAt: TEST_TIME,
  });
  job = startNormalizationJob(job, { at: TEST_TIME });
  job = failNormalizationJob(job, {
    at: '2026-08-14T00:00:01.000Z',
    recoverable: true,
    error: { code: 'INSPECT_FAILED', message: 'Synthetic contract failure' },
  });
  assert.equal(job.status, NORMALIZATION_JOB_STATUS.RECOVERABLE);
  assert.equal(job.phase, 'error');
  assert.equal(job.attempts[0].status, 'recoverable');

  job = retryNormalizationJob(job, { at: '2026-08-14T00:00:02.000Z' });
  assert.equal(job.status, NORMALIZATION_JOB_STATUS.QUEUED);
  assert.equal(job.retryCount, 1);
  assert.equal(job.sourceReference.relativePath, 'media/original/pitch.mp4');
  assert.equal(job.normalizedReference, null);

  job = startNormalizationJob(job, { at: '2026-08-14T00:00:03.000Z' });
  job = requestNormalizationCancellation(job, { at: '2026-08-14T00:00:04.000Z' });
  job = cancelNormalizationJob(job, { at: '2026-08-14T00:00:05.000Z' });
  assert.equal(job.status, NORMALIZATION_JOB_STATUS.CANCELLED);
  assert.equal(job.cancelRequested, true);
  assert.equal(job.attempts[1].status, 'cancelled');
  assert.equal(job.history.length, 6);
});

test('cannot construct a succeeded job without normalized reference and verification evidence', () => {
  assert.throws(
    () => completeNormalizationJob({
      schemaVersion: 1,
      id: 'job-3',
      projectId: 'project-1',
      assetId: 'asset-3',
      status: 'running',
      phase: 'register',
      processed: 0,
      total: 1,
      counts: { success: 0, skipped: 0, failed: 0 },
      warnings: [],
      error: null,
      cancelRequested: false,
      sourceReference: { relativePath: 'media/original/pitch.mp4' },
      normalizedReference: null,
      resultLocation: null,
      verification: null,
      retryCount: 0,
      attempts: [],
      history: [],
      createdAt: TEST_TIME,
      startedAt: TEST_TIME,
      completedAt: null,
      updatedAt: TEST_TIME,
    }, {
      at: '2026-08-14T00:00:01.000Z',
    }),
    /normalized reference/iu,
  );
  assert.equal(new MediaContractError('contract test').name, 'MediaContractError');
});
