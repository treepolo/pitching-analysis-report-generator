'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const { createTestTemp } = require('../project-temp');
const {
  buildFrameCache,
  cleanupFrameCache,
  FRAME_CACHE_STATUS,
  readFrameCache,
} = require('../../src/media/frame-cache');
const { prepareFrameCache } = require('../../src/media');
const { normalizeFrameCacheResponse } = require('../../src/media/frame-cache-contract');
const { createMediaToolAdapter } = require('../../src/media/tool-adapter');

let projectRoot;

test.beforeEach(async () => {
  projectRoot = await createTestTemp('pitch-frame-cache-project-');
  await fs.mkdir(path.join(projectRoot, 'media', 'original'), { recursive: true });
  await fs.writeFile(path.join(projectRoot, 'media', 'original', 'pitch.mp4'), Buffer.from('synthetic-private-source'));
});

test.afterEach(async () => {
  await fs.rm(projectRoot, { recursive: true, force: true });
});

function probeFixture({ average = '30/1', raw = '30/1', times = [0, 0.033333, 0.066666] } = {}) {
  return JSON.stringify({
    format: { duration: String(times.at(-1) ?? 0) },
    streams: [{
      codec_type: 'video',
      width: 640,
      height: 360,
      avg_frame_rate: average,
      r_frame_rate: raw,
      time_base: '1/90000',
      duration: String(times.at(-1) ?? 0),
    }],
    frames: times.map((time, index) => ({
      best_effort_timestamp: String(Math.round(time * 90000)),
      best_effort_timestamp_time: String(time),
      pts: String(Math.round(time * 90000)),
      pts_time: String(time),
      width: 640,
      height: 360,
      index,
    })),
  });
}

function fixtureAdapter({ probe = probeFixture(), failDecode = false, counters = {}, decodeDelay = 0 } = {}) {
  return createMediaToolAdapter({
    runner: async ({ tool, args, signal, onOutput }) => {
      counters[tool] = (counters[tool] ?? 0) + 1;
      if (tool === 'ffprobe') return { exitCode: 0, stdout: probe, stderr: '' };
      if (failDecode) return { exitCode: 7, stdout: '', stderr: 'synthetic decode failure' };
      if (decodeDelay > 0) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, decodeDelay);
          signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            const error = new Error('cancelled');
            error.name = 'AbortError';
            error.code = 'ABORT_ERR';
            reject(error);
          }, { once: true });
        });
      }
      const pattern = args.at(-1);
      const directory = path.dirname(pattern);
      const count = JSON.parse(probe).frames.length;
      await fs.mkdir(directory, { recursive: true });
      for (let index = 0; index < count; index += 1) {
        await fs.writeFile(path.join(directory, `frame-${String(index).padStart(8, '0')}.png`), Buffer.from(`frame-${index}`));
      }
      onOutput?.({ stream: 'stderr', text: 'frame=3\nprogress=end\n' });
      return { exitCode: 0, stdout: '', stderr: '' };
    },
  });
}

function input(adapter, overrides = {}) {
  return {
    projectRoot,
    projectId: 'project-1',
    assetId: 'asset-1',
    requestId: 'request-1',
    sourceReference: 'media/original/pitch.mp4',
    adapter,
    ...overrides,
  };
}

test('exports prepareFrameCache as the stable media entry point', () => {
  assert.equal(prepareFrameCache, buildFrameCache);
});

test('predecodes a ready CFR cache with index metadata and preserves the source', async () => {
  const sourcePath = path.join(projectRoot, 'media', 'original', 'pitch.mp4');
  const before = await fs.readFile(sourcePath);
  const counters = {};
  const result = await buildFrameCache(input(fixtureAdapter({ counters })));

  assert.equal(result.status, FRAME_CACHE_STATUS.READY);
  assert.equal(result.reused, false);
  assert.equal(result.metadata.frameTiming, 'cfr');
  assert.equal(result.metadata.fps, 30);
  assert.equal(result.metadata.frameCount, 3);
  assert.deepEqual(result.frames.map((frame) => frame.frameNumber), [0, 1, 2]);
  assert.deepEqual(result.frames.map((frame) => frame.time), [0, 0.033333, 0.066666]);
  assert.equal(result.frames[0].pts, 0);
  assert.equal(result.frames[0].width, 640);
  assert.equal(result.frames[0].height, 360);
  assert.equal(result.frames[0].relativePath.startsWith(result.cache.rootRelativePath), true);
  assert.equal(path.isAbsolute(result.frames[0].relativePath), false);
  assert.equal(path.isAbsolute(result.cache.rootRelativePath), false);
  assert.equal(counters.ffprobe, 1);
  assert.equal(counters.ffmpeg, 1);
  assert.deepEqual(await fs.readFile(sourcePath), before);
  assert.deepEqual(
    normalizeFrameCacheResponse(result).frames,
    result.frames,
  );
  assert.equal(result.progress.events.at(-1).state, 'end');
});

