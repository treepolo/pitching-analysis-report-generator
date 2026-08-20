'use strict';

const { createReadStream } = require('node:fs');
const { createHash, randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const {
  FRAME_TIMING,
  createSourceReference,
} = require('./contract');
const {
  FRAME_CACHE_CONTRACT_VERSION,
  FRAME_CACHE_RESPONSE_STATUS,
} = require('./frame-cache-contract');
const {
  isPathInside,
  normalizeProjectRelativePath,
  resolveProjectRelativePath,
  toProjectRelativePath,
} = require('./path-policy');
const { resolveMediaPathWithinProjectRoot } = require('./ingest');
const {
  MEDIA_TOOL_KIND,
  MEDIA_TOOL_STATUS,
  buildFfprobeCommand,
  createLocalMediaToolAdapter,
} = require('./tool-adapter');

const FRAME_CACHE_SCHEMA_VERSION = FRAME_CACHE_CONTRACT_VERSION;
const FRAME_CACHE_DECODER_VERSION = 'ffmpeg-png-v1';
const FRAME_CACHE_DEFAULT_DIRECTORY = '.cache/frame-cache';
const FRAME_CACHE_STATUS = Object.freeze({
  ...FRAME_CACHE_RESPONSE_STATUS,
  CLEANED: 'cleaned',
});

class FrameCacheError extends Error {
  constructor(message, code = 'FRAME_CACHE_FAILED') {
    super(message);
    this.name = 'FrameCacheError';
    this.code = code;
  }
}

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireRecord(value, fieldName) {
  if (!isPlainRecord(value)) throw new FrameCacheError(`${fieldName} must be an object`, 'OBJECT_REQUIRED');
  return value;
}

function finiteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '' || value.trim() === 'N/A') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value) {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function rationalNumber(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === '0/0' || trimmed === 'N/A') return null;
  if (!trimmed.includes('/')) return positiveNumber(trimmed);
  const [numeratorText, denominatorText] = trimmed.split('/');
  const numerator = positiveNumber(numeratorText);
  const denominator = positiveNumber(denominatorText);
  return numerator === null || denominator === null ? null : numerator / denominator;
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stableJson(value[key]);
      return result;
    }, {});
  }
  return value;
}

function sha256Json(value) {
  return createHash('sha256').update(JSON.stringify(stableJson(value))).digest('hex');
}

function cancellationError() {
  const error = new FrameCacheError('Frame cache build was cancelled', 'CANCELLED');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw cancellationError();
}

function safeDiagnostic(value) {
  return typeof value === 'string'
    ? value.replace(/[a-zA-Z]:[\\/][^\r\n]*/gu, '[absolute-path]').slice(0, 1000)
    : '';
}

function assertProjectLocalPath(projectRoot, candidate, fieldName) {
  const root = path.resolve(projectRoot);
  const target = path.resolve(candidate);
  if (target === root || !isPathInside(root, target)) {
    throw new FrameCacheError(`${fieldName} must stay inside the project root`, 'PATH_OUTSIDE_PROJECT_ROOT');
  }
  return target;
}

async function assertNoSymbolicLinkAncestors(projectRoot, candidate, fieldName) {
  const root = path.resolve(projectRoot);
  let current = path.resolve(candidate);
  while (true) {
    if (!isPathInside(root, current) && current !== root) {
      throw new FrameCacheError(`${fieldName} must stay inside the project root`, 'PATH_OUTSIDE_PROJECT_ROOT');
    }
    const stats = await fs.lstat(current).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw new FrameCacheError(`${fieldName} cannot be inspected`, 'PATH_UNAVAILABLE');
    });
    if (stats?.isSymbolicLink()) {
      throw new FrameCacheError(`${fieldName} must not contain a symbolic link`, 'SYMLINK_NOT_ALLOWED');
    }
    if (current === root) return;
    const parent = path.dirname(current);
    if (parent === current) throw new FrameCacheError(`${fieldName} cannot be resolved`, 'PATH_UNAVAILABLE');
    current = parent;
  }
}

