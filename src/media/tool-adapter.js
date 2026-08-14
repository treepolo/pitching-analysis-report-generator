'use strict';

const { createReadStream } = require('node:fs');
const { spawn: defaultSpawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const {
  COMPATIBILITY,
  FRAME_TIMING,
  INSPECTION_STATUS,
  MEDIA_KINDS,
  PLAYABILITY,
  advanceNormalizationJob,
  cancelNormalizationJob,
  completeNormalizationJob,
  createNormalizedReference,
  createSourceReference,
  detectMediaType,
  failNormalizationJob,
  normalizeMediaMetadata,
  requestNormalizationCancellation,
  startNormalizationJob,
} = require('./contract');
const {
  isPathInside,
  normalizeProjectRelativePath,
  resolveProjectRelativePath,
  toProjectRelativePath,
} = require('./path-policy');

const MEDIA_TOOL_KIND = Object.freeze({
  FFPROBE: 'ffprobe',
  FFMPEG: 'ffmpeg',
});

const MEDIA_TOOL_STATUS = Object.freeze({
  AVAILABLE: 'available',
  TOOL_MISSING: 'tool-missing',
  PROCESS_FAILED: 'process-failed',
  CANCELLED: 'cancelled',
});

const MEDIA_OPERATION_STATUS = Object.freeze({
  SUCCEEDED: 'succeeded',
  TOOL_MISSING: 'tool-missing',
  PROCESS_FAILED: 'process-failed',
  MALFORMED_OUTPUT: 'malformed-output',
  UNSUPPORTED_CODEC: 'unsupported-codec',
  METADATA_PENDING: 'metadata-pending',
  VERIFICATION_PENDING: 'verification-pending',
  VERIFICATION_FAILED: 'verification-failed',
  CANCELLED: 'cancelled',
});

const DEFAULT_SUPPORTED_VIDEO_CODECS = Object.freeze(['h264', 'avc1']);
const DEFAULT_SUPPORTED_IMAGE_CODECS = Object.freeze([
  'bmp',
  'gif',
  'jpeg',
  'mjpeg',
  'png',
  'webp',
]);
const IMAGE_CONTAINERS = new Set(['avif', 'bmp', 'gif', 'ico', 'jpeg', 'png', 'tiff', 'webp']);
const MP4_FORMAT_NAMES = new Set(['3gp', '3g2', 'm4a', 'm4v', 'mj2', 'mov', 'mp4']);
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;
const SAFE_COMMAND_PATTERN = /^[a-zA-Z0-9._+-]{1,80}$/u;
const SAFE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u;

class MediaToolAdapterError extends Error {
  constructor(message, code = 'MEDIA_TOOL_ADAPTER_FAILED') {
    super(message);
    this.name = 'MediaToolAdapterError';
    this.code = code;
  }
}

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireRecord(value, fieldName) {
  if (!isPlainRecord(value)) {
    throw new MediaToolAdapterError(`${fieldName} must be an object`, 'OBJECT_REQUIRED');
  }
  return value;
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeCommand(value, fieldName) {
  if (typeof value !== 'string' || value.length === 0 || CONTROL_CHARACTER_PATTERN.test(value)
    || (path.isAbsolute(value) ? value.length > 1000 : !SAFE_COMMAND_PATTERN.test(value))) {
    throw new MediaToolAdapterError(`${fieldName} is not a safe command name`, 'COMMAND_INVALID');
  }
  return value;
}

function normalizeText(value, fieldName, maxLength = 500) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength
    || CONTROL_CHARACTER_PATTERN.test(value)) {
    throw new MediaToolAdapterError(`${fieldName} is invalid`, 'TEXT_INVALID');
  }
  return value;
}

function normalizeOutputText(value, fieldName) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return Buffer.from(value).toString('utf8');
  throw new MediaToolAdapterError(`${fieldName} must be text`, 'OUTPUT_INVALID');
}

function safeDiagnosticText(value) {
  const text = typeof value === 'string' ? value : '';
  return text
    .replace(/[a-zA-Z]:[\\/][^\r\n]*/gu, '[absolute-path]')
    .replace(/(^|\s)\/(?:[^\s\r\n]+)/gu, '$1[absolute-path]')
    .slice(0, 1000);
}

function isCancellationError(error, signal) {
  return Boolean(signal?.aborted)
    || error?.name === 'AbortError'
    || ['ABORT_ERR', 'ECANCELED', 'ERR_CANCELED'].includes(error?.code);
}

function normalizeSourceLocation(input) {
  requireRecord(input, 'Media tool input');
  const projectRoot = typeof input.projectRoot === 'string' && input.projectRoot.trim() !== ''
    ? path.resolve(input.projectRoot)
    : null;
  if (projectRoot === null) {
    throw new MediaToolAdapterError('projectRoot is required', 'PROJECT_ROOT_REQUIRED');
  }

  const sourceValue = input.sourceReference ?? input.sourceRelativePath ?? input.relativePath;
  const sourceReference = createSourceReference(sourceValue);
  const candidateValue = input.realPath ?? input.sourcePath
    ?? resolveProjectRelativePath(projectRoot, sourceReference.relativePath);
  if (typeof candidateValue !== 'string' || candidateValue.trim() === '') {
    throw new MediaToolAdapterError('A source path is required', 'SOURCE_PATH_REQUIRED');
  }
  const absolutePath = path.isAbsolute(candidateValue)
    ? path.resolve(candidateValue)
    : resolveProjectRelativePath(projectRoot, candidateValue);
  if (!isPathInside(projectRoot, absolutePath) || absolutePath === projectRoot) {
    throw new MediaToolAdapterError('Source path is outside the project root', 'PATH_OUTSIDE_PROJECT_ROOT');
  }

  const canonicalRelativePath = toProjectRelativePath(projectRoot, absolutePath);
  if (sourceReference.relativePath !== canonicalRelativePath) {
    throw new MediaToolAdapterError('Source reference does not match the resolved path', 'SOURCE_REFERENCE_MISMATCH');
  }

  return {
    projectRoot,
    sourceReference,
    sourcePath: absolutePath,
    relativePath: sourceReference.relativePath,
  };
}

