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
const SOCIAL_LINKS = Object.freeze([
  ['instagram', 'Instagram', 'https://www.instagram.com/treepolooo/'],
  ['vocus', '方格子 vocus', 'https://vocus.cc/user/@treepolooo'],
  ['youtube', 'YouTube', 'https://www.youtube.com/@treepolo'],
]);

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

function applyTreePoloBrandHtml(html, { title } = {}) {
  let output = String(html);
  const brandedTitle = escapeHtml(brandedDisplayTitle(title));
  output = output.replace(/<title>[\s\S]*?<\/title>/iu, `<title>${brandedTitle}</title>`);
  output = output.replace(/<header class="report-header">[\s\S]*?<\/header>/iu, brandHeader(title));
  return output;
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

function socialIcon(kind) {
  if (kind === 'instagram') {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.25" y="3.25" width="17.5" height="17.5" rx="5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17.55" cy="6.55" r="1.15" fill="currentColor"/></svg>';
  }
  if (kind === 'youtube') {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="4.4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M10 8.7 16 12l-6 3.3z" fill="currentColor"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.25" y="3.25" width="17.5" height="17.5" rx="4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7.2 7.2h3.1l1.75 6.25L13.8 7.2h3.05l-3.25 9.6h-3.2z" fill="currentColor"/></svg>';
}

function treePoloFooterStyle() {
  return `<style data-tree-polo-footer-style>
.tree-polo-promotion{margin:64px 20px 0;padding:30px 0 28px;border-top:1px solid #e6e6e6}
.tree-polo-promotion-links{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;width:min(760px,100%);margin:0 auto}
.tree-polo-promotion-link{display:flex;align-items:center;justify-content:center;gap:10px;min-height:58px;padding:12px 16px;border:1px solid #e1e1e1;border-radius:10px;background:#fafafa;color:#2b2b2b;text-decoration:none;font:650 13px/1.2 system-ui,-apple-system,"Segoe UI","Microsoft JhengHei",sans-serif;letter-spacing:.01em;transition:transform .18s ease,border-color .18s ease,background .18s ease,color .18s ease,box-shadow .18s ease}
.tree-polo-promotion-link:hover{transform:translateY(-2px);border-color:#1a8917;background:#fff;color:#156d12;box-shadow:0 7px 20px rgba(0,0,0,.07)}
.tree-polo-promotion-link:focus-visible{outline:2px solid #1a8917;outline-offset:3px}
.tree-polo-promotion-icon{display:grid;place-items:center;width:24px;height:24px;flex:0 0 24px}.tree-polo-promotion-icon svg{display:block;width:24px;height:24px}
.tree-polo-footer{margin:0 20px;padding:38px 20px 30px;border-top:1px solid #ededed;text-align:center;color:#242424}
.tree-polo-footer-message{width:min(680px,100%);margin:0 auto 28px;font:600 clamp(18px,2.25vw,25px)/1.55 Georgia,"Noto Serif TC","PMingLiU",serif;letter-spacing:.015em;color:#242424}
.tree-polo-footer-brand{display:flex;align-items:center;justify-content:center;gap:10px;margin:0 auto 12px}.tree-polo-footer-logo{display:block;width:auto;height:30px;max-width:130px;object-fit:contain}.tree-polo-footer-wordmark{font:800 13px/1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.11em;color:#1a8917}
.tree-polo-footer-meta{margin:0;color:#858585;font:500 10px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.055em;text-transform:uppercase}
@media(max-width:700px){.tree-polo-promotion{margin:48px 8px 0;padding:24px 0 22px}.tree-polo-promotion-links{gap:6px}.tree-polo-promotion-link{gap:6px;min-height:52px;padding:10px 6px;font-size:11px}.tree-polo-promotion-icon,.tree-polo-promotion-icon svg{width:20px;height:20px}.tree-polo-footer{margin:0 8px;padding:30px 12px 24px}.tree-polo-footer-message{font-size:19px;margin-bottom:23px}.tree-polo-footer-logo{height:26px}}
@media print{.tree-polo-promotion{display:none!important}.tree-polo-footer{margin-top:32px}.tree-polo-footer-logo{filter:grayscale(1)}}
</style>`;
}

function treePoloPromotionFooterMarkup({ logoRelativePath = BRAND_LOGO_RELATIVE_PATH } = {}) {
  const links = SOCIAL_LINKS.map(([kind, label, href]) => `<a class="tree-polo-promotion-link tree-polo-promotion-link-${kind}" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" aria-label="前往${escapeHtml(label)}"><span class="tree-polo-promotion-icon">${socialIcon(kind)}</span><span class="tree-polo-promotion-name">${escapeHtml(label)}</span></a>`).join('');
  return `<section class="tree-polo-promotion" data-tree-polo-promotion aria-label="小樹Polo 自媒體"><nav class="tree-polo-promotion-links" aria-label="小樹Polo 社群與內容平台">${links}</nav></section>
<footer class="tree-polo-footer" data-tree-polo-footer>
  <p class="tree-polo-footer-message">希望我的洞察，能在你追求卓越的路上幫上忙。</p>
  <div class="tree-polo-footer-brand"><img class="tree-polo-footer-logo" src="${escapeHtml(logoRelativePath)}" alt="小樹Polo"><span class="tree-polo-footer-wordmark">TREEPOLO</span></div>
  <p class="tree-polo-footer-meta">Pitching Analysis Report by 小樹Polo · © TREEPOLO</p>
</footer>`;
}

function injectTreePoloPromotionFooter(html, options = {}) {
  let output = String(html);
  if (!output.includes('data-tree-polo-footer-style')) {
    const style = treePoloFooterStyle();
    output = output.includes('</head>') ? output.replace('</head>', `${style}\n</head>`) : `${style}\n${output}`;
  }
  if (!output.includes('data-tree-polo-promotion') && !output.includes('data-tree-polo-footer')) {
    const markup = treePoloPromotionFooterMarkup(options);
    output = output.includes('</main>') ? output.replace('</main>', `${markup}\n</main>`) : `${output}\n${markup}`;
  }
  return output;
}

function applyTreePoloPackageHtml(html, { title, logoRelativePath = BRAND_LOGO_RELATIVE_PATH } = {}) {
  let output = applyTreePoloBrandHtml(html, { title });
  output = shortenDocumentTitle(output);
  output = stylizeBrandSignature(output);
  output = enableTreePoloBackground(output);
  output = removeRedundantHelpCopy(output);
  output = injectTreePoloPromotionFooter(output, { logoRelativePath });
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
  SOCIAL_LINKS,
  applyTreePoloBrandHtml,
  applyTreePoloPackageHtml,
  brandedDisplayTitle,
  brandedReportName,
  canonicalReportName,
  createTreePoloPackageAssets,
  enableTreePoloBackground,
  injectTreePoloPromotionFooter,
  shortenBrandSuffix,
  stylizeBrandSignature,
  treePoloFooterStyle,
  treePoloPromotionFooterMarkup,
};
