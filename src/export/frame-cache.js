'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  ExportValidationError,
  normalizeRelativeAssetPath,
  portableAssetPathKey,
  safeAssetFilename,
} = require('./asset-paths');
const {
  FRAME_CACHE_RESPONSE_STATUS,
  FrameCacheContractError,
  normalizeFrameCacheResponse,
} = require('../media/frame-cache-contract');

const FRAME_CACHE_OUTPUT_ROOT = 'images/frame-cache';

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function pathInsideOrEqual(rootPath, candidatePath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return relative === ''
    || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function portablePathInside(rootPath, candidatePath) {
  const relative = path.posix.relative(rootPath, candidatePath);
  return relative === '' || (relative !== '..' && !relative.startsWith('../') && !path.posix.isAbsolute(relative));
}

function normalizePortablePath(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ExportValidationError(`${fieldName} is required`);
  }
  const normalized = value.replaceAll('\\', '/');
  try {
    return normalizeRelativeAssetPath(normalized, { allowRootFile: true });
  } catch (error) {
    throw new ExportValidationError(`${fieldName} is invalid`, { cause: error });
  }
}

function unwrapFrameCache(value) {
  if (!isRecord(value)) return value;
  for (const key of ['response', 'frameCacheResponse', 'cacheResponse', 'frameCache']) {
    if (isRecord(value[key])) return value[key];
  }
  return value;
}

function frameCacheEntryAssetId(value) {
  if (!isRecord(value)) return null;
  if (typeof value.assetId === 'string' && value.assetId.length > 0) return value.assetId;
  if (typeof value.id === 'string' && value.id.length > 0
    && (value.status !== undefined || value.frames !== undefined || value.cache !== undefined)) {
    return value.id;
  }
  if (isRecord(value.asset) && typeof value.asset.id === 'string') return value.asset.id;
  return null;
}

function frameCachePayloadFromEntry(value) {
  if (!isRecord(value)) return value;
  if (isRecord(value.response)) return value.response;
  if (isRecord(value.frameCacheResponse)) return value.frameCacheResponse;
  if (isRecord(value.cacheResponse)) return value.cacheResponse;
  if (isRecord(value.frameCache)) return value.frameCache;
  return value;
}

/**
 * Build a raw asset-id lookup without validating entries that are not
 * referenced by the report. This preserves the canonical referenced-only
 * export rule: a malformed unused cache cannot block a valid export.
 */
function indexFrameCaches(value, { assetIds = null } = {}) {
  const indexed = new Map();
  if (value === null || value === undefined) return indexed;

  const add = (assetId, payload) => {
    if (typeof assetId !== 'string' || assetId.length === 0) return;
    if (indexed.has(assetId)) {
      throw new ExportValidationError(`Duplicate frame cache asset id: ${assetId}`);
    }
    indexed.set(assetId, payload);
  };

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      const assetId = frameCacheEntryAssetId(entry);
      if (!assetId) {
        if (assetIds === null) throw new ExportValidationError(`Frame cache entry ${index} has no assetId`);
        return;
      }
      if (assetIds && !assetIds.has(assetId)) return;
      add(assetId, frameCachePayloadFromEntry(entry));
    });
    return indexed;
  }

  if (!isRecord(value)) throw new ExportValidationError('Frame caches must be an array or object');
  const directAssetId = frameCacheEntryAssetId(value);
  if (directAssetId) {
    if (assetIds && !assetIds.has(directAssetId)) return indexed;
    add(directAssetId, frameCachePayloadFromEntry(value));
    return indexed;
  }
  const mapValue = isRecord(value.byAssetId) ? value.byAssetId : value;
  Object.entries(mapValue).forEach(([assetId, entry]) => {
    if (assetIds && !assetIds.has(assetId)) return;
    add(assetId, frameCachePayloadFromEntry(entry));
  });
  return indexed;
}

function normalizeCacheResponse(value, assetId) {
  if (value === null || value === undefined) return null;
  let normalized;
  try {
    normalized = normalizeFrameCacheResponse(unwrapFrameCache(value));
  } catch (error) {
    if (error instanceof FrameCacheContractError) {
      throw new ExportValidationError(`Frame cache for asset ${assetId} is invalid: ${error.message}`, { cause: error });
    }
    throw error;
  }
  if (normalized.assetId !== assetId) {
    throw new ExportValidationError(`Frame cache asset id does not match referenced asset: ${assetId}`);
  }
  if (normalized.status !== FRAME_CACHE_RESPONSE_STATUS.READY) {
    return {
      assetId,
      status: normalized.status,
      ready: false,
      error: normalized.error,
      response: normalized,
    };
  }
  if (!normalized.sourceIdentity) {
    throw new ExportValidationError(`Ready frame cache for asset ${assetId} has no source identity`);
  }
  if (!normalized.cache || normalized.cache.format !== 'png' || normalized.frames.length === 0) {
    throw new ExportValidationError(`Ready frame cache for asset ${assetId} has no usable PNG index`);
  }
  return {
    assetId,
    status: normalized.status,
    ready: true,
    error: null,
    response: normalized,
  };
}

