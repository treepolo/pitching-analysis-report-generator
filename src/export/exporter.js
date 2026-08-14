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
const { renderReportHtml } = require('./report-renderer');
const { createZipArchive, validateZipParity } = require('./zip-archive');
const { toReportDocument } = require('../report-contract');

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
    };
  });
}

async function stageAsset(asset, outputRoot, { projectRootLexical, projectRootReal }) {
  const destination = path.join(outputRoot, ...asset.relativePath.split('/'));
  await fs.mkdir(path.dirname(destination), { recursive: true });
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
    data = await fs.readFile(realSourcePath);
  }
  await fs.writeFile(destination, data);
  return {
    id: asset.id,
    kind: asset.kind,
    relativePath: asset.relativePath,
    label: asset.label,
    mediaType: asset.mediaType,
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
  }));
}

function exportManifest({ reportDocument, safeName, stagedAssets, html, reportFileName = 'report.html' }) {
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
  };
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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
  const safeReportDocument = toReportDocument(reportDocument);
  const referencedAssetIds = new Set(collectReferencedVideoAssetIds(safeReportDocument));
  const outputRoot = path.resolve(outputDirectory);
  await assertContainedPath({
    lexicalRoot: projectRootLexical,
    realRoot: projectRootReal,
    targetPath: outputRoot,
    description: 'Export outputDirectory',
  });
  const safeName = safeReportName(reportName ?? safeReportDocument.title);
  const folderPath = path.join(outputRoot, safeName);
  const shouldCreateZip = createZip === true || outputKind === 'zip' || outputKind === 'both';
  const resolvedZipPath = path.resolve(zipPath || path.join(outputRoot, `${safeName}_offline.zip`));
  if (!isPathInsideOrEqual(outputRoot, folderPath) || !isPathInsideOrEqual(outputRoot, resolvedZipPath)) {
    throw new ExportValidationError('Export targets must stay inside outputDirectory');
  }
  if (resolvedZipPath === outputRoot) throw new ExportValidationError('ZIP target must be a file path');
  if (await pathExists(folderPath)) throw new ExportValidationError(`Export folder already exists: ${folderPath}`);
  if (shouldCreateZip && await pathExists(resolvedZipPath)) {
    throw new ExportValidationError(`ZIP target already exists: ${resolvedZipPath}`);
  }

  await fs.mkdir(outputRoot, { recursive: true });
  const realOutputRoot = await fs.realpath(outputRoot);
  if (!isPathInsideOrEqual(projectRootReal, realOutputRoot)) {
    throw new ExportValidationError('Export outputDirectory resolves outside the project root');
  }
  if (shouldCreateZip) {
    await assertContainedPath({
      lexicalRoot: outputRoot,
      realRoot: realOutputRoot,
      targetPath: path.dirname(resolvedZipPath),
      description: 'ZIP target directory',
    });
  }
  throwIfAborted(signal);
  const temporaryRoot = await fs.mkdtemp(path.join(outputRoot, '.report-export-'));
  const stagingPath = path.join(temporaryRoot, safeName);
  const reportFileName = 'report.html';
  let moved = false;
  let zipCreatedPath = null;
  try {
    throwIfAborted(signal);
    await fs.mkdir(path.join(stagingPath, 'videos'), { recursive: true });
    await fs.mkdir(path.join(stagingPath, 'images'), { recursive: true });
    const preparedAssets = prepareAssetDescriptors(assets, { referencedAssetIds });
    const stagedAssets = [];
    for (const asset of preparedAssets) {
      throwIfAborted(signal);
      stagedAssets.push(await stageAsset(asset, stagingPath, {
        projectRootLexical,
        projectRootReal,
      }));
    }

    throwIfAborted(signal);
    const stagedManifest = rendererManifest(stagedAssets);
    validateReferencedVideoAssetReferences(safeReportDocument, stagedManifest);
    const html = renderReportHtml(safeReportDocument, { assetManifest: stagedManifest });
    await fs.writeFile(path.join(stagingPath, reportFileName), html, 'utf8');
    const manifest = exportManifest({
      reportDocument: safeReportDocument,
      safeName,
      stagedAssets,
      html,
      reportFileName,
    });
    await writeJson(path.join(stagingPath, 'export-manifest.json'), manifest);

    await fs.rename(stagingPath, folderPath);
    moved = true;
    await fs.rm(temporaryRoot, { recursive: true, force: true });

    const validation = await validateExportLayout(folderPath, {
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
    await writeJson(path.join(folderPath, 'export-manifest.json'), manifest);

    let zip = null;
    if (shouldCreateZip) {
      throwIfAborted(signal);
      zipCreatedPath = resolvedZipPath;
      zip = await createZipArchive(folderPath, resolvedZipPath);
      zip.parity = await validateZipParity(folderPath, resolvedZipPath);
    }
    throwIfAborted(signal);
    return {
      folderPath,
      zipPath: zip ? zip.zipPath : null,
      safeName,
      reportDocumentSha256: manifest.report.documentSha256,
      manifest,
      validation,
      zip,
    };
  } catch (error) {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
    if (moved) await fs.rm(folderPath, { recursive: true, force: true });
    if (zipCreatedPath) await fs.rm(zipCreatedPath, { force: true });
    throw error;
  }
}

module.exports = {
  exportReport,
  prepareAssetDescriptors,
  reportDocumentHash,
  safeReportName,
};