async function resolveExecutionSourceLocation(input) {
  const source = normalizeSourceLocation(input);
  let stats;
  try {
    stats = await fs.lstat(source.sourcePath);
  } catch (error) {
    // Command descriptors remain useful before an ingest copy exists. The
    // injected runner will report the eventual unavailable/tool error.
    if (error.code === 'ENOENT') return source;
    throw new MediaToolAdapterError('Source path is unavailable', 'SOURCE_UNAVAILABLE');
  }
  if (stats.isSymbolicLink()) {
    throw new MediaToolAdapterError('Source path must not be a symbolic link', 'SOURCE_SYMLINK_NOT_ALLOWED');
  }
  if (!stats.isFile()) {
    throw new MediaToolAdapterError('Source path is not a regular file', 'SOURCE_NOT_A_FILE');
  }
  let realSource;
  try {
    realSource = await fs.realpath(source.sourcePath);
  } catch (error) {
    throw new MediaToolAdapterError('Source path cannot be resolved safely', 'SOURCE_REALPATH_FAILED');
  }
  if (!isPathInside(source.projectRoot, realSource)
    || toProjectRelativePath(source.projectRoot, realSource) !== source.relativePath) {
    throw new MediaToolAdapterError('Source path resolves outside the project root', 'PATH_OUTSIDE_PROJECT_ROOT');
  }
  return { ...source, sourcePath: realSource };
}

async function assertNormalizationTargetSafe(target) {
  const projectRoot = path.resolve(target.projectRoot);
  let current = target.targetPath;
  while (true) {
    if (!isPathInside(projectRoot, current)) {
      throw new MediaToolAdapterError('Normalized target resolves outside the project root', 'TARGET_OUTSIDE_PROJECT_ROOT');
    }
    let stats;
    try {
      stats = await fs.lstat(current);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new MediaToolAdapterError('Normalized target is unavailable', 'TARGET_UNAVAILABLE');
      }
      if (path.resolve(current) === projectRoot) return;
      const parent = path.dirname(current);
      if (parent === current) return;
      current = parent;
      continue;
    }
    if (stats.isSymbolicLink()) {
      throw new MediaToolAdapterError('Normalized target path must not contain a symbolic link', 'TARGET_SYMLINK_NOT_ALLOWED');
    }
    const realCurrent = await fs.realpath(current).catch(() => null);
    if (!realCurrent || !isPathInside(projectRoot, realCurrent)) {
      throw new MediaToolAdapterError('Normalized target resolves outside the project root', 'TARGET_OUTSIDE_PROJECT_ROOT');
    }
    return;
  }
}

function normalizeRunnerResult(value) {
  requireRecord(value, 'Media tool runner result');
  const exitCode = value.exitCode ?? value.code;
  if (!Number.isInteger(exitCode)) {
    throw new MediaToolAdapterError('Media tool runner must return an integer exitCode', 'EXIT_CODE_REQUIRED');
  }
  return {
    exitCode,
    stdout: normalizeOutputText(value.stdout, 'stdout'),
    stderr: normalizeOutputText(value.stderr, 'stderr'),
  };
}

/**
 * Run a media tool through the OS process boundary without a shell. This is
 * opt-in: tests and embedders can keep using the injected runner seam, while
 * the desktop shell can supply this runner for real ffprobe/FFmpeg execution.
 */
function createLocalMediaToolRunner(input = {}) {
  requireRecord(input, 'Local media runner input');
  const spawnImpl = input.spawnImpl ?? defaultSpawn;
  if (typeof spawnImpl !== 'function') {
    throw new MediaToolAdapterError('spawnImpl must be a function', 'SPAWN_INVALID');
  }
  const maxOutputBytes = input.maxOutputBytes ?? 8 * 1024 * 1024;
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes < 1024 || maxOutputBytes > 64 * 1024 * 1024) {
    throw new MediaToolAdapterError('maxOutputBytes is invalid', 'OUTPUT_LIMIT_INVALID');
  }

  return ({ command, args = [], cwd, env, signal } = {}) => {
    if (typeof command !== 'string' || command.length === 0 || CONTROL_CHARACTER_PATTERN.test(command)) {
      return Promise.reject(new MediaToolAdapterError('command is invalid', 'COMMAND_INVALID'));
    }
    if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
      return Promise.reject(new MediaToolAdapterError('args must be strings', 'ARGS_INVALID'));
    }
    return new Promise((resolve, reject) => {
      let child;
      let settled = false;
      let stdout = '';
      let stderr = '';

      const cleanup = () => {
        if (signal) signal.removeEventListener('abort', onAbort);
      };
      const settleResolve = (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };
      const settleReject = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      const append = (field, value) => {
        const text = Buffer.isBuffer(value) || value instanceof Uint8Array
          ? Buffer.from(value).toString('utf8')
          : String(value);
        const next = field === 'stdout' ? stdout + text : stderr + text;
        if (Buffer.byteLength(next, 'utf8') > maxOutputBytes) {
          const error = new Error('Media tool output exceeded the configured limit');
          error.code = 'OUTPUT_LIMIT_EXCEEDED';
          if (child && typeof child.kill === 'function') child.kill();
          settleReject(error);
          return;
        }
        if (field === 'stdout') stdout = next;
        else stderr = next;
      };
      const onAbort = () => {
        if (child && typeof child.kill === 'function') child.kill();
        const error = new Error('Media tool execution was cancelled');
        error.name = 'AbortError';
        error.code = 'ABORT_ERR';
        settleReject(error);
      };

      if (signal?.aborted) {
        onAbort();
        return;
      }

      try {
        child = spawnImpl(command, [...args], {
          cwd,
          env,
          shell: false,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error) {
        settleReject(error);
        return;
      }
      if (!child || typeof child.once !== 'function') {
        settleReject(new MediaToolAdapterError('spawnImpl did not return a child process', 'SPAWN_RESULT_INVALID'));
        return;
      }
      child.stdout?.on('data', (value) => append('stdout', value));
      child.stderr?.on('data', (value) => append('stderr', value));
      child.once('error', settleReject);
      child.once('close', (code, signalName) => {
        settleResolve({
          exitCode: Number.isInteger(code) ? code : -1,
          stdout,
          stderr: signalName ? `${stderr}\nterminated:${signalName}`.trim() : stderr,
        });
      });
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
    });
  };
}

