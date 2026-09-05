'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  inferAssetKind,
  normalizeAssetKind,
  safeAssetFilename,
  safeReportName,
} = require('./asset-paths');

const LEGACY_BRAND_SUFFIX = '投球分析報告by小樹Polo';
const BRAND_SUFFIX = '報告by小樹Polo';
const BRAND_LOGO_ASSET_ID = '__tree_polo_brand_logo__';
const BRAND_LOGO_MEDIA_TYPE = 'image/webp';
const BRAND_LOGO_RELATIVE_PATH = 'images/tree-polo-logo.webp';
const BRAND_LOGO_SOURCE_PATH = path.join(__dirname, 'tree-polo-logo.webp');
const REPORT_BACKGROUND_ASSET_ID = '__tree_polo_report_background__';
const REPORT_BACKGROUND_MEDIA_TYPE = 'image/jpeg';
const REPORT_BACKGROUND_RELATIVE_PATH = 'images/tree-polo-report-background.jpg';
const REPORT_BACKGROUND_SOURCE_PATH = path.join(__dirname, 'tree-polo-report-background.jpg');
const MAX_REPORT_NAME_LENGTH = 80;

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
  return title.endsWith(LEGACY_BRAND_SUFFIX) ? title : `${title}${LEGACY_BRAND_SUFFIX}`;
}

function brandedReportName(value) {
  let base = rawReportName(value);
  if (base.endsWith(LEGACY_BRAND_SUFFIX)) base = base.slice(0, -LEGACY_BRAND_SUFFIX.length).trim();
  const safeBase = safeReportName(base);
  const available = Math.max(1, MAX_REPORT_NAME_LENGTH - LEGACY_BRAND_SUFFIX.length);
  const stem = safeBase.slice(0, available).replace(/[. ]+$/gu, '') || 'report';
  return `${stem}${LEGACY_BRAND_SUFFIX}`;
}

function shortenBrandSuffix(value) {
  const text = String(value ?? '');
  return text.includes(LEGACY_BRAND_SUFFIX)
    ? text.replaceAll(LEGACY_BRAND_SUFFIX, BRAND_SUFFIX)
    : text;
}

function canonicalReportName(value) {
  return shortenBrandSuffix(brandedReportName(value));
}

function brandHeader(title) {
  return `<header class="report-header tree-polo-report-header"><div class="tree-polo-brand-copy"><h1>${escapeHtml(brandedDisplayTitle(title))}</h1></div></header>`;
}

