'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { ExportValidationError } = require('./asset-paths');
const { exportReport: exportLegacyBrandedReport } = require('./tree-polo-branded-exporter');
const { validateExportLayout } = require('./layout-validator');
const { createZipArchive, validateZipParity } = require('./zip-archive');

const LEGACY_BRAND_SUFFIX = '投球分析報告by小樹Polo';
const BRAND_SUFFIX = '報告by小樹Polo';
const REPORT_BACKGROUND_ASSET_ID = '__tree_polo_report_background__';
const REPORT_BACKGROUND_MEDIA_TYPE = 'image/jpeg';
const REPORT_BACKGROUND_RELATIVE_PATH = 'images/tree-polo-report-background.jpg';
const REPORT_BACKGROUND_SOURCE_PATH = path.join(__dirname, 'tree-polo-report-background.jpg');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function pathExists(candidate) {
  return fs.lstat(candidate).then(() => true, (error) => {
    if (error?.code === 'ENOENT') return false;
    throw error;
  });
}

function shortenBrandSuffix(value) {
  const text = String(value ?? '');
  return text.includes(LEGACY_BRAND_SUFFIX)
    ? text.replaceAll(LEGACY_BRAND_SUFFIX, BRAND_SUFFIX)
    : text;
}

function stylizeBrandSignature(html) {
  return String(html).replace(
    /(<h1>[^<]*?報告)by小樹Polo(<\/h1>)/u,
    '$1<span class="tree-polo-signature">by<span class="tree-polo-signature-tree">小樹</span><span class="tree-polo-signature-polo">Polo</span></span>$2',
  );
}

function removeRedundantHelpCopy(html) {
  return String(html)
    .replace('<p>以下圖解直接使用這份報告中的實際播放器介面。</p>', '')
    .replace('<h3>實際播放器圖解</h3>', '')
    .replace(
      '<figcaption>這裡會直接複製本報告中的實際播放器介面，因此按鈕排列、標註控制、進度條與速度控制會和你正在看的報告一致。藍色編號與下方說明相同。</figcaption>',
      '',
    );
}

function enableTreePoloBackground(html) {
  const source = String(html);
  return source.replace(/<body\b([^>]*)>/iu, (match, attributes) => {
    if (/\bdata-tree-polo-background\s*=/iu.test(match)) return match;
    return `<body${attributes} data-tree-polo-background="true">`;
  });
}

function refineHtml(html) {
  let output = shortenBrandSuffix(String(html));
  output = stylizeBrandSignature(output);
  output = enableTreePoloBackground(output);
  output = removeRedundantHelpCopy(output);
  return output;
}

function requestedOutputKind(options) {
  return typeof options?.outputKind === 'string' ? options.outputKind : 'folder';
}

function automaticZipPath(folderParent, safeName) {
  return path.join(folderParent, `${safeName}_offline.zip`);
}

async function availableSafeName(parent, desired, { needsFolder, needsZip }) {
  let suffix = 1;
  while (true) {
    const candidate = suffix === 1 ? desired : `${desired}-${suffix}`;
    const folderBusy = needsFolder && await pathExists(path.join(parent, candidate));
    const zipBusy = needsZip && await pathExists(automaticZipPath(parent, candidate));
    if (!folderBusy && !zipBusy) return candidate;
    suffix += 1;
  }
}

