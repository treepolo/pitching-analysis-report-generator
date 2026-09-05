'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const baseExporter = require('./exporter');
const { safeReportName } = require('./asset-paths');
const { validateExportLayout } = require('./layout-validator');
const { createZipArchive, validateZipParity } = require('./zip-archive');

const BRAND_SUFFIX = '投球分析報告by小樹Polo';
const BRAND_LOGO_MIME = 'image/webp';
const BRAND_LOGO_BASENAME = 'tree-polo-logo.webp';
const BRAND_LOGO_BASE64 = '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';
const BRAND_LOGO_BUFFER = Buffer.from(BRAND_LOGO_BASE64, 'base64');
const MAX_REPORT_NAME_LENGTH = 80;

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function rawReportName(value) {
  const normalized = typeof value === 'string' ? value.normalize('NFKC').trim() : '';
  return normalized || '未命名';
}

function brandedDisplayTitle(value) {
  const title = rawReportName(value);
  return title.endsWith(BRAND_SUFFIX) ? title : `${title}${BRAND_SUFFIX}`;
}

function brandedReportName(value) {
  let base = rawReportName(value);
  if (base.endsWith(BRAND_SUFFIX)) base = base.slice(0, -BRAND_SUFFIX.length).trim();
  const safeBase = safeReportName(base);
  const available = Math.max(1, MAX_REPORT_NAME_LENGTH - BRAND_SUFFIX.length);
  const stem = safeBase.slice(0, available).replace(/[. ]+$/gu, '') || 'report';
  return `${stem}${BRAND_SUFFIX}`;
}

function brandHeader(title, logoRelativePath) {
  return `<header class="report-header tree-polo-report-header"><img class="tree-polo-brand-logo" src="${escapeHtml(logoRelativePath)}" alt="小樹Polo"><div class="tree-polo-brand-copy"><h1>${escapeHtml(brandedDisplayTitle(title))}</h1></div></header>`;
}

function applyTreePoloBrandHtml(html, { title, logoRelativePath }) {
  let output = String(html);
  const brandedTitle = escapeHtml(brandedDisplayTitle(title));
  output = output.replace(/<title>[\s\S]*?<\/title>/iu, `<title>${brandedTitle}</title>`);
  output = output.replace(/<header class="report-header">[\s\S]*?<\/header>/iu, brandHeader(title, logoRelativePath));
  return output;
}

function logoAssetId(manifest) {
  const used = new Set((manifest.assets || []).map((asset) => asset?.id).filter(Boolean));
  let suffix = 1;
  while (true) {
    const id = suffix === 1 ? '__tree_polo_brand_logo__' : `__tree_polo_brand_logo_${suffix}__`;
    if (!used.has(id)) return id;
    suffix += 1;
  }
}

async function availableLogoPath(folderPath, manifest) {
  const used = new Set((manifest.assets || []).map((asset) => asset?.relativePath).filter(Boolean));
  let suffix = 1;
  while (true) {
    const filename = suffix === 1 ? BRAND_LOGO_BASENAME : `tree-polo-logo-${suffix}.webp`;
    const relativePath = `images/${filename}`;
    const absolutePath = path.join(folderPath, 'images', filename);
    const exists = await fs.lstat(absolutePath).then(() => true, (error) => {
      if (error?.code === 'ENOENT') return false;
      throw error;
    });
    if (!used.has(relativePath) && !exists) return { relativePath, absolutePath };
    suffix += 1;
  }
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  const error = new Error('Export cancelled');
  error.code = 'EXPORT_CANCELLED';
  throw error;
}

