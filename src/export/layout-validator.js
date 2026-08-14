'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
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
  validateNetworkIsolation(html);
  return references;
}

function validateNetworkIsolation(html) {
  if (typeof html !== 'string') throw new ExportValidationError('Rendered HTML must be a string');
  if (/<base\b[^>]*\bhref\s*=/iu.test(html) || /<meta\b[^>]*http-equiv\s*=\s*["']?refresh\b/iu.test(html)) {
    throw new ExportValidationError('Self-contained report must not redirect or redefine its base URL');
  }

  const scriptBodies = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/giu)].map((match) => match[1]);
  const networkApiPattern = /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b|navigator\.serviceWorker|import\s*\(/iu;
  if (scriptBodies.some((body) => networkApiPattern.test(body))) {
    throw new ExportValidationError('Self-contained report must not use runtime network APIs');
  }

  const styleBodies = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/giu)].map((match) => match[1]);
  const externalStylePattern = /@import\b|url\(\s*["']?(?:https?:|file:|data:|blob:|\/\/)/iu;
  if (styleBodies.some((body) => externalStylePattern.test(body))) {
    throw new ExportValidationError('Self-contained report must not load external style resources');
  }
  return {
    valid: true,
    scriptsInspected: scriptBodies.length,
    networkApis: [],
  };
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

function fileUrlForRelativePath(outputDirectory, relativePath) {
  const outputRoot = path.resolve(outputDirectory);
  const normalized = normalizeRelativeAssetPath(relativePath, { allowRootFile: true });
  return pathToFileURL(absoluteAssetPath(outputRoot, normalized)).href;
}

async function resolveHtmlFile(outputRoot, htmlFileName) {
  const candidates = htmlFileName
    ? [normalizeRelativeAssetPath(htmlFileName, { allowRootFile: true })]
    : ['report.html', 'index.html'];
  for (const relativePath of candidates) {
    const candidate = absoluteAssetPath(outputRoot, relativePath);
    try {
      await fs.lstat(candidate);
      return { path: candidate, relativePath };
    } catch (error) {
      if (error.code !== 'ENOENT' || htmlFileName) throw error;
    }
  }
  return {
    path: absoluteAssetPath(outputRoot, candidates[0]),
    relativePath: candidates[0],
  };
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

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function validateExportManifest(outputDirectory, { manifestFileName = 'export-manifest.json' } = {}) {
  const outputRoot = path.resolve(outputDirectory);
  const normalizedManifestName = normalizeRelativeAssetPath(manifestFileName, { allowRootFile: true });
  const manifestPath = absoluteAssetPath(outputRoot, normalizedManifestName);
  await assertFile(manifestPath, 'Export manifest', outputRoot);

  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch (error) {
    throw new ExportValidationError('Export manifest is not valid JSON', { cause: error });
  }
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.files)) {
    throw new ExportValidationError('Export manifest files must be an array');
  }

  const filesByPath = new Map();
  for (const file of manifest.files) {
    if (!file || typeof file !== 'object') throw new ExportValidationError('Export manifest file entry is invalid');
    const relativePath = normalizeRelativeAssetPath(file.relativePath, { allowRootFile: true });
    if (filesByPath.has(relativePath)) throw new ExportValidationError(`Duplicate export manifest file: ${relativePath}`);
    const targetPath = absoluteAssetPath(outputRoot, relativePath);
    await assertFile(targetPath, 'Manifest file', outputRoot);
    const data = await fs.readFile(targetPath);
    const actual = { byteLength: data.length, sha256: sha256(data) };
    if (actual.byteLength !== file.byteLength || actual.sha256 !== file.sha256) {
      throw new ExportValidationError(`Manifest checksum mismatch: ${relativePath}`, {
        relativePath,
        expected: { byteLength: file.byteLength, sha256: file.sha256 },
        actual,
      });
    }
    filesByPath.set(relativePath, actual);
  }

  if (!Array.isArray(manifest.assets)) throw new ExportValidationError('Export manifest assets must be an array');
  const normalizedAssets = normalizeAssetManifest(manifest.assets);
  for (let index = 0; index < manifest.assets.length; index += 1) {
    const asset = manifest.assets[index];
    const normalizedAsset = normalizedAssets[index];
    if (!asset || typeof asset !== 'object') throw new ExportValidationError('Export manifest asset entry is invalid');
    const relativePath = normalizedAsset.relativePath;
    const file = filesByPath.get(relativePath);
    if (!file || file.byteLength !== asset.byteLength || file.sha256 !== asset.sha256) {
      throw new ExportValidationError(`Manifest asset checksum mismatch: ${relativePath}`);
    }
  }

  return {
    valid: true,
    manifestPath,
    fileCount: filesByPath.size,
    assetCount: manifest.assets.length,
  };
}

async function validateFileUrlContract(outputDirectory, {
  assetManifest = [],
  html,
  htmlFileName,
} = {}) {
  const outputRoot = path.resolve(outputDirectory);
  const htmlFile = await resolveHtmlFile(outputRoot, htmlFileName);
  await assertFile(htmlFile.path, `Export ${htmlFile.relativePath}`, outputRoot);
  const renderedHtml = html === undefined ? await fs.readFile(htmlFile.path, 'utf8') : html;
  const references = validateRelativeAssetPaths(renderedHtml);
  const manifest = normalizeAssetManifest(assetManifest);
  const byPath = new Map(manifest.map((asset) => [asset.relativePath, asset]));
  const assetFileUrls = [];
  for (const reference of references) {
    if (!byPath.has(reference.relativePath)) {
      throw new ExportValidationError(`HTML references an unmanifested asset: ${reference.relativePath}`);
    }
    const targetPath = absoluteAssetPath(outputRoot, reference.relativePath);
    await assertFile(targetPath, 'File URL asset', outputRoot);
    assetFileUrls.push(fileUrlForRelativePath(outputRoot, reference.relativePath));
  }
  return {
    valid: true,
    htmlFileName: htmlFile.relativePath,
    htmlFileUrl: fileUrlForRelativePath(outputRoot, htmlFile.relativePath),
    indexFileUrl: fileUrlForRelativePath(outputRoot, htmlFile.relativePath),
    assetFileUrls,
    networkIsolation: validateNetworkIsolation(renderedHtml),
  };
}

async function validateExportLayout(outputDirectory, {
  assetManifest = [],
  html,
  htmlFileName,
  requireAllManifestAssetsUsed = false,
  verifyManifest = false,
} = {}) {
  const outputRoot = path.resolve(outputDirectory);
  await assertDirectory(outputRoot, 'Export directory');
  const htmlFile = await resolveHtmlFile(outputRoot, htmlFileName);
  const indexPath = htmlFile.path;
  await assertFile(indexPath, `Export ${htmlFile.relativePath}`, outputRoot);
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

  const fileUrlValidation = await validateFileUrlContract(outputRoot, {
    assetManifest: manifest,
    html: renderedHtml,
    htmlFileName: htmlFile.relativePath,
  });
  const manifestValidation = verifyManifest
    ? await validateExportManifest(outputRoot)
    : null;

  return {
    valid: true,
    indexPath,
    htmlFileName: htmlFile.relativePath,
    assetCount: manifest.length,
    referencedAssetCount: referencedPaths.size,
    references,
    fileUrlValidation,
    manifestValidation,
  };
}

module.exports = {
  absoluteAssetPath,
  extractHtmlAssetReferences,
  fileUrlForRelativePath,
  isPathInside,
  validateExportManifest,
  validateExportLayout,
  validateFileUrlContract,
  validateNetworkIsolation,
  validateRelativeAssetPaths,
};
