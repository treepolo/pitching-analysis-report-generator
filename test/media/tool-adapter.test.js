'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  COMPATIBILITY,
  FRAME_TIMING,
  INSPECTION_STATUS,
  MEDIA_OPERATION_STATUS,
  MEDIA_TOOL_KIND,
  MEDIA_TOOL_READINESS_STATUS,
  MEDIA_TOOL_STATUS,
  NORMALIZATION_JOB_STATUS,
  PLAYABILITY,
  buildFfmpegCommand,
  buildFfprobeCommand,
  createMediaToolAdapter,
  createNormalizationJob,
  createNormalizedCopyTarget,
  discoverLocalMediaTools,
  inspectWithFfprobe,
  normalizeWithFfmpeg,
  parseFfmpegProgressEvents,
  probeMediaToolVersion,
  registerMediaAsset,
  retryNormalizationJob,
  runNormalizationJobWithAdapter,
  summarizeMediaToolReadiness,
} = require('../../src/media');

const PROJECT_ROOT = path.resolve('deterministic-media-tool-project');
const SOURCE_REFERENCE = 'media/original/pitch.mp4';
const TEST_TIME = '2026-08-14T00:00:00.000Z';

function probeFixture({
  codec = 'h264',
  average = '60/1',
  raw = '60/1',
  timebase = '1/90000',
  duration = '2.5',
} = {}) {
  return JSON.stringify({
    format: {
      format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
      duration,
    },
    streams: [{
      codec_type: 'video',
      codec_name: codec,
      width: 1920,
      height: 1080,
      avg_frame_rate: average,
      r_frame_rate: raw,
      time_base: timebase,
    }],
  });
}

function sourceInput(overrides = {}) {
  return {
    projectRoot: PROJECT_ROOT,
    sourceReference: SOURCE_REFERENCE,
    ...overrides,
  };
}

test('discovers ffprobe and FFmpeg versions without claiming media support', async () => {
  const calls = [];
  const discovery = await discoverLocalMediaTools({
    runner: async ({ tool, args }) => {
      calls.push({ tool, args });
      return {
        exitCode: 0,
        stdout: `${tool} version 7.0.0-test\nconfiguration: fixture`,
        stderr: '',
      };
    },
  });

  assert.equal(discovery.allAvailable, true);
  assert.equal(discovery.ffprobe.available, true);
  assert.equal(discovery.ffprobe.version, '7.0.0-test');
  assert.equal(discovery.ffmpeg.available, true);
  assert.equal(discovery.ffmpeg.version, '7.0.0-test');
  assert.deepEqual(calls.map((call) => call.args), [['-version'], ['-version']]);
  assert.equal(Object.hasOwn(discovery.ffprobe, 'mediaInspection'), false);
  assert.equal(discovery.readiness.status, MEDIA_TOOL_READINESS_STATUS.READY);
  assert.equal(discovery.readiness.canInspect, true);
  assert.equal(discovery.readiness.canNormalize, true);
  assert.deepEqual(discovery.readiness.blockingTools, []);
  assert.equal(discovery.readiness.evidence, 'version-command-only');
});

