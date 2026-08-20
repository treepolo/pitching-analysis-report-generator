'use strict';

const { app, BrowserWindow, dialog, ipcMain } = require('electron');
if (process.env.PITCHING_DISABLE_GPU === '1') {
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('in-process-gpu');
  app.disableHardwareAcceleration();
}

const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const {
  createProjectStore,
  isPathInside,
  validateProjectRoot,
} = require('./storage');
const syncDomain = require('./sync/domain');
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
const nativePlayerSessions = new Map();
const FRAME_CACHE_PROJECT_ID_PATTERN = /^[a-z0-9-]{1,80}$/u;
const FRAME_CACHE_REQUEST_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u;
const FRAME_CACHE_MAX_FRAME_BYTES = 32 * 1024 * 1024;
const NATIVE_PLAYER_PROTOCOL_VERSION = 1;
const NATIVE_PLAYER_SESSION_ID_PATTERN = /^[0-9a-f-]{36}$/iu;
const NATIVE_PLAYER_REQUEST_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u;
const NATIVE_PLAYER_SURFACE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/u;
const NATIVE_PLAYER_HELPER_PATH = path.join(APP_ROOT, 'native', 'bin', 'media-foundation-player.exe');
const NATIVE_PLAYER_MAX_COMMAND_BYTES = 4096;

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

function nativePlayerError(code, message, extra = {}) {
  return {
    schemaVersion: NATIVE_PLAYER_PROTOCOL_VERSION,
    ok: false,
    status: 'error',
    code,
    message,
    ...extra,
  };
}

function nativePlayerSuccess(session, extra = {}) {
  return {
    schemaVersion: NATIVE_PLAYER_PROTOCOL_VERSION,
    ok: true,
    status: 'completed',
    sessionId: session.id,
    surfaceId: session.surfaceId,
    ...extra,
  };
}

function nativePlayerWindowHandle(senderWindow) {
  if (process.platform !== 'win32' || typeof senderWindow?.getNativeWindowHandle !== 'function') {
    return null;
  }
  let nativeHandle;
  try {
    nativeHandle = senderWindow.getNativeWindowHandle();
  } catch {
    return null;
  }
  if (!Buffer.isBuffer(nativeHandle) || nativeHandle.length === 0) return null;
  const bytes = Math.min(nativeHandle.length, 8);
  let value = 0n;
  for (let index = 0; index < bytes; index += 1) {
    value |= BigInt(nativeHandle[index]) << BigInt(index * 8);
  }
  return value === 0n ? null : value.toString(16);
}

