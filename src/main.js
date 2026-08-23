'use strict';

const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const gpuDisabled = process.env.PITCHING_DISABLE_GPU === '1' || process.argv.includes('--disable-gpu');
if (gpuDisabled) {
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('in-process-gpu');
  app.disableHardwareAcceleration();
}

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const {
  createProjectStore,
  isPathInside,
  validateProjectRoot,
} = require('./storage');
const {
  ExportJobController,
  validatePickedExportDirectory,
} = require('./export/app-bridge');
const { collectReferencedVideoAssetIds } = require('./export/asset-paths');
const {
  FRAME_CACHE_BRIDGE_METHODS,
  FRAME_CACHE_CONTRACT_VERSION,
  FRAME_CACHE_RESPONSE_STATUS,
  FrameCacheContractError,
  cleanupFrameCache,
  createCancelResponse,
  createCleanupResponse,
  normalizeFrameCacheRequest,
  normalizeFrameCacheResponse,
  prepareFrameCache,
  readFrameCache,
} = require('./media');
const { resolveProjectRelativePath } = require('./media/path-policy');

const APP_ROOT = path.resolve(app.getAppPath());
const configuredProjectRoot = process.env.PITCHING_PROJECT_ROOT;
const isSmokeMode = process.env.PITCHING_SMOKE === '1' || process.argv.includes('--smoke');
const smokeProjectRoot = isSmokeMode && !configuredProjectRoot
  ? path.join(APP_ROOT, '.tmp', `electron-smoke-${process.pid}`)
  : null;
const PROJECT_ROOT = configuredProjectRoot
  ? path.resolve(configuredProjectRoot)
  : smokeProjectRoot || APP_ROOT;
const APP_ENTRY_URL = pathToFileURL(path.join(__dirname, 'index.html')).href;
const closeGuards = new WeakMap();

if (!isPathInside(APP_ROOT, PROJECT_ROOT)) {
  throw new Error('PITCHING_PROJECT_ROOT must stay inside the application project root');
}

const projectStore = createProjectStore(PROJECT_ROOT, { boundaryRoot: APP_ROOT });
const exportJobs = new ExportJobController();
const frameCacheOperations = new Map();
const FRAME_CACHE_PROJECT_ID_PATTERN = /^[a-z0-9-]{1,80}$/u;
const FRAME_CACHE_REQUEST_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u;
const FRAME_CACHE_MAX_FRAME_BYTES = 32 * 1024 * 1024;

function assertTrustedSender(event) {
  const sender = event?.sender;
  const senderFrame = event?.senderFrame;
  const senderWindow = sender ? BrowserWindow.fromWebContents(sender) : null;
  const mainFrame = sender?.mainFrame;
  if (!sender || sender.isDestroyed() || !senderWindow || senderWindow.isDestroyed()
    || senderWindow.webContents !== sender) {
    throw new Error('Untrusted IPC sender');
  }
  if (!senderFrame || !mainFrame || senderFrame !== mainFrame
    || senderFrame.url !== APP_ENTRY_URL || mainFrame.url !== APP_ENTRY_URL) {
    throw new Error('Untrusted IPC frame');
  }
  return senderWindow;
}

function frameCacheErrorCode(error, fallback = 'FRAME_CACHE_FAILED') {
  const code = typeof error?.code === 'string' && /^[A-Z0-9_:-]{1,120}$/u.test(error.code)
    ? error.code
    : fallback;
  return code;
}

