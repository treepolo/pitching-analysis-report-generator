'use strict';

/**
 * Frame cache bridge contract v1.
 *
 * Bridge methods are intentionally data-only. The renderer sends a project
 * and asset identity, never an absolute path or executable command; the main
 * process resolves the project-local source and owns FFmpeg/cancellation.
 *
 *   prepareFrameCache(request) -> FrameCacheResponse
 *   readFrameCache(request)    -> FrameCacheResponse
 *   cleanupFrameCache(request) -> FrameCacheCleanupResponse
 *   cancelFrameCache(request)  -> { schemaVersion, requestId, accepted }
 *
 * `frames[].relativePath`, `cache.rootRelativePath`, and all cache paths are
 * project-relative POSIX paths. A ready response is the only response that
 * may contain frames; non-ready responses must expose an explicit status and
 * an error where the operation failed. Absolute paths, temporary paths, and
 * tool diagnostics are never part of this public response schema.
 */

const FRAME_CACHE_CONTRACT_VERSION = 1;
const FRAME_CACHE_BRIDGE_METHODS = Object.freeze({
  PREPARE: 'prepareFrameCache',
  READ: 'readFrameCache',
  CLEANUP: 'cleanupFrameCache',
  CANCEL: 'cancelFrameCache',
});

const FRAME_CACHE_RESPONSE_STATUS = Object.freeze({
  PREPARING: 'preparing',
  READY: 'ready',
  CACHE_MISS: 'cache-miss',
  TOOL_MISSING: 'tool-missing',
  PROCESS_FAILED: 'process-failed',
  MALFORMED_OUTPUT: 'malformed-output',
  CANCELLED: 'cancelled',
  SOURCE_UNAVAILABLE: 'source-unavailable',
  CACHE_ERROR: 'cache-error',
});

const FRAME_CACHE_ERROR_CODES = Object.freeze({
  REQUEST_INVALID: 'REQUEST_INVALID',
  SOURCE_REFERENCE_INVALID: 'SOURCE_REFERENCE_INVALID',
  SOURCE_IDENTITY_INVALID: 'SOURCE_IDENTITY_INVALID',
  CACHE_REFERENCE_INVALID: 'CACHE_REFERENCE_INVALID',
  FRAME_INDEX_INVALID: 'FRAME_INDEX_INVALID',
  RESPONSE_INVALID: 'RESPONSE_INVALID',
  ERROR_REQUIRED: 'ERROR_REQUIRED',
});

const READY_STATUS = FRAME_CACHE_RESPONSE_STATUS.READY;
const NON_READY_STATUSES = new Set(Object.values(FRAME_CACHE_RESPONSE_STATUS).filter((value) => value !== READY_STATUS));
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/iu;
const SAFE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u;

class FrameCacheContractError extends Error {
  constructor(message, code = FRAME_CACHE_ERROR_CODES.RESPONSE_INVALID) {
    super(message);
    this.name = 'FrameCacheContractError';
    this.code = code;
  }
}

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireRecord(value, name) {
  if (!isRecord(value)) throw new FrameCacheContractError(`${name} must be an object`, FRAME_CACHE_ERROR_CODES.REQUEST_INVALID);
  return value;
}

function requireText(value, name, { maxLength = 500 } = {}) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength || CONTROL_CHARACTER_PATTERN.test(value)) {
    throw new FrameCacheContractError(`${name} is invalid`, FRAME_CACHE_ERROR_CODES.REQUEST_INVALID);
  }
  return value;
}

function normalizeProjectRelativePath(value, name) {
  const raw = requireText(value, name, { maxLength: 2048 }).replaceAll('\\', '/');
  if (raw.startsWith('/') || /^[a-zA-Z]:\//u.test(raw) || raw.startsWith('//')) {
    throw new FrameCacheContractError(`${name} must be project-relative`, FRAME_CACHE_ERROR_CODES.CACHE_REFERENCE_INVALID);
  }
  const segments = raw.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new FrameCacheContractError(`${name} must not contain traversal`, FRAME_CACHE_ERROR_CODES.CACHE_REFERENCE_INVALID);
  }
  return segments.join('/');
}

