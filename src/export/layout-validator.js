'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  ExportValidationError,
  normalizeAssetManifest,
  normalizeRelativeAssetPath,
} = require('./asset-paths');

const HTML_ATTRIBUTE_PATTERN = /\b(src|poster|href)\s*=\s*(["'])(.*?)\2/giu;

function extractHtmlAssetReferences(html) {
  if (typeof html !== 'string') throw new ExportValidationError('Rendered HTML must be a string');
  const references = [];
  let match;
  while ((match = HTML_ATTRIBUTE_PATTERN.exec(html)) !== null) {
    const attribute = match[1].toLowerCase();
    const value = match[3];
    if (attribute === 'href' && value.startsWith('#')) continue;
    if (attribute === 'href') {
      throw new ExportValidationError(`Self-contained report has a non-local href: ${value}`);
    }
    let decoded;
    try {
      decoded = decodeURIComponent(value);
    } catch (error) {
      throw new ExportValidationError(`HTML asset path is not valid URI encoding: ${value}`, { cause: error });
    }
    references.push({ attribute, value, relativePath: normalizeRelativeAssetPath(decoded) });
  }
  if (/<script\b[^>]*\bsrc\s*=/iu.test(html) || /<link\b[^>]*\bhref\s*=/iu.test(html)) {
    throw new ExportValidationError('Self-contained report must not load external runtime resources');
  }
  return references;
}

function isPathInside(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function absoluteAssetPath(outputRoot, relativePath) {
  const candidate = path.resolve(outputRoot, ...relativePath.split('/'));
  if (!isPathInside(outputRoot, candidate)) {
    throw new ExportValidationError(`Asset path escapes export directory: ${relativePath}`);
  }
  return candidate;
}

async function assertRealPathContained(rootPath, candidatePath, description) {
  let rootRealPath;
  let candidateRealPath;
  try {
    rootRealPath = await fs.realpath(rootPath);
    candidateRealPath = await fs.realpath(candidatePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new ExportValidationError(`${description} is missing`, { cause: error });
    }
    throw new ExportValidationError(`${description} cannot be resolved safely`, { cause: error });
  }
  if (!isPathInside(rootRealPath, candidateRealPath)) {
    throw new ExportValidationError(`${description} resolves outside export directory`);
  }
}

async function assertFile(filePath, description, containmentRoot) {
  if (containmentRoot) await assertRealPathContained(containmentRoot, filePath, description);
  let stats;
  try {
    stats = await fs.lstat(filePath);
  } catch (error) {
    throw new ExportValidationError(`${description} is missing: ${filePath}`, { cause: error });
  }
  if (stats.isSymbolicLink()) throw new ExportValidationError(`${description} must not be a symlink`);
  if (!stats.isFile()) throw new ExportValidationError(`${description} is not a file: ${filePath}`);
}

async function assertDirectory(directoryPath, description, containmentRoot) {
  if (containmentRoot) await assertRealPathContained(containmentRoot, directoryPath, description);
  let stats;
  try {
    stats = await fs.lstat(directoryPath);
  } catch (error) {
    throw new ExportValidationError(`${description} is missing: ${directoryPath}`, { cause: error });
  }
  if (stats.isSymbolicLink()) throw new ExportValidationError(`${description} must not be a symlink`);
  if (!stats.isDirectory()) throw new ExportValidationError(`${description} is not a directory: ${directoryPath}`);
}

function validateRelativeAssetPaths(html) {
  return extractHtmlAssetReferences(html);
}

async function validateExportLayout(outputDirectory, {
  assetManifest = [],
  html,
  requireAllManifestAssetsUsed = false,
} = {}) {
  const outputRoot = path.resolve(outputDirectory);
  await assertDirectory(outputRoot, 'Export directory');
  const indexPath = path.join(outputRoot, 'index.html');
  await assertFile(indexPath, 'Export index.html', outputRoot);
  await assertDirectory(path.join(outputRoot, 'videos'), 'Export videos directory', outputRoot);
  await assertDirectory(path.join(outputRoot, 'images'), 'Export images directory', outputRoot);

  const renderedHtml = html === undefined ? await fs.readFile(indexPath, 'utf8') : html;
  const references = validateRelativeAssetPaths(renderedHtml);
  const manifest = normalizeAssetManifest(assetManifest);
  const byPath = new Map(manifest.map((asset) => [asset.relativePath, asset]));
  const referencedPaths = new Set();

  for (const reference of references) {
    const asset = byPath.get(reference.relativePath);
    if (!asset) {
      throw new ExportValidationError(`HTML references an unmanifested asset: ${reference.relativePath}`);
    }
    referencedPaths.add(reference.relativePath);
    await assertFile(absoluteAssetPath(outputRoot, reference.relativePath), 'Referenced export asset', outputRoot);
  }

  for (const asset of manifest) {
    await assertFile(absoluteAssetPath(outputRoot, asset.relativePath), 'Manifest export asset', outputRoot);
  }

  if (requireAllManifestAssetsUsed) {
    const unused = manifest
      .map((asset) => asset.relativePath)
      .filter((relativePath) => !referencedPaths.has(relativePath));
    if (unused.length > 0) {
      throw new ExportValidationError('Manifest contains assets that are not referenced by index.html', { unused });
    }
  }

  return {
    valid: true,
    indexPath,
    assetCount: manifest.length,
    referencedAssetCount: referencedPaths.size,
    references,
  };
}

module.exports = {
  absoluteAssetPath,
  extractHtmlAssetReferences,
  isPathInside,
  validateExportLayout,
  validateRelativeAssetPaths,
};
