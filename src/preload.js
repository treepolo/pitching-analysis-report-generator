'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const PROJECT_ID_PATTERN = /^[a-z0-9-]{1,80}$/u;
const MEDIA_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;
const closeCallbacks = new Set();

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
  removeMedia: (projectId, assetId) => ipcRenderer.invoke('media:remove', {
    projectId: assertProjectId(projectId),
    assetId: assertMediaId(assetId),
  }),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  onBeforeClose: (callback) => {
    if (typeof callback !== 'function') throw new Error('Close callback must be a function');
    closeCallbacks.add(callback);
    return () => closeCallbacks.delete(callback);
  },
}));