test('keeps malformed version output and missing tools explicit', async () => {
  const malformed = await probeMediaToolVersion(
    createMediaToolAdapter({ runner: async () => ({ exitCode: 0, stdout: 'not a tool version', stderr: '' }) }),
    MEDIA_TOOL_KIND.FFPROBE,
  );
  assert.equal(malformed.status, MEDIA_OPERATION_STATUS.MALFORMED_OUTPUT);
  assert.equal(malformed.available, false);
  assert.equal(malformed.errorCode, 'VERSION_OUTPUT_INVALID');

  const missing = await discoverLocalMediaTools({
    ffprobeCommand: 'wave8a-ffprobe-does-not-exist',
    ffmpegCommand: 'wave8a-ffmpeg-does-not-exist',
  });
  assert.equal(missing.allAvailable, false);
  assert.equal(missing.ffprobe.status, MEDIA_TOOL_STATUS.TOOL_MISSING);
  assert.equal(missing.ffmpeg.status, MEDIA_TOOL_STATUS.TOOL_MISSING);
  assert.equal(missing.ffprobe.available, false);
  assert.equal(missing.ffmpeg.available, false);
  assert.equal(missing.readiness.status, MEDIA_TOOL_READINESS_STATUS.INSPECTION_UNAVAILABLE);
  assert.equal(missing.readiness.canInspect, false);
  assert.equal(missing.readiness.canNormalize, false);
  assert.deepEqual(missing.readiness.blockingTools, ['ffprobe', 'ffmpeg']);
  assert.equal(missing.ffprobe.diagnostic.action, 'install-or-configure-tool');
  assert.equal(missing.ffprobe.diagnostic.retryable, true);

  const controller = new AbortController();
  controller.abort();
  const cancelled = await discoverLocalMediaTools({
    runner: async () => ({ exitCode: 0, stdout: 'ffprobe version should not run', stderr: '' }),
  }, { signal: controller.signal });
  assert.equal(cancelled.ffprobe.status, MEDIA_TOOL_STATUS.CANCELLED);
  assert.equal(cancelled.ffmpeg.status, MEDIA_TOOL_STATUS.CANCELLED);
  assert.equal(cancelled.allAvailable, false);
  assert.equal(cancelled.readiness.status, MEDIA_TOOL_READINESS_STATUS.CANCELLED);
  assert.equal(cancelled.readiness.actions[0], 'retry-capability-check');
});

test('readiness distinguishes inspection availability from normalization availability', async () => {
  const partial = await discoverLocalMediaTools({
    runner: async ({ tool }) => {
      if (tool === MEDIA_TOOL_KIND.FFPROBE) {
        return { exitCode: 0, stdout: 'ffprobe version 7.0.0-test', stderr: '' };
      }
      const error = new Error('configured FFmpeg is unavailable');
      error.code = 'ENOENT';
      throw error;
    },
  });

  assert.equal(partial.ffprobe.available, true);
  assert.equal(partial.ffmpeg.status, MEDIA_TOOL_STATUS.TOOL_MISSING);
  assert.equal(partial.readiness.status, MEDIA_TOOL_READINESS_STATUS.NORMALIZATION_UNAVAILABLE);
  assert.equal(partial.readiness.canInspect, true);
  assert.equal(partial.readiness.canNormalize, false);
  assert.deepEqual(partial.readiness.blockingTools, ['ffmpeg']);
  assert.match(partial.readiness.message, /normalization.*blocked/iu);

  const malformed = await probeMediaToolVersion(
    createMediaToolAdapter({
      runner: async () => ({ exitCode: 0, stdout: 'wrapper started successfully', stderr: '' }),
    }),
    MEDIA_TOOL_KIND.FFMPEG,
  );
  assert.equal(malformed.status, MEDIA_OPERATION_STATUS.MALFORMED_OUTPUT);
  assert.equal(malformed.diagnostic.action, 'check-tool-command');
  assert.equal(malformed.diagnostic.retryable, true);

  const summarized = summarizeMediaToolReadiness({
    ffprobe: { tool: 'ffprobe', available: true, status: MEDIA_TOOL_STATUS.AVAILABLE },
    ffmpeg: malformed,
  });
  assert.equal(summarized.status, MEDIA_TOOL_READINESS_STATUS.NORMALIZATION_UNAVAILABLE);
  assert.deepEqual(summarized.actions, ['check-tool-command']);
});

test('adapter exposes missing and process-failure states without claiming inspection success', async () => {
  const missing = await inspectWithFfprobe(
    createMediaToolAdapter(),
    sourceInput(),
  );
  assert.equal(missing.status, MEDIA_OPERATION_STATUS.TOOL_MISSING);
  assert.equal(missing.tool.status, MEDIA_TOOL_STATUS.TOOL_MISSING);
  assert.equal(missing.tool.diagnostic.action, 'install-or-configure-tool');
  assert.equal(missing.inspectionStatus, INSPECTION_STATUS.METADATA_PENDING);
  assert.equal(missing.playability, PLAYABILITY.UNKNOWN);
  assert.equal(missing.metadata.durationSeconds, null);

  const processFailure = await inspectWithFfprobe(
    createMediaToolAdapter({
      runner: async () => ({
        exitCode: 1,
        stdout: '',
        stderr: `cannot open ${path.join(PROJECT_ROOT, 'private-name.mp4')}`,
      }),
    }),
    sourceInput(),
  );
  assert.equal(processFailure.status, MEDIA_OPERATION_STATUS.PROCESS_FAILED);
  assert.equal(processFailure.tool.status, MEDIA_TOOL_STATUS.PROCESS_FAILED);
  assert.equal(processFailure.inspectionStatus, INSPECTION_STATUS.METADATA_PENDING);
  assert.match(processFailure.tool.command, /ffprobe/iu);
});

