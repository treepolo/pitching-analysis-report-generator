'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  ASSET_ROOTS,
  ExportValidationError,
  collectReferencedVideoAssetIds,
  inferAssetKind,
  normalizeAssetKind,
  normalizeRelativeAssetPath,
  safeAssetFilename,
  safeReportName,
  validateReferencedVideoAssetReferences,
} = require('./asset-paths');
const { validateExportLayout } = require('./layout-validator');
const { renderReportHtml, toPortableReportDocument } = require('./report-renderer');
const { createZipArchive, validateZipParity } = require('./zip-archive');


// Export target selection is collision-safe for completed outputs, but two
// jobs can otherwise observe the same free target before either one commits it.
// Keep jobs for one destination root in order so a repeated UI action cannot
// race the final folder rename or ZIP commit on Windows.
const outputLocks = new Map();
const CLEANUP_RETRYABLE_CODES = new Set(['EACCES', 'EBUSY', 'ENOTEMPTY', 'EPERM']);
const EXPORT_FS_RETRYABLE_CODES = new Set(['EACCES', 'EBUSY', 'EAGAIN', 'EPERM']);

function annotateExportFsError(error, phase) {
  if (error && typeof error === 'object'
    && typeof error.exportPhase !== 'string') {
    error.exportPhase = phase;
  }
  return error;
}

async function withExportFsRetry(operation, phase, { attempts = 4 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = annotateExportFsError(error, phase);
      if (!EXPORT_FS_RETRYABLE_CODES.has(error?.code) || attempt === attempts - 1) throw lastError;
      await new Promise((resolve) => setTimeout(resolve, 60 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function createTemporaryRoot(projectRoot) {
  // Keep all internal staging inside the project. The selected output root is
  // reserved for the final folder/ZIP delivery artifacts only.
  const candidates = [
    { parent: path.join(projectRoot, '.tmp'), prefix: '.report-export-', sameDestination: false },
  ];
  let lastError = null;
  for (const candidate of candidates) {
    try {
      if (!candidate.sameDestination) {
        await withExportFsRetry(
          () => fs.mkdir(candidate.parent, { recursive: true }),
          'create-staging',
        );
      }
      const root = await withExportFsRetry(
        () => fs.mkdtemp(path.join(candidate.parent, candidate.prefix)),
        'create-staging',
      );
      return { root, sameDestination: candidate.sameDestination };
    } catch (error) {
      lastError = error;
      if (!EXPORT_FS_RETRYABLE_CODES.has(error?.code)) throw error;
    }
  }
  throw lastError;
}

async function commitStagingDirectory(stagingPath, folderPath, { sameDestination }) {
  if (sameDestination) {
    try {
      await withExportFsRetry(() => fs.rename(stagingPath, folderPath), 'commit-folder');
      return;
    } catch (error) {
      if (error?.code !== 'EXDEV') throw error;
    }
  }

  if (await pathExists(folderPath)) {
    throw new ExportValidationError(`Export folder already exists: ${folderPath}`);
  }
  let copyStarted = false;
  try {
    copyStarted = true;
    await withExportFsRetry(
      () => fs.cp(stagingPath, folderPath, {
        recursive: true,
        force: false,
        errorOnExist: true,
      }),
      'commit-folder',
      { attempts: 1 },
    );
  } catch (error) {
    if (copyStarted) await cleanupExportPath(folderPath);
    throw error;
  }
}


function outputLockKey(outputRoot) {
  const resolved = path.resolve(outputRoot);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

async function withOutputLock(outputRoot, task) {
  const key = outputLockKey(outputRoot);
  const previous = outputLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  outputLocks.set(key, queued);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (outputLocks.get(key) === queued) outputLocks.delete(key);
  }
}

async function cleanupExportPath(targetPath) {
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await fs.rm(targetPath, { recursive: true, force: true });
      return null;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      lastError = error;
      if (!CLEANUP_RETRYABLE_CODES.has(error.code) || attempt === 3) return lastError;
      await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
    }
  }
  return lastError;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stableValue(value[key]);
      return result;
    }, {});
  }
  return value;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function reportDocumentHash(reportDocument) {
  return sha256(JSON.stringify(stableValue(reportDocument)));
}