function resolveFrameCacheForAsset(asset, indexedCaches) {
  const embedded = asset?.frameCacheResponse
    ?? asset?.frameCache
    ?? asset?.frameIndex
    ?? asset?.readyFrameCache;
  if (embedded !== undefined && embedded !== null) return normalizeCacheResponse(embedded, asset.id);
  const raw = indexedCaches.get(asset?.id);
  return raw === undefined ? null : normalizeCacheResponse(raw, asset.id);
}

function sourcePathFromAsset(asset) {
  for (const value of [
    asset?.sourcePath,
    asset?.sourceReference,
    asset?.normalizedReference,
    asset?.filePath,
    asset?.localPath,
  ]) {
    if (typeof value === 'string' && value.length > 0) return value;
    if (isRecord(value)) {
      if (typeof value.relativePath === 'string' && value.relativePath.length > 0) return value.relativePath;
      if (typeof value.path === 'string' && value.path.length > 0) return value.path;
    }
  }
  return null;
}

function normalizeSourcePath(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const normalized = value.trim().replaceAll('\\', '/');
  if (/^[a-z][a-z\d+.-]*:/iu.test(normalized) || normalized.startsWith('/') || /^[a-z]:/iu.test(normalized)) {
    return null;
  }
  return normalized;
}

function assertProjectRelativePath(projectRoot, projectRootReal, relativePath, description) {
  const normalized = normalizePortablePath(relativePath, description);
  const targetPath = path.resolve(projectRoot, ...normalized.split('/'));
  if (!pathInsideOrEqual(projectRoot, targetPath) || targetPath === path.resolve(projectRoot)) {
    throw new ExportValidationError(`${description} resolves outside the project root`);
  }
  return { normalized, targetPath, projectRootReal };
}