function resolveCacheDirectory(projectRoot, value) {
  const root = path.resolve(projectRoot);
  const candidate = value === undefined
    ? resolveProjectRelativePath(root, FRAME_CACHE_DEFAULT_DIRECTORY)
    : path.isAbsolute(value)
      ? path.resolve(value)
      : resolveProjectRelativePath(root, normalizeProjectRelativePath(value, 'frame cache directory'));
  return assertProjectLocalPath(root, candidate, 'Frame cache directory');
}

async function hashFile(filePath, signal) {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    let settled = false;
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(value);
    };
    const onAbort = () => {
      stream.destroy(cancellationError());
    };
    stream.on('data', (chunk) => {
      if (signal?.aborted) return;
      hash.update(chunk);
    });
    stream.once('error', (error) => finish(signal?.aborted ? cancellationError() : error));
    stream.once('end', () => finish(null, hash.digest('hex')));
    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    }
  });
}

async function sourceIdentityFor(input, { signal } = {}) {
  requireRecord(input, 'Frame cache input');
  if (typeof input.projectRoot !== 'string' || input.projectRoot.trim() === '') {
    throw new FrameCacheError('projectRoot is required', 'PROJECT_ROOT_REQUIRED');
  }
  const projectRoot = path.resolve(input.projectRoot);
  const sourceValue = input.sourceReference ?? input.sourceRelativePath ?? input.relativePath;
  if (sourceValue === undefined) throw new FrameCacheError('sourceReference is required', 'SOURCE_REFERENCE_REQUIRED');
  const sourceReference = createSourceReference(sourceValue);
  let containment;
  try {
    containment = await resolveMediaPathWithinProjectRoot(projectRoot, sourceReference.relativePath);
  } catch (error) {
    if (error?.code === 'MEDIA_PATH_NOT_FOUND') {
      throw new FrameCacheError('Frame source is unavailable', 'SOURCE_UNAVAILABLE');
    }
    throw new FrameCacheError(error.message, error.code || 'SOURCE_PATH_INVALID');
  }
  throwIfAborted(signal);
  const stats = await fs.stat(containment.realPath).catch(() => null);
  if (!stats?.isFile()) throw new FrameCacheError('Frame source is not a regular file', 'SOURCE_NOT_A_FILE');
  const checksumSha256 = await hashFile(containment.realPath, signal);
  if (sourceReference.checksumSha256 && sourceReference.checksumSha256 !== checksumSha256) {
    throw new FrameCacheError('Frame source checksum does not match its reference', 'SOURCE_IDENTITY_MISMATCH');
  }
  if (sourceReference.byteSize !== null && sourceReference.byteSize !== stats.size) {
    throw new FrameCacheError('Frame source byte size does not match its reference', 'SOURCE_IDENTITY_MISMATCH');
  }
  return {
    projectRoot,
    sourcePath: containment.realPath,
    sourceIdentity: {
      relativePath: containment.relativePath,
      checksumSha256,
      byteSize: stats.size,
      mtimeMs: Number(stats.mtimeMs),
    },
  };
}

function cacheDescriptor(projectRoot, cacheDirectory, cacheKey) {
  const directoryPath = assertProjectLocalPath(
    projectRoot,
    path.join(cacheDirectory, cacheKey),
    'Frame cache entry',
  );
  const directoryRelativePath = toProjectRelativePath(projectRoot, directoryPath);
  return {
    projectRoot,
    key: cacheKey,
    directoryPath,
    directoryRelativePath,
    indexPath: path.join(directoryPath, 'index.json'),
    indexRelativePath: `${directoryRelativePath}/index.json`,
    frameDirectoryPath: path.join(directoryPath, 'frames'),
    frameDirectoryRelativePath: `${directoryRelativePath}/frames`,
  };
}

function publicCacheDescriptor(cache) {
  if (!cache) return null;
  return {
    key: cache.key,
    rootRelativePath: cache.directoryRelativePath,
    indexRelativePath: cache.indexRelativePath,
    frameDirectoryRelativePath: cache.frameDirectoryRelativePath,
    format: 'png',
  };
}

function createCacheKey(sourceIdentity) {
  return sha256Json({ decoderVersion: FRAME_CACHE_DECODER_VERSION, sourceIdentity });
}