function frameCacheErrorMessage(error, fallback = '影格快取操作失敗。') {
  const raw = typeof error?.message === 'string' && error.message.trim() !== ''
    ? error.message
    : fallback;
  return raw
    .replace(/[a-zA-Z]:[\\/][^\r\n]*/gu, '[project-path]')
    .replace(/(^|[\s('"`])\/(?:[^\s'"`)]+(?:[\s][^\r\n]*)?)/gu, '$1[project-path]')
    .slice(0, 1000);
}

function frameCacheFailure(request, status, error, sourceIdentity = null) {
  return normalizeFrameCacheResponse({
    schemaVersion: FRAME_CACHE_CONTRACT_VERSION,
    requestId: request.requestId,
    projectId: request.projectId,
    assetId: request.assetId,
    status,
    sourceIdentity,
    cache: null,
    metadata: null,
    frames: [],
    reused: false,
    progress: null,
    error: status === FRAME_CACHE_RESPONSE_STATUS.CACHE_MISS || status === FRAME_CACHE_RESPONSE_STATUS.PREPARING
      ? null
      : {
        code: frameCacheErrorCode(error),
        message: frameCacheErrorMessage(error),
      },
  });
}

function frameCacheStatusForError(error) {
  const code = frameCacheErrorCode(error);
  if (code === 'CANCELLED' || error?.name === 'AbortError') return FRAME_CACHE_RESPONSE_STATUS.CANCELLED;
  if (code === 'FFPROBE_UNAVAILABLE' || code === 'FFMPEG_UNAVAILABLE') return FRAME_CACHE_RESPONSE_STATUS.TOOL_MISSING;
  if (code.startsWith('SOURCE_')
    || code.startsWith('MEDIA_')
    || code === 'MEDIA_KIND_UNSUPPORTED'
    || code === 'PROJECT_NOT_FOUND'
    || code === 'ASSET_NOT_FOUND') {
    return FRAME_CACHE_RESPONSE_STATUS.SOURCE_UNAVAILABLE;
  }
  return FRAME_CACHE_RESPONSE_STATUS.CACHE_ERROR;
}

function frameCacheOperationKey(event, requestId) {
  return `${event.sender.id}:${requestId}`;
}

async function assertNoFrameCacheSymlinkAncestors(projectRoot, targetPath) {
  const root = path.resolve(projectRoot);
  let current = path.resolve(targetPath);
  while (true) {
    if (current !== root && !isPathInside(root, current)) {
      throw new Error('影格來源不在專案範圍內。');
    }
    const stats = await fs.lstat(current).catch(() => null);
    if (stats?.isSymbolicLink()) throw new Error('影格來源不可透過符號連結讀取。');
    if (current === root) return;
    const parent = path.dirname(current);
    if (parent === current) throw new Error('影格來源無法安全解析。');
    current = parent;
  }
}

function normalizeFrameCacheBridgeRequest(value, operation) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new FrameCacheContractError('frame cache request must be an object');
  }
  if (value.schemaVersion !== undefined && value.schemaVersion !== FRAME_CACHE_CONTRACT_VERSION) {
    throw new FrameCacheContractError('frame cache request schemaVersion is unsupported');
  }
  if (value.operation !== undefined && value.operation !== operation) {
    throw new FrameCacheContractError('frame cache operation does not match its bridge channel');
  }

  // Normalize the identity fields without accepting a renderer-supplied source
  // path. The trusted source reference is added only after project-store lookup.
  const normalized = normalizeFrameCacheRequest({
    requestId: value.requestId,
    projectId: value.projectId,
    assetId: value.assetId,
    cacheKey: value.cacheKey,
    operation: FRAME_CACHE_BRIDGE_METHODS.CANCEL,
  });
  if (!FRAME_CACHE_PROJECT_ID_PATTERN.test(normalized.projectId)) {
    throw new FrameCacheContractError('projectId is invalid');
  }
  if (!FRAME_CACHE_REQUEST_ID_PATTERN.test(normalized.requestId)) {
    throw new FrameCacheContractError('requestId is invalid');
  }
  return {
    schemaVersion: FRAME_CACHE_CONTRACT_VERSION,
    operation,
    requestId: normalized.requestId,
    projectId: normalized.projectId,
    assetId: normalized.assetId,
    ...(normalized.cacheKey ? { cacheKey: normalized.cacheKey } : {}),
  };
}

async function resolveFrameCacheAsset(request) {
  let project;
  try {
    project = await projectStore.readProject(request.projectId);
  } catch (error) {
    const wrapped = new Error('影格來源所屬專案不存在。');
    wrapped.code = 'PROJECT_NOT_FOUND';
    throw wrapped;
  }
  const asset = Array.isArray(project.media)
    ? project.media.find((candidate) => candidate?.id === request.assetId)
    : null;
  if (!asset) {
    const error = new Error('影格來源資產不存在。');
    error.code = 'ASSET_NOT_FOUND';
    throw error;
  }
  if (asset.mediaKind !== undefined && asset.mediaKind !== 'video') {
    const error = new Error('只有影片資產可以建立影格快取。');
    error.code = 'MEDIA_KIND_UNSUPPORTED';
    throw error;
  }

  let resolved;
  try {
    resolved = await projectStore.resolveMediaAssetSource(request.projectId, request.assetId);
  } catch (error) {
    const wrapped = new Error('影格來源無法安全解析。');
    wrapped.code = error?.code?.startsWith('MEDIA_') ? error.code : 'SOURCE_UNAVAILABLE';
    throw wrapped;
  }
  const selectedReference = asset.normalizedReference?.relativePath === resolved.relativePath
    ? asset.normalizedReference
    : asset.sourceReference;
  const sourceReference = {
    relativePath: resolved.relativePath,
  };
  if (typeof selectedReference?.checksumSha256 === 'string') {
    sourceReference.checksumSha256 = selectedReference.checksumSha256;
  }
  if (Number.isInteger(selectedReference?.byteSize) && selectedReference.byteSize >= 0) {
    sourceReference.byteSize = selectedReference.byteSize;
  }
  return {
    sourceReference,
    sourcePath: resolved.sourcePath,
  };
}

async function readExportFrameCaches(project) {
  const assetIds = collectReferencedVideoAssetIds(project);
  return Promise.all(assetIds.map(async (assetId) => {
    const request = {
      schemaVersion: FRAME_CACHE_CONTRACT_VERSION,
      operation: FRAME_CACHE_BRIDGE_METHODS.READ,
      requestId: `export-${randomUUID()}`,
      projectId: project.id,
      assetId,
    };
    try {
      const resolved = await resolveFrameCacheAsset(request);
      const response = normalizeFrameCacheResponse(await readFrameCache({
        ...request,
        sourceReference: resolved.sourceReference,
        projectRoot: PROJECT_ROOT,
      }));
      return { assetId, response };
    } catch (error) {
      return {
        assetId,
        response: frameCacheFailure(request, frameCacheStatusForError(error), error),
      };
    }
  }));
}

async function invokeFrameCacheOperation(event, payload, operation, operationFn) {
  const senderWindow = assertTrustedSender(event);
  const request = normalizeFrameCacheBridgeRequest(payload, operation);
  const operationKey = frameCacheOperationKey(event, request.requestId);
  if (frameCacheOperations.has(operationKey)) {
    throw new FrameCacheContractError('A frame cache request with this requestId is already running');
  }

  const controller = new AbortController();
  const operationState = { controller, senderId: senderWindow.webContents.id };
  frameCacheOperations.set(operationKey, operationState);
  try {
    let resolved;
    try {
      resolved = await resolveFrameCacheAsset(request);
    } catch (error) {
      if (controller.signal.aborted) {
        return frameCacheFailure(
          request,
          FRAME_CACHE_RESPONSE_STATUS.CANCELLED,
          { code: 'CANCELLED', message: '影格快取已取消。' },
        );
      }
      return frameCacheFailure(request, frameCacheStatusForError(error), error);
    }
    if (controller.signal.aborted) {
      return frameCacheFailure(
        request,
        FRAME_CACHE_RESPONSE_STATUS.CANCELLED,
        { code: 'CANCELLED', message: '影格快取已取消。' },
      );
    }
    const contractRequest = normalizeFrameCacheRequest({
      ...request,
      sourceReference: resolved.sourceReference,
    });
    const trustedRequest = {
      ...contractRequest,
      projectRoot: projectStore.root,
    };
    const result = await operationFn(trustedRequest, controller.signal);
    const normalizedResult = normalizeFrameCacheResponse(result);
    if (normalizedResult.status === FRAME_CACHE_RESPONSE_STATUS.CACHE_ERROR
      && normalizedResult.error?.code?.startsWith('SOURCE_')) {
      return frameCacheFailure(request, FRAME_CACHE_RESPONSE_STATUS.SOURCE_UNAVAILABLE, normalizedResult.error);
    }
    return normalizedResult;
  } catch (error) {
    return frameCacheFailure(request, frameCacheStatusForError(error), error);
  } finally {
    if (frameCacheOperations.get(operationKey) === operationState) frameCacheOperations.delete(operationKey);
  }
}

async function invokeFrameCacheCleanup(event, payload) {
  assertTrustedSender(event);
  const request = normalizeFrameCacheBridgeRequest(payload, FRAME_CACHE_BRIDGE_METHODS.CLEANUP);
  try {
    const resolved = request.cacheKey ? null : await resolveFrameCacheAsset(request);
    const cleanupInput = {
      ...request,
      projectRoot: projectStore.root,
      ...(resolved ? { sourceReference: resolved.sourceReference } : {}),
    };
    const contractRequest = normalizeFrameCacheRequest(cleanupInput);
    const result = await cleanupFrameCache({
      ...contractRequest,
      projectRoot: projectStore.root,
    });
    return createCleanupResponse({
      ...result,
      requestId: request.requestId,
      projectId: request.projectId,
      assetId: request.assetId,
    });
  } catch (error) {
    return createCleanupResponse({
      schemaVersion: FRAME_CACHE_CONTRACT_VERSION,
      requestId: request.requestId,
      projectId: request.projectId,
      assetId: request.assetId,
      status: 'cleanup-failed',
      error: {
        code: frameCacheErrorCode(error, 'CACHE_CLEANUP_FAILED'),
        message: frameCacheErrorMessage(error, '影格快取清理失敗。'),
      },
    });
  }
}

function invokeFrameCacheCancel(event, payload) {
  assertTrustedSender(event);
  const request = normalizeFrameCacheBridgeRequest(payload, FRAME_CACHE_BRIDGE_METHODS.CANCEL);
  const operation = frameCacheOperations.get(frameCacheOperationKey(event, request.requestId));
  if (operation) operation.controller.abort();
  return createCancelResponse({
    schemaVersion: FRAME_CACHE_CONTRACT_VERSION,
    requestId: request.requestId,
    accepted: Boolean(operation),
  });
}

async function invokeFrameCacheSource(event, payload) {
  assertTrustedSender(event);
  const request = normalizeFrameCacheBridgeRequest(payload, FRAME_CACHE_BRIDGE_METHODS.READ);
  if (!request.cacheKey) {
    throw new FrameCacheContractError('frame source request requires cacheKey');
  }
  if (!Number.isInteger(payload?.frameNumber) || payload.frameNumber < 0 || payload.frameNumber > 10_000_000) {
    throw new FrameCacheContractError('frameNumber is invalid');
  }

  const resolved = await resolveFrameCacheAsset(request);
  const contractRequest = normalizeFrameCacheRequest({
    ...request,
    sourceReference: resolved.sourceReference,
  });
  const response = normalizeFrameCacheResponse(await readFrameCache({
    ...contractRequest,
    projectRoot: projectStore.root,
  }));
  if (response.status !== FRAME_CACHE_RESPONSE_STATUS.READY) {
    throw new Error(response.error?.message || `影格快取狀態為「${response.status}」。`);
  }
  if (response.cache?.key !== request.cacheKey) {
    throw new Error('影格快取識別不符合目前來源。');
  }
  const frame = response.frames[payload.frameNumber];
  if (!frame || frame.frameNumber !== payload.frameNumber
    || !/^frame-\d{8}\.png$/u.test(path.basename(frame.relativePath))) {
    throw new Error('指定影格不存在。');
  }

  const projectRoot = path.resolve(projectStore.root);
  const cacheRoot = resolveProjectRelativePath(projectRoot, response.cache.rootRelativePath);
  const frameDirectory = resolveProjectRelativePath(projectRoot, response.cache.frameDirectoryRelativePath);
  const framePath = resolveProjectRelativePath(projectRoot, frame.relativePath);
  if (!isPathInside(projectRoot, cacheRoot)
    || !isPathInside(projectRoot, frameDirectory)
    || !isPathInside(cacheRoot, frameDirectory)
    || frameDirectory === cacheRoot
    || !isPathInside(frameDirectory, framePath)
    || framePath === frameDirectory) {
    throw new Error('影格來源不在專案快取範圍內。');
  }
  await assertNoFrameCacheSymlinkAncestors(projectRoot, framePath);
  const stats = await fs.lstat(framePath).catch(() => null);
  if (!stats?.isFile() || stats.isSymbolicLink() || stats.size <= 0 || stats.size > FRAME_CACHE_MAX_FRAME_BYTES) {
    throw new Error('影格檔案無法安全讀取。');
  }
  const bytes = await fs.readFile(framePath);
  return {
    schemaVersion: FRAME_CACHE_CONTRACT_VERSION,
    requestId: request.requestId,
    projectId: request.projectId,
    assetId: request.assetId,
    frameNumber: payload.frameNumber,
    dataUrl: `data:image/png;base64,${bytes.toString('base64')}`,
  };
}

function guardNavigation(event, navigationUrl) {
  if (navigationUrl !== APP_ENTRY_URL) event.preventDefault();
}

function registerIpc() {
  ipcMain.handle('project:list', (event) => {
    assertTrustedSender(event);
    return projectStore.listProjects();
  });
  ipcMain.handle('project:create', (event, displayName) => {
    assertTrustedSender(event);
    return projectStore.createProject(displayName);
  });
  ipcMain.handle('project:open', (event, projectId) => {
    assertTrustedSender(event);
    return projectStore.openProject(projectId);
  });
  ipcMain.handle('project:save', (event, project) => {
    assertTrustedSender(event);
    return projectStore.saveProject(project);
  });
  ipcMain.handle('project:pick-text', async (event) => {
    const senderWindow = assertTrustedSender(event);
    const result = await dialog.showOpenDialog(senderWindow, {
      title: '匯入文字檔案',
      properties: ['openFile'],
      filters: [{ name: 'Text / Markdown', extensions: ['txt', 'md'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return projectStore.readTextImportFile(result.filePaths[0]);
  });
  ipcMain.handle('project:insert-text', (event, payload) => {
    assertTrustedSender(event);
    return projectStore.insertTextBlock(payload?.projectId, payload);
  });
  ipcMain.handle('media:list', async (event, projectId) => {
    assertTrustedSender(event);
    const project = await projectStore.readProject(projectId);
    return project.media;
  });
  ipcMain.handle('media:pick', async (event, projectId) => {
    const senderWindow = assertTrustedSender(event);
    const result = await dialog.showOpenDialog(senderWindow, {
      title: '匯入圖片或影片',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Supported media', extensions: ['mp4', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'tif', 'tiff', 'svg', 'ico'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return projectStore.registerMediaFiles(projectId, result.filePaths);
  });
  ipcMain.handle('media:source', async (event, payload) => {
    assertTrustedSender(event);
    const resolved = await projectStore.resolveMediaAssetSource(payload?.projectId, payload?.assetId);
    return {
      assetId: resolved.assetId,
      relativePath: resolved.relativePath,
      sourceRole: resolved.sourceRole,
      sourceUrl: pathToFileURL(resolved.sourcePath).href,
    };
  });
  ipcMain.handle('frame-cache:prepare', (event, payload) => invokeFrameCacheOperation(
    event,
    payload,
    FRAME_CACHE_BRIDGE_METHODS.PREPARE,
    (request, signal) => prepareFrameCache(request, { signal }),
  ));
  ipcMain.handle('frame-cache:read', (event, payload) => invokeFrameCacheOperation(
    event,
    payload,
    FRAME_CACHE_BRIDGE_METHODS.READ,
    (request, signal) => readFrameCache(request, { signal }),
  ));
  ipcMain.handle('frame-cache:cleanup', (event, payload) => invokeFrameCacheCleanup(event, payload));
  ipcMain.handle('frame-cache:cancel', (event, payload) => invokeFrameCacheCancel(event, payload));
  ipcMain.handle('frame-cache:frame', (event, payload) => invokeFrameCacheSource(event, payload));
  ipcMain.handle('media:remove', (event, payload) => {
    assertTrustedSender(event);
    return projectStore.removeMediaAsset(payload?.projectId, payload?.assetId);
  });
  ipcMain.handle('export:pick-directory', async (event) => {
    const senderWindow = assertTrustedSender(event);
    const result = await dialog.showOpenDialog(senderWindow, {
      title: 'Select export output directory',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return validatePickedExportDirectory(PROJECT_ROOT, result.filePaths[0]);
  });
  ipcMain.handle('export:start', async (event, payload) => {
    assertTrustedSender(event);
    const projectId = payload?.projectId;
    const project = await projectStore.readProject(projectId);
    return exportJobs.start({
      projectId: project.id,
      projectRoot: PROJECT_ROOT,
      reportDocument: project,
      assets: project.media,
      outputDirectory: payload?.outputDirectory,
      reportName: payload?.reportName ?? project.reportTitle ?? project.displayName,
      outputKind: payload?.outputKind,
    });
  });
  ipcMain.handle('export:status', (event, jobId) => {
    assertTrustedSender(event);
    return exportJobs.status(jobId);
  });
  ipcMain.handle('export:wait', (event, jobId) => {
    assertTrustedSender(event);
    return exportJobs.wait(jobId);
  });
  ipcMain.handle('export:cancel', (event, jobId) => {
    assertTrustedSender(event);
    return exportJobs.cancel(jobId);
  });
  ipcMain.handle('export:retry', (event, jobId) => {
    assertTrustedSender(event);
    return exportJobs.retry(jobId);
  });
  ipcMain.handle('app:info', (event) => {
    assertTrustedSender(event);
    return {
      projectRoot: projectStore.root,
      projectsRoot: projectStore.projectsRoot,
    };
  });
  ipcMain.on('app:close-ready', (event) => {
    try {
      const senderWindow = assertTrustedSender(event);
      const guard = closeGuards.get(senderWindow);
      if (!guard) return;
      guard.allowClose = true;
      senderWindow.close();
    } catch {
      // Ignore untrusted close signals; the guarded window remains open.
    }
  });
  ipcMain.on('app:close-failed', (event) => {
    try {
      const senderWindow = assertTrustedSender(event);
      const guard = closeGuards.get(senderWindow);
      if (guard) guard.requestPending = false;
    } catch {
      // Ignore untrusted close signals; the guarded window remains open.
    }
  });
}

function browserWindowOptions() {
  return {
    width: 1280,
    height: 820,
    minWidth: 880,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
}

function createWindow({ show = true } = {}) {
  const window = new BrowserWindow({ ...browserWindowOptions(), show });
  closeGuards.set(window, { allowClose: false, requestPending: false });
  window.setMenuBarVisibility(false);
  window.webContents.on('context-menu', (_event, params = {}) => {
    const selectionText = typeof params.selectionText === 'string' ? params.selectionText.trim() : '';
    const editable = Boolean(params.isEditable);
    if (!selectionText && !editable) return;
    const flags = params.editFlags || {};
    const menu = Menu.buildFromTemplate([
      { label: '剪下', role: 'cut', enabled: editable && Boolean(flags.canCut) },
      { label: '複製', role: 'copy', enabled: Boolean(flags.canCopy || selectionText) },
      { label: '貼上', role: 'paste', enabled: editable && Boolean(flags.canPaste) },
      { type: 'separator' },
      { label: '全選', role: 'selectAll', enabled: Boolean(flags.canSelectAll || editable || selectionText) },
    ]);
    menu.popup({ window });
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', guardNavigation);
  window.webContents.on('will-redirect', guardNavigation);
  window.on('close', (event) => {
    const guard = closeGuards.get(window);
    if (!guard || guard.allowClose) return;
    if (window.webContents.isDestroyed() || window.webContents.isLoading()) {
      guard.allowClose = true;
      return;
    }
    event.preventDefault();
    if (!guard.requestPending) {
      guard.requestPending = true;
      window.webContents.send('app:flush-before-close');
    }
  });
  if (isSmokeMode) {
    window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.error(`[electron-smoke] did-fail-load ${errorCode} ${errorDescription} ${validatedURL}`);
    });
    window.webContents.on('render-process-gone', (_event, details) => {
      console.error(`[electron-smoke] render-process-gone ${JSON.stringify(details)}`);
    });
    window.webContents.on('console-message', (_event, _level, message, line, sourceId) => {
      console.log(`[electron-smoke] console ${sourceId}:${line} ${message}`);
    });
  }
  window.loadPromise = window.loadFile(path.join(__dirname, 'index.html'));
  return window;
}

function closeWindowAndWait(window) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('window did not finish close flush'));
    }, 10_000);
    window.once('closed', () => {
      clearTimeout(timeout);
      resolve();
    });
    window.close();
  });
}

async function runElectronSmoke() {
  let window = createWindow({ show: false });
  try {
    await window.loadPromise;
    const smokeName = `Electron smoke ${Date.now()}`;
    const smokeScript = `
      (async () => {
        const expectedRoot = ${JSON.stringify(PROJECT_ROOT)};
        const displayName = ${JSON.stringify(smokeName)};
        const info = await window.pitchingApp.getAppInfo();
        if (typeof window.pitchingApp !== 'object' || typeof require !== 'undefined' || typeof process !== 'undefined') {
          throw new Error('renderer bridge is not isolated');
        }
        if (info.projectRoot !== expectedRoot) throw new Error('project root mismatch');

        const waitFor = async (predicate, message) => {
          for (let attempt = 0; attempt < 40; attempt += 1) {
            if (predicate()) return;
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          throw new Error(message);
        };

        document.querySelector('#new-project').click();
        const nameField = document.querySelector('#new-project-name');
        const form = document.querySelector('#new-project-form');
        if (!nameField || !form) throw new Error('new project form is missing');
        nameField.value = displayName;
        form.requestSubmit();
        await waitFor(
          () => document.querySelectorAll('[data-project-id]').length === 1,
          'created project is not listed in the renderer',
        );

        const projectButton = document.querySelector('[data-project-id]');
        const createdId = projectButton && projectButton.dataset.projectId;
        if (!createdId) throw new Error('created project id is missing from the project list');
        await waitFor(
          () => !document.querySelector('#editor')?.hidden
            && document.querySelector('#block-canvas')
            && !document.querySelector('#block-section-target')?.disabled,
          'created project did not open in the renderer',
        );

        const listed = await window.pitchingApp.listProjects();
        if (!listed.some((project) => project.id === createdId)) throw new Error('created project is not listed');

        const opened = await window.pitchingApp.openProject(createdId);
        opened.sections[0].title = 'Smoke section';
        opened.sections[0].blocks[0].content = 'Saved through Electron IPC';
        await window.pitchingApp.saveProject(opened);

        const sectionTitle = document.querySelector('#block-canvas [data-section-title]');
        const sectionContent = document.querySelector('#block-canvas [data-block-field="content"]');
        if (!sectionTitle || !sectionContent) throw new Error('editor fields are missing');
        sectionTitle.value = 'Autosaved section';
        sectionTitle.dispatchEvent(new Event('input', { bubbles: true }));
        sectionContent.value = 'Saved through renderer autosave';
        sectionContent.dispatchEvent(new Event('input', { bubbles: true }));
        await waitFor(
          () => document.querySelector('#save-state')?.dataset.state === 'dirty',
          'renderer did not mark the project dirty',
        );
        await waitFor(
          () => document.querySelector('#save-state')?.textContent === '已儲存',
          'renderer autosave did not finish',
        );

        const autosaved = await window.pitchingApp.openProject(createdId);
        if (autosaved.sections[0].title !== 'Autosaved section') throw new Error('autosaved section title did not persist');
        if (autosaved.sections[0].blocks[0].content !== 'Saved through renderer autosave') throw new Error('autosaved section content did not persist');

        const explicitSnapshot = await window.pitchingApp.openProject(createdId);
        explicitSnapshot.sections[0].title = 'Explicit saved section';
        explicitSnapshot.sections[0].blocks[0].content = 'Saved through explicit save';
        await window.pitchingApp.saveProject(explicitSnapshot);

        const explicitlySaved = await window.pitchingApp.openProject(createdId);
        if (explicitlySaved.sections[0].title !== 'Explicit saved section') throw new Error('explicit section title did not persist');
        if (explicitlySaved.sections[0].blocks[0].content !== 'Saved through explicit save') throw new Error('explicit section content did not persist');

        const imported = await window.pitchingApp.insertTextBlock({
          projectId: createdId,
          sectionId: 'summary',
          fileName: 'smoke-notes.md',
          content: '# Imported notes\\n\\nText import persisted through the app bridge.',
        });
        if (!imported.sections[1].blocks[0].content.includes('Text import persisted through the app bridge.')) {
          throw new Error('text import did not update the report model');
        }
        const importedReopened = await window.pitchingApp.openProject(createdId);
        if (!importedReopened.sections[1].blocks[0].content.includes('Text import persisted through the app bridge.')) {
          throw new Error('text import did not survive immediate reopen');
        }
        const listedMedia = await window.pitchingApp.listMedia(createdId);
        if (!Array.isArray(listedMedia) || listedMedia.length !== 0) throw new Error('empty media library did not list safely');
        if (!document.querySelector('#editor:not([hidden])')
          || !document.querySelector('#block-canvas')
          || !document.querySelector('#add-text-block')
          || !document.querySelector('#add-editor-single-video')
          || !document.querySelector('#add-editor-comparison-video')) {
          throw new Error('canonical block editor UI is not rendered');
        }
        sectionTitle.value = 'Close flush section';
        sectionTitle.dispatchEvent(new Event('input', { bubbles: true }));
        sectionContent.value = 'Saved while closing the application';
        sectionContent.dispatchEvent(new Event('input', { bubbles: true }));
        await waitFor(
          () => document.querySelector('#save-state')?.dataset.state === 'dirty',
          'renderer did not mark close-flush changes dirty',
        );

        let invalidProjectRejected = false;
        try { await window.pitchingApp.openProject('../outside'); } catch { invalidProjectRejected = true; }
        if (!invalidProjectRejected) throw new Error('invalid project id was accepted');

        return {
          projectId: createdId,
          projectRoot: info.projectRoot,
          projectFile: info.projectsRoot + '/' + createdId + '/project.json',
          autosaveVerified: true,
          explicitSaveVerified: true,
          textImportVerified: true,
          blockEditorUiVerified: true,
          editorControlsVerified: true,
          mediaListVerified: true,
          bridgeSecurityVerified: true,
          invalidProjectRejected,
        };
      })()
    `;
    const result = await window.webContents.executeJavaScript(smokeScript, true);
    const responsiveProbe = `
      (() => {
        const selectors = [
          '#save-project',
          '#import-text',
          '#import-media',
          '#add-text-block',
          '#add-editor-single-video',
          '#add-editor-comparison-video',
          '#export-report',
        ];
        const inspect = (selector) => {
          const element = document.querySelector(selector);
          if (!element) return { selector, present: false, visible: false, disabled: null };
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          const hiddenAncestor = element.closest('[hidden]');
          return {
            selector,
            present: true,
            visible: !hiddenAncestor
              && style.display !== 'none'
              && style.visibility !== 'hidden'
              && rect.width > 0
              && rect.height > 0,
            disabled: Boolean(element.disabled),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        };
        const controls = selectors.map(inspect);
        const overflow = {
          document: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
          body: document.body.scrollWidth <= document.body.clientWidth + 1,
        };
        return {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          controls,
          overflow,
          pass: controls.every((control) => control.present && control.visible)
            && overflow.document
            && overflow.body,
        };
      })()
    `;
    const originalSize = window.getSize();
    let responsiveEvidence;
    try {
      const desktop = await window.webContents.executeJavaScript(responsiveProbe, true);
      // Smoke-only viewport override; production launch keeps the normal minimum size.
      window.setMinimumSize(320, 480);
      window.setSize(600, 900);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const narrow = await window.webContents.executeJavaScript(responsiveProbe, true);
      responsiveEvidence = { desktop, narrow };
      if (!desktop.pass || !narrow.pass) {
        throw new Error(`responsive gate failed: ${JSON.stringify(responsiveEvidence)}`);
      }
    } finally {
      window.setMinimumSize(880, 600);
      window.setSize(originalSize[0], originalSize[1]);
    }
    result.responsiveGateVerified = true;
    result.responsiveEvidence = responsiveEvidence;
    await closeWindowAndWait(window);

    window = createWindow({ show: false });
    await window.loadPromise;
    const reopened = await window.webContents.executeJavaScript(`
      window.pitchingApp.openProject(${JSON.stringify(result.projectId)})
    `, true);
    if (reopened.sections[0].title !== 'Close flush section') {
      throw new Error('project did not reopen with the close-flushed title');
    }
    if (reopened.sections[0].blocks[0].content !== 'Saved while closing the application') {
      throw new Error('project did not reopen with the close-flushed content');
    }
    const payloadSnapshot = await window.webContents.executeJavaScript(`
      (async () => {
        const project = await window.pitchingApp.openProject(${JSON.stringify(result.projectId)});
        project.reportTitle = 'Smoke payload title';
        project.media = [{
          id: 'smoke-asset',
          mediaKind: 'video',
          displayName: 'smoke.mp4',
          lifecycleStatus: 'missing',
          timing: { duration: 2.5, fps: 60, precision: 'unknown' },
        }];
        project.sections[0].blocks.push({
          id: 'smoke-video-block',
          type: 'singleVideo',
          mediaAssetId: 'smoke-asset',
          label: 'Future media block',
          playback: { rate: 0.75 },
        });
        project.exportSettings = {
          lastOutputPath: ${JSON.stringify(path.join(PROJECT_ROOT, 'output'))},
          outputKind: 'folder',
          includeMedia: true,
          validation: { requirePortablePaths: true },
        };
        project.futureReportExtension = { sourceRevision: 4 };
        return window.pitchingApp.saveProject(project);
      })()
    `, true);
    if (payloadSnapshot.reportTitle !== 'Smoke payload title') {
      throw new Error('report payload title did not persist');
    }
    if (payloadSnapshot.media?.[0]?.timing?.fps !== 60) {
      throw new Error('media payload schema was dropped');
    }
    if (payloadSnapshot.sections[0].blocks.at(-1)?.mediaAssetId !== 'smoke-asset') {
      throw new Error('future media block payload was dropped');
    }
    if (payloadSnapshot.exportSettings?.validation?.requirePortablePaths !== true) {
      throw new Error('export settings schema was dropped');
    }
    const payloadReopened = await window.webContents.executeJavaScript(`
      window.pitchingApp.openProject(${JSON.stringify(result.projectId)})
    `, true);
    if (payloadReopened.media?.[0]?.timing?.precision !== 'unknown'
      || payloadReopened.exportSettings?.outputKind !== 'folder'
      || payloadReopened.futureReportExtension?.sourceRevision !== 4) {
      throw new Error('project payload did not survive reopen');
    }

    const projectFile = path.join(projectStore.projectDirectory(result.projectId), 'project.json');
    const projectFileStat = await fs.stat(projectFile);
    const realProjectsRoot = await fs.realpath(projectStore.projectsRoot);
    const realProjectFile = await fs.realpath(projectFile);
    if (!projectFileStat.isFile()
      || !isPathInside(projectStore.projectsRoot, projectFile)
      || !isPathInside(realProjectsRoot, realProjectFile)) {
      throw new Error('project file escaped the projects boundary');
    }
    return {
      ...result,
      payloadSchemaVerified: true,
      closeFlushVerified: true,
      reopenVerified: true,
    };
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
}

app.whenReady().then(async () => {
  try {
    await validateProjectRoot(PROJECT_ROOT, APP_ROOT);
  } catch (error) {
    console.error(`[app] invalid project root: ${error.message}`);
    if (smokeProjectRoot) await fs.rm(smokeProjectRoot, { recursive: true, force: true }).catch(() => {});
    process.exitCode = 1;
    process.exit(1);
    return;
  }

  registerIpc();

  if (isSmokeMode) {
    let exitCode = 0;
    try {
      const result = await runElectronSmoke();
      console.log(`[electron-smoke] ${JSON.stringify(result)}`);
    } catch (error) {
      console.error(`[electron-smoke] ${error.message}`);
      exitCode = 1;
    } finally {
      if (smokeProjectRoot) {
        try {
          await fs.rm(smokeProjectRoot, { recursive: true, force: true });
        } catch (error) {
          console.error(`[electron-smoke] cleanup failed: ${error.message}`);
          exitCode = 1;
        }
      }
      process.exitCode = exitCode;
      process.exit(exitCode);
    }
    return;
  }

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
