'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  COMPATIBILITY,
  INSPECTION_STATUS,
  MEDIA_OPERATION_STATUS,
  MEDIA_TOOL_STATUS,
  NORMALIZATION_JOB_STATUS,
  PLAYABILITY,
  copyMediaSourceIntoProject,
  createLocalMediaToolAdapter,
  createLocalMediaToolRunner,
  createNormalizationJob,
  inspectWithFfprobe,
  normalizeWithFfmpeg,
  runNormalizationJobWithLocalTools,
  verifyNormalizedOutputWithFfprobe,
} = require('../../src/media');

function syntheticMp4Header() {
  const bytes = Buffer.alloc(24);
  bytes.writeUInt32BE(24, 0);
  bytes.write('ftyp', 4, 4, 'ascii');
  bytes.write('isom', 8, 4, 'ascii');
  bytes.writeUInt32BE(0, 12);
  bytes.write('mp42', 16, 4, 'ascii');
  return bytes;
}

function probeFixture() {
  return JSON.stringify({
    format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '1.25' },
    streams: [{
      codec_type: 'video',
      codec_name: 'h264',
      width: 640,
      height: 360,
      avg_frame_rate: '30/1',
      r_frame_rate: '30/1',
      time_base: '1/90000',
    }],
  });
}

function checksum(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

test('local runner executes a deterministic process without a shell and preserves exit boundaries', async () => {
  const runner = createLocalMediaToolRunner({ maxOutputBytes: 4096 });
  const outputEvents = [];
  const success = await runner({
    command: process.execPath,
    args: [
      '-e',
      "process.stdout.write('runner-fixture'); process.stderr.write('progress=continue\\n')",
    ],
    onOutput: (event) => outputEvents.push(event),
  });
  assert.equal(success.exitCode, 0);
  assert.equal(success.stdout, 'runner-fixture');
  assert.equal(success.stderr, 'progress=continue\n');
  assert.deepEqual(outputEvents, [
    { stream: 'stdout', text: 'runner-fixture' },
    { stream: 'stderr', text: 'progress=continue\n' },
  ]);

  const failed = await runner({
    command: process.execPath,
    args: ['-e', "process.stderr.write('fixture-failure'); process.exit(7)"],
  });
  assert.equal(failed.exitCode, 7);
  assert.equal(failed.stderr, 'fixture-failure');

  const controller = new AbortController();
  const running = runner({
    command: process.execPath,
    args: ['-e', 'setTimeout(() => {}, 2000)'],
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(running, (error) => error?.code === 'ABORT_ERR');
});

test('local adapter reports an unavailable executable without pretending probe success', async () => {
  const projectRoot = path.resolve('local-tool-boundary-project');
  const inspected = await inspectWithFfprobe(
    createLocalMediaToolAdapter({ ffprobeCommand: 'media-tool-does-not-exist' }),
    {
      projectRoot,
      sourceReference: 'media/original/missing.mp4',
    },
  );
  assert.equal(inspected.status, MEDIA_OPERATION_STATUS.TOOL_MISSING);
  assert.equal(inspected.tool.status, MEDIA_TOOL_STATUS.TOOL_MISSING);
  assert.equal(inspected.inspectionStatus, INSPECTION_STATUS.METADATA_PENDING);
});

test('local runner waits for a cancelled child to close before releasing its output file', async () => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'media-cancel-cleanup-'));
  const outputPath = path.join(fixtureRoot, 'partial-normalized.mp4');
  const controller = new AbortController();
  try {
    const running = createLocalMediaToolRunner()({
      command: process.execPath,
      args: [
        '-e',
        "const fs=require('node:fs'); fs.writeFileSync(process.argv[1], 'partial-output'); process.stdout.write('ready'); setTimeout(() => {}, 2000)",
        outputPath,
      ],
      signal: controller.signal,
      onOutput: ({ stream, text }) => {
        if (stream === 'stdout' && text.includes('ready')) controller.abort();
      },
    });
    await assert.rejects(running, (error) => error?.code === 'ABORT_ERR');
    await fs.rm(outputPath, { force: true });
    assert.equal(await fs.stat(outputPath).catch(() => null), null);
  } finally {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('local normalization orchestration keeps missing real tools recoverable', async () => {
  const projectRoot = path.resolve('local-normalization-boundary-project');
  const result = await runNormalizationJobWithLocalTools({
    job: createNormalizationJob({
      id: 'job-local-tool-missing-1',
      projectId: 'project-local-1',
      assetId: 'asset-local-tool-missing-1',
      sourceReference: 'media/original/source.mp4',
      createdAt: '2026-08-14T00:00:00.000Z',
    }),
    projectRoot,
    sourceReference: 'media/original/source.mp4',
    assetId: 'asset-local-tool-missing-1',
    ffprobeCommand: 'media-tool-does-not-exist',
    ffmpegCommand: 'media-ffmpeg-does-not-exist',
  }, { now: () => '2026-08-14T00:00:01.000Z' });

  assert.equal(result.job.status, NORMALIZATION_JOB_STATUS.RECOVERABLE);
  assert.equal(result.job.phase, 'error');
  assert.equal(result.inspection.status, MEDIA_OPERATION_STATUS.TOOL_MISSING);
  assert.equal(result.normalization, null);
  assert.equal(result.job.normalizedReference, null);
});

test('copies external source into project-local originals with checksum provenance and preserves source bytes', async () => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'media-copy-lifecycle-'));
  const projectRoot = path.join(fixtureRoot, 'project');
  const sourceRoot = path.join(fixtureRoot, 'incoming');
  const sourcePath = path.join(sourceRoot, 'pitch.mp4');
  const sourceBytes = Buffer.concat([syntheticMp4Header(), Buffer.from('synthetic-source-payload')]);
  try {
    await fs.mkdir(sourceRoot, { recursive: true });
    await fs.writeFile(sourcePath, sourceBytes);
    const before = await fs.readFile(sourcePath);

    const copied = await copyMediaSourceIntoProject({
      projectRoot,
      projectId: 'project-copy-1',
      assetId: 'asset-copy-1',
      sourcePath,
    });
    const destinationPath = path.join(projectRoot, 'media', 'original', 'asset-copy-1-pitch.mp4');
    const after = await fs.readFile(sourcePath);
    const destination = await fs.readFile(destinationPath);

    assert.deepEqual(after, before);
    assert.deepEqual(destination, sourceBytes);
    assert.equal(copied.destinationRelativePath, 'media/original/asset-copy-1-pitch.mp4');
    assert.equal(copied.asset.id, 'asset-copy-1');
    assert.equal(copied.asset.projectId, 'project-copy-1');
    assert.equal(copied.asset.sourceReference.relativePath, copied.destinationRelativePath);
    assert.equal(copied.asset.sourceReference.byteSize, sourceBytes.length);
    assert.equal(copied.asset.sourceReference.checksumSha256, checksum(sourceBytes));
    assert.equal(copied.asset.normalizedReference, null);
    assert.equal(copied.asset.inspectionStatus, INSPECTION_STATUS.METADATA_PENDING);
    assert.equal(copied.provenance.originalPreserved, true);
    assert.equal(copied.provenance.sourceChecksumSha256, checksum(sourceBytes));
    assert.equal(Object.hasOwn(copied.provenance, 'sourcePath'), false);
    assert.doesNotMatch(JSON.stringify(copied.provenance), /media-copy-lifecycle/iu);

    await assert.rejects(
      copyMediaSourceIntoProject({
        projectRoot,
        projectId: 'project-copy-1',
        assetId: 'asset-copy-1',
        sourcePath,
      }),
      (error) => error?.code === 'MEDIA_DESTINATION_EXISTS',
    );
    assert.deepEqual(await fs.readFile(destinationPath), sourceBytes);
  } finally {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('copies unsupported sources but keeps their unplayable state visible', async () => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'media-copy-unsupported-'));
  const projectRoot = path.join(fixtureRoot, 'project');
  const sourcePath = path.join(fixtureRoot, 'clip.mov');
  try {
    await fs.writeFile(sourcePath, Buffer.from('synthetic unsupported source'));
    const copied = await copyMediaSourceIntoProject({
      projectRoot,
      projectId: 'project-copy-2',
      assetId: 'asset-copy-2',
      sourcePath,
    });
    assert.equal(copied.asset.inspectionStatus, INSPECTION_STATUS.UNPLAYABLE);
    assert.equal(copied.asset.playability, PLAYABILITY.UNPLAYABLE);
    assert.equal(copied.asset.compatibility, COMPATIBILITY.UNPLAYABLE);
    assert.equal(copied.asset.sourceReference.relativePath, 'media/original/asset-copy-2-clip.mov');
  } finally {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('verification helper requires a real project-local target and injected ffprobe evidence', async () => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'media-verify-lifecycle-'));
  const projectRoot = path.join(fixtureRoot, 'project');
  const targetPath = path.join(projectRoot, 'media', 'normalized', 'asset-verify-1.mp4');
  try {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    const targetBytes = syntheticMp4Header();
    await fs.writeFile(targetPath, targetBytes);
    const adapter = createLocalMediaToolAdapter({
      runner: async ({ tool }) => tool === 'ffprobe'
        ? { exitCode: 0, stdout: probeFixture(), stderr: '' }
        : { exitCode: 0, stdout: '', stderr: '' },
    });
    const verified = await verifyNormalizedOutputWithFfprobe(adapter, {
      projectRoot,
      normalizedReference: 'media/normalized/asset-verify-1.mp4',
      targetPath,
    }, { now: () => '2026-08-14T00:00:00.000Z' });
    assert.equal(verified.verified, true);
    assert.equal(verified.checksumSha256, checksum(targetBytes));
    assert.equal(verified.metadata.durationSeconds, 1.25);
    assert.equal(verified.inspection.status, MEDIA_OPERATION_STATUS.SUCCEEDED);

    const missing = await verifyNormalizedOutputWithFfprobe(adapter, {
      projectRoot,
      normalizedReference: 'media/normalized/missing.mp4',
    });
    assert.equal(missing.verified, false);
    assert.equal(missing.reason, 'normalized-output-unavailable');
  } finally {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('normalization may prepare a project-local target directory but never treats process exit as output success', async () => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'media-normalize-target-'));
  const projectRoot = path.join(fixtureRoot, 'project');
  const sourcePath = path.join(projectRoot, 'media', 'original', 'pitch.mp4');
  const targetPath = path.join(projectRoot, 'media', 'normalized', 'asset-target-1.mp4');
  try {
    const sourceBytes = syntheticMp4Header();
    await fs.mkdir(path.dirname(sourcePath), { recursive: true });
    await fs.writeFile(sourcePath, sourceBytes);
    const normalized = await normalizeWithFfmpeg(
      createLocalMediaToolAdapter({
        runner: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      }),
      {
        projectRoot,
        sourceReference: 'media/original/pitch.mp4',
        sourcePath,
        assetId: 'asset-target-1',
      },
      { prepareTargetDirectory: true },
    );
    assert.equal(normalized.status, MEDIA_OPERATION_STATUS.VERIFICATION_PENDING);
    assert.equal(await fs.stat(path.dirname(targetPath)).then((stats) => stats.isDirectory()), true);
    assert.equal(await fs.stat(targetPath).catch(() => null), null);
    assert.deepEqual(await fs.readFile(sourcePath), sourceBytes);
  } finally {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  }
});
