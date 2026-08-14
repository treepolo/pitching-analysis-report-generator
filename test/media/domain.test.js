'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  ASSET_LIFECYCLE_STATUS,
  COMPATIBILITY,
  INSPECTION_STATUS,
  MediaContractError,
  NORMALIZATION_JOB_STATUS,
  PLAYABILITY,
  advanceNormalizationJob,
  applyVerifiedNormalization,
  cancelNormalizationJob,
  completeNormalizationJob,
  createMediaIngestRequest,
  createMediaAssetReference,
  createMediaAsset,
  createNormalizationJob,
  detectContainerSignature,
  detectMediaType,
  failNormalizationJob,
  ingestMediaSource,
  isProjectRelativePath,
  normalizeProjectRelativePath,
  requestNormalizationCancellation,
  inspectMediaSource,
  registerMediaAsset,
  resolveMediaPathWithinProjectRoot,
  resolveProjectRelativePath,
  retryNormalizationJob,
  startNormalizationJob,
  toProjectRelativePath,
  updateNormalizationJobProgress,
} = require('../../src/media');

const TEST_TIME = '2026-08-14T00:00:00.000Z';
const PROJECT_ROOT = path.resolve('virtual-media-project-root');

function syntheticPngHeader() {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

function syntheticMp4Header(majorBrand = 'isom', compatibleBrand = 'mp42') {
  const bytes = Buffer.alloc(24);
  bytes.writeUInt32BE(24, 0);
  bytes.write('ftyp', 4, 4, 'ascii');
  bytes.write(majorBrand, 8, 4, 'ascii');
  bytes.writeUInt32BE(0, 12);
  bytes.write(compatibleBrand, 16, 4, 'ascii');
  return bytes;
}

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
      timebase: '1/90000',
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
  assert.equal(asset.metadata.timebase, '1/90000');
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

test('creates independent project-scoped references for repeated block use', () => {
  const asset = createMediaAsset({
    id: 'asset-reusable-1',
    projectId: 'project-reusable-1',
    displayName: 'pitch.mp4',
    sourceReference: 'media/original/pitch.mp4',
  });
  const first = createMediaAssetReference(asset);
  const second = createMediaAssetReference({ asset });

  assert.deepEqual(first, {
    projectId: 'project-reusable-1',
    mediaAssetId: 'asset-reusable-1',
  });
  assert.deepEqual(second, first);
  assert.notStrictEqual(first, second);
  first.mediaAssetId = 'asset-reusable-other';
  assert.equal(second.mediaAssetId, 'asset-reusable-1');
  assert.throws(
    () => createMediaAssetReference({ projectId: 'project-reusable-1', mediaAssetId: '../outside' }),
    /unsafe identifier/iu,
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
  assert.equal(normalized.inspectionStatus, INSPECTION_STATUS.INSPECTED);
  assert.equal(normalized.playability, PLAYABILITY.PLAYABLE);
  assert.equal(normalized.normalizedReference.relativePath, 'media/normalized/pitch.mp4');
  assert.equal(normalized.sourceReference.relativePath, 'media/original/pitch.mp4');
});

test('detects container signatures without fabricating media metadata', () => {
  const mp4Signature = detectContainerSignature(syntheticMp4Header());
  assert.deepEqual({
    kind: mp4Signature.kind,
    format: mp4Signature.format,
    mimeType: mp4Signature.mimeType,
    container: mp4Signature.container,
    majorBrand: mp4Signature.majorBrand,
  }, {
    kind: 'video',
    format: 'mp4',
    mimeType: 'video/mp4',
    container: 'mp4',
    majorBrand: 'isom',
  });

  const pngSignature = detectContainerSignature(syntheticPngHeader());
  assert.equal(pngSignature.format, 'png');
  assert.equal(pngSignature.evidence, 'magic-bytes');

  const inspected = inspectMediaSource({
    fileName: 'pitch.mp4',
    bytes: syntheticMp4Header(),
  });
  assert.equal(inspected.inspectionStatus, INSPECTION_STATUS.METADATA_PENDING);
  assert.equal(inspected.playability, PLAYABILITY.UNKNOWN);
  assert.equal(inspected.compatibility, COMPATIBILITY.UNKNOWN);
  assert.equal(inspected.metadata.container, 'mp4');
  assert.equal(inspected.metadata.durationSeconds, null);
  assert.equal(inspected.metadata.width, null);
  assert.equal(inspected.metadata.height, null);
  assert.equal(inspected.metadata.fps, null);
  assert.equal(inspected.metadata.codec, null);

  const extensionOnly = inspectMediaSource({ fileName: 'pending.mp4' });
  assert.equal(extensionOnly.inspectionStatus, INSPECTION_STATUS.METADATA_PENDING);
  assert.equal(extensionOnly.reason, 'signature-pending');

  const unsupported = inspectMediaSource({ fileName: 'clip.mov' });
  assert.equal(unsupported.inspectionStatus, INSPECTION_STATUS.UNPLAYABLE);
  assert.equal(unsupported.playability, PLAYABILITY.UNPLAYABLE);

  const imageInspection = inspectMediaSource({
    fileName: 'frame.png',
    bytes: syntheticPngHeader(),
  });
  assert.equal(imageInspection.inspectionStatus, INSPECTION_STATUS.METADATA_PENDING);
  assert.equal(imageInspection.playability, PLAYABILITY.PLAYABLE);
  assert.equal(imageInspection.compatibility, COMPATIBILITY.DIRECT);

  const mismatch = inspectMediaSource({
    fileName: 'frame.jpg',
    bytes: syntheticPngHeader(),
  });
  assert.equal(mismatch.inspectionStatus, INSPECTION_STATUS.UNPLAYABLE);
  assert.equal(mismatch.playability, PLAYABILITY.UNPLAYABLE);
  assert.equal(mismatch.reason, 'extension-signature-mismatch');

  const unknown = inspectMediaSource({
    fileName: 'capture.bin',
    bytes: Buffer.from('not a media signature', 'ascii'),
  });
  assert.equal(unknown.inspectionStatus, INSPECTION_STATUS.UNKNOWN);
  assert.equal(unknown.playability, PLAYABILITY.UNKNOWN);
});

test('registers inspected evidence while preserving source and pending normalization state', () => {
  const inspection = inspectMediaSource({
    fileName: 'pitch.mp4',
    bytes: syntheticMp4Header(),
  });
  const asset = registerMediaAsset({
    id: 'asset-register-1',
    projectId: 'project-1',
    displayName: 'Pitch original.mp4',
    sourceReference: 'media/original/pitch.mp4',
    inspection,
  });

  assert.equal(asset.lifecycleStatus, ASSET_LIFECYCLE_STATUS.METADATA_PENDING);
  assert.equal(asset.inspectionStatus, INSPECTION_STATUS.METADATA_PENDING);
  assert.equal(asset.playability, PLAYABILITY.UNKNOWN);
  assert.equal(asset.compatibility, COMPATIBILITY.UNKNOWN);
  assert.equal(asset.sourceReference.relativePath, 'media/original/pitch.mp4');
  assert.equal(asset.normalizedReference, null);
  assert.equal(asset.metadata.durationSeconds, null);

  assert.throws(
    () => registerMediaAsset({
      id: 'asset-register-2',
      projectId: 'project-1',
      sourceReference: 'media/original/pitch.mp4',
      inspection,
      lifecycleStatus: ASSET_LIFECYCLE_STATUS.READY,
    }),
    /completed inspection/iu,
  );
});

test('ingest request and real-path containment reject external and symlink escapes', async (t) => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pitching-media-domain-'));
  const projectRoot = path.join(fixtureRoot, 'project');
  const mediaDirectory = path.join(projectRoot, 'media', 'original');
  const outsideRoot = path.join(fixtureRoot, 'outside');
  const outsideFile = path.join(outsideRoot, 'outside.mp4');
  const projectFile = path.join(mediaDirectory, 'pitch.mp4');
  const linkFile = path.join(mediaDirectory, 'linked.mp4');
  try {
    await fs.mkdir(mediaDirectory, { recursive: true });
    await fs.mkdir(outsideRoot, { recursive: true });
    await fs.writeFile(projectFile, syntheticMp4Header());
    await fs.writeFile(outsideFile, syntheticMp4Header());

    const request = createMediaIngestRequest({
      projectRoot,
      projectId: 'project-1',
      assetId: 'asset-ingest-1',
      sourcePath: projectFile,
    });
    assert.equal(request.sourceReference.relativePath, 'media/original/pitch.mp4');
    assert.throws(
      () => createMediaIngestRequest({
        projectRoot,
        projectId: 'project-1',
        assetId: 'asset-ingest-2',
        sourcePath: outsideFile,
      }),
      /outside the project root/iu,
    );

    const contained = await resolveMediaPathWithinProjectRoot(projectRoot, projectFile);
    assert.equal(contained.relativePath, 'media/original/pitch.mp4');
    assert.equal(contained.sizeBytes, (await fs.stat(projectFile)).size);

    const ingested = await ingestMediaSource(request);
    assert.equal(ingested.asset.sourceReference.relativePath, 'media/original/pitch.mp4');
    assert.equal(ingested.asset.metadata.container, 'mp4');
    assert.equal(ingested.asset.metadata.durationSeconds, null);
    assert.equal(ingested.asset.normalizedReference, null);

    try {
      await fs.symlink(outsideFile, linkFile, 'file');
    } catch (error) {
      if (error.code === 'EPERM' || error.code === 'EACCES') {
        t.skip(`symlink creation is unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    await assert.rejects(
      resolveMediaPathWithinProjectRoot(projectRoot, linkFile),
      /symlinks are not allowed/iu,
    );
    await assert.rejects(
      resolveMediaPathWithinProjectRoot(projectRoot, linkFile, { allowSymlink: true }),
      /real path is outside the project root/iu,
    );
  } finally {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('ingest request rejects identifiers that could cross project model boundaries', () => {
  assert.throws(
    () => createMediaIngestRequest({
      projectRoot: PROJECT_ROOT,
      projectId: '../project-escape',
      assetId: 'asset-1',
      sourceReference: 'media/original/pitch.mp4',
    }),
    /unsafe identifier/iu,
  );
  assert.throws(
    () => createMediaIngestRequest({
      projectRoot: PROJECT_ROOT,
      projectId: 'project-1',
      assetId: 'asset/escape',
      sourceReference: 'media/original/pitch.mp4',
    }),
    /unsafe identifier/iu,
  );
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