function parseFrameProbeOutput(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { status: FRAME_CACHE_STATUS.MALFORMED_OUTPUT, error: { code: 'FFPROBE_JSON_INVALID', message: 'ffprobe frame JSON is invalid' } };
  }
  if (!isPlainRecord(parsed) || !Array.isArray(parsed.streams) || !Array.isArray(parsed.frames)) {
    return { status: FRAME_CACHE_STATUS.MALFORMED_OUTPUT, error: { code: 'FFPROBE_FRAME_OUTPUT_INVALID', message: 'ffprobe frame output shape is invalid' } };
  }
  const stream = parsed.streams.find((candidate) => candidate?.codec_type === 'video');
  if (!stream) {
    return { status: FRAME_CACHE_STATUS.MALFORMED_OUTPUT, error: { code: 'FFPROBE_VIDEO_STREAM_MISSING', message: 'ffprobe did not return a video stream' } };
  }
  const averageFps = rationalNumber(stream.avg_frame_rate);
  const rawFps = rationalNumber(stream.r_frame_rate);
  const fps = averageFps ?? rawFps;
  const frameTiming = averageFps === null || rawFps === null
    ? FRAME_TIMING.UNKNOWN
    : Math.abs(averageFps - rawFps) <= 0.000001 ? FRAME_TIMING.CFR : FRAME_TIMING.VFR;
  const durationSeconds = positiveNumber(parsed.format?.duration) ?? positiveNumber(stream.duration);
  const width = positiveNumber(stream.width);
  const height = positiveNumber(stream.height);
  const timebase = typeof stream.time_base === 'string' ? stream.time_base : null;
  const frames = parsed.frames.map((frame, frameNumber) => {
    const pts = finiteNumber(frame.pts ?? frame.best_effort_timestamp);
    const probedTime = finiteNumber(frame.best_effort_timestamp_time ?? frame.pts_time);
    const time = probedTime ?? (fps === null ? null : frameNumber / fps);
    return {
      frameNumber,
      pts,
      time,
      timeSource: probedTime === null ? (time === null ? 'unavailable' : 'derived-cfr-or-fps') : 'ffprobe',
      width: positiveNumber(frame.width) ?? width,
      height: positiveNumber(frame.height) ?? height,
    };
  });
  if (frames.length === 0) {
    return { status: FRAME_CACHE_STATUS.MALFORMED_OUTPUT, error: { code: 'FFPROBE_FRAMES_EMPTY', message: 'ffprobe returned no video frames' } };
  }
  return {
    status: FRAME_CACHE_STATUS.READY,
    metadata: {
      durationSeconds,
      width,
      height,
      fps,
      averageFps,
      rawFps,
      frameTiming,
      timebase,
      frameCount: frames.length,
    },
    frames,
  };
}

function frameProbeCommand(input, sourcePath) {
  const base = buildFfprobeCommand({
    ...input,
    sourcePath,
  });
  return {
    tool: MEDIA_TOOL_KIND.FFPROBE,
    command: base.command,
    args: [
      '-v', 'error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      '-show_frames',
      '-select_streams', 'v:0',
      '-show_entries', 'format=duration:stream=codec_type,width,height,avg_frame_rate,r_frame_rate,time_base,duration:frame=best_effort_timestamp,best_effort_timestamp_time,pts,pts_time,width,height',
      sourcePath,
    ],
    cwd: input.cwd,
  };
}

function decodeCommand(input, sourcePath, frameDirectoryPath) {
  const command = typeof input.ffmpegCommand === 'string' ? input.ffmpegCommand : 'ffmpeg';
  const progressArgs = input.enableProgress === false ? [] : ['-progress', 'pipe:2', '-nostats'];
  return {
    tool: MEDIA_TOOL_KIND.FFMPEG,
    command,
    args: [
      '-y',
      ...progressArgs,
      '-i', sourcePath,
      '-map', '0:v:0',
      '-an',
      '-fps_mode', 'passthrough',
      '-start_number', '0',
      '-f', 'image2',
      '-c:v', 'png',
      path.join(frameDirectoryPath, 'frame-%08d.png'),
    ],
    cwd: input.cwd,
  };
}

