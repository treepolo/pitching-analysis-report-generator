'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Sandboxed Electron preloads can require Electron's bridge modules, but they
// cannot load project-local CommonJS modules. Keep this small, data-only
// contract mirror local to the preload; the main process remains authoritative
// for source resolution, cache identity, and filesystem safety.
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
const FRAME_CACHE_READY_STATUS = FRAME_CACHE_RESPONSE_STATUS.READY;
const FRAME_CACHE_NON_READY_STATUSES = new Set(
  Object.values(FRAME_CACHE_RESPONSE_STATUS).filter((value) => value !== FRAME_CACHE_READY_STATUS),
);

const PROJECT_ID_PATTERN = /^[a-z0-9-]{1,80}$/u;
const MEDIA_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u;
const EXPORT_JOB_ID_PATTERN = /^[0-9a-f-]{36}$/iu;
const FRAME_CACHE_REQUEST_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u;
const FRAME_CACHE_KEY_PATTERN = /^[a-f0-9]{64}$/iu;
const NATIVE_PLAYER_SESSION_ID_PATTERN = /^[0-9a-f-]{36}$/iu;
const NATIVE_PLAYER_REQUEST_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u;
const NATIVE_PLAYER_SURFACE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/u;
const EXPORT_OUTPUT_KINDS = new Set(['folder', 'zip', 'both']);
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;
const closeCallbacks = new Set();