async function rewriteManifest(folderPath, manifest) {
  await fs.writeFile(
    path.join(folderPath, 'export-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
}

async function refineFolder(baseResult, options, needsZip) {
  const sourceFolder = baseResult.folderPath;
  if (!sourceFolder) throw new Error('Refined Tree Polo export requires a temporary folder');
  const parent = path.dirname(sourceFolder);
  const desiredName = shortenBrandSuffix(baseResult.safeName);
  const safeName = await availableSafeName(parent, desiredName, {
    needsFolder: true,
    needsZip,
  });

  const sourceHtmlName = baseResult.reportFileName || `${baseResult.safeName}.html`;
  const targetHtmlName = `${safeName}.html`;
  const sourceHtmlPath = path.join(sourceFolder, sourceHtmlName);
  const targetHtmlPath = path.join(sourceFolder, targetHtmlName);
  const sourceHtml = await fs.readFile(sourceHtmlPath, 'utf8');
  const html = refineHtml(sourceHtml);
  await fs.writeFile(targetHtmlPath, html, sourceHtmlName === targetHtmlName ? 'utf8' : { encoding: 'utf8', flag: 'wx' });
  if (sourceHtmlName !== targetHtmlName) await fs.rm(sourceHtmlPath, { force: true });

  const manifestPath = path.join(sourceFolder, 'export-manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (manifest.report && typeof manifest.report === 'object') manifest.report.safeName = safeName;
  const htmlBuffer = Buffer.from(html, 'utf8');
  manifest.files = (manifest.files || []).map((file) => (
    file?.relativePath === sourceHtmlName
      ? { relativePath: targetHtmlName, byteLength: htmlBuffer.length, sha256: sha256(htmlBuffer) }
      : file
  ));
  await rewriteManifest(sourceFolder, manifest);

  const validation = await validateExportLayout(sourceFolder, {
    assetManifest: manifest.assets || [],
    html,
    htmlFileName: targetHtmlName,
    requireAllManifestAssetsUsed: false,
    verifyManifest: true,
  });
  manifest.validation = {
    valid: validation.valid,
    assetCount: validation.assetCount,
    referencedAssetCount: validation.referencedAssetCount,
  };
  await rewriteManifest(sourceFolder, manifest);

  const targetFolder = path.join(parent, safeName);
  await fs.rename(sourceFolder, targetFolder);
  return {
    safeName,
    folderPath: targetFolder,
    reportFileName: targetHtmlName,
    html,
    manifest,
    validation,
  };
}

async function createReportBackgroundAsset() {
  return {
    id: REPORT_BACKGROUND_ASSET_ID,
    kind: 'image',
    relativePath: REPORT_BACKGROUND_RELATIVE_PATH,
    label: '小樹Polo 報告背景',
    mediaType: REPORT_BACKGROUND_MEDIA_TYPE,
    data: await fs.readFile(REPORT_BACKGROUND_SOURCE_PATH),
    requiredForExport: true,
  };
}

async function exportReport(options = {}) {
  const outputKind = requestedOutputKind(options);
  const needsZip = options.createZip === true || outputKind === 'zip' || outputKind === 'both';
  const sourceAssets = options.assets ?? [];
  if (!Array.isArray(sourceAssets)) throw new ExportValidationError('Export assets must be an array');
  const backgroundAsset = await createReportBackgroundAsset();
  const legacyResult = await exportLegacyBrandedReport({
    ...options,
    assets: [...sourceAssets, backgroundAsset],
    outputKind: needsZip ? 'both' : 'folder',
    createZip: needsZip,
  });

  let refined = null;
  let finalZipPath = null;
  try {
    refined = await refineFolder(legacyResult, options, needsZip);

    let zip = null;
    if (needsZip) {
      if (legacyResult.zipPath) await fs.rm(legacyResult.zipPath, { force: true });
      finalZipPath = automaticZipPath(path.dirname(refined.folderPath), refined.safeName);
      zip = await createZipArchive(refined.folderPath, finalZipPath);
      zip.parity = await validateZipParity(refined.folderPath, finalZipPath);
    }

    let folderPath = refined.folderPath;
    if (outputKind === 'zip') {
      await fs.rm(folderPath, { recursive: true, force: true });
      folderPath = null;
    }

    return {
      ...legacyResult,
      safeName: refined.safeName,
      folderPath,
      zipPath: finalZipPath,
      reportFileName: refined.reportFileName,
      manifest: refined.manifest,
      validation: refined.validation,
      zip,
    };
  } catch (error) {
    if (legacyResult.zipPath) await fs.rm(legacyResult.zipPath, { force: true }).catch(() => {});
    if (finalZipPath) await fs.rm(finalZipPath, { force: true }).catch(() => {});
    if (refined?.folderPath) await fs.rm(refined.folderPath, { recursive: true, force: true }).catch(() => {});
    else if (legacyResult.folderPath) await fs.rm(legacyResult.folderPath, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

module.exports = {
  BRAND_SUFFIX,
  LEGACY_BRAND_SUFFIX,
  REPORT_BACKGROUND_ASSET_ID,
  REPORT_BACKGROUND_MEDIA_TYPE,
  REPORT_BACKGROUND_RELATIVE_PATH,
  REPORT_BACKGROUND_SOURCE_PATH,
  enableTreePoloBackground,
  exportReport,
  refineHtml,
  shortenBrandSuffix,
  stylizeBrandSignature,
};
