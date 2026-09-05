'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { ExportValidationError } = require('./asset-paths');
const baseExporter = require('./exporter');
const { validateExportLayout } = require('./layout-validator');
const { bundleReportStyles } = require('./report-style-bundler');
const {
  BRAND_SUFFIX,
  LEGACY_BRAND_SUFFIX,
  applyTreePoloPackageHtml,
  canonicalReportName,
  createTreePoloPackageAssets,
} = require('./tree-polo-package');
const { createZipArchive, validateZipParity } = require('./zip-archive');

const outputLocks = new Map();

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
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

function requestedOutputKind(options) {
  return typeof options?.outputKind === 'string' ? options.outputKind : 'folder';
}

function automaticZipPath(outputRoot, safeName) {
  return path.join(outputRoot, `${safeName}_offline.zip`);
}

async function pathExists(candidate) {
  return fs.lstat(candidate).then(() => true, (error) => {
    if (error?.code === 'ENOENT') return false;
    throw error;
  });
}

async function assertNoSymbolicLinkAncestors(targetPath, description) {
  let currentPath = path.resolve(targetPath);
  while (true) {
    const entry = await fs.lstat(currentPath).catch((error) => {
      if (error?.code === 'ENOENT') return null;
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

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  const error = new ExportValidationError('Export cancelled');
  error.code = 'EXPORT_CANCELLED';
  throw error;
}

async function createInternalOutputRoot(projectRoot) {
  if (typeof projectRoot !== 'string' || projectRoot.length === 0) {
    throw new ExportValidationError('Export projectRoot is required');
  }
  const projectPath = path.resolve(projectRoot);
  const tmpRoot = path.join(projectPath, '.tmp');
  await fs.mkdir(tmpRoot, { recursive: true });
  return fs.mkdtemp(path.join(tmpRoot, '.tree-polo-canonical-export-'));
}

async function resolveCanonicalTargets(outputRoot, baseSafeName, { needsFolder, needsZip }) {
  for (let suffix = 1; ; suffix += 1) {
    const safeName = suffix === 1 ? baseSafeName : `${baseSafeName}-${suffix}`;
    const folderPath = path.join(outputRoot, safeName);
    const zipPath = automaticZipPath(outputRoot, safeName);
    const folderBusy = needsFolder && await pathExists(folderPath);
    const zipBusy = needsZip && await pathExists(zipPath);
    if (!folderBusy && !zipBusy) return { safeName, folderPath, zipPath };
  }
}

async function rewriteManifest(folderPath, manifest) {
  await fs.writeFile(
    path.join(folderPath, 'export-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
}

async function retargetStagedExport(stagedResult, safeName, { title, logoRelativePath }) {
  const folderPath = stagedResult.folderPath;
  if (!folderPath) throw new Error('Canonical Tree Polo delivery requires a staged folder');

  const oldHtmlFileName = stagedResult.reportFileName || 'report.html';
  const htmlFileName = `${safeName}.html`;
  const oldHtmlPath = path.join(folderPath, oldHtmlFileName);
  const htmlPath = path.join(folderPath, htmlFileName);
  const sourceHtml = await fs.readFile(oldHtmlPath, 'utf8');
  const packagedHtml = applyTreePoloPackageHtml(sourceHtml, { title, logoRelativePath });
  const html = bundleReportStyles(packagedHtml);

  if (oldHtmlFileName === htmlFileName) {
    await fs.writeFile(htmlPath, html, 'utf8');
  } else {
    await fs.writeFile(htmlPath, html, { encoding: 'utf8', flag: 'wx' });
    await fs.rm(oldHtmlPath, { force: true });
  }

  const manifest = JSON.parse(await fs.readFile(path.join(folderPath, 'export-manifest.json'), 'utf8'));
  if (manifest.report && typeof manifest.report === 'object') manifest.report.safeName = safeName;
  const htmlBuffer = Buffer.from(html, 'utf8');
  manifest.files = (manifest.files || []).map((file) => (
    file?.relativePath === oldHtmlFileName
      ? {
        ...file,
        relativePath: htmlFileName,
        byteLength: htmlBuffer.length,
        sha256: sha256(htmlBuffer),
      }
      : file
  ));
  await rewriteManifest(folderPath, manifest);

  const validation = await validateExportLayout(folderPath, {
    assetManifest: manifest.assets || [],
    html,
    htmlFileName,
    requireAllManifestAssetsUsed: false,
    verifyManifest: true,
  });
  manifest.validation = {
    valid: validation.valid,
    assetCount: validation.assetCount,
    referencedAssetCount: validation.referencedAssetCount,
  };
  await rewriteManifest(folderPath, manifest);

  return {
    ...stagedResult,
    safeName,
    reportFileName: htmlFileName,
    html,
    manifest,
    validation,
  };
}

async function copyFinalFolder(sourceFolder, targetFolder) {
  let copyStarted = false;
  try {
    copyStarted = true;
    await fs.cp(sourceFolder, targetFolder, {
      recursive: true,
      force: false,
      errorOnExist: true,
    });
  } catch (error) {
    if (copyStarted) await fs.rm(targetFolder, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function exportReport(options = {}) {
  const outputKind = requestedOutputKind(options);
  const needsFolder = outputKind !== 'zip';
  const needsZip = options.createZip === true || outputKind === 'zip' || outputKind === 'both';
  if (typeof options.outputDirectory !== 'string' || options.outputDirectory.trim() === '') {
    throw new ExportValidationError('Export outputDirectory is required');
  }
  if (!path.isAbsolute(options.outputDirectory)) {
    throw new ExportValidationError('Export outputDirectory must be an absolute safe path');
  }
  const sourceAssets = options.assets ?? [];
  if (!Array.isArray(sourceAssets)) throw new ExportValidationError('Export assets must be an array');

  const outputRoot = path.resolve(options.outputDirectory);
  await assertNoSymbolicLinkAncestors(outputRoot, 'Export outputDirectory');
  const internalOutputRoot = await createInternalOutputRoot(options.projectRoot);
  let stagedResult = null;

  try {
    throwIfAborted(options.signal);
    const treePoloPackage = await createTreePoloPackageAssets(sourceAssets);
    const reportName = canonicalReportName(options.reportName ?? options.reportDocument?.title);
    stagedResult = await baseExporter.exportReport({
      ...options,
      reportName,
      assets: [...sourceAssets, ...treePoloPackage.assets],
      outputDirectory: internalOutputRoot,
      outputKind: 'folder',
      createZip: false,
      zipPath: undefined,
    });
    if (!stagedResult.folderPath) throw new Error('Tree Polo base export did not produce a staged folder');
    if (!stagedResult.safeName.endsWith(BRAND_SUFFIX)) {
      throw new Error(`Unexpected Tree Polo export name: ${stagedResult.safeName}`);
    }

    return await withOutputLock(outputRoot, async () => {
      throwIfAborted(options.signal);
      await fs.mkdir(outputRoot, { recursive: true });
      const targets = await resolveCanonicalTargets(outputRoot, stagedResult.safeName, { needsFolder, needsZip });
      const staged = await retargetStagedExport(stagedResult, targets.safeName, {
        title: options.reportDocument?.title ?? options.reportName,
        logoRelativePath: treePoloPackage.logoRelativePath,
      });
      let folderCreated = false;
      let zipCreated = false;
      let zip = null;

      try {
        if (needsFolder) {
          await copyFinalFolder(staged.folderPath, targets.folderPath);
          folderCreated = true;
        }

        const validationFolder = needsFolder ? targets.folderPath : staged.folderPath;
        const validationHtml = await fs.readFile(path.join(validationFolder, staged.reportFileName), 'utf8');
        const validation = await validateExportLayout(validationFolder, {
          assetManifest: staged.manifest.assets || [],
          html: validationHtml,
          htmlFileName: staged.reportFileName,
          requireAllManifestAssetsUsed: false,
          verifyManifest: true,
        });

        if (needsZip) {
          throwIfAborted(options.signal);
          const zipSource = needsFolder ? targets.folderPath : staged.folderPath;
          zip = await createZipArchive(zipSource, targets.zipPath);
          zipCreated = true;
          zip.parity = await validateZipParity(zipSource, targets.zipPath);
        }

        return {
          ...staged,
          safeName: targets.safeName,
          folderPath: needsFolder ? targets.folderPath : null,
          zipPath: needsZip ? targets.zipPath : null,
          reportFileName: `${targets.safeName}.html`,
          validation,
          zip,
        };
      } catch (error) {
        if (zipCreated) await fs.rm(targets.zipPath, { force: true }).catch(() => {});
        if (folderCreated) await fs.rm(targets.folderPath, { recursive: true, force: true }).catch(() => {});
        throw error;
      }
    });
  } finally {
    await fs.rm(internalOutputRoot, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = {
  BRAND_SUFFIX,
  LEGACY_BRAND_SUFFIX,
  exportReport,
};