function nativePlayerAssetMetadata(asset) {
  const metadata = asset?.metadata && typeof asset.metadata === 'object' ? asset.metadata : {};
  const timing = asset?.timing && typeof asset.timing === 'object' ? asset.timing : {};
  const durationSeconds = [metadata.durationSeconds, metadata.duration, timing.duration]
    .find((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0) ?? null;
  const fps = [metadata.fps, metadata.averageFps, timing.fps]
    .find((value) => typeof value === 'number' && Number.isFinite(value) && value > 0) ?? 30;
  const frameCount = [metadata.frameCount, timing.frameCount]
    .find((value) => Number.isInteger(value) && value > 0)
    ?? (durationSeconds !== null ? Math.max(1, Math.ceil(durationSeconds * fps)) : 1);
  return { durationSeconds, fps, frameCount };
}

async function resolveNativePlayerAsset(projectId, assetId) {
  const project = await projectStore.readProject(projectId);
  const asset = project.media.find((entry) => entry && entry.id === assetId);
  if (!asset || asset.mediaKind !== 'video') {
    const error = new Error('Native player source is not a project-local video');
    error.code = 'NATIVE_PLAYER_SOURCE_UNAVAILABLE';
    throw error;
  }
  const resolved = await projectStore.resolveMediaAssetSource(projectId, assetId);
  const sourceEntry = await fs.lstat(resolved.sourcePath);
  if (sourceEntry.isSymbolicLink()) {
    const error = new Error('Native player source cannot be a symbolic link');
    error.code = 'NATIVE_PLAYER_SOURCE_UNAVAILABLE';
    throw error;
  }
  const realProjectRoot = await fs.realpath(projectStore.root);
  const realSourcePath = await fs.realpath(resolved.sourcePath);
  const sourceStats = await fs.lstat(realSourcePath);
  if (!sourceStats.isFile() || sourceStats.isSymbolicLink()
    || !isPathInside(realProjectRoot, realSourcePath)) {
    const error = new Error('Native player source is outside the project boundary');
    error.code = 'NATIVE_PLAYER_SOURCE_UNAVAILABLE';
    throw error;
  }
  return {
    project,
    asset,
    sourcePath: realSourcePath,
    metadata: nativePlayerAssetMetadata(asset),
  };
}

function nativePlayerEventError(event, fallbackCode = 'NATIVE_PLAYER_FAILED') {
  const error = new Error('Native player operation failed');
  error.code = typeof event?.error?.code === 'string'
    && /^[A-Z0-9_:-]{1,120}$/u.test(event.error.code)
    ? event.error.code
    : fallbackCode;
  return error;
}

function rejectNativePlayerPending(session, error) {
  for (const pending of session.pending.values()) pending.reject(error);
  session.pending.clear();
}

function finishNativePlayerSession(session) {
  if (session.closed) return;
  session.closed = true;
  rejectNativePlayerPending(session, new Error('Native player process closed'));
  if (session.readyReject) session.readyReject(new Error('Native player process closed'));
  nativePlayerSessions.delete(session.id);
}

function handleNativePlayerEvent(session, event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return;
  if (session.window?.webContents && !session.window.webContents.isDestroyed()) {
    const forwarded = {
      schemaVersion: NATIVE_PLAYER_PROTOCOL_VERSION,
      sessionId: session.id,
      type: typeof event.type === 'string' ? event.type.slice(0, 80) : 'unknown',
      ...(typeof event.requestId === 'string' && NATIVE_PLAYER_REQUEST_ID_PATTERN.test(event.requestId)
        ? { requestId: event.requestId } : {}),
      ...(Number.isInteger(event.frameIndex) ? { frameIndex: event.frameIndex } : {}),
      ...(event.type === 'scrub-complete' ? { surfaceUpdated: true } : {}),
    };
    session.window.webContents.send('native-player:event', forwarded);
  }
  if (event.type === 'ready') {
    session.topologyReady = true;
    return;
  }
  if (event.type === 'opened') {
    session.ready = true;
    if (Number.isInteger(event.frameCount) && event.frameCount > 0) session.metadata.frameCount = event.frameCount;
    if (typeof event.fps === 'number' && Number.isFinite(event.fps) && event.fps > 0) session.metadata.fps = event.fps;
    if (typeof event.durationSeconds === 'number' && Number.isFinite(event.durationSeconds) && event.durationSeconds >= 0) {
      session.metadata.durationSeconds = event.durationSeconds;
    }
    if (session.readyResolve) {
      session.readyResolve();
      session.readyResolve = null;
      session.readyReject = null;
    }
    return;
  }
  if (event.type === 'open-failed' || (event.type === 'error' && !session.ready)) {
    const error = nativePlayerEventError(event, 'NATIVE_PLAYER_UNAVAILABLE');
    if (session.readyReject) {
      session.readyReject(error);
      session.readyResolve = null;
      session.readyReject = null;
    }
    return;
  }
  if (event.type === 'error' && session.ready) {
    rejectNativePlayerPending(session, nativePlayerEventError(event));
    return;
  }
  const requestId = typeof event.requestId === 'string' ? event.requestId : '';
  const pending = requestId ? session.pending.get(requestId) : null;
  if (!pending) return;
  if (event.type === 'command-failed' || event.ok === false) {
    session.pending.delete(requestId);
    pending.reject(nativePlayerEventError(event));
    return;
  }
  if (!pending.types.has(event.type)) return;
  session.pending.delete(requestId);
  pending.resolve(event);
}

function attachNativePlayerProcess(session) {
  let stdoutBuffer = '';
  session.child.stdout.setEncoding('utf8');
  session.child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk;
    if (stdoutBuffer.length > NATIVE_PLAYER_MAX_COMMAND_BYTES * 4) {
      session.child.kill();
      return;
    }
    let newlineIndex = stdoutBuffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = stdoutBuffer.slice(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      if (line) {
        try {
          handleNativePlayerEvent(session, JSON.parse(line));
        } catch {
          // Native stdout is not a renderer-facing data channel. Ignore malformed lines.
        }
      }
      newlineIndex = stdoutBuffer.indexOf('\n');
    }
  });
  session.child.stderr.setEncoding('utf8');
  session.child.stderr.on('data', () => {});
  session.child.once('error', (error) => {
    const wrapped = new Error('Native player helper is unavailable');
    wrapped.code = error?.code === 'ENOENT' ? 'NATIVE_PLAYER_UNAVAILABLE' : 'NATIVE_PLAYER_FAILED';
    rejectNativePlayerPending(session, wrapped);
    if (session.readyReject) session.readyReject(wrapped);
  });
  session.child.once('exit', () => finishNativePlayerSession(session));
}

