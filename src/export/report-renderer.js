'use strict';

const {
  ExportValidationError,
  validateReferencedVideoAssetReferences,
} = require('./asset-paths');
const { toReportDocument } = require('../report-contract');

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function encodeAssetPath(relativePath) {
  return relativePath.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

function assertReportDocument(reportDocument) {
  if (reportDocument === null || typeof reportDocument !== 'object' || Array.isArray(reportDocument)) {
    throw new ExportValidationError('Report document is required');
  }
  if (!Array.isArray(reportDocument.sections)) {
    throw new ExportValidationError('Report document sections must be an array');
  }
}

function referenceId(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof value.id === 'string') return value.id;
  return null;
}

const NESTED_REFERENCE_KEYS = [
  'assetId',
  'assetIds',
  'assetRef',
  'assetRefs',
  'mediaAssetId',
  'mediaAssetIds',
  'imageAssetId',
  'videoAssetId',
  'posterAssetId',
  'posterImageAssetId',
  'leftAssetId',
  'rightAssetId',
  'firstAssetId',
  'secondAssetId',
  'leftMediaAssetId',
  'rightMediaAssetId',
  'firstMediaAssetId',
  'secondMediaAssetId',
  'videoAssetIds',
];

function appendReferenceIds(value, ids) {
  if (Array.isArray(value)) {
    value.forEach((entry) => appendReferenceIds(entry, ids));
    return;
  }
  const id = referenceId(value);
  if (id) ids.push(id);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    NESTED_REFERENCE_KEYS.forEach((key) => appendReferenceIds(value[key], ids));
  }
}

function firstReferenceId(block, keys) {
  for (const key of keys) {
    const ids = [];
    appendReferenceIds(block[key], ids);
    if (ids.length > 0) return ids[0];
  }
  return null;
}

function blockReferenceIds(block) {
  const values = [
    block.leftMediaAssetId,
    block.rightMediaAssetId,
    block.firstMediaAssetId,
    block.secondMediaAssetId,
    block.leftAssetId,
    block.rightAssetId,
    block.firstAssetId,
    block.secondAssetId,
    block.videoAssetIds,
    block.assetIds,
    block.mediaAssetIds,
    block.assetRefs,
    block.assetRef,
    block.left,
    block.right,
    block.sides && block.sides.left,
    block.sides && block.sides.right,
  ];
  const ids = [];
  values.forEach((value) => appendReferenceIds(value, ids));
  return [...new Set(ids)];
}

function blockText(block) {
  if (typeof block.content === 'string') return block.content;
  if (typeof block.text === 'string') return block.text;
  return '';
}

function renderEmptyContent() {
  return '<span class="muted">No content</span>';
}

function renderText(block) {
  const content = blockText(block);
  return `<p class="report-text">${content ? escapeHtml(content) : renderEmptyContent()}</p>`;
}

function renderCaption(label) {
  return label ? `<figcaption>${escapeHtml(label)}</figcaption>` : '';
}

function renderImage(asset, label) {
  const alt = label || asset.label || 'Report image';
  return '<figure class="report-media report-image">'
    + `<img loading="lazy" src="${escapeHtml(encodeAssetPath(asset.relativePath))}" alt="${escapeHtml(alt)}">`
    + renderCaption(label || asset.label)
    + '</figure>';
}

function renderVideo(asset, label, posterAsset) {
  const poster = posterAsset ? ` poster="${escapeHtml(encodeAssetPath(posterAsset.relativePath))}"` : '';
  return '<figure class="report-media report-video">'
    + `<video controls preload="metadata" src="${escapeHtml(encodeAssetPath(asset.relativePath))}"${poster}>`
    + 'Your browser does not support embedded video.'
    + '</video>'
    + renderCaption(label || asset.label)
    + '</figure>';
}

function renderComparison(block, byId) {
  const ids = blockReferenceIds(block);
  const assets = ids.map((id) => byId.get(id)).filter(Boolean).slice(0, 2);
  if (assets.length === 0) return renderText(block);
  const labels = Array.isArray(block.labels) ? block.labels : [
    block.left && block.left.label,
    block.right && block.right.label,
  ];
  return `<div class="comparison-media">${assets.map((asset, index) => renderVideo(
    asset,
    typeof labels[index] === 'string' ? labels[index] : asset.label,
    null,
  )).join('')}</div>`;
}