function ensureBrandIcon(html, logoRelativePath) {
  const source = String(html);
  if (typeof logoRelativePath !== 'string' || logoRelativePath.trim() === '') return source;
  if (/<link\b[^>]*\brel=["']icon["']/iu.test(source)) return source;
  const icon = `<link rel="icon" type="${BRAND_LOGO_MEDIA_TYPE}" href="${escapeHtml(logoRelativePath)}">`;
  return source.includes('</head>') ? source.replace('</head>', `${icon}</head>`) : `${icon}${source}`;
}

function applyTreePoloBrandHtml(html, { title, logoRelativePath } = {}) {
  let output = String(html);
  const brandedTitle = escapeHtml(brandedDisplayTitle(title));
  output = output.replace(/<title>[\s\S]*?<\/title>/iu, `<title>${brandedTitle}</title>`);
  output = output.replace(/<header class="report-header">[\s\S]*?<\/header>/iu, brandHeader(title));
  return ensureBrandIcon(output, logoRelativePath);
}

function shortenDocumentTitle(html) {
  return String(html).replace(/<title>([\s\S]*?)<\/title>/iu, (match, title) => (
    `<title>${shortenBrandSuffix(title)}</title>`
  ));
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

function applyTreePoloPackageHtml(html, { title, logoRelativePath } = {}) {
  let output = applyTreePoloBrandHtml(html, { title, logoRelativePath });
  output = shortenDocumentTitle(output);
  output = stylizeBrandSignature(output);
  output = enableTreePoloBackground(output);
  output = removeRedundantHelpCopy(output);
  return output;
}

function assetSourceName(asset) {
  const source = asset?.sourceReference;
  if (typeof source === 'string') return source;
  if (source && typeof source === 'object') return source.relativePath ?? source.path ?? '';
  return asset?.sourcePath ?? asset?.filePath ?? asset?.localPath ?? '';
}

function reservedImagePath(asset) {
  if (!asset || typeof asset !== 'object') return null;
  const kind = normalizeAssetKind(
    asset.kind ?? asset.mediaKind ?? asset.assetKind,
    inferAssetKind(asset.relativePath ?? assetSourceName(asset) ?? asset.displayName ?? asset.name),
  );
  if (kind !== 'image') return null;
  if (typeof asset.relativePath === 'string' && asset.relativePath.trim() !== '') {
    return asset.relativePath.replaceAll('\\', '/');
  }
  const filename = safeAssetFilename(
    asset.displayName || asset.name || assetSourceName(asset) || `${asset.id || 'image'}.png`,
    `${asset.id || 'image'}.png`,
  );
  return `images/${filename}`;
}

function portablePathKey(value) {
  return String(value).normalize('NFC').toLocaleLowerCase('en-US');
}

function uniqueLogoIdentity(assets) {
  const usedIds = new Set(assets.map((asset) => asset?.id).filter(Boolean));
  const usedPaths = new Set(assets.map(reservedImagePath).filter(Boolean).map(portablePathKey));
  let idSuffix = 1;
  let id = BRAND_LOGO_ASSET_ID;
  while (usedIds.has(id)) {
    idSuffix += 1;
    id = `__tree_polo_brand_logo_${idSuffix}__`;
  }
  let pathSuffix = 1;
  let relativePath = BRAND_LOGO_RELATIVE_PATH;
  while (usedPaths.has(portablePathKey(relativePath))) {
    pathSuffix += 1;
    relativePath = `images/tree-polo-logo-${pathSuffix}.webp`;
  }
  return { id, relativePath };
}

async function createTreePoloPackageAssets(sourceAssets = []) {
  const backgroundAsset = {
    id: REPORT_BACKGROUND_ASSET_ID,
    kind: 'image',
    relativePath: REPORT_BACKGROUND_RELATIVE_PATH,
    label: '小樹Polo 報告背景',
    mediaType: REPORT_BACKGROUND_MEDIA_TYPE,
    data: await fs.readFile(REPORT_BACKGROUND_SOURCE_PATH),
    requiredForExport: true,
  };
  const logoIdentity = uniqueLogoIdentity([...sourceAssets, backgroundAsset]);
  const logoAsset = {
    id: logoIdentity.id,
    kind: 'image',
    relativePath: logoIdentity.relativePath,
    label: '小樹Polo Logo',
    mediaType: BRAND_LOGO_MEDIA_TYPE,
    data: await fs.readFile(BRAND_LOGO_SOURCE_PATH),
    requiredForExport: true,
  };
  return {
    assets: [backgroundAsset, logoAsset],
    logoRelativePath: logoAsset.relativePath,
  };
}

module.exports = {
  BRAND_LOGO_ASSET_ID,
  BRAND_LOGO_MEDIA_TYPE,
  BRAND_LOGO_RELATIVE_PATH,
  BRAND_LOGO_SOURCE_PATH,
  BRAND_SUFFIX,
  LEGACY_BRAND_SUFFIX,
  REPORT_BACKGROUND_ASSET_ID,
  REPORT_BACKGROUND_MEDIA_TYPE,
  REPORT_BACKGROUND_RELATIVE_PATH,
  REPORT_BACKGROUND_SOURCE_PATH,
  applyTreePoloBrandHtml,
  applyTreePoloPackageHtml,
  brandedDisplayTitle,
  brandedReportName,
  canonicalReportName,
  createTreePoloPackageAssets,
  enableTreePoloBackground,
  shortenBrandSuffix,
  stylizeBrandSignature,
};
