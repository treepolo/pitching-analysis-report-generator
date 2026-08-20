'use strict';

const path = require('node:path');

const ASSET_ROOTS = Object.freeze({
  video: 'videos',
  image: 'images',
});

class ExportValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ExportValidationError';
    this.code = 'EXPORT_VALIDATION_FAILED';
    this.details = details;
  }
}

function normalizeAssetKind(value, fallback = null) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized) return fallback;
  if (['video', 'videos', 'movie', 'media'].includes(normalized)) return 'video';
  if (['image', 'images', 'photo', 'picture'].includes(normalized)) return 'image';
  throw new ExportValidationError(`Unsupported asset kind: ${value}`);
}

function inferAssetKind(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const normalized = value.replaceAll('\\', '/').toLowerCase();
  if (normalized === 'videos' || normalized.startsWith('videos/')) return 'video';
  if (normalized === 'images' || normalized.startsWith('images/')) return 'image';
  const extension = path.posix.extname(normalized);
  if (['.mp4', '.mov', '.m4v', '.webm', '.avi', '.mkv'].includes(extension)) return 'video';
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp'].includes(extension)) return 'image';
  return null;
}

function normalizeRelativeAssetPath(value, { kind = null, allowRootFile = false } = {}) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ExportValidationError('Asset relativePath is required');
  }

  const candidate = value.trim();
  if (candidate.includes('\\')) {
    throw new ExportValidationError(`Asset path must use forward slashes: ${value}`);
  }
  if (/^[a-z][a-z\d+.-]*:/iu.test(candidate) || candidate.startsWith('/') || /^[a-z]:/iu.test(candidate)) {
    throw new ExportValidationError(`Asset path must be relative: ${value}`);
  }

  const segments = candidate.split('/');
  if (segments[0] === '.') segments.shift();
  if ((!allowRootFile && segments.length < 2) || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new ExportValidationError(`Asset path contains an invalid segment: ${value}`);
  }
  if (segments.some((segment) => /[\u0000-\u001f\u007f<>:"|?*]/u.test(segment))) {
    throw new ExportValidationError(`Asset path contains an unsafe filename character: ${value}`);
  }

  const normalized = segments.join('/');
  if (kind) {
    const root = ASSET_ROOTS[kind];
    if (!root || !normalized.startsWith(`${root}/`)) {
      throw new ExportValidationError(`Asset path must be under ${root || 'a supported asset root'}: ${value}`);
    }
  }
  return normalized;
}

function portableAssetPathKey(relativePath) {
  return relativePath.normalize('NFC').toLocaleLowerCase('en-US');
}

function sanitizePortableName(value, fallback = 'report', maxLength = 80) {
  let name = typeof value === 'string' ? value.normalize('NFKC') : '';
  name = name
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/gu, '-')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[. ]+$/gu, '');
  if (!name || name === '.' || name === '..') name = fallback;
  if (/^(con|prn|aux|nul|clock\$|com[1-9]|lpt[1-9])(?:\..*)?$/iu.test(name)) {
    name = `report-${name}`;
  }
  name = name.slice(0, maxLength).replace(/[. ]+$/gu, '');
  return name || fallback;
}

function safeReportName(value) {
  return sanitizePortableName(value, 'pitching-report', 80);
}

function safeAssetFilename(value, fallback = 'asset') {
  const raw = typeof value === 'string' ? value.replaceAll('\\', '/').split('/').pop() : '';
  return sanitizePortableName(raw, fallback, 120).replace(/ /gu, '-');
}

function isAssetReferenceKey(key) {
  return key === 'assetId'
    || key === 'assetIds'
    || key === 'assetRef'
    || key === 'assetRefs'
    || /AssetIds?$/u.test(key);
}

function addAssetReference(value, referencePath, references) {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => addAssetReference(entry, `${referencePath}[${index}]`, references));
    return;
  }
  if (typeof value === 'string') {
    references.push({ id: value, path: referencePath });
    return;
  }
  if (typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, 'id')) {
      addAssetReference(value.id, `${referencePath}.id`, references);
    } else {
      references.push({ id: undefined, path: referencePath });
    }
    return;
  }
  references.push({ id: undefined, path: referencePath });
}