function createLocalMediaToolAdapter(input = {}) {
  requireRecord(input, 'Local media adapter input');
  const runner = input.runner === undefined
    ? createLocalMediaToolRunner(input)
    : input.runner;
  return createMediaToolAdapter({ ...input, runner });
}

/**
 * Build a command-only adapter. It never spawns a process. The caller owns
 * the runner so desktop/main code can inject child-process, sandbox, or test
 * execution without making this domain depend on any runtime integration.
 */
function createMediaToolAdapter(input = {}) {
  requireRecord(input, 'Media tool adapter input');
  if (input.runner !== undefined && input.runner !== null && typeof input.runner !== 'function') {
    throw new MediaToolAdapterError('runner must be a function', 'RUNNER_INVALID');
  }
  const runner = input.runner ?? null;
  const commands = Object.freeze({
    [MEDIA_TOOL_KIND.FFPROBE]: normalizeCommand(input.ffprobeCommand ?? 'ffprobe', 'ffprobeCommand'),
    [MEDIA_TOOL_KIND.FFMPEG]: normalizeCommand(input.ffmpegCommand ?? 'ffmpeg', 'ffmpegCommand'),
  });
  const defaultCwd = input.cwd === undefined ? undefined : normalizeText(input.cwd, 'cwd', 1000);
  const environment = input.env === undefined ? undefined : cloneJson(input.env);

  async function run({ tool, args, cwd = defaultCwd, signal } = {}) {
    if (!Object.values(MEDIA_TOOL_KIND).includes(tool)) {
      throw new MediaToolAdapterError('tool kind is invalid', 'TOOL_KIND_INVALID');
    }
    if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
      throw new MediaToolAdapterError('tool args must be strings', 'ARGS_INVALID');
    }
    const command = commands[tool];
    if (runner === null) {
      return {
        status: MEDIA_TOOL_STATUS.TOOL_MISSING,
        tool,
        command,
        exitCode: null,
        stdout: '',
        stderr: '',
        errorCode: 'TOOL_RUNNER_UNAVAILABLE',
      };
    }
    if (signal?.aborted) {
      return {
        status: MEDIA_TOOL_STATUS.CANCELLED,
        tool,
        command,
        exitCode: null,
        stdout: '',
        stderr: '',
        errorCode: 'CANCELLED',
      };
    }
    try {
      const raw = await runner({
        tool,
        command,
        args: [...args],
        cwd,
        env: environment === undefined ? undefined : cloneJson(environment),
        signal,
      });
      const result = normalizeRunnerResult(raw);
      if (result.exitCode !== 0) {
        return {
          ...result,
          status: MEDIA_TOOL_STATUS.PROCESS_FAILED,
          tool,
          command,
          errorCode: `EXIT_${result.exitCode}`,
          stderr: safeDiagnosticText(result.stderr),
        };
      }
      return {
        ...result,
        status: MEDIA_TOOL_STATUS.AVAILABLE,
        tool,
        command,
      };
    } catch (error) {
      if (isCancellationError(error, signal)) {
        return {
          status: MEDIA_TOOL_STATUS.CANCELLED,
          tool,
          command,
          exitCode: null,
          stdout: '',
          stderr: '',
          errorCode: 'CANCELLED',
        };
      }
      if (error?.code === 'ENOENT') {
        return {
          status: MEDIA_TOOL_STATUS.TOOL_MISSING,
          tool,
          command,
          exitCode: null,
          stdout: '',
          stderr: '',
          errorCode: 'ENOENT',
        };
      }
      return {
        status: MEDIA_TOOL_STATUS.PROCESS_FAILED,
        tool,
        command,
        exitCode: Number.isInteger(error?.exitCode) ? error.exitCode : null,
        stdout: '',
        stderr: safeDiagnosticText(error?.stderr ?? error?.message),
        errorCode: typeof error?.code === 'string' ? error.code : 'RUNNER_FAILED',
      };
    }
  }

  return Object.freeze({
    kind: 'media-tool-adapter',
    commands,
    run,
  });
}

function parseToolVersion(tool, output) {
  const executableName = tool === MEDIA_TOOL_KIND.FFPROBE ? 'ffprobe' : 'ffmpeg';
  const match = new RegExp(`^${executableName}\\s+version\\s+([^\\s]+)`, 'imu').exec(output);
  return match?.[1] ?? null;
}

/**
 * Probe only the external tool capability boundary. A version response proves
 * that a command is executable, not that any particular media file is valid
 * or playable; real-media inspection remains owned by inspectWithFfprobe.
 */