function normalizeSourceIdentity(value) {
  requireRecord(value, 'sourceIdentity');
  const relativePath = normalizeProjectRelativePath(value.relativePath, 'sourceIdentity.relativePath');
  if (!SHA256_PATTERN.test(value.checksumSha256)) {
    throw new FrameCacheContractError('sourceIdentity.checksumSha256 is invalid', FRAME_CACHE_ERROR_CODES.SOURCE_IDENTITY_INVALID);
  }
  if (!Number.isInteger(value.byteSize) || value.byteSize < 0) {
    throw new FrameCacheContractError('sourceIdentity.byteSize is invalid', FRAME_CACHE_ERROR_CODES.SOURCE_IDENTITY_INVALID);
  }
  if (typeof value.mtimeMs !== 'number' || !Number.isFinite(value.mtimeMs) || value.mtimeMs < 0) {
    throw new FrameCacheContractError('sourceIdentity.mtimeMs is invalid', FRAME_CACHE_ERROR_CODES.SOURCE_IDENTITY_INVALID);
  }
  return {
    relativePath,
    checksumSha256: value.checksumSha256.toLowerCase(),
    byteSize: value.byteSize,
    mtimeMs: value.mtimeMs,
  };
}

function normalizeSourceReference(value) {
  requireRecord(value, 'sourceReference');
  const normalized = {
    relativePath: normalizeProjectRelativePath(value.relativePath, 'sourceReference.relativePath'),
  };
  if (value.checksumSha256 !== undefined) {
    if (!SHA256_PATTERN.test(value.checksumSha256)) {
      throw new FrameCacheContractError('sourceReference.checksumSha256 is invalid', FRAME_CACHE_ERROR_CODES.SOURCE_IDENTITY_INVALID);
    }
    normalized.checksumSha256 = value.checksumSha256.toLowerCase();
  }
  if (value.byteSize !== undefined) {
    if (!Number.isInteger(value.byteSize) || value.byteSize < 0) {
      throw new FrameCacheContractError('sourceReference.byteSize is invalid', FRAME_CACHE_ERROR_CODES.SOURCE_IDENTITY_INVALID);
    }
    normalized.byteSize = value.byteSize;
  }
  return normalized;
}

function normalizeRequest(input) {
  requireRecord(input, 'frame cache request');
  const operation = input.operation ?? FRAME_CACHE_BRIDGE_METHODS.PREPARE;
  if (![FRAME_CACHE_BRIDGE_METHODS.PREPARE, FRAME_CACHE_BRIDGE_METHODS.READ, FRAME_CACHE_BRIDGE_METHODS.CLEANUP, FRAME_CACHE_BRIDGE_METHODS.CANCEL].includes(operation)) {
    throw new FrameCacheContractError('frame cache operation is invalid', FRAME_CACHE_ERROR_CODES.REQUEST_INVALID);
  }
  const request = {
    schemaVersion: FRAME_CACHE_CONTRACT_VERSION,
    operation,
    requestId: requireText(input.requestId, 'requestId', { maxLength: 128 }),
    projectId: requireText(input.projectId, 'projectId', { maxLength: 128 }),
    assetId: requireText(input.assetId, 'assetId', { maxLength: 128 }),
  };
  if (!SAFE_ID_PATTERN.test(request.projectId) || !SAFE_ID_PATTERN.test(request.assetId)) {
    throw new FrameCacheContractError('projectId or assetId is unsafe', FRAME_CACHE_ERROR_CODES.REQUEST_INVALID);
  }
  if (operation !== FRAME_CACHE_BRIDGE_METHODS.CANCEL && input.sourceReference !== undefined) {
    request.sourceReference = normalizeSourceReference(input.sourceReference);
  }
  if (operation === FRAME_CACHE_BRIDGE_METHODS.PREPARE && !request.sourceReference) {
    throw new FrameCacheContractError('prepareFrameCache requires sourceReference', FRAME_CACHE_ERROR_CODES.SOURCE_REFERENCE_INVALID);
  }
  if (input.cacheKey !== undefined) {
    if (typeof input.cacheKey !== 'string' || !/^[a-f0-9]{64}$/iu.test(input.cacheKey)) {
      throw new FrameCacheContractError('cacheKey is invalid', FRAME_CACHE_ERROR_CODES.CACHE_REFERENCE_INVALID);
    }
    request.cacheKey = input.cacheKey.toLowerCase();
  }
  return request;
}