function operationFailure(status, sourceIdentity, cache, error, extra = {}) {
  return {
    schemaVersion: FRAME_CACHE_SCHEMA_VERSION,
    requestId: extra.requestId ?? null,
    projectId: extra.projectId ?? null,
    assetId: extra.assetId ?? null,
    status,
    sourceIdentity,
    cache: publicCacheDescriptor(cache),
    frames: [],
    metadata: null,
    reused: false,
    progress: Array.isArray(extra.progress) ? { events: extra.progress } : (extra.progress ?? null),
    error: error ? { code: error.code ?? 'FRAME_CACHE_FAILED', message: safeDiagnostic(error.message) } : null,
  };
}

function cachePayload({ sourceIdentity, cache, metadata, frames }) {
  return {
    schemaVersion: FRAME_CACHE_SCHEMA_VERSION,
    decoderVersion: FRAME_CACHE_DECODER_VERSION,
    status: FRAME_CACHE_STATUS.READY,
    sourceIdentity,
    cache: {
      key: cache.key,
      rootRelativePath: cache.directoryRelativePath,
      indexRelativePath: cache.indexRelativePath,
      frameDirectoryRelativePath: cache.frameDirectoryRelativePath,
      format: 'png',
    },
    metadata,
    frames: frames.map(publicFrameDescriptor),
  };
}

function publicFrameDescriptor(frame) {
  const { timeSource, ...publicFrame } = frame;
  return publicFrame;
}

async function validateCachedPayload(payload, expectedSource, cache) {
  if (!isPlainRecord(payload)
    || payload.schemaVersion !== FRAME_CACHE_SCHEMA_VERSION
    || payload.decoderVersion !== FRAME_CACHE_DECODER_VERSION
    || payload.status !== FRAME_CACHE_STATUS.READY
    || JSON.stringify(payload.sourceIdentity) !== JSON.stringify(expectedSource)
    || !isPlainRecord(payload.cache)
    || payload.cache.key !== cache.key
    || !Array.isArray(payload.frames)
    || !isPlainRecord(payload.metadata)) return null;
  const frames = [];
  for (let index = 0; index < payload.frames.length; index += 1) {
    const frame = payload.frames[index];
    if (!isPlainRecord(frame) || frame.frameNumber !== index || typeof frame.relativePath !== 'string') return null;
    const relative = normalizeProjectRelativePath(frame.relativePath, 'cached frame path');
    const absolute = assertProjectLocalPath(cache.projectRoot, resolveProjectRelativePath(cache.projectRoot, relative), 'Cached frame path');
    if (!isPathInside(cache.directoryPath, absolute)) return null;
    const stats = await fs.stat(absolute).catch(() => null);
    if (!stats?.isFile() || stats.size === 0) return null;
    frames.push({ ...frame, relativePath: relative });
  }
  return { ...payload, frames };
}

async function readReadyCache(cache, sourceIdentity) {
  const payload = await fs.readFile(cache.indexPath, 'utf8')
    .then((text) => JSON.parse(text))
    .catch(() => null);
  if (!payload) return null;
  return validateCachedPayload(payload, sourceIdentity, cache);
}

async function listDecodedFrames(frameDirectoryPath) {
  const entries = await fs.readdir(frameDirectoryPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /^frame-\d{8}\.png$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => Number(left.slice(6, -4)) - Number(right.slice(6, -4)));
}

async function removePathIfExists(target) {
  await fs.rm(target, { recursive: true, force: true });
}

function resultFromPayload(payload, cache, reused) {
  return {
    ...payload,
    cache: publicCacheDescriptor(cache),
    frames: payload.frames.map(publicFrameDescriptor),
    reused,
    error: null,
  };
}

function bridgeContext(input) {
  const projectId = input.projectId ?? 'local-project';
  const assetId = input.assetId ?? 'frame-cache-asset';
  if (typeof projectId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u.test(projectId)) {
    throw new FrameCacheError('projectId is invalid', 'PROJECT_ID_INVALID');
  }
  if (typeof assetId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u.test(assetId)) {
    throw new FrameCacheError('assetId is invalid', 'ASSET_ID_INVALID');
  }
  return {
    requestId: typeof input.requestId === 'string' && input.requestId.length > 0 ? input.requestId : randomUUID(),
    projectId,
    assetId,
  };
}