async function probeMediaToolVersion(adapter, tool, { signal } = {}) {
  if (!adapter || typeof adapter.run !== 'function') {
    throw new MediaToolAdapterError('A media tool adapter is required', 'ADAPTER_REQUIRED');
  }
  if (!Object.values(MEDIA_TOOL_KIND).includes(tool)) {
    throw new MediaToolAdapterError('tool kind is invalid', 'TOOL_KIND_INVALID');
  }

  const execution = await adapter.run({ tool, args: ['-version'], signal });
  const base = {
    tool,
    command: execution.command ?? null,
    toolStatus: execution.status ?? null,
    status: execution.status ?? MEDIA_OPERATION_STATUS.PROCESS_FAILED,
    available: false,
    version: null,
    exitCode: Number.isInteger(execution.exitCode) ? execution.exitCode : null,
    errorCode: execution.errorCode ?? null,
  };
  if (execution.status !== MEDIA_TOOL_STATUS.AVAILABLE) {
    return {
      ...base,
      reason: execution.status ?? 'tool-status-unknown',
    };
  }

  const output = [normalizeOutputText(execution.stdout, 'version stdout'), normalizeOutputText(execution.stderr, 'version stderr')]
    .filter((value) => value.length > 0)
    .join('\n');
  const version = parseToolVersion(tool, output);
  if (version === null) {
    return {
      ...base,
      status: MEDIA_OPERATION_STATUS.MALFORMED_OUTPUT,
      errorCode: 'VERSION_OUTPUT_INVALID',
      reason: 'version output did not identify the requested tool',
    };
  }
  return {
    ...base,
    status: MEDIA_TOOL_STATUS.AVAILABLE,
    available: true,
    version,
    evidence: 'version-command',
    errorCode: null,
    reason: null,
  };
}

/**
 * Discover local ffprobe/FFmpeg executability without claiming media support.
 * The injected adapter keeps this deterministic in tests and lets the shell
 * surface unavailable tools before starting a long normalization job.
 */
async function discoverLocalMediaTools(input = {}, { signal } = {}) {
  requireRecord(input, 'Local media discovery input');
  const adapter = input.adapter ?? createLocalMediaToolAdapter(input.toolOptions ?? input);
  const ffprobe = await probeMediaToolVersion(adapter, MEDIA_TOOL_KIND.FFPROBE, { signal });
  const ffmpeg = await probeMediaToolVersion(adapter, MEDIA_TOOL_KIND.FFMPEG, { signal });
  return {
    schemaVersion: 1,
    allAvailable: ffprobe.available && ffmpeg.available,
    ffprobe,
    ffmpeg,
  };
}

function buildFfprobeCommand(input) {
  const source = normalizeSourceLocation(input);
  const command = normalizeCommand(input.ffprobeCommand ?? 'ffprobe', 'ffprobeCommand');
  return {
    tool: MEDIA_TOOL_KIND.FFPROBE,
    command,
    args: ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', source.sourcePath],
    cwd: input.cwd,
    sourceReference: source.sourceReference,
    sourcePath: source.sourcePath,
    projectRoot: source.projectRoot,
  };
}

function createNormalizedCopyTarget(input) {
  const source = normalizeSourceLocation(input);
  const assetId = input.assetId ?? input.id;
  if (typeof assetId !== 'string' || !SAFE_ID_PATTERN.test(assetId)) {
    throw new MediaToolAdapterError('assetId is invalid', 'ASSET_ID_INVALID');
  }
  const targetRelativePath = normalizeProjectRelativePath(
    input.targetRelativePath ?? `media/normalized/${assetId}.mp4`,
    'normalized target path',
  );
  if (!/\.mp4$/iu.test(targetRelativePath)) {
    throw new MediaToolAdapterError('Normalized target must be an MP4 path', 'NORMALIZED_TARGET_FORMAT_INVALID');
  }
  const targetPath = resolveProjectRelativePath(source.projectRoot, targetRelativePath);
  if (targetPath === source.sourcePath || source.relativePath === targetRelativePath) {
    throw new MediaToolAdapterError('Source and normalized target must be different', 'REFERENCE_COLLISION');
  }
  return {
    projectRoot: source.projectRoot,
    sourceReference: source.sourceReference,
    sourcePath: source.sourcePath,
    normalizedReference: createNormalizedReference({
      relativePath: targetRelativePath,
      mediaType: 'video/mp4',
    }),
    targetPath,
  };
}

function buildFfmpegCommand(input) {
  const target = createNormalizedCopyTarget(input);
  const command = normalizeCommand(input.ffmpegCommand ?? 'ffmpeg', 'ffmpegCommand');
  return {
    tool: MEDIA_TOOL_KIND.FFMPEG,
    command,
    args: [
      '-y',
      '-i', target.sourcePath,
      '-map_metadata', '0',
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      target.targetPath,
    ],
    cwd: input.cwd,
    sourceReference: target.sourceReference,
    normalizedReference: target.normalizedReference,
    sourcePath: target.sourcePath,
    targetPath: target.targetPath,
    projectRoot: target.projectRoot,
  };
}

function parseFiniteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '' || value.trim() === 'N/A') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parsePositiveNumber(value) {
  const number = parseFiniteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function parseFrameRate(value) {
  if (typeof value === 'number') return value > 0 && Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '0/0' || trimmed === 'N/A') return null;
  if (trimmed.includes('/')) {
    const [numeratorText, denominatorText] = trimmed.split('/');
    const numerator = Number(numeratorText);
    const denominator = Number(denominatorText);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0 || numerator <= 0) {
      return null;
    }
    return numerator / denominator;
  }
  return parsePositiveNumber(trimmed);
}

function parseTimebase(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const match = /^(\d+)\/(\d+)$/u.exec(trimmed);
  if (!match || match[1] === '0' || match[2] === '0') return null;
  return `${match[1]}/${match[2]}`;
}