function sendNativePlayerCommand(session, command, payload, expectedTypes, timeoutMs = 5000) {
  if (!session || session.closed || !session.ready || !session.child.stdin || session.child.stdin.destroyed) {
    return Promise.reject(Object.assign(new Error('Native player session is unavailable'), {
      code: 'NATIVE_PLAYER_UNAVAILABLE',
    }));
  }
  const requestId = payload.requestId || randomUUID();
  const line = `${JSON.stringify({ command, requestId, ...payload })}\n`;
  if (Buffer.byteLength(line, 'utf8') > NATIVE_PLAYER_MAX_COMMAND_BYTES) {
    return Promise.reject(Object.assign(new Error('Native player request is too large'), {
      code: 'NATIVE_PLAYER_REQUEST_INVALID',
    }));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      session.pending.delete(requestId);
      const error = new Error('Native player operation timed out');
      error.code = 'NATIVE_PLAYER_TIMEOUT';
      reject(error);
    }, timeoutMs);
    session.pending.set(requestId, {
      types: new Set(expectedTypes),
      resolve: (event) => {
        clearTimeout(timer);
        resolve(event);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
    try {
      session.child.stdin.write(line, 'utf8');
    } catch (error) {
      clearTimeout(timer);
      session.pending.delete(requestId);
      reject(Object.assign(new Error('Native player helper is unavailable'), {
        code: error?.code || 'NATIVE_PLAYER_UNAVAILABLE',
      }));
    }
  });
}

function nativePlayerSessionFor(senderWindow, sessionId) {
  if (typeof sessionId !== 'string' || !NATIVE_PLAYER_SESSION_ID_PATTERN.test(sessionId)) {
    const error = new Error('Native player session id is invalid');
    error.code = 'NATIVE_PLAYER_SESSION_INVALID';
    throw error;
  }
  const session = nativePlayerSessions.get(sessionId);
  if (!session || session.window !== senderWindow || session.closed) {
    const error = new Error('Native player session is invalid');
    error.code = 'NATIVE_PLAYER_SESSION_INVALID';
    throw error;
  }
  return session;
}

function assertNativePlayerSurface(session, surfaceId) {
  if (typeof surfaceId !== 'string' || !NATIVE_PLAYER_SURFACE_ID_PATTERN.test(surfaceId)
    || surfaceId !== session.surfaceId) {
    const error = new Error('Native player surface does not belong to this session');
    error.code = 'NATIVE_PLAYER_SESSION_INVALID';
    throw error;
  }
}

async function closeNativePlayerSession(session) {
  if (!session || session.closed) return;
  try {
    if (session.ready) await sendNativePlayerCommand(session, 'close', {}, ['closed'], 1500);
  } catch {
    // Process termination below is the cleanup boundary when the helper cannot respond.
  }
  if (!session.closed && session.child && !session.child.killed) session.child.kill();
  finishNativePlayerSession(session);
}

function nativePlayerBounds(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Native player bounds are invalid');
  }
  const integer = (field, minimum, maximum) => {
    if (!Number.isInteger(value[field]) || value[field] < minimum || value[field] > maximum) {
      throw new Error(`Native player bounds.${field} is invalid`);
    }
    return value[field];
  };
  const devicePixelRatio = value.devicePixelRatio === undefined ? 1 : value.devicePixelRatio;
  if (typeof devicePixelRatio !== 'number' || !Number.isFinite(devicePixelRatio)
    || devicePixelRatio < 0.25 || devicePixelRatio > 8) {
    throw new Error('Native player bounds.devicePixelRatio is invalid');
  }
  return {
    x: integer('x', -100_000, 100_000),
    y: integer('y', -100_000, 100_000),
    width: integer('width', 1, 16_384),
    height: integer('height', 1, 16_384),
    devicePixelRatio,
  };
}