/**
 * Stable renderer/export bridge contract (v1):
 *
 * Request: { projectRoot, sourceReference, cacheDirectory?, ffmpegCommand?,
 *            ffprobeCommand?, cwd?, adapter?, signal? }.
 * Response: { schemaVersion, status, sourceIdentity, metadata, frames, cache,
 *             reused, error }.  `frames` is ordered by zero-based
 * `frameNumber`; each item has `pts`, `time`, `width`, `height`, and a
 * project-relative `relativePath` under `cache.frameDirectoryRelativePath`.
 * `sourceIdentity` contains the project-relative source, SHA-256, byte size,
 * and mtime.  No absolute source/cache paths are serialized in the response
 * or index.  A consumer can drag or step by reading this index; it must not
 * invoke FFmpeg per input event.  `tool-missing`, `process-failed`,
 * `malformed-output`, `cancelled`, and `cache-error` are explicit non-ready
 * states and never expose a partial cache as ready.
 */
async function buildFrameCache(input = {}, { signal } = {}) {
  requireRecord(input, 'Frame cache input');
  const context = bridgeContext(input);
  const resolved = await sourceIdentityFor(input, { signal }).catch((error) => {
    if (error?.code === 'CANCELLED' || error?.name === 'AbortError') {
      return { cancelled: true, error };
    }
    if (error?.code === 'SOURCE_UNAVAILABLE') {
      return { unavailable: true, error };
    }
    throw error;
  });
  if (resolved.cancelled) return operationFailure(FRAME_CACHE_STATUS.CANCELLED, null, null, resolved.error, context);
  if (resolved.unavailable) return operationFailure(FRAME_CACHE_STATUS.SOURCE_UNAVAILABLE, null, null, resolved.error, context);
  const { projectRoot, sourcePath, sourceIdentity } = resolved;
  const cacheDirectory = resolveCacheDirectory(projectRoot, input.cacheDirectory);
  await assertNoSymbolicLinkAncestors(projectRoot, cacheDirectory, 'Frame cache directory');
  await fs.mkdir(cacheDirectory, { recursive: true });
  const cache = cacheDescriptor(projectRoot, cacheDirectory, createCacheKey(sourceIdentity));
  await assertNoSymbolicLinkAncestors(projectRoot, cache.directoryPath, 'Frame cache entry');

  const ready = await readReadyCache(cache, sourceIdentity);
  if (ready) return { ...resultFromPayload(ready, cache, true), ...context };

  const adapter = input.adapter ?? createLocalMediaToolAdapter({
    ...(input.toolOptions ?? {}),
    ffmpegCommand: input.ffmpegCommand ?? input.toolOptions?.ffmpegCommand,
    ffprobeCommand: input.ffprobeCommand ?? input.toolOptions?.ffprobeCommand,
    cwd: input.cwd ?? input.toolOptions?.cwd,
    maxOutputBytes: input.maxToolOutputBytes ?? input.toolOptions?.maxOutputBytes ?? 64 * 1024 * 1024,
  });
  const stagingPath = path.join(cacheDirectory, `.${cache.key}.build-${randomUUID()}`);
  const stagingFramesPath = path.join(stagingPath, 'frames');
  await assertNoSymbolicLinkAncestors(projectRoot, stagingPath, 'Frame cache staging path');
  await fs.mkdir(stagingFramesPath, { recursive: true });
  let progressBuffer = '';
  const progress = [];
  const onOutput = ({ stream, text }) => {
    if (stream !== 'stderr' || typeof text !== 'string') return;
    progressBuffer += text;
    const lines = progressBuffer.split(/\r?\n/u);
    progressBuffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('progress=')) {
        const event = { state: line.slice('progress='.length) };
        progress.push(event);
        if (typeof input.onProgress === 'function') input.onProgress(event);
      }
    }
  };

  try {
    throwIfAborted(signal);
    const probe = frameProbeCommand(input, sourcePath);
    const probeResult = await adapter.run({
      tool: MEDIA_TOOL_KIND.FFPROBE,
      args: probe.args,
      cwd: probe.cwd,
      signal,
    });
    if (probeResult.status === MEDIA_TOOL_STATUS.CANCELLED || signal?.aborted) {
      return operationFailure(FRAME_CACHE_STATUS.CANCELLED, sourceIdentity, cache, cancellationError(), context);
    }
    if (probeResult.status === MEDIA_TOOL_STATUS.TOOL_MISSING) {
      return operationFailure(FRAME_CACHE_STATUS.TOOL_MISSING, sourceIdentity, cache, new FrameCacheError('ffprobe is unavailable', 'FFPROBE_UNAVAILABLE'), context);
    }
    if (probeResult.status !== MEDIA_TOOL_STATUS.AVAILABLE) {
      return operationFailure(FRAME_CACHE_STATUS.PROCESS_FAILED, sourceIdentity, cache, new FrameCacheError(
        safeDiagnostic(probeResult.stderr) || 'ffprobe failed',
        probeResult.errorCode || 'FFPROBE_FAILED',
      ), context);
    }
    const parsed = parseFrameProbeOutput(probeResult.stdout);
    if (parsed.status !== FRAME_CACHE_STATUS.READY) {
      return operationFailure(parsed.status, sourceIdentity, cache, new FrameCacheError(parsed.error.message, parsed.error.code), context);
    }

    throwIfAborted(signal);
    const decode = decodeCommand(input, sourcePath, stagingFramesPath);
    const decodeResult = await adapter.run({
      tool: MEDIA_TOOL_KIND.FFMPEG,
      args: decode.args,
      cwd: decode.cwd,
      signal,
      onOutput,
    });
    if (decodeResult.status === MEDIA_TOOL_STATUS.CANCELLED || signal?.aborted) {
      return operationFailure(FRAME_CACHE_STATUS.CANCELLED, sourceIdentity, cache, cancellationError(), { ...context, progress });
    }
    if (decodeResult.status === MEDIA_TOOL_STATUS.TOOL_MISSING) {
      return operationFailure(FRAME_CACHE_STATUS.TOOL_MISSING, sourceIdentity, cache, new FrameCacheError('ffmpeg is unavailable', 'FFMPEG_UNAVAILABLE'), { ...context, progress });
    }
    if (decodeResult.status !== MEDIA_TOOL_STATUS.AVAILABLE) {
      return operationFailure(FRAME_CACHE_STATUS.PROCESS_FAILED, sourceIdentity, cache, new FrameCacheError(
        safeDiagnostic(decodeResult.stderr) || 'ffmpeg frame decode failed',
        decodeResult.errorCode || 'FFMPEG_FAILED',
      ), { ...context, progress });
    }
    const decodedFiles = await listDecodedFrames(stagingFramesPath);
    if (decodedFiles.length !== parsed.frames.length) {
      return operationFailure(
        FRAME_CACHE_STATUS.MALFORMED_OUTPUT,
        sourceIdentity,
        cache,
        new FrameCacheError(`ffmpeg decoded ${decodedFiles.length} frames but ffprobe indexed ${parsed.frames.length}`, 'FRAME_COUNT_MISMATCH'),
        { ...context, progress },
      );
    }
    const frames = parsed.frames.map((frame, index) => ({
      ...frame,
      relativePath: `${cache.directoryRelativePath}/frames/${decodedFiles[index]}`,
    }));
    const payload = cachePayload({ sourceIdentity, cache, metadata: parsed.metadata, frames });
    await fs.writeFile(path.join(stagingPath, 'index.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    throwIfAborted(signal);
    const existing = await fs.stat(cache.directoryPath).catch(() => null);
    if (existing) {
      const concurrentReady = await readReadyCache(cache, sourceIdentity);
      if (concurrentReady) {
        await removePathIfExists(stagingPath);
        return { ...resultFromPayload(concurrentReady, cache, true), ...context };
      }
      // The exact cache key is derived from the current source identity. An
      // invalid entry at this key is disposable; the source and other cache
      // keys remain untouched, and the freshly decoded staging tree wins.
      await removePathIfExists(cache.directoryPath);
    }
    await fs.rename(stagingPath, cache.directoryPath);
    return { ...resultFromPayload(payload, cache, false), ...context, progress: { events: progress } };
  } catch (error) {
    if (error?.code === 'CANCELLED' || error?.name === 'AbortError' || signal?.aborted) {
      return operationFailure(FRAME_CACHE_STATUS.CANCELLED, sourceIdentity, cache, cancellationError(), { ...context, progress });
    }
    if (error instanceof FrameCacheError) {
      return operationFailure(FRAME_CACHE_STATUS.CACHE_ERROR, sourceIdentity, cache, error, { ...context, progress });
    }
    return operationFailure(FRAME_CACHE_STATUS.CACHE_ERROR, sourceIdentity, cache, new FrameCacheError(error.message, error.code || 'CACHE_WRITE_FAILED'), { ...context, progress });
  } finally {
    await removePathIfExists(stagingPath);
  }
}

async function readFrameCache(input = {}, { signal } = {}) {
  const context = bridgeContext(input);
  let resolved;
  try {
    resolved = await sourceIdentityFor(input, { signal });
  } catch (error) {
    if (error?.code === 'CANCELLED' || error?.name === 'AbortError' || signal?.aborted) {
      return operationFailure(FRAME_CACHE_STATUS.CANCELLED, null, null, cancellationError(), context);
    }
    if (error?.code === 'SOURCE_UNAVAILABLE') {
      return operationFailure(FRAME_CACHE_STATUS.SOURCE_UNAVAILABLE, null, null, error, context);
    }
    throw error;
  }
  const cacheDirectory = resolveCacheDirectory(resolved.projectRoot, input.cacheDirectory);
  const cache = cacheDescriptor(resolved.projectRoot, cacheDirectory, createCacheKey(resolved.sourceIdentity));
  const ready = await readReadyCache(cache, resolved.sourceIdentity);
  if (!ready) return { ...operationFailure(FRAME_CACHE_STATUS.CACHE_MISS, resolved.sourceIdentity, cache, null, context), ...context };
  return { ...resultFromPayload(ready, cache, true), ...context };
}

async function cleanupFrameCache(input = {}) {
  requireRecord(input, 'Frame cache cleanup input');
  const context = bridgeContext(input);
  if (typeof input.projectRoot !== 'string' || input.projectRoot.trim() === '') {
    throw new FrameCacheError('projectRoot is required', 'PROJECT_ROOT_REQUIRED');
  }
  const projectRoot = path.resolve(input.projectRoot);
  const cacheDirectory = resolveCacheDirectory(projectRoot, input.cacheDirectory);
  await assertNoSymbolicLinkAncestors(projectRoot, cacheDirectory, 'Frame cache directory');
  let target;
  if (typeof input.cacheKey === 'string' && /^[a-f0-9]{64}$/iu.test(input.cacheKey)) {
    target = path.join(cacheDirectory, input.cacheKey);
  } else if (input.sourceReference !== undefined) {
    const resolved = await sourceIdentityFor(input);
    target = path.join(cacheDirectory, createCacheKey(resolved.sourceIdentity));
  } else {
    throw new FrameCacheError('cacheKey or sourceReference is required', 'CACHE_REFERENCE_REQUIRED');
  }
  assertProjectLocalPath(projectRoot, target, 'Frame cache cleanup target');
  await removePathIfExists(target);
  return {
    schemaVersion: FRAME_CACHE_SCHEMA_VERSION,
    ...context,
    status: FRAME_CACHE_STATUS.CLEANED,
    error: null,
  };
}

module.exports = Object.freeze({
  FRAME_CACHE_DECODER_VERSION,
  FRAME_CACHE_DEFAULT_DIRECTORY,
  FRAME_CACHE_SCHEMA_VERSION,
  FRAME_CACHE_STATUS,
  FrameCacheError,
  buildFrameCache,
  cleanupFrameCache,
  prepareFrameCache: buildFrameCache,
  readFrameCache,
});