test('command descriptors preserve project-relative references and reject path escapes or collisions', () => {
  const ffprobe = buildFfprobeCommand(sourceInput());
  assert.equal(ffprobe.tool, MEDIA_TOOL_KIND.FFPROBE);
  assert.deepEqual(ffprobe.args.slice(0, 6), [
    '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams',
  ]);
  assert.equal(ffprobe.sourceReference.relativePath, SOURCE_REFERENCE);
  assert.equal(ffprobe.sourcePath, path.join(PROJECT_ROOT, 'media', 'original', 'pitch.mp4'));

  const target = createNormalizedCopyTarget({
    ...sourceInput(),
    assetId: 'asset-adapter-1',
  });
  assert.equal(target.sourceReference.relativePath, SOURCE_REFERENCE);
  assert.equal(target.normalizedReference.relativePath, 'media/normalized/asset-adapter-1.mp4');
  assert.equal(target.normalizedReference.mediaType, 'video/mp4');
  assert.equal(target.targetPath, path.join(PROJECT_ROOT, 'media', 'normalized', 'asset-adapter-1.mp4'));

  const ffmpeg = buildFfmpegCommand({ ...sourceInput(), assetId: 'asset-adapter-1' });
  assert.equal(ffmpeg.tool, MEDIA_TOOL_KIND.FFMPEG);
  assert.equal(ffmpeg.sourceReference.relativePath, SOURCE_REFERENCE);
  assert.equal(ffmpeg.normalizedReference.relativePath, 'media/normalized/asset-adapter-1.mp4');
  assert.deepEqual(ffmpeg.args.slice(0, 5), ['-y', '-progress', 'pipe:2', '-nostats', '-i']);
  assert.equal(ffmpeg.args.at(-1), ffmpeg.targetPath);

  assert.throws(
    () => buildFfprobeCommand(sourceInput({ sourceReference: '../outside.mp4' })),
    /invalid path segment|project-relative/iu,
  );
  assert.throws(
    () => createNormalizedCopyTarget({
      ...sourceInput(),
      assetId: 'asset-adapter-2',
      targetRelativePath: SOURCE_REFERENCE,
    }),
    /different|collision/iu,
  );
  assert.throws(
    () => createNormalizedCopyTarget({
      ...sourceInput(),
      assetId: 'asset-adapter-3',
      targetRelativePath: '../escape.mp4',
    }),
    /invalid path segment|project-relative/iu,
  );
  assert.throws(
    () => buildFfprobeCommand(sourceInput({ sourcePath: path.resolve(PROJECT_ROOT, '..', 'outside.mp4') })),
    /outside the project root/iu,
  );
  assert.throws(
    () => buildFfprobeCommand(sourceInput({ sourcePath: path.join(PROJECT_ROOT, 'media', 'original', 'other.mp4') })),
    /reference does not match/iu,
  );
});

test('parses FFmpeg progress records without inventing a percentage or duration', () => {
  const events = parseFfmpegProgressEvents([
    'frame=12',
    'fps=29.97',
    'out_time=00:00:01.250000',
    'speed=1.2x',
    'progress=continue',
    'frame=24',
    'out_time_us=2500000',
    'progress=end',
  ].join('\n'));

  assert.deepEqual(events, [
    { frame: 12, fps: 29.97, outTimeSeconds: 1.25, speed: 1.2, state: 'continue' },
    { frame: 24, fps: null, outTimeSeconds: 2.5, speed: null, state: 'end' },
  ]);
  assert.equal(Object.hasOwn(events[0], 'percentage'), false);
  assert.deepEqual(parseFfmpegProgressEvents('frame=12\nfps=30\n'), []);
});