function normalizeNativePlayerRequestId(value) {
  const requestId = value === undefined ? randomUUID() : value;
  if (typeof requestId !== 'string' || !NATIVE_PLAYER_REQUEST_ID_PATTERN.test(requestId)) {
    const error = new Error('Native player request id is invalid');
    error.code = 'NATIVE_PLAYER_REQUEST_INVALID';
    throw error;
  }
  return requestId;
}

function normalizeNativePlayerSurfaceId(value) {
  if (typeof value !== 'string' || !NATIVE_PLAYER_SURFACE_ID_PATTERN.test(value)) {
    const error = new Error('Native player surface id is invalid');
    error.code = 'NATIVE_PLAYER_REQUEST_INVALID';
    throw error;
  }
  return value;
}

function nativePlayerFailureResponse(error, fallbackCode = 'NATIVE_PLAYER_FAILED') {
  const code = typeof error?.code === 'string' && /^[A-Z0-9_:-]{1,120}$/u.test(error.code)
    ? error.code
    : fallbackCode;
  const message = typeof error?.message === 'string' && error.message.trim() !== ''
    ? error.message.slice(0, 500)
    : 'Native player operation failed';
  return nativePlayerError(code, message);
}

function nativePlayerValidateIdentity(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    const error = new Error('Native player request must be an object');
    error.code = 'NATIVE_PLAYER_REQUEST_INVALID';
    throw error;
  }
  if (!FRAME_CACHE_PROJECT_ID_PATTERN.test(payload.projectId)) {
    const error = new Error('Native player project id is invalid');
    error.code = 'NATIVE_PLAYER_REQUEST_INVALID';
    throw error;
  }
  if (typeof payload.assetId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u.test(payload.assetId)) {
    const error = new Error('Native player asset id is invalid');
    error.code = 'NATIVE_PLAYER_REQUEST_INVALID';
    throw error;
  }
  return {
    projectId: payload.projectId,
    assetId: payload.assetId,
    surfaceId: normalizeNativePlayerSurfaceId(payload.surfaceId),
  };
}