function normalizeCacheDescriptor(value) {
  if (value === null) return null;
  requireRecord(value, 'cache');
  if (typeof value.key !== 'string' || !/^[a-f0-9]{64}$/iu.test(value.key)) {
    throw new FrameCacheContractError('cache.key is invalid', FRAME_CACHE_ERROR_CODES.CACHE_REFERENCE_INVALID);
  }
  return {
    key: value.key.toLowerCase(),
    rootRelativePath: normalizeProjectRelativePath(value.rootRelativePath, 'cache.rootRelativePath'),
    indexRelativePath: normalizeProjectRelativePath(value.indexRelativePath, 'cache.indexRelativePath'),
    frameDirectoryRelativePath: normalizeProjectRelativePath(value.frameDirectoryRelativePath, 'cache.frameDirectoryRelativePath'),
    format: value.format === 'png' ? 'png' : (() => {
      throw new FrameCacheContractError('cache.format is invalid', FRAME_CACHE_ERROR_CODES.CACHE_REFERENCE_INVALID);
    })(),
  };
}

function normalizeMetadata(value) {
  if (value === null) return null;
  requireRecord(value, 'metadata');
  const numericNullable = (field) => value[field] === null ? null : (
    typeof value[field] === 'number' && Number.isFinite(value[field]) ? value[field] : (() => {
      throw new FrameCacheContractError(`metadata.${field} is invalid`, FRAME_CACHE_ERROR_CODES.RESPONSE_INVALID);
    })()
  );
  const integerNullable = (field) => value[field] === null ? null : (
    Number.isInteger(value[field]) && value[field] >= 0 ? value[field] : (() => {
      throw new FrameCacheContractError(`metadata.${field} is invalid`, FRAME_CACHE_ERROR_CODES.RESPONSE_INVALID);
    })()
  );
  if (!['cfr', 'vfr', 'unknown'].includes(value.frameTiming)) {
    throw new FrameCacheContractError('metadata.frameTiming is invalid', FRAME_CACHE_ERROR_CODES.RESPONSE_INVALID);
  }
  return {
    durationSeconds: numericNullable('durationSeconds'),
    width: integerNullable('width'),
    height: integerNullable('height'),
    fps: numericNullable('fps'),
    averageFps: numericNullable('averageFps'),
    rawFps: numericNullable('rawFps'),
    frameTiming: value.frameTiming,
    timebase: value.timebase === null ? null : requireText(value.timebase, 'metadata.timebase', { maxLength: 32 }),
    frameCount: integerNullable('frameCount'),
  };
}

function normalizeFrame(value, index) {
  requireRecord(value, `frames[${index}]`);
  if (value.frameNumber !== index) {
    throw new FrameCacheContractError(`frames[${index}].frameNumber is not ordered`, FRAME_CACHE_ERROR_CODES.FRAME_INDEX_INVALID);
  }
  const numericNullable = (field) => value[field] === null ? null : (
    typeof value[field] === 'number' && Number.isFinite(value[field]) ? value[field] : (() => {
      throw new FrameCacheContractError(`frames[${index}].${field} is invalid`, FRAME_CACHE_ERROR_CODES.FRAME_INDEX_INVALID);
    })()
  );
  const integerNullable = (field) => value[field] === null ? null : (
    Number.isInteger(value[field]) && value[field] >= 0 ? value[field] : (() => {
      throw new FrameCacheContractError(`frames[${index}].${field} is invalid`, FRAME_CACHE_ERROR_CODES.FRAME_INDEX_INVALID);
    })()
  );
  return {
    frameNumber: index,
    pts: numericNullable('pts'),
    time: numericNullable('time'),
    width: integerNullable('width'),
    height: integerNullable('height'),
    relativePath: normalizeProjectRelativePath(value.relativePath, `frames[${index}].relativePath`),
  };
}

function normalizeError(value, required) {
  if (value === null || value === undefined) {
    if (required) throw new FrameCacheContractError('error is required for this status', FRAME_CACHE_ERROR_CODES.ERROR_REQUIRED);
    return null;
  }
  requireRecord(value, 'error');
  return {
    code: requireText(value.code, 'error.code', { maxLength: 120 }),
    message: requireText(value.message, 'error.message', { maxLength: 1000 }),
  };
}