async function pathExists(targetPath) {
  try {
    await fs.lstat(targetPath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function isPathInsideOrEqual(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === ''
    || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function collisionSafeReportName(baseName, collisionIndex) {
  if (collisionIndex === 1) return baseName;
  const suffix = `-${collisionIndex}`;
  const stemLength = Math.max(1, 80 - suffix.length);
  const stem = baseName.slice(0, stemLength).replace(/[. ]+$/u, '') || 'report';
  return `${stem}${suffix}`;
}

function collisionSafeZipPath(zipPath, collisionIndex) {
  const resolvedPath = path.resolve(zipPath);
  if (collisionIndex === 1) return resolvedPath;
  const parsed = path.parse(resolvedPath);
  return path.join(parsed.dir, `${parsed.name}-${collisionIndex}${parsed.ext}`);
}

async function resolveOutputTargets({
  outputRoot,
  baseName,
  shouldKeepFolder,
  shouldCreateZip,
  zipPath,
}) {
  for (let collisionIndex = 1; ; collisionIndex += 1) {
    const safeName = collisionSafeReportName(baseName, collisionIndex);
    const folderPath = path.join(outputRoot, safeName);
    const candidateZipPath = zipPath
      ? collisionSafeZipPath(zipPath, collisionIndex)
      : path.join(outputRoot, `${safeName}_offline.zip`);
    if (!isPathInsideOrEqual(outputRoot, folderPath) || !isPathInsideOrEqual(outputRoot, candidateZipPath)) {
      throw new ExportValidationError('Export targets must stay inside outputDirectory');
    }
    if (candidateZipPath === outputRoot) throw new ExportValidationError('ZIP target must be a file path');

    const folderCollision = shouldKeepFolder && await pathExists(folderPath);
    const zipCollision = shouldCreateZip && await pathExists(candidateZipPath);
    if (!folderCollision && !zipCollision) {
      return {
        safeName,
        folderPath,
        resolvedZipPath: candidateZipPath,
      };
    }
  }
}

async function realpathNearestExisting(targetPath) {
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

async function assertNoSymbolicLinkAncestors(targetPath, description) {
  let currentPath = path.resolve(targetPath);
  while (true) {
    const entry = await fs.lstat(currentPath).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw new ExportValidationError(`${description} cannot be inspected: ${currentPath}`, { cause: error });
    });
    if (entry?.isSymbolicLink()) {
      throw new ExportValidationError(`${description} contains a symbolic link: ${currentPath}`);
    }
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) return;
    currentPath = parentPath;
  }
}

async function assertContainedPath({ lexicalRoot, realRoot, targetPath, description, allowEqual = true }) {
  const resolvedTarget = path.resolve(targetPath);
  if ((!allowEqual && resolvedTarget === path.resolve(lexicalRoot))
    || !isPathInsideOrEqual(path.resolve(lexicalRoot), resolvedTarget)) {
    throw new ExportValidationError(`${description} resolves outside the project root`);
  }
  let existingRealPath;
  try {
    existingRealPath = await realpathNearestExisting(resolvedTarget);
  } catch (error) {
    throw new ExportValidationError(`${description} cannot be resolved safely`, { cause: error });
  }
  if ((!allowEqual && existingRealPath === path.resolve(realRoot))
    || !isPathInsideOrEqual(path.resolve(realRoot), existingRealPath)) {
    throw new ExportValidationError(`${description} resolves outside the project root`);
  }
  return resolvedTarget;
}

async function resolveProjectRoots(projectRoot) {
  if (typeof projectRoot !== 'string' || projectRoot.length === 0) {
    throw new ExportValidationError('Export projectRoot is required');
  }
  const lexicalRoot = path.resolve(projectRoot);
  let realRoot;
  try {
    realRoot = await fs.realpath(lexicalRoot);
  } catch (error) {
    throw new ExportValidationError('Export projectRoot is unavailable', { cause: error });
  }
  const stats = await fs.stat(realRoot).catch((error) => {
    throw new ExportValidationError('Export projectRoot is unavailable', { cause: error });
  });
  if (!stats.isDirectory()) throw new ExportValidationError('Export projectRoot must be a directory');
  return { lexicalRoot, realRoot };
}

function referencePath(value) {
  if (typeof value === 'string' && value.length > 0) return value;
  if (value && typeof value === 'object') {
    if (typeof value.relativePath === 'string' && value.relativePath.length > 0) return value.relativePath;
    if (typeof value.path === 'string' && value.path.length > 0) return value.path;
  }
  return null;
}

function portableAssetPathKey(relativePath) {
  return relativePath.normalize('NFC').toLocaleLowerCase('en-US');
}

function descriptorSourcePath(asset) {
  for (const value of [
    asset.normalizedReference,
    asset.sourceReference,
    asset.sourcePath,
    asset.filePath,
    asset.localPath,
  ]) {
    const sourcePath = referencePath(value);
    if (sourcePath) return sourcePath;
  }
  return null;
}

function assertProjectRelativeSourcePath(sourcePath, assetId) {
  if (typeof sourcePath !== 'string' || sourcePath.trim() === '') {
    throw new ExportValidationError(`Source asset ${assetId} requires a project-relative path`);
  }
  const value = sourcePath.trim();
  if (path.isAbsolute(value)
    || value.startsWith('/')
    || value.startsWith('\\')
    || /^[a-z]:[\\/]/iu.test(value)
    || /^[a-z][a-z\d+.-]*:/iu.test(value)
    || value.startsWith('//')) {
    throw new ExportValidationError(`Source asset ${assetId} must use a project-relative path`);
  }
  return value;
}

function descriptorData(asset) {
  if (Buffer.isBuffer(asset.data)) return Buffer.from(asset.data);
  if (asset.data instanceof Uint8Array) return Buffer.from(asset.data);
  return null;
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  const error = new ExportValidationError('Export cancelled');
  error.code = 'EXPORT_CANCELLED';
  throw error;
}

function inferDescriptorKind(asset) {
  return normalizeAssetKind(
    asset.kind ?? asset.mediaKind ?? asset.assetKind,
    inferAssetKind(asset.relativePath ?? descriptorSourcePath(asset) ?? asset.displayName ?? asset.name),
  );
}

function uniqueGeneratedPath(kind, filename, usedPaths) {
  const root = ASSET_ROOTS[kind];
  const extension = path.posix.extname(filename);
  const stem = extension ? filename.slice(0, -extension.length) : filename;
  let suffix = 0;
  while (true) {
    const candidateName = suffix === 0 ? filename : `${stem}-${suffix + 1}${extension}`;
    const candidate = normalizeRelativeAssetPath(`${root}/${candidateName}`, { kind });
    if (!usedPaths.has(portableAssetPathKey(candidate))) return candidate;
    suffix += 1;
  }
}

function portableAssetMetadata(asset) {
  const metadata = asset && asset.metadata && typeof asset.metadata === 'object'
    ? asset.metadata
    : {};
  const fps = Number(metadata.fps);
  const frameCount = Number(metadata.frameCount);
  const frameTimes = Array.isArray(metadata.frameTimes)
    ? metadata.frameTimes.map((value) => (Number.isFinite(Number(value)) ? Number(value) : null))
    : [];
  return {
    fps: Number.isFinite(fps) && fps > 0 ? fps : null,
    frameCount: Number.isInteger(frameCount) && frameCount > 0 ? frameCount : null,
    frameTimes,
  };
}
function prepareAssetDescriptors(assets, { referencedAssetIds = null } = {}) {
  if (!Array.isArray(assets)) throw new ExportValidationError('Export assets must be an array');
  const selectedAssets = referencedAssetIds === null
    ? assets
    : assets.filter((asset) => asset && typeof asset === 'object' && referencedAssetIds.has(asset.id));
  const ids = new Set();
  const usedPaths = new Set();
  return selectedAssets.map((asset, index) => {
    if (asset === null || typeof asset !== 'object' || Array.isArray(asset)) {
      throw new ExportValidationError(`Export asset ${index} must be an object`);
    }
    if (typeof asset.id !== 'string' || asset.id.length === 0) {
      throw new ExportValidationError(`Export asset ${index} has an invalid id`);
    }
    if (ids.has(asset.id)) throw new ExportValidationError(`Duplicate export asset id: ${asset.id}`);
    const kind = inferDescriptorKind(asset);
    if (!kind) throw new ExportValidationError(`Export asset ${asset.id} has no supported kind`);

    for (const value of [
      referencePath(asset.normalizedReference),
      referencePath(asset.sourceReference),
      asset.sourcePath,
      asset.filePath,
      asset.localPath,
    ].filter(Boolean)) {
      assertProjectRelativeSourcePath(value, asset.id);
    }
    const rawSourcePath = descriptorSourcePath(asset);
    const sourcePath = rawSourcePath ? assertProjectRelativeSourcePath(rawSourcePath, asset.id) : null;
    const data = descriptorData(asset);
    if (!sourcePath && !data) {
      throw new ExportValidationError(`Export asset ${asset.id} needs sourcePath or data`);
    }

    const requestedPath = typeof asset.relativePath === 'string' ? asset.relativePath : '';
    const filename = safeAssetFilename(
      requestedPath || asset.displayName || asset.name || sourcePath || `${asset.id}.${kind === 'video' ? 'mp4' : 'png'}`,
      `${asset.id}.${kind === 'video' ? 'mp4' : 'png'}`,
    );
    const relativePath = requestedPath
      ? normalizeRelativeAssetPath(requestedPath, { kind })
      : uniqueGeneratedPath(kind, filename, usedPaths);
    const pathKey = portableAssetPathKey(relativePath);
    if (usedPaths.has(pathKey)) throw new ExportValidationError(`Duplicate export asset path: ${relativePath}`);
    ids.add(asset.id);
    usedPaths.add(pathKey);
    return {
      id: asset.id,
      kind,
      relativePath,
      label: typeof asset.label === 'string'
        ? asset.label
        : (typeof asset.displayName === 'string' ? asset.displayName : ''),
      mediaType: typeof asset.mediaType === 'string' ? asset.mediaType : '',
      sourcePath,
      data,
      metadata: portableAssetMetadata(asset),
    };
  });
}

async function stageAsset(asset, outputRoot, { projectRootLexical, projectRootReal }) {
  const destination = path.join(outputRoot, ...asset.relativePath.split('/'));
  await withExportFsRetry(
    () => fs.mkdir(path.dirname(destination), { recursive: true }),
    'stage-asset',
  );
  let data = asset.data;
  if (!data) {
    const sourcePath = path.isAbsolute(asset.sourcePath)
      ? path.resolve(asset.sourcePath)
      : path.resolve(projectRootLexical, asset.sourcePath);
    await assertContainedPath({
      lexicalRoot: projectRootLexical,
      realRoot: projectRootReal,
      targetPath: sourcePath,
      description: `Source asset ${asset.id}`,
    });
    const stats = await fs.lstat(sourcePath).catch((error) => {
      throw new ExportValidationError(`Source asset is unavailable: ${asset.id}`, { cause: error });
    });
    if (stats.isSymbolicLink()) throw new ExportValidationError(`Source asset must not be a symlink: ${asset.id}`);
    if (!stats.isFile()) throw new ExportValidationError(`Source asset is not a regular file: ${asset.id}`);
    let realSourcePath;
    try {
      realSourcePath = await fs.realpath(sourcePath);
    } catch (error) {
      throw new ExportValidationError(`Source asset is unavailable: ${asset.id}`, { cause: error });
    }
    await assertContainedPath({
      lexicalRoot: projectRootLexical,
      realRoot: projectRootReal,
      targetPath: realSourcePath,
      description: `Source asset ${asset.id}`,
    });
    data = await withExportFsRetry(() => fs.readFile(realSourcePath), 'stage-asset');
  }
  await withExportFsRetry(() => fs.writeFile(destination, data), 'stage-asset');
  return {
    id: asset.id,
    kind: asset.kind,
    relativePath: asset.relativePath,
    label: asset.label,
    mediaType: asset.mediaType,
    metadata: asset.metadata,
    byteLength: data.length,
    sha256: sha256(data),
  };
}

function rendererManifest(stagedAssets) {
  return stagedAssets.map((asset) => ({
    id: asset.id,
    kind: asset.kind,
    relativePath: asset.relativePath,
    label: asset.label,
    mediaType: asset.mediaType,
    metadata: asset.metadata,
  }));
}

function exportManifest({
  reportDocument,
  safeName,
  stagedAssets,
  html,
  reportFileName = 'report.html',
  warnings = [],
}) {
  return {
    format: 'pitching-analysis-report-export',
    schemaVersion: 1,
    report: {
      safeName,
      documentSchemaVersion: reportDocument.schemaVersion ?? 1,
      documentSha256: reportDocumentHash(reportDocument),
    },
    assets: stagedAssets.map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      relativePath: asset.relativePath,
      label: asset.label,
      mediaType: asset.mediaType,
      byteLength: asset.byteLength,
      sha256: asset.sha256,
    })),
    files: [
      {
        relativePath: reportFileName,
        byteLength: Buffer.byteLength(html),
        sha256: sha256(Buffer.from(html)),
      },
      ...stagedAssets.map((asset) => ({
        relativePath: asset.relativePath,
        byteLength: asset.byteLength,
        sha256: asset.sha256,
      })),

    ],
    ...(warnings.length > 0 ? { warnings: [...warnings] } : {}),
  };
}