async function openNativePlayerSession(senderWindow, payload) {
  const identity = nativePlayerValidateIdentity(payload);
  if (process.platform !== 'win32') {
    return nativePlayerError('NATIVE_PLAYER_UNAVAILABLE', 'Media Foundation 原生播放器只支援 Windows。');
  }
  if (!(await fs.stat(NATIVE_PLAYER_HELPER_PATH).catch(() => null))?.isFile()) {
    return nativePlayerError('NATIVE_PLAYER_UNAVAILABLE', '尚未建置 Media Foundation 原生播放器。');
  }
  const windowHandle = nativePlayerWindowHandle(senderWindow);
  if (!windowHandle) {
    return nativePlayerError('NATIVE_PLAYER_UNAVAILABLE', '目前視窗沒有可用的原生畫面句柄。');
  }
  const resolved = await resolveNativePlayerAsset(identity.projectId, identity.assetId);
  const id = randomUUID();
  const child = spawn(NATIVE_PLAYER_HELPER_PATH, [
    '--source', resolved.sourcePath,
    '--hwnd', windowHandle,
  ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const session = {
    id,
    window: senderWindow,
    projectId: identity.projectId,
    assetId: identity.assetId,
    surfaceId: identity.surfaceId,
    sourcePath: resolved.sourcePath,
    metadata: resolved.metadata,
    child,
    pending: new Map(),
    ready: false,
    closed: false,
    currentFrameIndex: 0,
    activeScrubRequest: null,
  };
  nativePlayerSessions.set(id, session);
  attachNativePlayerProcess(session);
  try {
    await new Promise((resolve, reject) => {
      session.readyResolve = resolve;
      session.readyReject = reject;
      session.readyTimer = setTimeout(() => {
        const error = new Error('Native player did not become ready');
        error.code = 'NATIVE_PLAYER_TIMEOUT';
        reject(error);
      }, 15_000);
    });
    clearTimeout(session.readyTimer);
    session.readyResolve = null;
    session.readyReject = null;
    return nativePlayerSuccess(session, {
      frameCount: session.metadata.frameCount,
      fps: session.metadata.fps,
      durationSeconds: session.metadata.durationSeconds,
      currentFrameIndex: 0,
    });
  } catch (error) {
    clearTimeout(session.readyTimer);
    await closeNativePlayerSession(session);
    return nativePlayerFailureResponse(error, 'NATIVE_PLAYER_UNAVAILABLE');
  }
}

async function nativePlayerScrub(senderWindow, payload) {
  const session = nativePlayerSessionFor(senderWindow, payload.sessionId);
  assertNativePlayerSurface(session, payload.surfaceId);
  if (!Number.isInteger(payload.frameIndex) || payload.frameIndex < 0
    || payload.frameIndex >= session.metadata.frameCount) {
    throw Object.assign(new Error('Native player frame index is invalid'), { code: 'NATIVE_PLAYER_REQUEST_INVALID' });
  }
  const frameIndex = payload.frameIndex;
  const requestId = normalizeNativePlayerRequestId(payload.requestId);
  if (session.activeScrubRequest && session.activeScrubRequest !== requestId) {
    const previous = session.pending.get(session.activeScrubRequest);
    if (previous) {
      session.pending.delete(session.activeScrubRequest);
      const cancelled = new Error('Native scrub superseded by a newer pointer position');
      cancelled.code = 'NATIVE_PLAYER_SCRUB_SUPERSEDED';
      previous.reject(cancelled);
    }
  }
  session.activeScrubRequest = requestId;
  const position100ns = Math.max(0, Math.round((frameIndex / session.metadata.fps) * 10_000_000));
  try {
    const response = await sendNativePlayerCommand(
      session,
      'scrub',
      { requestId, position100ns, frameIndex },
      ['scrub-complete'],
      15_000,
    );
    session.currentFrameIndex = frameIndex;
    return nativePlayerSuccess(session, {
      requestId,
      frameIndex,
      surfaceUpdated: response.type === 'scrub-complete',
      completion: response.completion || 'MESessionScrubSampleComplete',
    });
  } finally {
    if (session.activeScrubRequest === requestId) session.activeScrubRequest = null;
  }
}

async function nativePlayerStep(senderWindow, payload) {
  const session = nativePlayerSessionFor(senderWindow, payload.sessionId);
  assertNativePlayerSurface(session, payload.surfaceId);
  if (![-1, 1].includes(payload.direction)) {
    throw Object.assign(new Error('Native player step direction is invalid'), { code: 'NATIVE_PLAYER_REQUEST_INVALID' });
  }
  const requestId = normalizeNativePlayerRequestId(payload.requestId);
  const target = Math.min(session.metadata.frameCount - 1,
    Math.max(0, session.currentFrameIndex + payload.direction));
  if (target === session.currentFrameIndex) {
    return nativePlayerSuccess(session, { requestId, frameIndex: target, surfaceUpdated: true });
  }
  // Media Foundation's documented scrub completion is the only completion
  // signal that guarantees the new sample has reached the renderer. EVR's
  // IVideoFrameStep::Step is asynchronous and its completion is delivered to
  // a DirectShow graph manager, not this Media Session host. Use native MF
  // scrubbing for both directions until an EVR presenter completion bridge is
  // present; never report the Step submission itself as a displayed frame.
  const position100ns = Math.max(0, Math.round((target / session.metadata.fps) * 10_000_000));
  const response = await sendNativePlayerCommand(session, 'scrub', {
    requestId,
    position100ns,
    frameIndex: target,
  }, ['scrub-complete'], 15_000);
  session.currentFrameIndex = target;
  return nativePlayerSuccess(session, {
    requestId,
    frameIndex: target,
    surfaceUpdated: true,
    completion: response.type,
  });
}

async function nativePlayerCommand(senderWindow, payload, command, expectedTypes, extra = {}) {
  const session = nativePlayerSessionFor(senderWindow, payload.sessionId);
  const requestId = normalizeNativePlayerRequestId(payload.requestId);
  const response = await sendNativePlayerCommand(session, command, { requestId, ...extra }, expectedTypes);
  return nativePlayerSuccess(session, {
    requestId,
    surfaceUpdated: true,
    ended: response.type === 'ended',
  });
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
  ipcMain.handle('sync:align', (event, payload) => {
    assertTrustedSender(event);
    return syncDomain.alignComparisonAtRelativeTime(payload?.sides, payload?.relativeTime, payload?.options);
  });
  ipcMain.handle('sync:capture', (event, payload) => {
    assertTrustedSender(event);
    return syncDomain.captureSyncAnchor(payload);
  });
  ipcMain.handle('sync:create-player', (event, payload) => {
    assertTrustedSender(event);
    return syncDomain.createPlayerBlock(payload);
  });
  ipcMain.handle('sync:map-anchor', (event, payload) => {
    assertTrustedSender(event);
    return syncDomain.mapAnchorToRelativeTime(payload?.anchor, payload?.relativeTime, payload?.options);
  });
  ipcMain.handle('sync:frame-step', (event, payload) => {
    assertTrustedSender(event);
    return syncDomain.planFrameStep(payload);
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
  ipcMain.handle('native-player:open', async (event, payload) => {
    const senderWindow = assertTrustedSender(event);
    try {
      return await openNativePlayerSession(senderWindow, payload);
    } catch (error) {
      return nativePlayerFailureResponse(error, 'NATIVE_PLAYER_SOURCE_UNAVAILABLE');
    }
  });
  ipcMain.handle('native-player:set-bounds', async (event, payload) => {
    const senderWindow = assertTrustedSender(event);
    try {
      const session = nativePlayerSessionFor(senderWindow, payload?.sessionId);
      assertNativePlayerSurface(session, payload?.surfaceId);
      const bounds = nativePlayerBounds(payload?.bounds);
      const requestId = normalizeNativePlayerRequestId(payload?.requestId);
      const response = await sendNativePlayerCommand(session, 'set-bounds', {
        requestId,
        ...bounds,
      }, ['bounds-applied'], 5_000);
      return nativePlayerSuccess(session, { requestId, surfaceUpdated: response.type === 'bounds-applied' });
    } catch (error) {
      return nativePlayerFailureResponse(error);
    }
  });
  ipcMain.handle('native-player:scrub', async (event, payload) => {
    const senderWindow = assertTrustedSender(event);
    try {
      return await nativePlayerScrub(senderWindow, payload || {});
    } catch (error) {
      return nativePlayerFailureResponse(error);
    }
  });
  ipcMain.handle('native-player:step', async (event, payload) => {
    const senderWindow = assertTrustedSender(event);
    try {
      return await nativePlayerStep(senderWindow, payload || {});
    } catch (error) {
      return nativePlayerFailureResponse(error);
    }
  });
  ipcMain.handle('native-player:play', async (event, payload) => {
    const senderWindow = assertTrustedSender(event);
    try {
      const rate = Number(payload?.rate ?? payload?.playbackRate ?? 1);
      if (!Number.isFinite(rate) || rate <= 0 || rate > 16) {
        throw Object.assign(new Error('Native player playback rate is invalid'), { code: 'NATIVE_PLAYER_REQUEST_INVALID' });
      }
      return await nativePlayerCommand(senderWindow, payload || {}, 'play', ['play'], { rate100: Math.round(rate * 100) });
    } catch (error) {
      return nativePlayerFailureResponse(error);
    }
  });
  ipcMain.handle('native-player:pause', async (event, payload) => {
    const senderWindow = assertTrustedSender(event);
    try {
      return await nativePlayerCommand(senderWindow, payload || {}, 'pause', ['pause']);
    } catch (error) {
      return nativePlayerFailureResponse(error);
    }
  });
  ipcMain.handle('native-player:close', async (event, payload) => {
    const senderWindow = assertTrustedSender(event);
    try {
      const session = nativePlayerSessionFor(senderWindow, payload?.sessionId);
      await closeNativePlayerSession(session);
      return { schemaVersion: NATIVE_PLAYER_PROTOCOL_VERSION, ok: true, status: 'completed', sessionId: session.id };
    } catch (error) {
      return nativePlayerFailureResponse(error);
    }
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
    const frameCaches = await readExportFrameCaches(project);
    return exportJobs.start({
      projectId: project.id,
      projectRoot: PROJECT_ROOT,
      reportDocument: project,
      assets: project.media,
      frameCaches,
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
  window.on('closed', () => {
    for (const session of nativePlayerSessions.values()) {
      if (session.window === window) void closeNativePlayerSession(session);
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
        if (typeof window.pitchingApp.sync?.planFrameStep !== 'function') {
          throw new Error('sync frame-step bridge is missing');
        }
        const unknownStep = await window.pitchingApp.sync.planFrameStep({
          timing: { kind: 'unknown' },
          duration: 2.5,
          currentTime: 0,
          direction: 1,
          capability: false,
        });
        if (!unknownStep.fallback || unknownStep.resolution !== 'unsupported') {
          throw new Error('unknown frame-step capability did not remain an explicit fallback');
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
          syncFallbackVerified: true,
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