async function nearestRealPath(targetPath) {
  let current = path.resolve(targetPath);
  while (true) {
    try {
      return await fs.realpath(current);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
}

async function assertRegularProjectFile(projectRoot, projectRootReal, relativePath, description) {
  const { normalized, targetPath } = assertProjectRelativePath(projectRoot, projectRootReal, relativePath, description);
  const realPath = await nearestRealPath(targetPath).catch((error) => {
    throw new ExportValidationError(`${description} is unavailable`, { cause: error });
  });
  if (!pathInsideOrEqual(projectRootReal, realPath)) {
    throw new ExportValidationError(`${description} resolves outside the project root`);
  }
  const stats = await fs.lstat(targetPath).catch((error) => {
    throw new ExportValidationError(`${description} is unavailable`, { cause: error });
  });
  if (stats.isSymbolicLink()) throw new ExportValidationError(`${description} must not be a symlink`);
  if (!stats.isFile()) throw new ExportValidationError(`${description} is not a regular file`);
  return { normalized, targetPath, realPath, stats };
}

function ensureCachePaths(cache, frames, assetId) {
  const root = normalizePortablePath(cache.rootRelativePath, `Frame cache ${assetId} rootRelativePath`);
  const index = normalizePortablePath(cache.indexRelativePath, `Frame cache ${assetId} indexRelativePath`);
  const frameDirectory = normalizePortablePath(
    cache.frameDirectoryRelativePath,
    `Frame cache ${assetId} frameDirectoryRelativePath`,
  );
  if (!portablePathInside(root, index) || index === root) {
    throw new ExportValidationError(`Frame cache ${assetId} index is outside its cache root`);
  }
  if (!portablePathInside(root, frameDirectory) || frameDirectory === root) {
    throw new ExportValidationError(`Frame cache ${assetId} frame directory is outside its cache root`);
  }
  const normalizedFrames = frames.map((frame, indexNumber) => {
    const relativePath = normalizePortablePath(frame.relativePath, `Frame cache ${assetId} frame ${indexNumber}`);
    if (!portablePathInside(frameDirectory, relativePath) || relativePath === frameDirectory) {
      throw new ExportValidationError(`Frame cache ${assetId} frame ${indexNumber} is outside its frame directory`);
    }
    if (!/\.png$/iu.test(relativePath)) {
      throw new ExportValidationError(`Frame cache ${assetId} frame ${indexNumber} is not a PNG`);
    }
    return { ...frame, relativePath };
  });
  return { root, index, frameDirectory, frames: normalizedFrames };
}

function assertSourceMatchesAsset(asset, sourceIdentity) {
  const assetSource = normalizeSourcePath(sourcePathFromAsset(asset));
  if (!assetSource) return;
  const cacheSource = normalizeSourcePath(sourceIdentity?.relativePath);
  if (!cacheSource || portableAssetPathKey(assetSource) !== portableAssetPathKey(cacheSource)) {
    throw new ExportValidationError(`Frame cache source does not match asset ${asset.id}`);
  }
}

async function assertSourceIdentityCurrent(projectRoot, projectRootReal, sourceIdentity, assetId) {
  const source = await assertRegularProjectFile(
    projectRoot,
    projectRootReal,
    sourceIdentity.relativePath,
    `Frame cache ${assetId} source`,
  );
  const data = await fs.readFile(source.realPath);
  const checksum = cacheFileDigest(data).sha256;
  if (checksum !== sourceIdentity.checksumSha256 || data.length !== sourceIdentity.byteSize) {
    throw new ExportValidationError(`Frame cache ${assetId} source identity does not match source file`);
  }
  if (typeof sourceIdentity.mtimeMs === 'number' && Math.abs(source.stats.mtimeMs - sourceIdentity.mtimeMs) > 1) {
    throw new ExportValidationError(`Frame cache ${assetId} source modification time does not match source file`);
  }
}

async function readAndValidateSourceIndex(projectRoot, projectRootReal, cache, response, assetId) {
  const indexFile = await assertRegularProjectFile(projectRoot, projectRootReal, cache.index, `Frame cache ${assetId} index`);
  let payload;
  try {
    payload = JSON.parse(await fs.readFile(indexFile.realPath, 'utf8'));
  } catch (error) {
    throw new ExportValidationError(`Frame cache ${assetId} index is not valid JSON`, { cause: error });
  }
  const payloadSource = payload?.sourceIdentity;
  const sourceMatches = isRecord(payloadSource)
    && normalizeSourcePath(payloadSource.relativePath) === normalizeSourcePath(response.sourceIdentity.relativePath)
    && String(payloadSource.checksumSha256 || '').toLowerCase() === response.sourceIdentity.checksumSha256
    && payloadSource.byteSize === response.sourceIdentity.byteSize
    && payloadSource.mtimeMs === response.sourceIdentity.mtimeMs;
  if (!isRecord(payload) || payload.status !== FRAME_CACHE_RESPONSE_STATUS.READY || !Array.isArray(payload.frames)
    || payload.cache?.key !== response.cache.key
    || !sourceMatches) {
    throw new ExportValidationError(`Frame cache ${assetId} index is not ready`);
  }
  if (payload.frames.length !== response.frames.length) {
    throw new ExportValidationError(`Frame cache ${assetId} index frame count does not match response`);
  }
  payload.frames.forEach((frame, index) => {
    if (!isRecord(frame) || frame.frameNumber !== index
      || normalizeSourcePath(frame.relativePath) !== normalizeSourcePath(cache.frames[index].relativePath)) {
      throw new ExportValidationError(`Frame cache ${assetId} index frame mapping is invalid`);
    }
  });
  return indexFile;
}

function cacheOutputFolder(assetId, usedPaths) {
  const base = safeAssetFilename(assetId, 'asset').replace(/\.png$/iu, '').replace(/\.mp4$/iu, '');
  let index = 1;
  while (true) {
    const suffix = index === 1 ? '' : `-${index}`;
    const folder = normalizeRelativeAssetPath(`${FRAME_CACHE_OUTPUT_ROOT}/${base}${suffix}`, { allowRootFile: true });
    const key = portableAssetPathKey(folder);
    const collides = [...usedPaths].some((value) => value === key || value.startsWith(`${key}/`));
    if (!collides) return folder;
    index += 1;
  }
}

function cacheOutputFile(folder, relativeName) {
  return normalizeRelativeAssetPath(`${folder}/${relativeName}`, { allowRootFile: true });
}

function cacheFileDigest(data) {
  return {
    byteLength: data.length,
    sha256: crypto.createHash('sha256').update(data).digest('hex'),
  };
}

/**
 * Stage exactly the files listed by a ready cache response. The source cache
 * directory is never copied wholesale: no temporary build tree, DB, or tool
 * runtime can enter the portable output.
 */
async function stageFrameCache({
  asset,
  cacheEntry,
  stagingPath,
  projectRoot,
  projectRootReal,
  usedPaths = new Set(),
}) {
  if (!cacheEntry?.ready) throw new ExportValidationError(`Frame cache for asset ${asset.id} is not ready`);
  const response = cacheEntry.response;
  assertSourceMatchesAsset(asset, response.sourceIdentity);
  await assertSourceIdentityCurrent(projectRoot, projectRootReal, response.sourceIdentity, asset.id);
  const cache = ensureCachePaths(response.cache, response.frames, asset.id);
  await readAndValidateSourceIndex(projectRoot, projectRootReal, cache, response, asset.id);

  const folder = cacheOutputFolder(asset.id, usedPaths);
  const frameDirectory = cacheOutputFile(folder, 'frames');
  const indexRelativePath = cacheOutputFile(folder, 'index.json');
  const frameAssets = [];
  const portableFrames = [];
  for (const frame of cache.frames) {
    const sourceFile = await assertRegularProjectFile(
      projectRoot,
      projectRootReal,
      frame.relativePath,
      `Frame cache ${asset.id} frame ${frame.frameNumber}`,
    );
    const frameName = `frame-${String(frame.frameNumber).padStart(8, '0')}.png`;
    const outputRelativePath = cacheOutputFile(frameDirectory, frameName);
    const outputKey = portableAssetPathKey(outputRelativePath);
    if (usedPaths.has(outputKey)) throw new ExportValidationError(`Frame cache output path collides: ${outputRelativePath}`);
    usedPaths.add(outputKey);
    const data = await fs.readFile(sourceFile.realPath);
    if (data.length === 0) throw new ExportValidationError(`Frame cache ${asset.id} frame ${frame.frameNumber} is empty`);
    const destination = path.join(stagingPath, ...outputRelativePath.split('/'));
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, data, { flag: 'wx' });
    const digest = cacheFileDigest(data);
    frameAssets.push({
      id: `frame-cache-${asset.id}-${frame.frameNumber}`,
      kind: 'image',
      relativePath: outputRelativePath,
      label: `${asset.label || asset.id} frame ${frame.frameNumber + 1}`,
      mediaType: 'image/png',
      ...digest,
    });
    portableFrames.push({
      frameNumber: frame.frameNumber,
      pts: frame.pts,
      time: frame.time,
      width: frame.width,
      height: frame.height,
      relativePath: outputRelativePath,
    });
  }

  const portableCache = {
    schemaVersion: response.schemaVersion,
    status: FRAME_CACHE_RESPONSE_STATUS.READY,
    assetId: asset.id,
    sourceIdentity: response.sourceIdentity,
    metadata: response.metadata,
    cache: {
      key: response.cache.key,
      rootRelativePath: folder,
      indexRelativePath,
      frameDirectoryRelativePath: frameDirectory,
      format: 'png',
    },
    frames: portableFrames,
    frameCount: portableFrames.length,
    fps: response.metadata?.fps ?? response.metadata?.averageFps ?? null,
  };
  const indexData = Buffer.from(`${JSON.stringify(portableCache, null, 2)}\n`, 'utf8');
  const indexDestination = path.join(stagingPath, ...indexRelativePath.split('/'));
  await fs.mkdir(path.dirname(indexDestination), { recursive: true });
  await fs.writeFile(indexDestination, indexData, { flag: 'wx' });
  usedPaths.add(portableAssetPathKey(indexRelativePath));

  return {
    assetId: asset.id,
    status: FRAME_CACHE_RESPONSE_STATUS.READY,
    ready: true,
    cache: portableCache,
    frameAssets,
    indexFile: {
      relativePath: indexRelativePath,
      ...cacheFileDigest(indexData),
    },
  };
}

function frameCacheWarning(assetId, entry) {
  if (!entry) return `Referenced video asset ${assetId} has no ready frame cache; exported player uses video fallback.`;
  const status = entry.status || 'unknown';
  const detail = entry.error?.code ? ` (${entry.error.code})` : '';
  return `Frame cache for referenced video asset ${assetId} is ${status}${detail}; exported player uses video fallback.`;
}

module.exports = {
  FRAME_CACHE_OUTPUT_ROOT,
  frameCacheWarning,
  indexFrameCaches,
  normalizeCacheResponse,
  resolveFrameCacheForAsset,
  stageFrameCache,
};