test('execution rejects existing source or normalized-target symlink escapes', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pitch-report-tool-path-'));
  const originalDirectory = path.join(root, 'media', 'original');
  const normalizedDirectory = path.join(root, 'media', 'normalized');
  const outsidePath = path.join(path.dirname(root), `${path.basename(root)}-outside.mp4`);
  const sourcePath = path.join(originalDirectory, 'pitch.mp4');
  const linkedSourcePath = path.join(originalDirectory, 'linked.mp4');
  const linkedTargetPath = path.join(normalizedDirectory, 'asset-symlink.mp4');
  try {
    await fs.mkdir(originalDirectory, { recursive: true });
    await fs.mkdir(normalizedDirectory, { recursive: true });
    await fs.writeFile(outsidePath, Buffer.from('outside fixture'));
    await fs.writeFile(sourcePath, Buffer.from('source fixture'));
    try {
      await fs.symlink(outsidePath, linkedSourcePath, 'file');
      await fs.symlink(outsidePath, linkedTargetPath, 'file');
    } catch (error) {
      if (error.code === 'EPERM' || error.code === 'EACCES') {
        t.skip(`file symlink creation is unavailable: ${error.code}`);
        return;
      }
      throw error;
    }

    await assert.rejects(
      inspectWithFfprobe(createMediaToolAdapter({ runner: async () => ({ exitCode: 0, stdout: '', stderr: '' }) }), {
        projectRoot: root,
        sourceReference: 'media/original/linked.mp4',
      }),
      (error) => error?.code === 'SOURCE_SYMLINK_NOT_ALLOWED',
    );
    await assert.rejects(
      normalizeWithFfmpeg(createMediaToolAdapter({ runner: async () => ({ exitCode: 0, stdout: '', stderr: '' }) }), {
        projectRoot: root,
        sourceReference: 'media/original/pitch.mp4',
        assetId: 'asset-symlink',
        targetRelativePath: 'media/normalized/asset-symlink.mp4',
      }),
      (error) => error?.code === 'TARGET_SYMLINK_NOT_ALLOWED',
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outsidePath, { force: true });
  }
});

test('parses deterministic ffprobe CFR metadata and keeps the tool evidence visible', async () => {
  const calls = [];
  const adapter = createMediaToolAdapter({
    runner: async (request) => {
      calls.push(request);
      return { exitCode: 0, stdout: probeFixture(), stderr: '' };
    },
  });
  const inspected = await inspectWithFfprobe(adapter, sourceInput());

  assert.equal(calls.length, 1);
  assert.equal(calls[0].tool, MEDIA_TOOL_KIND.FFPROBE);
  assert.equal(calls[0].args.at(-1), path.join(PROJECT_ROOT, 'media', 'original', 'pitch.mp4'));
  assert.equal(inspected.status, MEDIA_OPERATION_STATUS.SUCCEEDED);
  assert.equal(inspected.tool.status, MEDIA_TOOL_STATUS.AVAILABLE);
  assert.equal(inspected.inspectionStatus, INSPECTION_STATUS.INSPECTED);
  assert.equal(inspected.playability, PLAYABILITY.PLAYABLE);
  assert.equal(inspected.compatibility, COMPATIBILITY.DIRECT);
  assert.equal(inspected.metadata.durationSeconds, 2.5);
  assert.equal(inspected.metadata.width, 1920);
  assert.equal(inspected.metadata.height, 1080);
  assert.equal(inspected.metadata.fps, 60);
  assert.equal(inspected.metadata.frameTiming, FRAME_TIMING.CFR);
  assert.equal(inspected.metadata.timebase, '1/90000');
  assert.equal(inspected.metadata.codec, 'h264');
  assert.equal(inspected.metadata.container, 'mp4');

  const asset = registerMediaAsset({
    id: 'asset-probed-1',
    projectId: 'project-1',
    sourceReference: SOURCE_REFERENCE,
    inspection: inspected,
  });
  assert.equal(asset.inspectionStatus, INSPECTION_STATUS.INSPECTED);
  assert.equal(asset.compatibility, COMPATIBILITY.DIRECT);
  assert.equal(asset.playability, PLAYABILITY.PLAYABLE);
  assert.equal(asset.metadata.durationSeconds, 2.5);
  assert.equal(asset.normalizedReference, null);
});