function frameTimingFor(stream) {
  const average = parseFrameRate(stream.avg_frame_rate);
  const raw = parseFrameRate(stream.r_frame_rate);
  if (average === null || raw === null) {
    return {
      fps: average ?? raw,
      frameTiming: FRAME_TIMING.UNKNOWN,
      timebase: parseTimebase(stream.time_base ?? stream.timebase),
    };
  }
  return {
    fps: average,
    frameTiming: Math.abs(average - raw) <= 0.000001 ? FRAME_TIMING.CFR : FRAME_TIMING.VFR,
    timebase: parseTimebase(stream.time_base ?? stream.timebase),
  };
}

function normalizedContainer(formatName) {
  if (typeof formatName !== 'string') return null;
  const names = formatName.split(',').map((name) => name.trim().toLowerCase()).filter(Boolean);
  if (names.some((name) => MP4_FORMAT_NAMES.has(name))) return 'mp4';
  if (names.includes('mjpeg') || names.includes('image2')) return 'jpeg';
  if (names.includes('png_pipe')) return 'png';
  if (names.includes('gif')) return 'gif';
  if (names.includes('webp')) return 'webp';
  if (names.includes('bmp_pipe')) return 'bmp';
  if (names.includes('avif')) return 'avif';
  if (names.includes('tiff')) return 'tiff';
  return names[0] ?? null;
}

function codecIsSupported(codec, mediaKind, supportedCodecs) {
  if (typeof codec !== 'string' || codec.length === 0) return false;
  return supportedCodecs.has(codec.toLowerCase())
    || (mediaKind === MEDIA_KINDS.IMAGE && DEFAULT_SUPPORTED_IMAGE_CODECS.includes(codec.toLowerCase()));
}

function baseInspectionResult(source, tool, status, reason) {
  const detected = detectMediaType(source.relativePath);
  const metadata = normalizeMediaMetadata({
    fileName: path.basename(source.relativePath),
    extension: detected.extension,
    mimeType: detected.mimeType,
  }, detected);
  return {
    schemaVersion: 1,
    status,
    inspectionStatus: INSPECTION_STATUS.METADATA_PENDING,
    playability: PLAYABILITY.UNKNOWN,
    compatibility: COMPATIBILITY.UNKNOWN,
    reason,
    mediaKind: detected.kind,
    format: detected.format,
    extension: detected.extension,
    mimeType: detected.mimeType,
    container: null,
    detection: cloneJson(detected),
    signature: null,
    metadata,
    warnings: [`${reason} prevented verified metadata inspection.`],
    tool,
    sourceReference: source.sourceReference,
  };
}

function malformedInspectionResult(source, tool, reason) {
  return baseInspectionResult(source, tool, MEDIA_OPERATION_STATUS.MALFORMED_OUTPUT, reason);
}