function renderBlock(block, byId) {
  const safeBlock = block && typeof block === 'object' ? block : {};
  const type = typeof safeBlock.type === 'string' ? safeBlock.type.toLowerCase() : 'unknown';
  const label = typeof safeBlock.label === 'string'
    ? safeBlock.label
    : (typeof safeBlock.title === 'string' ? safeBlock.title : '');

  if (type === 'image' || type === 'imageblock' || type === 'photo') {
    const imageId = firstReferenceId(safeBlock, ['mediaAssetId', 'imageAssetId', 'assetRef', 'assetId']);
    const image = imageId ? byId.get(imageId) : null;
    return image ? renderImage(image, label) : renderText(safeBlock);
  }

  if (type === 'singlevideo' || type === 'video' || type === 'video-block') {
    const videoId = firstReferenceId(safeBlock, ['mediaAssetId', 'videoAssetId', 'assetRef', 'assetId']);
    const video = videoId ? byId.get(videoId) : null;
    const posterId = firstReferenceId(safeBlock, ['posterAssetId', 'posterImageAssetId']);
    const poster = posterId ? byId.get(posterId) : null;
    return video ? renderVideo(video, label, poster) : renderText(safeBlock);
  }

  if (type === 'comparisonvideo' || type === 'comparison-video' || type === 'comparison') {
    return renderComparison(safeBlock, byId);
  }

  if (type === 'heading' || type === 'subheading') {
    return `<h4>${escapeHtml(label || blockText(safeBlock))}</h4>`;
  }

  return `${label ? `<h4>${escapeHtml(label)}</h4>` : ''}${renderText(safeBlock)}`;
}

function renderStyles() {
  return `
    :root { color-scheme: light; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f7fb; color: #172033; }
    main { width: min(100% - 2rem, 980px); margin: 0 auto; padding: 2rem 0 4rem; }
    .report-header { margin-bottom: 2rem; }
    .eyebrow { margin: 0 0 .5rem; color: #596780; font-size: .78rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    h1, h2, h3, h4 { line-height: 1.2; }
    h1 { margin: 0; font-size: clamp(1.75rem, 4vw, 2.8rem); }
    h2 { margin: 0 0 1rem; font-size: 1.45rem; }
    h3 { margin: 0 0 .75rem; font-size: 1.1rem; }
    h4 { margin: 1rem 0 .5rem; font-size: 1rem; }
    .report-section { margin: 0 0 1.25rem; padding: 1.25rem; border: 1px solid #dfe5ef; border-radius: 1rem; background: #fff; box-shadow: 0 8px 24px rgb(23 32 51 / 6%); }
    .report-text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.65; }
    .muted { color: #71809a; }
    .report-media { margin: 1rem 0 0; }
    .report-media video, .report-media img { display: block; width: 100%; max-height: 620px; border-radius: .75rem; background: #111827; object-fit: contain; }
    .report-media img { background: #eef2f7; }
    figcaption { margin-top: .5rem; color: #596780; font-size: .9rem; }
    .comparison-media { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
    @media (max-width: 700px) { main { width: min(100% - 1rem, 980px); padding-top: 1rem; } .report-section { padding: 1rem; } .comparison-media { grid-template-columns: 1fr; } }
  `;
}

function renderReportHtml(reportDocument, { assetManifest = [] } = {}) {
  assertReportDocument(reportDocument);
  const safeReportDocument = toReportDocument(reportDocument);
  const { manifest } = validateReferencedVideoAssetReferences(safeReportDocument, assetManifest);
  const byId = new Map(manifest.map((asset) => [asset.id, asset]));
  const title = typeof safeReportDocument.title === 'string' && safeReportDocument.title.length > 0
    ? safeReportDocument.title
    : 'Pitching analysis report';
  const sections = safeReportDocument.sections.map((section, sectionIndex) => {
    const safeSection = section && typeof section === 'object' ? section : {};
    const sectionId = typeof safeSection.id === 'string' && safeSection.id.length > 0
      ? safeSection.id
      : `section-${sectionIndex + 1}`;
    const sectionTitle = typeof safeSection.title === 'string' ? safeSection.title : '';
    const blocks = Array.isArray(safeSection.blocks) ? safeSection.blocks : [];
    return `<section class="report-section" id="${escapeHtml(sectionId)}">`
      + `${sectionTitle ? `<h2>${escapeHtml(sectionTitle)}</h2>` : ''}`
      + `${blocks.length > 0 ? blocks.map((block) => renderBlock(block, byId)).join('') : renderEmptyContent()}`
      + '</section>';
  }).join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="report-schema-version" content="${escapeHtml(safeReportDocument.schemaVersion ?? 1)}">
    <title>${escapeHtml(title)}</title>
    <style>${renderStyles()}</style>
  </head>
  <body>
    <main>
      <header class="report-header">
        <p class="eyebrow">Pitching analysis report</p>
        <h1>${escapeHtml(title)}</h1>
      </header>
      ${sections || `<section class="report-section">${renderEmptyContent()}</section>`}
    </main>
  </body>
</html>
`;
}

module.exports = {
  encodeAssetPath,
  escapeHtml,
  renderReportHtml,
};