test('marks VFR as inspected but needs-normalization, and unsupported codecs as unplayable', async () => {
  const vfr = await inspectWithFfprobe(
    createMediaToolAdapter({
      runner: async () => ({
        exitCode: 0,
        stdout: probeFixture({ average: '60000/1001', raw: '30/1' }),
        stderr: '',
      }),
    }),
    sourceInput(),
  );
  assert.equal(vfr.status, MEDIA_OPERATION_STATUS.SUCCEEDED);
  assert.equal(vfr.inspectionStatus, INSPECTION_STATUS.INSPECTED);
  assert.equal(vfr.metadata.frameTiming, FRAME_TIMING.VFR);
  assert.equal(vfr.metadata.timebase, '1/90000');
  assert.equal(vfr.compatibility, COMPATIBILITY.NEEDS_NORMALIZATION);
  assert.equal(vfr.playability, PLAYABILITY.UNKNOWN);

  const unsupported = await inspectWithFfprobe(
    createMediaToolAdapter({
      runner: async () => ({
        exitCode: 0,
        stdout: probeFixture({ codec: 'hevc' }),
        stderr: '',
      }),
    }),
    sourceInput(),
  );
  assert.equal(unsupported.status, MEDIA_OPERATION_STATUS.UNSUPPORTED_CODEC);
  assert.equal(unsupported.inspectionStatus, INSPECTION_STATUS.UNPLAYABLE);
  assert.equal(unsupported.playability, PLAYABILITY.UNPLAYABLE);
  assert.equal(unsupported.compatibility, COMPATIBILITY.UNPLAYABLE);
  assert.equal(unsupported.metadata.codec, 'hevc');
});

test('keeps malformed or incomplete ffprobe output visibly pending', async () => {
  const malformed = await inspectWithFfprobe(
    createMediaToolAdapter({
      runner: async () => ({ exitCode: 0, stdout: '{not-json', stderr: '' }),
    }),
    sourceInput(),
  );
  assert.equal(malformed.status, MEDIA_OPERATION_STATUS.MALFORMED_OUTPUT);
  assert.equal(malformed.inspectionStatus, INSPECTION_STATUS.METADATA_PENDING);
  assert.equal(malformed.metadata.durationSeconds, null);

  const incomplete = await inspectWithFfprobe(
    createMediaToolAdapter({
      runner: async () => ({
        exitCode: 0,
        stdout: probeFixture({ duration: 'N/A', average: '0/0', raw: '0/0' }),
        stderr: '',
      }),
    }),
    sourceInput(),
  );
  assert.equal(incomplete.status, MEDIA_OPERATION_STATUS.METADATA_PENDING);
  assert.equal(incomplete.inspectionStatus, INSPECTION_STATUS.METADATA_PENDING);
  assert.equal(incomplete.metadata.durationSeconds, null);
  assert.equal(incomplete.metadata.fps, null);
  assert.equal(incomplete.metadata.timebase, '1/90000');

  const unknownTimebase = await inspectWithFfprobe(
    createMediaToolAdapter({
      runner: async () => ({
        exitCode: 0,
        stdout: probeFixture({ timebase: 'N/A' }),
        stderr: '',
      }),
    }),
    sourceInput(),
  );
  assert.equal(unknownTimebase.status, MEDIA_OPERATION_STATUS.METADATA_PENDING);
  assert.equal(unknownTimebase.inspectionStatus, INSPECTION_STATUS.METADATA_PENDING);
  assert.equal(unknownTimebase.metadata.timebase, null);
});