function parseFfprobeOutput(stdout, input = {}) {
  const source = normalizeSourceLocation(input);
  let parsed;
  try {
    parsed = JSON.parse(normalizeOutputText(stdout, 'ffprobe stdout'));
  } catch {
    return malformedInspectionResult(source, {
      kind: MEDIA_TOOL_KIND.FFPROBE,
      command: input.ffprobeCommand ?? 'ffprobe',
      status: MEDIA_TOOL_STATUS.AVAILABLE,
      exitCode: 0,
    }, 'ffprobe-json-invalid');
  }
  if (!isPlainRecord(parsed) || !isPlainRecord(parsed.format) || !Array.isArray(parsed.streams)) {
    return malformedInspectionResult(source, {
      kind: MEDIA_TOOL_KIND.FFPROBE,
      command: input.ffprobeCommand ?? 'ffprobe',
      status: MEDIA_TOOL_STATUS.AVAILABLE,
      exitCode: 0,
    }, 'ffprobe-output-shape-invalid');
  }
  const stream = parsed.streams.find((candidate) => isPlainRecord(candidate) && candidate.codec_type === 'video');
  if (!stream) {
    return malformedInspectionResult(source, {
      kind: MEDIA_TOOL_KIND.FFPROBE,
      command: input.ffprobeCommand ?? 'ffprobe',
      status: MEDIA_TOOL_STATUS.AVAILABLE,
      exitCode: 0,
    }, 'ffprobe-video-stream-missing');
  }

  const container = normalizedContainer(parsed.format.format_name);
  const sourceDetected = detectMediaType(source.relativePath);
  const mediaKind = container && IMAGE_CONTAINERS.has(container) ? MEDIA_KINDS.IMAGE : MEDIA_KINDS.VIDEO;
  const frame = frameTimingFor(stream);
  const codec = typeof stream.codec_name === 'string' && stream.codec_name.trim() !== ''
    ? stream.codec_name.trim().toLowerCase()
    : null;
  const metadata = normalizeMediaMetadata({
    fileName: path.basename(source.relativePath),
    extension: sourceDetected.extension,
    mimeType: sourceDetected.mimeType,
    byteSize: input.byteSize,
    durationSeconds: parseFiniteNumber(parsed.format.duration),
    width: parsePositiveNumber(stream.width),
    height: parsePositiveNumber(stream.height),
    fps: frame.fps,
    frameTiming: frame.frameTiming,
    timebase: frame.timebase,
    codec,
    container,
  }, {
    extension: sourceDetected.extension,
    mimeType: sourceDetected.mimeType,
  });
  const tool = {
    kind: MEDIA_TOOL_KIND.FFPROBE,
    command: input.ffprobeCommand ?? 'ffprobe',
    status: MEDIA_TOOL_STATUS.AVAILABLE,
    exitCode: 0,
  };
  const supportedCodecs = new Set(input.supportedVideoCodecs ?? DEFAULT_SUPPORTED_VIDEO_CODECS);
  const codecSupported = codecIsSupported(codec, mediaKind, supportedCodecs);
  if (codec !== null && !codecSupported) {
    return {
      schemaVersion: 1,
      status: MEDIA_OPERATION_STATUS.UNSUPPORTED_CODEC,
      inspectionStatus: INSPECTION_STATUS.UNPLAYABLE,
      playability: PLAYABILITY.UNPLAYABLE,
      compatibility: COMPATIBILITY.UNPLAYABLE,
      reason: 'unsupported-codec',
      mediaKind,
      format: sourceDetected.format,
      extension: sourceDetected.extension,
      mimeType: sourceDetected.mimeType,
      container,
      detection: cloneJson(sourceDetected),
      signature: null,
      metadata,
      warnings: ['The external probe identified a codec outside the configured playable codec policy.'],
      tool,
      sourceReference: source.sourceReference,
    };
  }

  const completeVideoMetadata = mediaKind === MEDIA_KINDS.VIDEO
    && metadata.durationSeconds !== null
    && metadata.width !== null
    && metadata.height !== null
    && metadata.fps !== null
    && metadata.frameTiming !== FRAME_TIMING.UNKNOWN
    && metadata.timebase !== null
    && metadata.codec !== null
    && metadata.container !== null;
  const completeImageMetadata = mediaKind === MEDIA_KINDS.IMAGE
    && metadata.width !== null
    && metadata.height !== null
    && metadata.codec !== null
    && metadata.container !== null;
  if (!completeVideoMetadata && !completeImageMetadata) {
    return {
      schemaVersion: 1,
      status: MEDIA_OPERATION_STATUS.METADATA_PENDING,
      inspectionStatus: INSPECTION_STATUS.METADATA_PENDING,
      playability: PLAYABILITY.UNKNOWN,
      compatibility: COMPATIBILITY.UNKNOWN,
      reason: 'metadata-incomplete',
      mediaKind,
      format: sourceDetected.format,
      extension: sourceDetected.extension,
      mimeType: sourceDetected.mimeType,
      container,
      detection: cloneJson(sourceDetected),
      signature: null,
      metadata,
      warnings: ['ffprobe completed but required duration, resolution, codec, frame timing, or timebase metadata is absent.'],
      tool,
      sourceReference: source.sourceReference,
    };
  }

  const needsNormalization = mediaKind === MEDIA_KINDS.VIDEO
    && (metadata.frameTiming === FRAME_TIMING.VFR || !codecSupported);
  return {
    schemaVersion: 1,
    status: MEDIA_OPERATION_STATUS.SUCCEEDED,
    inspectionStatus: INSPECTION_STATUS.INSPECTED,
    playability: needsNormalization ? PLAYABILITY.UNKNOWN : PLAYABILITY.PLAYABLE,
    compatibility: needsNormalization ? COMPATIBILITY.NEEDS_NORMALIZATION : COMPATIBILITY.DIRECT,
    reason: needsNormalization ? 'vfr-requires-normalization' : 'ffprobe-verified',
    mediaKind,
    format: sourceDetected.format,
    extension: sourceDetected.extension,
    mimeType: sourceDetected.mimeType,
    container,
    detection: cloneJson(sourceDetected),
    signature: null,
    metadata,
    warnings: needsNormalization
      ? ['Probe metadata is valid, but frame timing requires normalization before direct playback.']
      : [],
    tool,
    sourceReference: source.sourceReference,
  };
}

async function inspectWithFfprobe(adapter, input, { signal } = {}) {
  if (!adapter || typeof adapter.run !== 'function') {
    throw new MediaToolAdapterError('A media tool adapter is required', 'ADAPTER_REQUIRED');
  }
  const source = await resolveExecutionSourceLocation(input);
  const command = buildFfprobeCommand({ ...input, sourcePath: source.sourcePath });
  const execution = await adapter.run({
    tool: MEDIA_TOOL_KIND.FFPROBE,
    args: command.args,
    cwd: command.cwd,
    signal,
  });
  const tool = {
    kind: MEDIA_TOOL_KIND.FFPROBE,
    command: execution.command ?? command.command,
    status: execution.status,
    exitCode: execution.exitCode,
  };
  if (execution.status !== MEDIA_TOOL_STATUS.AVAILABLE) {
    return baseInspectionResult(
      source,
      tool,
      execution.status === MEDIA_TOOL_STATUS.CANCELLED
        ? MEDIA_OPERATION_STATUS.CANCELLED
        : execution.status,
      execution.status,
    );
  }
  return parseFfprobeOutput(execution.stdout, {
    ...input,
    ffprobeCommand: execution.command ?? command.command,
    byteSize: input.byteSize,
  });
}