test('reuses a valid cache and reads it without spawning FFmpeg again', async () => {
  const counters = {};
  const adapter = fixtureAdapter({ counters });
  const first = await buildFrameCache(input(adapter));
  const second = await buildFrameCache(input(adapter));
  const read = await readFrameCache(input(adapter));

  assert.equal(first.status, 'ready');
  assert.equal(second.status, 'ready');
  assert.equal(second.reused, true);
  assert.equal(read.status, 'ready');
  assert.equal(read.reused, true);
  assert.equal(counters.ffprobe, 1);
  assert.equal(counters.ffmpeg, 1);
});

test('rebuilds a corrupt cache entry without deleting the source or another cache key', async () => {
  const counters = {};
  const adapter = fixtureAdapter({ counters });
  const first = await buildFrameCache(input(adapter));
  await fs.rm(path.join(projectRoot, first.cache.rootRelativePath, 'frames', 'frame-00000001.png'));
  const rebuilt = await buildFrameCache(input(adapter));

  assert.equal(rebuilt.status, 'ready');
  assert.equal(rebuilt.reused, false);
  assert.equal(counters.ffprobe, 2);
  assert.equal(counters.ffmpeg, 2);
  assert.equal(rebuilt.frames.length, 3);
});

test('keeps VFR and different-FPS metadata explicit', async () => {
  const counters = {};
  const result = await buildFrameCache(input(fixtureAdapter({
    counters,
    probe: probeFixture({ average: '24000/1001', raw: '60/1', times: [0, 0.021, 0.071] }),
  }), { assetId: 'asset-vfr' }));

  assert.equal(result.status, 'ready');
  assert.equal(result.metadata.frameTiming, 'vfr');
  assert.equal(result.metadata.fps, 24000 / 1001);
  assert.equal(result.metadata.rawFps, 60);
  assert.deepEqual(result.frames.map((frame) => frame.time), [0, 0.021, 0.071]);
});

test('returns explicit missing-tool and process-failure states without ready cache', async () => {
  const missing = await buildFrameCache(input(createMediaToolAdapter(), { assetId: 'asset-missing' }));
  assert.equal(missing.status, 'tool-missing');
  assert.equal(missing.error.code, 'FFPROBE_UNAVAILABLE');
  assert.deepEqual(missing.frames, []);

  const failed = await buildFrameCache(input(fixtureAdapter({ failDecode: true }), { assetId: 'asset-failed' }));
  assert.equal(failed.status, 'process-failed');
  assert.equal(failed.error.code, 'EXIT_7');
  assert.deepEqual(failed.frames, []);
  const entries = await fs.readdir(path.join(projectRoot, '.cache', 'frame-cache')).catch(() => []);
  assert.equal(entries.some((entry) => entry.includes('.build-')), false);
});

test('returns source-unavailable when the referenced media is missing', async () => {
  const result = await buildFrameCache(input(fixtureAdapter(), {
    sourceReference: 'media/original/missing.mp4',
    assetId: 'asset-missing-source',
  }));

  assert.equal(result.status, FRAME_CACHE_STATUS.SOURCE_UNAVAILABLE);
  assert.equal(result.error.code, 'SOURCE_UNAVAILABLE');
  assert.deepEqual(result.frames, []);
});

test('cancellation cleans staging and permits a later retry', async () => {
  const controller = new AbortController();
  const pending = buildFrameCache(input(fixtureAdapter({ decodeDelay: 100 }), { assetId: 'asset-cancelled' }), {
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(), 10);
  const cancelled = await pending;
  assert.equal(cancelled.status, 'cancelled');
  assert.deepEqual(cancelled.frames, []);
  const entries = await fs.readdir(path.join(projectRoot, '.cache', 'frame-cache')).catch(() => []);
  assert.equal(entries.some((entry) => entry.includes('.build-')), false);

  const retried = await buildFrameCache(input(fixtureAdapter(), { assetId: 'asset-cancelled' }));
  assert.equal(retried.status, 'ready');
});

test('rejects unsafe source/cache paths and cleans a ready cache by identity', async () => {
  await assert.rejects(
    buildFrameCache(input(fixtureAdapter(), { sourceReference: '../outside.mp4' })),
    /relativePath|outside|traversal/u,
  );
  await assert.rejects(
    buildFrameCache(input(fixtureAdapter(), { cacheDirectory: path.join(path.dirname(projectRoot), 'outside-frame-cache') })),
    /inside the project root/u,
  );
  const built = await buildFrameCache(input(fixtureAdapter()));
  const cleaned = await cleanupFrameCache({
    projectRoot,
    projectId: 'project-1',
    assetId: 'asset-1',
    requestId: 'cleanup-1',
    sourceReference: 'media/original/pitch.mp4',
  });
  assert.equal(cleaned.status, 'cleaned');
  assert.equal(cleaned.requestId, 'cleanup-1');
  const miss = await readFrameCache(input(fixtureAdapter()));
  assert.equal(miss.status, 'cache-miss');
  assert.equal(createHash('sha256').update(await fs.readFile(path.join(projectRoot, 'media', 'original', 'pitch.mp4'))).digest('hex'), built.sourceIdentity.checksumSha256);
});