async function writeJson(filePath, value, phase = 'write-manifest') {
  await withExportFsRetry(
    () => fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8'),
    phase,
  );
}

async function exportReport({
  reportDocument,
  assets = [],
  projectRoot,
  outputDirectory,
  reportName,
  createZip = false,
  outputKind = 'folder',
  zipPath,
  signal,
} = {}) {
  if (typeof outputDirectory !== 'string' || outputDirectory.length === 0) {
    throw new ExportValidationError('Export outputDirectory is required');
  }
  if (reportDocument === null || typeof reportDocument !== 'object' || Array.isArray(reportDocument)) {
    throw new ExportValidationError('Report document is required');
  }
  const { lexicalRoot: projectRootLexical, realRoot: projectRootReal } = await resolveProjectRoots(projectRoot);
  const safeReportDocument = toPortableReportDocument(reportDocument);
  const referencedAssetIds = new Set([
    ...collectReferencedVideoAssetIds(safeReportDocument),
    ...assets
      .filter((asset) => asset && typeof asset === 'object' && asset.requiredForExport === true)
      .map((asset) => asset.id)
      .filter((id) => typeof id === 'string' && id.length > 0),
  ]);
  const outputRoot = path.resolve(outputDirectory);
  if (typeof outputDirectory !== 'string' || outputDirectory.trim() === '' || !path.isAbsolute(outputDirectory)) {
    throw new ExportValidationError('Export outputDirectory must be an absolute safe path');
  }
  await assertNoSymbolicLinkAncestors(outputRoot, 'Export outputDirectory');
  const outputAncestor = await realpathNearestExisting(outputRoot).catch((error) => {
    throw new ExportValidationError('Export outputDirectory cannot be resolved safely', { cause: error });
  });
  const outputAncestorStats = await fs.stat(outputAncestor).catch((error) => {
    throw new ExportValidationError('Export outputDirectory cannot be inspected safely', { cause: error });
  });
  if (!outputAncestorStats.isDirectory()) {
    throw new ExportValidationError('Export outputDirectory parent must be a directory');
  }
  const shouldKeepFolder = outputKind !== 'zip';
  const shouldCreateZip = createZip === true || outputKind === 'zip' || outputKind === 'both';
  const runExport = () => withOutputLock(outputRoot, async () => {
    const outputTargets = await resolveOutputTargets({
    outputRoot,
    baseName: safeReportName(reportName ?? safeReportDocument.title),
    shouldKeepFolder,
    shouldCreateZip,
    zipPath,
    });
    const { safeName, folderPath, resolvedZipPath } = outputTargets;

    await withExportFsRetry(
      () => fs.mkdir(outputRoot, { recursive: true }),
      'prepare-output',
    );
    const realOutputRoot = await withExportFsRetry(
      () => fs.realpath(outputRoot),
      'prepare-output',
    );
    if (shouldCreateZip) {
      await assertContainedPath({
        lexicalRoot: outputRoot,
        realRoot: realOutputRoot,
        targetPath: path.dirname(resolvedZipPath),
        description: 'ZIP target directory',
      });
    }
    throwIfAborted(signal);
    const temporary = await createTemporaryRoot(projectRootLexical);
    const temporaryRoot = temporary.root;
    const stagingPath = path.join(temporaryRoot, safeName);
    const reportFileName = 'report.html';
    const outputFolderPath = shouldKeepFolder ? folderPath : stagingPath;
    let moved = false;
    let zipCreatedPath = null;
    try {
    throwIfAborted(signal);
    await withExportFsRetry(
      () => fs.mkdir(path.join(stagingPath, 'videos'), { recursive: true }),
      'create-staging',
    );
    await withExportFsRetry(
      () => fs.mkdir(path.join(stagingPath, 'images'), { recursive: true }),
      'create-staging',
    );
    const preparedAssets = prepareAssetDescriptors(assets, { referencedAssetIds });
    const stagedAssets = [];
    const warnings = [];
    for (const asset of preparedAssets) {
      throwIfAborted(signal);
      const stagedAsset = await stageAsset(asset, stagingPath, {
        projectRootLexical,
        projectRootReal,
      });
      stagedAssets.push(stagedAsset);

    }

    throwIfAborted(signal);
    const stagedManifest = rendererManifest(stagedAssets);
    validateReferencedVideoAssetReferences(safeReportDocument, stagedManifest);
    const html = renderReportHtml(safeReportDocument, { assetManifest: stagedManifest });
    await withExportFsRetry(
      () => fs.writeFile(path.join(stagingPath, reportFileName), html, 'utf8'),
      'write-report',
    );
    const manifest = exportManifest({
      reportDocument: safeReportDocument,
      safeName,
      stagedAssets,
      html,
      reportFileName,
      warnings,
    });
    await writeJson(path.join(stagingPath, 'export-manifest.json'), manifest, 'write-manifest');

    if (shouldKeepFolder) {
      await commitStagingDirectory(stagingPath, folderPath, {
        sameDestination: temporary.sameDestination,
      });
      moved = true;
      const cleanupError = await cleanupExportPath(temporaryRoot);
      if (cleanupError) warnings.push('匯出暫存檔清理稍後重試；輸出內容已完成。');
    }

    const validation = await validateExportLayout(outputFolderPath, {
      assetManifest: stagedManifest,
      html,
      requireAllManifestAssetsUsed: false,
      verifyManifest: true,
      htmlFileName: reportFileName,
    });
    manifest.validation = {
      valid: validation.valid,
      assetCount: validation.assetCount,
      referencedAssetCount: validation.referencedAssetCount,
    };
    await writeJson(path.join(outputFolderPath, 'export-manifest.json'), manifest, 'write-manifest');

    let zip = null;
    if (shouldCreateZip) {
      throwIfAborted(signal);
      zipCreatedPath = resolvedZipPath;
      try {
        zip = await withExportFsRetry(
          () => createZipArchive(outputFolderPath, resolvedZipPath),
          'create-zip',
        );
        zip.parity = await withExportFsRetry(
          () => validateZipParity(outputFolderPath, resolvedZipPath),
          'validate-zip',
        );
      } catch (error) {
        throw annotateExportFsError(error, error?.exportPhase || 'create-zip');
      }
    }
    throwIfAborted(signal);
    if (!shouldKeepFolder) {
      const cleanupError = await cleanupExportPath(temporaryRoot);
      if (cleanupError) warnings.push('匯出暫存檔清理稍後重試；輸出內容已完成。');
    }
    return {
      folderPath: shouldKeepFolder ? folderPath : null,
      zipPath: zip ? zip.zipPath : null,
      safeName,
      reportDocumentSha256: manifest.report.documentSha256,
      manifest,
      validation,
      zip,
      warnings,
    };
    } catch (error) {
      await cleanupExportPath(temporaryRoot);
      if (moved) await cleanupExportPath(folderPath);
      if (zipCreatedPath) await cleanupExportPath(zipCreatedPath);
      throw error;
    }
  });
  return runExport();
}

module.exports = {
  exportReport,
  prepareAssetDescriptors,
  reportDocumentHash,
  safeReportName,
};