function collectReportAssetReferences(reportDocument) {
  const references = [];
  const visited = new Set();

  function walk(value, currentPath) {
    if (value === null || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${currentPath}[${index}]`));
      return;
    }
    Object.entries(value).forEach(([key, child]) => {
      const childPath = currentPath ? `${currentPath}.${key}` : key;
      if (isAssetReferenceKey(key)) addAssetReference(child, childPath, references);
      walk(child, childPath);
    });
  }

  walk(reportDocument, 'reportDocument');
  return references;
}

const VIDEO_BLOCK_TYPES = new Set(['singleVideo', 'comparisonVideo']);

function videoReferenceDocument(reportDocument) {
  return {
    sections: Array.isArray(reportDocument?.sections)
      ? reportDocument.sections.map((section) => ({
        blocks: Array.isArray(section?.blocks)
          ? section.blocks.filter((block) => VIDEO_BLOCK_TYPES.has(block?.type))
          : [],
      }))
      : [],
  };
}

function collectReferencedVideoAssetReferences(reportDocument) {
  return collectReportAssetReferences(videoReferenceDocument(reportDocument));
}

function collectReferencedVideoAssetIds(reportDocument) {
  return [...new Set(
    collectReferencedVideoAssetReferences(reportDocument)
      .map((reference) => reference.id)
      .filter((id) => typeof id === 'string' && id.length > 0),
  )];
}

function normalizeAssetManifest(assetManifest = []) {
  if (!Array.isArray(assetManifest)) {
    throw new ExportValidationError('Asset manifest must be an array');
  }

  const ids = new Set();
  const paths = new Set();
  return assetManifest.map((asset, index) => {
    if (asset === null || typeof asset !== 'object' || Array.isArray(asset)) {
      throw new ExportValidationError(`Asset manifest entry ${index} must be an object`);
    }
    if (typeof asset.id !== 'string' || asset.id.length === 0) {
      throw new ExportValidationError(`Asset manifest entry ${index} has an invalid id`);
    }

    const relativePathValue = asset.relativePath ?? asset.path;
    const kind = normalizeAssetKind(
      asset.kind ?? asset.mediaKind ?? asset.assetKind,
      inferAssetKind(relativePathValue ?? asset.sourcePath),
    );
    if (!kind) {
      throw new ExportValidationError(`Asset manifest entry ${index} has no supported kind`);
    }
    const relativePath = normalizeRelativeAssetPath(relativePathValue, { kind });
    const pathKey = portableAssetPathKey(relativePath);
    if (ids.has(asset.id)) throw new ExportValidationError(`Duplicate asset id: ${asset.id}`);
    if (paths.has(pathKey)) throw new ExportValidationError(`Duplicate asset path: ${relativePath}`);
    ids.add(asset.id);
    paths.add(pathKey);

    return {
      id: asset.id,
      kind,
      relativePath,
      label: typeof asset.label === 'string' ? asset.label : '',
      mediaType: typeof asset.mediaType === 'string' ? asset.mediaType : '',
    };
  });
}

function validateReportAssetReferences(reportDocument, assetManifest = []) {
  const manifest = normalizeAssetManifest(assetManifest);
  const byId = new Map(manifest.map((asset) => [asset.id, asset]));
  const references = collectReportAssetReferences(reportDocument);
  const invalidReferences = references.filter((reference) => typeof reference.id !== 'string' || reference.id.length === 0);
  const missingAssetIds = [...new Set(
    references
      .filter((reference) => typeof reference.id === 'string' && reference.id.length > 0 && !byId.has(reference.id))
      .map((reference) => reference.id),
  )];

  if (invalidReferences.length > 0 || missingAssetIds.length > 0) {
    throw new ExportValidationError('Report contains invalid or missing asset references', {
      invalidReferences,
      missingAssetIds,
    });
  }

  return { manifest, references };
}

function validateReferencedVideoAssetReferences(reportDocument, assetManifest = []) {
  const videoDocument = videoReferenceDocument(reportDocument);
  return validateReportAssetReferences(videoDocument, assetManifest);
}

module.exports = {
  ASSET_ROOTS,
  ExportValidationError,
  collectReportAssetReferences,
  collectReferencedVideoAssetIds,
  collectReferencedVideoAssetReferences,
  inferAssetKind,
  normalizeAssetKind,
  normalizeAssetManifest,
  normalizeRelativeAssetPath,
  portableAssetPathKey,
  safeAssetFilename,
  safeReportName,
  sanitizePortableName,
  validateReportAssetReferences,
  validateReferencedVideoAssetReferences,
};
