'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const PROJECT_ID_PATTERN = /^[a-z0-9-]{1,80}$/u;
const MEDIA_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u;
const EXPORT_JOB_ID_PATTERN = /^[0-9a-f-]{36}$/iu;
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
  startExport: (request) => ipcRenderer.invoke('export:start', assertExportRequest(request)),
  getExportStatus: (jobId) => ipcRenderer.invoke('export:status', assertExportJobId(jobId)),
  waitForExport: (jobId) => ipcRenderer.invoke('export:wait', assertExportJobId(jobId)),
  cancelExport: (jobId) => ipcRenderer.invoke('export:cancel', assertExportJobId(jobId)),
  retryExport: (jobId) => ipcRenderer.invoke('export:retry', assertExportJobId(jobId)),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  sync: syncApi,
  onBeforeClose: (callback) => {
    if (typeof callback !== 'function') throw new Error('Close callback must be a function');
    closeCallbacks.add(callback);
    return () => closeCallbacks.delete(callback);
  },
}));