async function rewriteManifest(folderPath, manifest) {
  await fs.writeFile(
    path.join(folderPath, 'export-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
}

async function applyBrandToFolder(baseResult, options) {
  const folderPath = baseResult.folderPath;
  if (!folderPath) throw new Error('Branded export requires a staged output folder');
  throwIfAborted(options.signal);

  const manifestPath = path.join(folderPath, 'export-manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const oldHtmlPath = path.join(folderPath, 'report.html');
  const sourceHtml = await fs.readFile(oldHtmlPath, 'utf8');
  const logo = await availableLogoPath(folderPath, manifest);
  await fs.mkdir(path.dirname(logo.absolutePath), { recursive: true });
  await fs.writeFile(logo.absolutePath, BRAND_LOGO_BUFFER, { flag: 'wx' });

  const htmlFileName = `${baseResult.safeName}.html`;
  const htmlPath = path.join(folderPath, htmlFileName);
  const brandedHtml = applyTreePoloBrandHtml(sourceHtml, {
    title: options.reportDocument?.title ?? options.reportName,
    logoRelativePath: logo.relativePath,
  });
  await fs.writeFile(htmlPath, brandedHtml, { encoding: 'utf8', flag: 'wx' });
  await fs.rm(oldHtmlPath, { force: true });

  const htmlBuffer = Buffer.from(brandedHtml, 'utf8');
  const logoFileEntry = {
    relativePath: logo.relativePath,
    byteLength: BRAND_LOGO_BUFFER.length,
    sha256: sha256(BRAND_LOGO_BUFFER),
  };
  const logoAssetEntry = {
    id: logoAssetId(manifest),
    kind: 'image',
    relativePath: logo.relativePath,
    label: '小樹Polo Logo',
    mediaType: BRAND_LOGO_MIME,
    byteLength: logoFileEntry.byteLength,
    sha256: logoFileEntry.sha256,
  };
  manifest.assets = [...(manifest.assets || []), logoAssetEntry];
  manifest.files = [
    {
      relativePath: htmlFileName,
      byteLength: htmlBuffer.length,
      sha256: sha256(htmlBuffer),
    },
    ...(manifest.files || []).filter((file) => file?.relativePath !== 'report.html' && file?.relativePath !== logo.relativePath),
    logoFileEntry,
  ];
  await rewriteManifest(folderPath, manifest);

  const validation = await validateExportLayout(folderPath, {
    assetManifest: manifest.assets,
    html: brandedHtml,
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
  return { manifest, validation, htmlFileName, brandedHtml };
}

async function exportReport(options = {}) {
  const requestedKind = typeof options.outputKind === 'string' ? options.outputKind : 'folder';
  const needsZip = options.createZip === true || requestedKind === 'zip' || requestedKind === 'both';
  const internalKind = needsZip ? 'both' : 'folder';
  const brandedName = brandedReportName(options.reportName ?? options.reportDocument?.title);
  let baseResult = null;

  try {
    baseResult = await baseExporter.exportReport({
      ...options,
      reportName: brandedName,
      outputKind: internalKind,
      createZip: needsZip,
    });
    throwIfAborted(options.signal);
    const branded = await applyBrandToFolder(baseResult, options);
    let zip = needsZip ? baseResult.zip : null;

    if (needsZip) {
      if (!baseResult.zipPath) throw new Error('ZIP export did not produce a target path');
      await fs.rm(baseResult.zipPath, { force: true });
      zip = await createZipArchive(baseResult.folderPath, baseResult.zipPath);
      zip.parity = await validateZipParity(baseResult.folderPath, baseResult.zipPath);
    }

    let folderPath = baseResult.folderPath;
    if (requestedKind === 'zip') {
      await fs.rm(folderPath, { recursive: true, force: true });
      folderPath = null;
    }

    return {
      ...baseResult,
      folderPath,
      zipPath: needsZip ? baseResult.zipPath : null,
      manifest: branded.manifest,
      validation: branded.validation,
      zip,
      reportFileName: branded.htmlFileName,
    };
  } catch (error) {
    if (baseResult?.zipPath) await fs.rm(baseResult.zipPath, { force: true }).catch(() => {});
    if (baseResult?.folderPath) await fs.rm(baseResult.folderPath, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

module.exports = {
  BRAND_SUFFIX,
  applyTreePoloBrandHtml,
  brandedDisplayTitle,
  brandedReportName,
  exportReport,
};