function normalizeResponse(input) {
  requireRecord(input, 'frame cache response');
  if (input.schemaVersion !== FRAME_CACHE_CONTRACT_VERSION) {
    throw new FrameCacheContractError('frame cache response schemaVersion is unsupported', FRAME_CACHE_ERROR_CODES.RESPONSE_INVALID);
  }
  if (!Object.values(FRAME_CACHE_RESPONSE_STATUS).includes(input.status)) {
    throw new FrameCacheContractError('frame cache response status is invalid', FRAME_CACHE_ERROR_CODES.RESPONSE_INVALID);
  }
  const ready = input.status === READY_STATUS;
  const frames = Array.isArray(input.frames) ? input.frames.map(normalizeFrame) : [];
  if (ready && frames.length === 0) {
    throw new FrameCacheContractError('ready response requires frames', FRAME_CACHE_ERROR_CODES.FRAME_INDEX_INVALID);
  }
  if (!ready && frames.length > 0) {
    throw new FrameCacheContractError('non-ready response cannot expose frames', FRAME_CACHE_ERROR_CODES.FRAME_INDEX_INVALID);
  }
  const error = normalizeError(input.error, NON_READY_STATUSES.has(input.status) && ![FRAME_CACHE_RESPONSE_STATUS.PREPARING, FRAME_CACHE_RESPONSE_STATUS.CACHE_MISS].includes(input.status));
  if (ready && error !== null) {
    throw new FrameCacheContractError('ready response cannot contain an error', FRAME_CACHE_ERROR_CODES.RESPONSE_INVALID);
  }
  return {
    schemaVersion: FRAME_CACHE_CONTRACT_VERSION,
    requestId: requireText(input.requestId, 'requestId', { maxLength: 128 }),
    projectId: requireText(input.projectId, 'projectId', { maxLength: 128 }),
    assetId: requireText(input.assetId, 'assetId', { maxLength: 128 }),
    status: input.status,
    sourceIdentity: input.sourceIdentity === null ? null : normalizeSourceIdentity(input.sourceIdentity),
    cache: normalizeCacheDescriptor(input.cache),
    metadata: normalizeMetadata(input.metadata),
    frames,
    reused: input.reused === true,
    progress: input.progress === null || input.progress === undefined ? null : requireRecord(input.progress, 'progress'),
    error,
  };
}

function createCleanupResponse(input) {
  requireRecord(input, 'frame cache cleanup response');
  if (input.schemaVersion !== FRAME_CACHE_CONTRACT_VERSION) throw new FrameCacheContractError('cleanup schemaVersion is unsupported');
  return {
    schemaVersion: FRAME_CACHE_CONTRACT_VERSION,
    requestId: requireText(input.requestId, 'requestId', { maxLength: 128 }),
    projectId: requireText(input.projectId, 'projectId', { maxLength: 128 }),
    assetId: requireText(input.assetId, 'assetId', { maxLength: 128 }),
    status: input.status === 'cleaned' ? 'cleaned' : 'cleanup-failed',
    error: input.status === 'cleaned' ? null : normalizeError(input.error, true),
  };
}

function createCancelResponse(input) {
  requireRecord(input, 'frame cache cancel response');
  if (input.schemaVersion !== FRAME_CACHE_CONTRACT_VERSION) throw new FrameCacheContractError('cancel schemaVersion is unsupported');
  return {
    schemaVersion: FRAME_CACHE_CONTRACT_VERSION,
    requestId: requireText(input.requestId, 'requestId', { maxLength: 128 }),
    accepted: input.accepted === true,
  };
}

module.exports = Object.freeze({
  FRAME_CACHE_BRIDGE_METHODS,
  FRAME_CACHE_CONTRACT_VERSION,
  FRAME_CACHE_ERROR_CODES,
  FRAME_CACHE_RESPONSE_STATUS,
  FrameCacheContractError,
  createCancelResponse,
  createCleanupResponse,
  normalizeFrameCacheRequest: normalizeRequest,
  normalizeFrameCacheResponse: normalizeResponse,
});