function explicitVerification(value) {
  if (!isPlainRecord(value) || value.verified !== true
    || typeof value.verifiedAt !== 'string' || !Number.isFinite(Date.parse(value.verifiedAt))
    || !isPlainRecord(value.metadata) || Object.keys(value.metadata).length === 0) {
    return null;
  }
  return {
    verified: true,
    verifiedAt: value.verifiedAt,
    metadata: cloneJson(value.metadata),
    ...(value.checksumSha256 === undefined ? {} : { checksumSha256: value.checksumSha256 }),
  };
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('error', reject);
    stream.once('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Verify a normalized target with the same injected ffprobe boundary used for
 * inspection. A successful process exit alone is never enough: the output
 * must exist inside the project, be probeable, and be directly playable.
 */
async function verifyNormalizedOutputWithFfprobe(adapter, input, { signal, now = () => new Date().toISOString() } = {}) {
  requireRecord(input, 'Normalized verification input');
  const normalizedReference = createNormalizedReference(input.normalizedReference);
  const sourceInput = {
    projectRoot: input.projectRoot,
    sourceReference: normalizedReference.relativePath,
    sourcePath: input.targetPath ?? resolveProjectRelativePath(input.projectRoot, normalizedReference.relativePath),
  };
  let source;
  try {
    source = await resolveExecutionSourceLocation(sourceInput);
  } catch (error) {
    return {
      verified: false,
      reason: 'normalized-output-unavailable',
      errorCode: error?.code ?? 'TARGET_UNAVAILABLE',
    };
  }
  const stats = await fs.stat(source.sourcePath).catch(() => null);
  if (!stats) {
    return { verified: false, reason: 'normalized-output-unavailable', errorCode: 'TARGET_UNAVAILABLE' };
  }
  if (!stats?.isFile()) {
    return { verified: false, reason: 'normalized-output-not-a-file', errorCode: 'TARGET_NOT_A_FILE' };
  }
  const inspection = await inspectWithFfprobe(adapter, {
    ...sourceInput,
    sourcePath: source.sourcePath,
    byteSize: stats.size,
  }, { signal });
  if (inspection.status !== MEDIA_OPERATION_STATUS.SUCCEEDED
    || inspection.inspectionStatus !== INSPECTION_STATUS.INSPECTED
    || inspection.compatibility !== COMPATIBILITY.DIRECT
    || inspection.playability !== PLAYABILITY.PLAYABLE) {
    return {
      verified: false,
      reason: 'normalized-output-not-direct-playable',
      errorCode: inspection.status,
      inspection,
    };
  }
  let checksumSha256;
  try {
    checksumSha256 = await hashFile(source.sourcePath);
  } catch (error) {
    return {
      verified: false,
      reason: 'normalized-output-checksum-failed',
      errorCode: error?.code ?? 'CHECKSUM_FAILED',
      inspection,
    };
  }
  return {
    verified: true,
    verifiedAt: now(),
    checksumSha256,
    metadata: {
      ...inspection.metadata,
      byteSize: stats.size,
    },
    inspection,
  };
}

async function normalizeWithFfmpeg(adapter, input, {
  signal,
  verifyOutput,
  prepareTargetDirectory = false,
} = {}) {
  if (!adapter || typeof adapter.run !== 'function') {
    throw new MediaToolAdapterError('A media tool adapter is required', 'ADAPTER_REQUIRED');
  }
  const source = await resolveExecutionSourceLocation(input);
  const target = createNormalizedCopyTarget({ ...input, sourcePath: source.sourcePath });
  await assertNormalizationTargetSafe(target);
  if (prepareTargetDirectory === true) {
    await fs.mkdir(path.dirname(target.targetPath), { recursive: true });
    await assertNormalizationTargetSafe(target);
  }
  const command = buildFfmpegCommand({ ...input, sourcePath: source.sourcePath });
  const execution = await adapter.run({
    tool: MEDIA_TOOL_KIND.FFMPEG,
    args: command.args,
    cwd: command.cwd,
    signal,
  });
  const tool = {
    kind: MEDIA_TOOL_KIND.FFMPEG,
    command: execution.command ?? command.command,
    status: execution.status,
    exitCode: execution.exitCode,
  };
  const base = {
    sourceReference: target.sourceReference,
    normalizedReference: target.normalizedReference,
    tool,
  };
  if (execution.status !== MEDIA_TOOL_STATUS.AVAILABLE) {
    return {
      ...base,
      status: execution.status === MEDIA_TOOL_STATUS.CANCELLED
        ? MEDIA_OPERATION_STATUS.CANCELLED
        : execution.status,
      reason: execution.errorCode ?? execution.status,
    };
  }
  if (typeof verifyOutput !== 'function') {
    return {
      ...base,
      status: MEDIA_OPERATION_STATUS.VERIFICATION_PENDING,
      reason: 'normalized-output-verification-not-injected',
    };
  }
  if (signal?.aborted) {
    return { ...base, status: MEDIA_OPERATION_STATUS.CANCELLED, reason: 'cancelled' };
  }
  let verificationCandidate;
  try {
    verificationCandidate = await verifyOutput({
      sourceReference: target.sourceReference,
      normalizedReference: target.normalizedReference,
      targetPath: target.targetPath,
      signal,
    });
  } catch (error) {
    if (isCancellationError(error, signal)) {
      return { ...base, status: MEDIA_OPERATION_STATUS.CANCELLED, reason: 'cancelled' };
    }
    return {
      ...base,
      status: MEDIA_OPERATION_STATUS.VERIFICATION_FAILED,
      reason: 'normalized-output-verification-failed',
      errorCode: typeof error?.code === 'string' ? error.code : 'VERIFICATION_FAILED',
    };
  }
  const verification = explicitVerification(verificationCandidate);
  if (verification === null) {
    return {
      ...base,
      status: MEDIA_OPERATION_STATUS.VERIFICATION_PENDING,
      reason: 'explicit-verification-evidence-required',
    };
  }
  const metadata = normalizeMediaMetadata({
    ...verification.metadata,
    fileName: verification.metadata.fileName ?? path.basename(target.normalizedReference.relativePath),
    extension: verification.metadata.extension ?? '.mp4',
    mimeType: verification.metadata.mimeType ?? 'video/mp4',
    container: verification.metadata.container ?? 'mp4',
  }, { extension: '.mp4', mimeType: 'video/mp4' });
  return {
    ...base,
    status: MEDIA_OPERATION_STATUS.SUCCEEDED,
    reason: 'ffmpeg-output-verified',
    metadata,
    verification: {
      ...verification,
      metadata,
    },
  };
}

function operationError(result, fallbackCode, fallbackMessage) {
  return {
    code: result?.errorCode ?? result?.status ?? fallbackCode,
    message: result?.reason ?? fallbackMessage,
  };
}

function isRecoverableOperation(result) {
  return [
    MEDIA_OPERATION_STATUS.TOOL_MISSING,
    MEDIA_OPERATION_STATUS.PROCESS_FAILED,
    MEDIA_OPERATION_STATUS.MALFORMED_OUTPUT,
    MEDIA_OPERATION_STATUS.METADATA_PENDING,
    MEDIA_OPERATION_STATUS.VERIFICATION_PENDING,
    MEDIA_OPERATION_STATUS.VERIFICATION_FAILED,
  ].includes(result?.status);
}

function abortJob(current, now) {
  const requested = requestNormalizationCancellation(current, { at: now() });
  return cancelNormalizationJob(requested, { at: now() });
}

/**
 * Run the adapter seam against the existing persisted job contract. The
 * function only completes after ffprobe metadata, FFmpeg exit, and injected
 * output verification all produce explicit evidence. Every failure retains
 * the original source reference and maps tool failures to recoverable job
 * state where retry can safely be attempted.
 */
async function runNormalizationJobWithAdapter(input, { signal, now = () => new Date().toISOString() } = {}) {
  requireRecord(input, 'Normalization adapter input');
  if (!input.job || !input.adapter) {
    throw new MediaToolAdapterError('job and adapter are required', 'JOB_ADAPTER_REQUIRED');
  }
  let current = startNormalizationJob(input.job, { at: now() });
  let inspection = null;
  let normalization = null;
  const result = () => ({ job: current, inspection, normalization });

  if (signal?.aborted) {
    current = abortJob(current, now);
    return result();
  }

  inspection = await inspectWithFfprobe(input.adapter, {
    projectRoot: input.projectRoot,
    sourceReference: input.sourceReference,
    sourcePath: input.sourcePath,
    realPath: input.realPath,
    byteSize: input.byteSize,
    supportedVideoCodecs: input.supportedVideoCodecs,
  }, { signal });
  if (inspection.status === MEDIA_OPERATION_STATUS.CANCELLED || signal?.aborted) {
    current = abortJob(current, now);
    return result();
  }
  if (inspection.status !== MEDIA_OPERATION_STATUS.SUCCEEDED
    || inspection.inspectionStatus !== INSPECTION_STATUS.INSPECTED) {
    current = failNormalizationJob(current, {
      at: now(),
      recoverable: isRecoverableOperation(inspection),
      error: operationError(inspection, 'INSPECTION_FAILED', 'Media inspection did not produce verified metadata'),
    });
    return result();
  }

  current = advanceNormalizationJob(current, { at: now() });
  normalization = await normalizeWithFfmpeg(input.adapter, {
    projectRoot: input.projectRoot,
    sourceReference: input.sourceReference,
    sourcePath: input.sourcePath,
    realPath: input.realPath,
    assetId: input.assetId ?? current.assetId,
    targetRelativePath: input.targetRelativePath,
  }, {
    signal,
    verifyOutput: input.verifyOutput,
    prepareTargetDirectory: input.prepareTargetDirectory === true,
  });
  if (normalization.status === MEDIA_OPERATION_STATUS.CANCELLED || signal?.aborted) {
    current = abortJob(current, now);
    return result();
  }
  if (normalization.status !== MEDIA_OPERATION_STATUS.SUCCEEDED) {
    current = failNormalizationJob(current, {
      at: now(),
      recoverable: isRecoverableOperation(normalization),
      error: operationError(normalization, 'NORMALIZATION_FAILED', 'Normalization did not produce verified output'),
    });
    return result();
  }

  current = advanceNormalizationJob(current, { at: now() });
  current = advanceNormalizationJob(current, { at: now() });
  current = completeNormalizationJob(current, {
    at: now(),
    normalizedReference: normalization.normalizedReference,
    verification: normalization.verification,
  });
  return result();
}

/**
 * Execute the complete normalization seam with local ffprobe/FFmpeg
 * processes. Missing tools, non-zero exits, malformed probe output, and
 * unverified output remain explicit job states; this helper never fabricates
 * a normalized asset when the external tools are unavailable.
 */
async function runNormalizationJobWithLocalTools(input, options = {}) {
  requireRecord(input, 'Local normalization input');
  const adapter = input.adapter ?? createLocalMediaToolAdapter(input.toolOptions ?? input);
  const now = options.now ?? (() => new Date().toISOString());
  const verifyOutput = input.verifyOutput ?? ((context) => verifyNormalizedOutputWithFfprobe(
    adapter,
    {
      projectRoot: input.projectRoot,
      normalizedReference: context.normalizedReference,
      targetPath: context.targetPath,
    },
    { signal: context.signal, now },
  ));
  return runNormalizationJobWithAdapter({
    ...input,
    adapter,
    verifyOutput,
    prepareTargetDirectory: input.prepareTargetDirectory ?? true,
  }, options);
}

module.exports = Object.freeze({
  DEFAULT_SUPPORTED_IMAGE_CODECS,
  DEFAULT_SUPPORTED_VIDEO_CODECS,
  MEDIA_OPERATION_STATUS,
  MEDIA_TOOL_KIND,
  MEDIA_TOOL_STATUS,
  MediaToolAdapterError,
  buildFfmpegCommand,
  buildFfprobeCommand,
  createLocalMediaToolAdapter,
  createLocalMediaToolRunner,
  createMediaToolAdapter,
  createNormalizedCopyTarget,
  discoverLocalMediaTools,
  inspectWithFfprobe,
  normalizeWithFfmpeg,
  parseFfprobeOutput,
  probeMediaToolVersion,
  runNormalizationJobWithAdapter,
  runNormalizationJobWithLocalTools,
  verifyNormalizedOutputWithFfprobe,
});