test('FFmpeg normalization preserves original and cannot succeed without explicit verification', async () => {
  let captured = null;
  const adapter = createMediaToolAdapter({
    runner: async (request) => {
      captured = request;
      return { exitCode: 0, stdout: '', stderr: '' };
    },
  });
  const input = { ...sourceInput(), assetId: 'asset-normalize-1' };
  const pending = await normalizeWithFfmpeg(adapter, input);
  assert.equal(pending.status, MEDIA_OPERATION_STATUS.VERIFICATION_PENDING);
  assert.equal(pending.sourceReference.relativePath, SOURCE_REFERENCE);
  assert.equal(pending.normalizedReference.relativePath, 'media/normalized/asset-normalize-1.mp4');
  assert.equal(pending.tool.status, MEDIA_TOOL_STATUS.AVAILABLE);
  assert.equal(captured.tool, MEDIA_TOOL_KIND.FFMPEG);

  const verified = await normalizeWithFfmpeg(adapter, input, {
    verifyOutput: async ({ sourceReference, normalizedReference, targetPath }) => ({
      verified: true,
      verifiedAt: TEST_TIME,
      metadata: {
        fileName: normalizedReference.relativePath.split('/').at(-1),
        durationSeconds: 2.5,
        width: 1280,
        height: 720,
        fps: 60,
        frameTiming: 'cfr',
        codec: 'h264',
        container: 'mp4',
        source: sourceReference.relativePath,
        target: targetPath,
      },
    }),
  });
  assert.equal(verified.status, MEDIA_OPERATION_STATUS.SUCCEEDED);
  assert.equal(verified.sourceReference.relativePath, SOURCE_REFERENCE);
  assert.equal(verified.normalizedReference.relativePath, 'media/normalized/asset-normalize-1.mp4');
  assert.equal(verified.verification.verified, true);
  assert.equal(verified.metadata.frameTiming, FRAME_TIMING.CFR);
  assert.equal(Object.hasOwn(verified, 'targetPath'), false);
  assert.doesNotMatch(JSON.stringify(verified), new RegExp(PROJECT_ROOT.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
});

test('normalization forwards fragmented real-tool progress and keeps provenance separate', async () => {
  const progressEvents = [];
  let captured = null;
  const adapter = createMediaToolAdapter({
    runner: async (request) => {
      captured = request;
      request.onOutput({
        stream: 'stderr',
        text: 'frame=12\nfps=30\nout_time=00:00:01.000000\nspeed=1.0x\nprogress=cont',
      });
      request.onOutput({ stream: 'stderr', text: 'inue\n' });
      return { exitCode: 0, stdout: '', stderr: '' };
    },
  });
  const result = await normalizeWithFfmpeg(
    adapter,
    { ...sourceInput(), assetId: 'asset-progress-1' },
    {
      onProgress: (progress) => progressEvents.push(progress),
      verifyOutput: async ({ sourceReference, normalizedReference }) => ({
        verified: true,
        verifiedAt: TEST_TIME,
        metadata: {
          durationSeconds: 1,
          width: 640,
          height: 360,
          fps: 30,
          frameTiming: FRAME_TIMING.CFR,
          timebase: '1/90000',
          codec: 'h264',
          container: 'mp4',
          source: sourceReference.relativePath,
          target: normalizedReference.relativePath,
        },
      }),
    },
  );

  assert.deepEqual(progressEvents, [{
    frame: 12,
    fps: 30,
    outTimeSeconds: 1,
    speed: 1,
    state: 'continue',
  }]);
  assert.deepEqual(result.progress, progressEvents[0]);
  assert.equal(result.status, MEDIA_OPERATION_STATUS.SUCCEEDED);
  assert.equal(result.sourceReference.relativePath, SOURCE_REFERENCE);
  assert.equal(result.normalizedReference.relativePath, 'media/normalized/asset-progress-1.mp4');
  assert.deepEqual(captured.args.slice(0, 5), ['-y', '-progress', 'pipe:2', '-nostats', '-i']);
});

test('FFmpeg failure, missing tool, and cancellation remain visible and do not create normalized success', async () => {
  const failed = await normalizeWithFfmpeg(
    createMediaToolAdapter({
      runner: async () => ({ exitCode: 2, stdout: '', stderr: 'conversion failed' }),
    }),
    { ...sourceInput(), assetId: 'asset-failure-1' },
  );
  assert.equal(failed.status, MEDIA_OPERATION_STATUS.PROCESS_FAILED);
  assert.equal(failed.normalizedReference.relativePath, 'media/normalized/asset-failure-1.mp4');
  assert.equal(failed.verification, undefined);

  const missing = await normalizeWithFfmpeg(
    createMediaToolAdapter(),
    { ...sourceInput(), assetId: 'asset-missing-1' },
  );
  assert.equal(missing.status, MEDIA_OPERATION_STATUS.TOOL_MISSING);
  assert.equal(missing.verification, undefined);
  assert.equal(missing.diagnostic.action, 'install-or-configure-tool');

  const controller = new AbortController();
  controller.abort();
  const cancelled = await normalizeWithFfmpeg(
    createMediaToolAdapter({ runner: async () => ({ exitCode: 0, stdout: '', stderr: '' }) }),
    { ...sourceInput(), assetId: 'asset-cancelled-1' },
    { signal: controller.signal },
  );
  assert.equal(cancelled.status, MEDIA_OPERATION_STATUS.CANCELLED);
  assert.equal(cancelled.verification, undefined);
});

test('adapter job orchestration supports recoverable retry, explicit recovery, and cancellation', async () => {
  const source = sourceInput({ sourcePath: path.join(PROJECT_ROOT, 'media', 'original', 'pitch.mp4') });
  const jobInput = {
    id: 'job-adapter-1',
    projectId: 'project-1',
    assetId: 'asset-adapter-job-1',
    sourceReference: SOURCE_REFERENCE,
    createdAt: TEST_TIME,
  };
  const failing = await runNormalizationJobWithAdapter({
    job: createNormalizationJob(jobInput),
    adapter: createMediaToolAdapter({
      runner: async ({ tool }) => tool === MEDIA_TOOL_KIND.FFPROBE
        ? { exitCode: 0, stdout: probeFixture({ average: '60000/1001', raw: '30/1' }), stderr: '' }
        : { exitCode: 1, stdout: '', stderr: 'synthetic conversion failure' },
    }),
    ...source,
    assetId: jobInput.assetId,
  }, { now: () => TEST_TIME });
  assert.equal(failing.job.status, NORMALIZATION_JOB_STATUS.RECOVERABLE);
  assert.equal(failing.job.phase, 'error');
  assert.equal(failing.job.sourceReference.relativePath, SOURCE_REFERENCE);
  assert.equal(failing.normalization.status, MEDIA_OPERATION_STATUS.PROCESS_FAILED);

  const retried = await runNormalizationJobWithAdapter({
    job: retryNormalizationJob(failing.job, { at: '2026-08-14T00:00:01.000Z' }),
    adapter: createMediaToolAdapter({
      runner: async ({ tool }) => tool === MEDIA_TOOL_KIND.FFPROBE
        ? { exitCode: 0, stdout: probeFixture({ average: '60000/1001', raw: '30/1' }), stderr: '' }
        : { exitCode: 0, stdout: '', stderr: '' },
    }),
    ...source,
    assetId: jobInput.assetId,
    verifyOutput: async () => ({
      verified: true,
      verifiedAt: '2026-08-14T00:00:02.000Z',
      metadata: {
        durationSeconds: 2.5,
        width: 1280,
        height: 720,
        fps: 60,
        frameTiming: 'cfr',
        codec: 'h264',
        container: 'mp4',
      },
    }),
  }, { now: () => TEST_TIME });
  assert.equal(retried.job.status, NORMALIZATION_JOB_STATUS.SUCCEEDED);
  assert.equal(retried.job.phase, 'complete');
  assert.equal(retried.job.retryCount, 1);
  assert.equal(retried.job.sourceReference.relativePath, SOURCE_REFERENCE);
  assert.equal(retried.job.normalizedReference.relativePath, 'media/normalized/asset-adapter-job-1.mp4');
  assert.equal(retried.job.resultLocation.role, 'result');
  assert.equal(retried.normalization.verification.verified, true);

  const controller = new AbortController();
  controller.abort();
  const cancelled = await runNormalizationJobWithAdapter({
    job: createNormalizationJob({ ...jobInput, id: 'job-adapter-cancel-1' }),
    adapter: createMediaToolAdapter(),
    ...source,
    assetId: jobInput.assetId,
  }, { signal: controller.signal, now: () => TEST_TIME });
  assert.equal(cancelled.job.status, NORMALIZATION_JOB_STATUS.CANCELLED);
  assert.equal(cancelled.job.phase, 'inspect');
  assert.equal(cancelled.job.sourceReference.relativePath, SOURCE_REFERENCE);
});