// Electron sandboxed preloads do not expose Node built-ins such as
// `node:crypto`. Prefer the Web Crypto API and retain a small local fallback
// so the bridge can initialize in both sandboxed and unsandboxed runtimes.
function createRequestId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `request-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function isFrameCacheRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireFrameCacheRecord(value, name) {
  if (!isFrameCacheRecord(value)) throw new Error(`${name} must be an object`);
  return value;
}

function requireFrameCacheText(value, name, maxLength = 500) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength
    || CONTROL_CHARACTER_PATTERN.test(value)) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

function normalizeFrameCacheRelativePath(value, name) {
  const raw = requireFrameCacheText(value, name, 2048).replaceAll('\\', '/');
  if (raw.startsWith('/') || /^[a-zA-Z]:\//u.test(raw) || raw.startsWith('//')) {
    throw new Error(`${name} must be project-relative`);
  }
  const segments = raw.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`${name} must not contain traversal`);
  }
  return segments.join('/');
}

function normalizeFrameCacheSourceIdentity(value) {
  requireFrameCacheRecord(value, 'sourceIdentity');
  const relativePath = normalizeFrameCacheRelativePath(value.relativePath, 'sourceIdentity.relativePath');
  if (!/^[a-f0-9]{64}$/iu.test(value.checksumSha256)) {
    throw new Error('sourceIdentity.checksumSha256 is invalid');
  }
  if (!Number.isInteger(value.byteSize) || value.byteSize < 0) {
    throw new Error('sourceIdentity.byteSize is invalid');
  }
  if (typeof value.mtimeMs !== 'number' || !Number.isFinite(value.mtimeMs) || value.mtimeMs < 0) {
    throw new Error('sourceIdentity.mtimeMs is invalid');
  }
  return {
    relativePath,
    checksumSha256: value.checksumSha256.toLowerCase(),
    byteSize: value.byteSize,
    mtimeMs: value.mtimeMs,
  };
}

function normalizeFrameCacheDescriptor(value) {
  if (value === null) return null;
  requireFrameCacheRecord(value, 'cache');
  if (typeof value.key !== 'string' || !/^[a-f0-9]{64}$/iu.test(value.key)) {
    throw new Error('cache.key is invalid');
  }
  return {
    key: value.key.toLowerCase(),
    rootRelativePath: normalizeFrameCacheRelativePath(value.rootRelativePath, 'cache.rootRelativePath'),
    indexRelativePath: normalizeFrameCacheRelativePath(value.indexRelativePath, 'cache.indexRelativePath'),
    frameDirectoryRelativePath: normalizeFrameCacheRelativePath(
      value.frameDirectoryRelativePath,
      'cache.frameDirectoryRelativePath',
    ),
    format: value.format === 'png' ? 'png' : (() => { throw new Error('cache.format is invalid'); })(),
  };
}

function normalizeFrameCacheMetadata(value) {
  if (value === null) return null;
  requireFrameCacheRecord(value, 'metadata');
  const numericNullable = (field) => value[field] === null ? null : (
    typeof value[field] === 'number' && Number.isFinite(value[field])
      ? value[field]
      : (() => { throw new Error(`metadata.${field} is invalid`); })()
  );
  const integerNullable = (field) => value[field] === null ? null : (
    Number.isInteger(value[field]) && value[field] >= 0
      ? value[field]
      : (() => { throw new Error(`metadata.${field} is invalid`); })()
  );
  if (!['cfr', 'vfr', 'unknown'].includes(value.frameTiming)) {
    throw new Error('metadata.frameTiming is invalid');
  }
  return {
    durationSeconds: numericNullable('durationSeconds'),
    width: integerNullable('width'),
    height: integerNullable('height'),
    fps: numericNullable('fps'),
    averageFps: numericNullable('averageFps'),
    rawFps: numericNullable('rawFps'),
    frameTiming: value.frameTiming,
    timebase: value.timebase === null ? null : requireFrameCacheText(value.timebase, 'metadata.timebase', 32),
    frameCount: integerNullable('frameCount'),
  };
}

function normalizeFrameCacheFrame(value, index) {
  requireFrameCacheRecord(value, `frames[${index}]`);
  if (value.frameNumber !== index) throw new Error(`frames[${index}].frameNumber is not ordered`);
  const numericNullable = (field) => value[field] === null ? null : (
    typeof value[field] === 'number' && Number.isFinite(value[field])
      ? value[field]
      : (() => { throw new Error(`frames[${index}].${field} is invalid`); })()
  );
  const integerNullable = (field) => value[field] === null ? null : (
    Number.isInteger(value[field]) && value[field] >= 0
      ? value[field]
      : (() => { throw new Error(`frames[${index}].${field} is invalid`); })()
  );
  return {
    frameNumber: index,
    pts: numericNullable('pts'),
    time: numericNullable('time'),
    width: integerNullable('width'),
    height: integerNullable('height'),
    relativePath: normalizeFrameCacheRelativePath(value.relativePath, `frames[${index}].relativePath`),
  };
}

function normalizeFrameCacheError(value, required) {
  if (value === null || value === undefined) {
    if (required) throw new Error('error is required for this status');
    return null;
  }
  requireFrameCacheRecord(value, 'error');
  return {
    code: requireFrameCacheText(value.code, 'error.code', 120),
    message: requireFrameCacheText(value.message, 'error.message', 1000),
  };
}

function normalizeFrameCacheResponse(input) {
  requireFrameCacheRecord(input, 'frame cache response');
  if (input.schemaVersion !== FRAME_CACHE_CONTRACT_VERSION) throw new Error('Unsupported frame cache schema version');
  if (!Object.values(FRAME_CACHE_RESPONSE_STATUS).includes(input.status)) throw new Error('Invalid frame cache status');
  const ready = input.status === FRAME_CACHE_READY_STATUS;
  const frames = Array.isArray(input.frames) ? input.frames.map(normalizeFrameCacheFrame) : [];
  if (ready && frames.length === 0) throw new Error('Ready response requires frames');
  if (!ready && frames.length > 0) throw new Error('Non-ready response cannot expose frames');
  const error = normalizeFrameCacheError(
    input.error,
    FRAME_CACHE_NON_READY_STATUSES.has(input.status)
      && ![FRAME_CACHE_RESPONSE_STATUS.PREPARING, FRAME_CACHE_RESPONSE_STATUS.CACHE_MISS].includes(input.status),
  );
  if (ready && error !== null) throw new Error('Ready response cannot contain an error');
  return {
    schemaVersion: FRAME_CACHE_CONTRACT_VERSION,
    requestId: requireFrameCacheText(input.requestId, 'requestId', 128),
    projectId: requireFrameCacheText(input.projectId, 'projectId', 128),
    assetId: requireFrameCacheText(input.assetId, 'assetId', 128),
    status: input.status,
    sourceIdentity: input.sourceIdentity === null ? null : normalizeFrameCacheSourceIdentity(input.sourceIdentity),
    cache: normalizeFrameCacheDescriptor(input.cache),
    metadata: normalizeFrameCacheMetadata(input.metadata),
    frames,
    reused: input.reused === true,
    progress: input.progress === null || input.progress === undefined
      ? null
      : requireFrameCacheRecord(input.progress, 'progress'),
    error,
  };
}

function createCleanupResponse(input) {
  requireFrameCacheRecord(input, 'frame cache cleanup response');
  if (input.schemaVersion !== FRAME_CACHE_CONTRACT_VERSION) throw new Error('Unsupported cleanup schema version');
  return {
    schemaVersion: FRAME_CACHE_CONTRACT_VERSION,
    requestId: requireFrameCacheText(input.requestId, 'requestId', 128),
    projectId: requireFrameCacheText(input.projectId, 'projectId', 128),
    assetId: requireFrameCacheText(input.assetId, 'assetId', 128),
    status: input.status === 'cleaned' ? 'cleaned' : 'cleanup-failed',
    error: input.status === 'cleaned' ? null : normalizeFrameCacheError(input.error, true),
  };
}

function createCancelResponse(input) {
  requireFrameCacheRecord(input, 'frame cache cancel response');
  if (input.schemaVersion !== FRAME_CACHE_CONTRACT_VERSION) throw new Error('Unsupported cancel schema version');
  return {
    schemaVersion: FRAME_CACHE_CONTRACT_VERSION,
    requestId: requireFrameCacheText(input.requestId, 'requestId', 128),
    accepted: input.accepted === true,
  };
}

const syncApi = Object.freeze({
  alignComparisonAtRelativeTime: (sides, relativeTime, options) => ipcRenderer.invoke('sync:align', {
    sides,
    relativeTime,
    options,
  }),
  captureAnchor: (input) => ipcRenderer.invoke('sync:capture', input),
  createPlayerBlock: (input) => ipcRenderer.invoke('sync:create-player', input),
  mapAnchorToRelativeTime: (anchor, relativeTime, options) => ipcRenderer.invoke('sync:map-anchor', {
    anchor,
    relativeTime,
    options,
  }),
  planFrameStep: (input) => ipcRenderer.invoke('sync:frame-step', input),
});

function assertProjectId(value) {
  if (typeof value !== 'string' || !PROJECT_ID_PATTERN.test(value)) {
    throw new Error('Invalid project id');
  }
  return value;
}

function assertDisplayName(value) {
  if (typeof value !== 'string') throw new Error('Display name must be text');
  const name = value.trim();
  if (!name || name.length > 120 || CONTROL_CHARACTER_PATTERN.test(name)) {
    throw new Error('請輸入 1–120 個字元的報告名稱');
  }
  return name;
}

function assertMediaId(value) {
  if (typeof value !== 'string' || !MEDIA_ID_PATTERN.test(value)) throw new Error('Invalid media asset id');
  return value;
}

function assertNativeSessionId(value) {
  if (typeof value !== 'string' || !NATIVE_PLAYER_SESSION_ID_PATTERN.test(value)) {
    throw new Error('Invalid native player session id');
  }
  return value;
}

function assertNativeRequestId(value) {
  const requestId = value === undefined ? createRequestId() : value;
  if (typeof requestId !== 'string' || !NATIVE_PLAYER_REQUEST_ID_PATTERN.test(requestId)) {
    throw new Error('Invalid native player request id');
  }
  return requestId;
}

function assertNativeSurfaceId(value) {
  if (typeof value !== 'string' || !NATIVE_PLAYER_SURFACE_ID_PATTERN.test(value)) {
    throw new Error('Invalid native player surface id');
  }
  return value;
}

function assertNativeBounds(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid native player bounds');
  const integer = (field, min, max) => {
    if (!Number.isInteger(value[field]) || value[field] < min || value[field] > max) throw new Error(`Invalid native player bounds.${field}`);
    return value[field];
  };
  const devicePixelRatio = value.devicePixelRatio === undefined ? 1 : value.devicePixelRatio;
  if (typeof devicePixelRatio !== 'number' || !Number.isFinite(devicePixelRatio) || devicePixelRatio < .25 || devicePixelRatio > 8) {
    throw new Error('Invalid native player bounds.devicePixelRatio');
  }
  return {
    x: integer('x', -100000, 100000),
    y: integer('y', -100000, 100000),
    width: integer('width', 1, 16384),
    height: integer('height', 1, 16384),
    devicePixelRatio,
  };
}

function assertNativeResponse(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || value.schemaVersion !== 1 || typeof value.status !== 'string') {
    throw new Error('Invalid native player response');
  }
  if (value.ok === false || value.status === 'error') {
    const error = new Error(typeof value.message === 'string' ? value.message : 'Native player operation failed');
    if (typeof value.code === 'string') error.code = value.code;
    throw error;
  }
  return value;
}

const nativePlayerApi = Object.freeze({
  open: (request) => {
    if (request === null || typeof request !== 'object' || Array.isArray(request)) throw new Error('Invalid native player open request');
    return ipcRenderer.invoke('native-player:open', {
      projectId: assertProjectId(request.projectId),
      assetId: assertMediaId(request.assetId),
      surfaceId: assertNativeSurfaceId(request.surfaceId),
    }).then(assertNativeResponse);
  },
  setBounds: (request) => {
    if (request === null || typeof request !== 'object' || Array.isArray(request)) throw new Error('Invalid native player bounds request');
    return ipcRenderer.invoke('native-player:set-bounds', {
      sessionId: assertNativeSessionId(request.sessionId),
      surfaceId: assertNativeSurfaceId(request.surfaceId),
      requestId: assertNativeRequestId(request.requestId),
      bounds: assertNativeBounds(request.bounds),
    }).then(assertNativeResponse);
  },
  scrub: (request) => {
    if (request === null || typeof request !== 'object' || Array.isArray(request)) throw new Error('Invalid native player scrub request');
    if (!Number.isInteger(request.frameIndex) || request.frameIndex < 0 || request.frameIndex > 10_000_000) throw new Error('Invalid native player frame index');
    return ipcRenderer.invoke('native-player:scrub', {
      sessionId: assertNativeSessionId(request.sessionId),
      surfaceId: assertNativeSurfaceId(request.surfaceId),
      requestId: assertNativeRequestId(request.requestId),
      frameIndex: request.frameIndex,
    }).then(assertNativeResponse);
  },
  step: (request) => {
    if (request === null || typeof request !== 'object' || Array.isArray(request)) throw new Error('Invalid native player step request');
    if (![-1, 1].includes(request.direction)) throw new Error('Invalid native player step direction');
    return ipcRenderer.invoke('native-player:step', {
      sessionId: assertNativeSessionId(request.sessionId),
      surfaceId: assertNativeSurfaceId(request.surfaceId),
      requestId: assertNativeRequestId(request.requestId),
      direction: request.direction,
    }).then(assertNativeResponse);
  },
  play: (request) => {
    if (request === null || typeof request !== 'object' || Array.isArray(request)) throw new Error('Invalid native player play request');
    const rate = request.rate ?? request.playbackRate ?? 1;
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0 || rate > 16) throw new Error('Invalid native player playback rate');
    return ipcRenderer.invoke('native-player:play', {
      sessionId: assertNativeSessionId(request.sessionId),
      requestId: assertNativeRequestId(request.requestId),
      rate,
    }).then(assertNativeResponse);
  },
  pause: (request) => {
    if (request === null || typeof request !== 'object' || Array.isArray(request)) throw new Error('Invalid native player pause request');
    return ipcRenderer.invoke('native-player:pause', {
      sessionId: assertNativeSessionId(request.sessionId),
      requestId: assertNativeRequestId(request.requestId),
    }).then(assertNativeResponse);
  },
  close: (request) => {
    if (request === null || typeof request !== 'object' || Array.isArray(request)) throw new Error('Invalid native player close request');
    return ipcRenderer.invoke('native-player:close', {
      sessionId: assertNativeSessionId(request.sessionId),
    }).then(assertNativeResponse);
  },
  onEvent: (callback) => {
    if (typeof callback !== 'function') throw new Error('Native player event callback must be a function');
    const listener = (_event, payload) => {
      try { callback(assertNativeResponse({ ...payload, ok: true, status: 'event' })); } catch { /* untrusted event ignored */ }
    };
    ipcRenderer.on('native-player:event', listener);
    return () => ipcRenderer.removeListener('native-player:event', listener);
  },
});

function assertFrameCacheRequest(value, operation, { requireCacheKey = false } = {}) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid frame cache request');
  }
  if (value.schemaVersion !== undefined && value.schemaVersion !== FRAME_CACHE_CONTRACT_VERSION) {
    throw new Error('Unsupported frame cache schema version');
  }
  if (value.operation !== undefined && value.operation !== operation) {
    throw new Error('Invalid frame cache operation');
  }
  const requestId = value.requestId === undefined ? createRequestId() : value.requestId;
  if (typeof requestId !== 'string' || !FRAME_CACHE_REQUEST_ID_PATTERN.test(requestId)) {
    throw new Error('Invalid frame cache request id');
  }
  const request = {
    schemaVersion: FRAME_CACHE_CONTRACT_VERSION,
    operation,
    requestId,
    projectId: assertProjectId(value.projectId),
    assetId: assertMediaId(value.assetId),
  };
  if (value.cacheKey !== undefined) {
    if (typeof value.cacheKey !== 'string' || !FRAME_CACHE_KEY_PATTERN.test(value.cacheKey)) {
      throw new Error('Invalid frame cache key');
    }
    request.cacheKey = value.cacheKey.toLowerCase();
  }
  if (requireCacheKey && request.cacheKey === undefined) {
    throw new Error('Frame source requires a cache key');
  }
  return request;
}

function assertFrameCacheResponse(value) {
  try {
    return normalizeFrameCacheResponse(value);
  } catch {
    throw new Error('Invalid frame cache response');
  }
}

function assertFrameCacheCleanupResponse(value) {
  try {
    return createCleanupResponse(value);
  } catch {
    throw new Error('Invalid frame cache cleanup response');
  }
}

function assertFrameCacheCancelResponse(value) {
  try {
    return createCancelResponse(value);
  } catch {
    throw new Error('Invalid frame cache cancel response');
  }
}

function assertFrameSourceRequest(value) {
  const request = assertFrameCacheRequest(value, FRAME_CACHE_BRIDGE_METHODS.READ, { requireCacheKey: true });
  if (!Number.isInteger(value.frameNumber) || value.frameNumber < 0 || value.frameNumber > 10_000_000) {
    throw new Error('Invalid frame number');
  }
  return { ...request, frameNumber: value.frameNumber };
}

const frameCacheApi = Object.freeze({
  prepareFrameCache: (request) => ipcRenderer.invoke(
    'frame-cache:prepare',
    assertFrameCacheRequest(request, FRAME_CACHE_BRIDGE_METHODS.PREPARE),
  ).then(assertFrameCacheResponse),
  readFrameCache: (request) => ipcRenderer.invoke(
    'frame-cache:read',
    assertFrameCacheRequest(request, FRAME_CACHE_BRIDGE_METHODS.READ),
  ).then(assertFrameCacheResponse),
  cleanupFrameCache: (request) => ipcRenderer.invoke(
    'frame-cache:cleanup',
    assertFrameCacheRequest(request, FRAME_CACHE_BRIDGE_METHODS.CLEANUP),
  ).then(assertFrameCacheCleanupResponse),
  cancelFrameCache: (request) => ipcRenderer.invoke(
    'frame-cache:cancel',
    assertFrameCacheRequest(request, FRAME_CACHE_BRIDGE_METHODS.CANCEL),
  ).then(assertFrameCacheCancelResponse),
  // Frame descriptors intentionally remain project-relative in the v1
  // response. This narrow read endpoint returns only a PNG data URL so the
  // renderer never receives a filesystem path.
  getFrameSource: (input) => {
    const request = assertFrameSourceRequest(input);
    return ipcRenderer.invoke('frame-cache:frame', request).then((value) => {
      if (value === null || typeof value !== 'object' || Array.isArray(value)
        || value.schemaVersion !== FRAME_CACHE_CONTRACT_VERSION
        || value.requestId !== request.requestId
        || value.projectId !== request.projectId
        || value.assetId !== request.assetId
        || value.frameNumber !== request.frameNumber
        || typeof value.dataUrl !== 'string'
        || !/^data:image\/png;base64,[a-z0-9+/=]+$/iu.test(value.dataUrl)) {
        throw new Error('Invalid frame source response');
      }
      return { dataUrl: value.dataUrl };
    });
  },
});

function assertTextImportPayload(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid text import payload');
  }
  assertProjectId(value.projectId);
  assertProjectId(value.sectionId);
  if (typeof value.fileName !== 'string' || typeof value.content !== 'string') {
    throw new Error('Invalid text import content');
  }
  return value;
}

function assertExportRequest(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid export request');
  }
  assertProjectId(value.projectId);
  if (typeof value.outputDirectory !== 'string'
    || value.outputDirectory.trim() === ''
    || CONTROL_CHARACTER_PATTERN.test(value.outputDirectory)) {
    throw new Error('Invalid export output directory');
  }
  if (value.reportName !== undefined && value.reportName !== null
    && (typeof value.reportName !== 'string' || value.reportName.length > 160
      || CONTROL_CHARACTER_PATTERN.test(value.reportName))) {
    throw new Error('Invalid export report name');
  }
  if (value.outputKind !== undefined && !EXPORT_OUTPUT_KINDS.has(value.outputKind)) {
    throw new Error('Invalid export output kind');
  }
  return {
    projectId: value.projectId,
    outputDirectory: value.outputDirectory,
    reportName: value.reportName,
    outputKind: value.outputKind,
  };
}

function assertExportJobId(value) {
  if (typeof value !== 'string' || !EXPORT_JOB_ID_PATTERN.test(value)) {
    throw new Error('Invalid export job id');
  }
  return value;
}

function assertPickedExportDirectory(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || value.trim() === '' || CONTROL_CHARACTER_PATTERN.test(value)) {
    throw new Error('Invalid picked export directory');
  }
  return value;
}

function assertProjectPayload(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid project payload');
  }
  assertProjectId(value.id);
  if (value.displayName !== undefined) assertDisplayName(value.displayName);
  if (value.sections !== undefined && !Array.isArray(value.sections)) {
    throw new Error('Project sections must be an array');
  }
  if (value.media !== undefined && !Array.isArray(value.media)) {
    throw new Error('Project media must be an array');
  }
  if (value.exportSettings !== undefined
    && (value.exportSettings === null || typeof value.exportSettings !== 'object' || Array.isArray(value.exportSettings))) {
    throw new Error('Project export settings must be an object');
  }
  return value;
}

ipcRenderer.on('app:flush-before-close', async () => {
  try {
    for (const callback of closeCallbacks) await callback();
    ipcRenderer.send('app:close-ready');
  } catch (error) {
    ipcRenderer.send('app:close-failed', String(error?.message || 'close flush failed').slice(0, 500));
  }
});

contextBridge.exposeInMainWorld('pitchingApp', Object.freeze({
  listProjects: () => ipcRenderer.invoke('project:list'),
  createProject: (displayName) => ipcRenderer.invoke('project:create', assertDisplayName(displayName)),
  openProject: (projectId) => ipcRenderer.invoke('project:open', assertProjectId(projectId)),
  saveProject: (project) => ipcRenderer.invoke('project:save', assertProjectPayload(project)),
  pickTextFile: () => ipcRenderer.invoke('project:pick-text'),
  insertTextBlock: (payload) => ipcRenderer.invoke('project:insert-text', assertTextImportPayload(payload)),
  listMedia: (projectId) => ipcRenderer.invoke('media:list', assertProjectId(projectId)),
  pickMediaFiles: (projectId) => ipcRenderer.invoke('media:pick', assertProjectId(projectId)),
  resolveMediaSource: (projectId, assetId) => ipcRenderer.invoke('media:source', {
    projectId: assertProjectId(projectId),
    assetId: assertMediaId(assetId),
  }),
  removeMedia: (projectId, assetId) => ipcRenderer.invoke('media:remove', {
    projectId: assertProjectId(projectId),
    assetId: assertMediaId(assetId),
  }),
  pickExportDirectory: () => ipcRenderer.invoke('export:pick-directory').then(assertPickedExportDirectory),
  startExport: (request) => ipcRenderer.invoke('export:start', assertExportRequest(request)),
  getExportStatus: (jobId) => ipcRenderer.invoke('export:status', assertExportJobId(jobId)),
  waitForExport: (jobId) => ipcRenderer.invoke('export:wait', assertExportJobId(jobId)),
  cancelExport: (jobId) => ipcRenderer.invoke('export:cancel', assertExportJobId(jobId)),
  retryExport: (jobId) => ipcRenderer.invoke('export:retry', assertExportJobId(jobId)),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  nativePlayer: nativePlayerApi,
  frameCache: frameCacheApi,
  sync: syncApi,
  onBeforeClose: (callback) => {
    if (typeof callback !== 'function') throw new Error('Close callback must be a function');
    closeCallbacks.add(callback);
    return () => closeCallbacks.delete(callback);
  },
}));
