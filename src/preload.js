'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const { randomUUID } = require('node:crypto');
const {
  FRAME_CACHE_BRIDGE_METHODS,
  FRAME_CACHE_CONTRACT_VERSION,
  createCancelResponse,
  createCleanupResponse,
  normalizeFrameCacheResponse,
} = require('./media/frame-cache-contract');

const PROJECT_ID_PATTERN = /^[a-z0-9-]{1,80}$/u;
const MEDIA_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u;
const EXPORT_JOB_ID_PATTERN = /^[0-9a-f-]{36}$/iu;
const FRAME_CACHE_REQUEST_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u;
const FRAME_CACHE_KEY_PATTERN = /^[a-f0-9]{64}$/iu;
const EXPORT_OUTPUT_KINDS = new Set(['folder', 'zip', 'both']);
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;
const closeCallbacks = new Set();
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
  const requestId = value.requestId === undefined ? randomUUID() : value.requestId;
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
  frameCache: frameCacheApi,
  sync: syncApi,
  onBeforeClose: (callback) => {
    if (typeof callback !== 'function') throw new Error('Close callback must be a function');
    closeCallbacks.add(callback);
    return () => closeCallbacks.delete(callback);
  },
}));
