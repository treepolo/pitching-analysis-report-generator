'use strict';
const {
  ExportValidationError,
  validateReferencedVideoAssetReferences,
} = require('./asset-paths');
const { toReportDocument } = require('../report-contract');
const { sanitizeRichTextHtml } = require('../rich-text');
const { renderNativeFramePlayerScript } = require('./native-frame-player');
const { renderXp7ReaderTheme } = require('./xp7-reader-theme');
const PLAYBACK_RATE_MIN = 1 / 64;
const PLAYBACK_RATE_MAX = 64;
const PLAYBACK_RATE_DEFAULT = 1;
const PLAYBACK_RATE_SLIDER_MIN = -6;
const PLAYBACK_RATE_SLIDER_MAX = 6;
const PLAYBACK_RATE_SLIDER_STEP = 0.01;
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
function toPortableReportDocument(reportDocument) {
  return toReportDocument(reportDocument);
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
  const rawContent = typeof block?.content === 'string' ? block.content : '';
  const content = block?.contentFormat === 'html'
    ? sanitizeRichTextHtml(rawContent)
    : escapeHtml(rawContent);
  return '<p class="report-text">' + (content || renderEmptyContent()) + '</p>';
}
function renderCaption(label) {
  return label ? `<figcaption>${escapeHtml(label)}</figcaption>` : '';
}
function clampPlaybackRate(value, fallback = PLAYBACK_RATE_DEFAULT) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(PLAYBACK_RATE_MAX, Math.max(PLAYBACK_RATE_MIN, parsed));
}
function playbackRateToSliderValue(rate) {
  return Math.log2(clampPlaybackRate(rate));
}
function formatPlaybackRate(rate) {
  const normalized = clampPlaybackRate(rate);
  if (normalized < 0.1) return normalized.toFixed(4);
  if (normalized < 1) return normalized.toFixed(3);
  return normalized.toFixed(2);
}
function normalizeSegment(value) {
  const segment = value && typeof value === 'object' ? value : {};
  const startValue = Number(segment.in ?? segment.start ?? segment.startFrame);
  const endValue = Number(segment.out ?? segment.end ?? segment.endFrame);
  const start = Number.isFinite(startValue) ? Math.max(0, Math.round(startValue)) : 0;
  const end = Number.isFinite(endValue) && endValue > 0 ? Math.max(start, Math.round(endValue)) : 0;
  return { in: start, out: end };
}
function normalizeLoop(value, segment) {
  const loop = value && typeof value === 'object' ? value : null;
  if (!loop && value !== true) {
    return { enabled: true };
  }
  return {
    enabled: loop ? loop.enabled !== false : true,
  };
}
function playbackSettings(config) {
  const source = config && typeof config === 'object' ? config : {};
  const playback = source.playback && typeof source.playback === 'object' ? source.playback : {};
  const playbackOptions = source.playbackOptions && typeof source.playbackOptions === 'object'
    ? source.playbackOptions
    : {};
  const segment = normalizeSegment(source.segment);
  const loopSource = source.loop
    ?? playback.loop
    ?? playbackOptions.loop;
  return {
    segment,
    rate: PLAYBACK_RATE_DEFAULT,
    loop: normalizeLoop(loopSource, segment),
  };
}
function sideConfig(block, side) {
  if (side === 'single') return block;
  return block[side] || block.sides?.[side] || {};
}
function sideTitle(block, side, asset) {
  const config = sideConfig(block, side);
  const configuredLabel = side === 'single' ? config.sourceLabel : config.label;
  if (typeof configuredLabel === 'string' && configuredLabel.trim() !== '') return configuredLabel;
  const fileName = asset
    ? (asset.fileName || asset.originalFileName || asset.label || asset.relativePath?.split('/').pop() || '')
    : '';
  return fileName || (side === 'left' ? '左側影片' : side === 'right' ? '右側影片' : '影片來源');
}
function sideAssetId(block, side) {
  const config = sideConfig(block, side);
  const directId = firstReferenceId(config, ['mediaAssetId', 'videoAssetId', 'assetRef', 'assetId']);
  if (directId) return directId;
  const keys = side === 'left'
    ? ['leftMediaAssetId', 'leftAssetId', 'firstMediaAssetId', 'firstAssetId']
    : ['rightMediaAssetId', 'rightAssetId', 'secondMediaAssetId', 'secondAssetId'];
  return firstReferenceId(block, keys);
}
function sidePosterAssetId(block, side) {
  const config = sideConfig(block, side);
  const directId = firstReferenceId(config, ['posterAssetId', 'posterImageAssetId']);
  if (directId) return directId;
  return side === 'single' ? firstReferenceId(block, ['posterAssetId', 'posterImageAssetId']) : null;
}
function renderImage(asset, label) {
  const alt = label || asset.label || 'Report image';
  return '<figure class="report-media report-image">'
    + `<img loading="lazy" src="${escapeHtml(encodeAssetPath(asset.relativePath))}" alt="${escapeHtml(alt)}">`
    + renderCaption(label || asset.label)
    + '</figure>';
}
function frameMetadataAttributes(asset) {
  const metadata = asset && asset.metadata && typeof asset.metadata === 'object'
    ? asset.metadata
    : {};
  const fps = Number(metadata.fps);
  const frameCount = Number(metadata.frameCount);
  const frameTimes = Array.isArray(metadata.frameTimes)
    ? metadata.frameTimes.map((value) => (Number.isFinite(Number(value)) ? Number(value) : null))
    : [];
  return {
    fpsAttribute: ' data-frame-fps="' + escapeHtml(String(Number.isFinite(fps) && fps > 0 ? fps : 30)) + '"',
    frameCountAttribute: ' data-frame-count="' + escapeHtml(String(Number.isInteger(frameCount) && frameCount > 0 ? frameCount : 0)) + '"',
    frameTimesAttribute: frameTimes.length > 0
      ? ' data-frame-times="' + escapeHtml(JSON.stringify(frameTimes)) + '"'
      : '',
  };
}
function renderPlayerVideo(block, side, asset, posterAsset, comparison) {
  if (!asset) return '';
  const config = sideConfig(block, side);
  const settings = playbackSettings(config);
  const label = sideTitle(block, side, asset);
  const poster = posterAsset
    ? ' poster="' + escapeHtml(encodeAssetPath(posterAsset.relativePath)) + '"'
    : '';
  const segmentOut = settings.segment.out > 0 ? String(settings.segment.out) : '';
  const sideLabel = side === 'left' ? '左側' : side === 'right' ? '右側' : '影片';
  const sideHeading = comparison ? '<div class="portable-player-side-heading"><h3>' + escapeHtml(label) + '</h3></div>' : '';
  const metadata = frameMetadataAttributes(asset);
  return '<div class="portable-player-side native-frame-player-side" data-native-frame-player data-player-side="' + escapeHtml(side) + '" tabindex="-1" aria-selected="false" data-frame-selected="false"'
    + ' data-segment-in="' + escapeHtml(String(settings.segment.in)) + '"'
    + ' data-segment-out="' + escapeHtml(segmentOut) + '"'
    + ' data-loop-enabled="' + (settings.loop.enabled ? 'true' : 'false') + '"'
    + metadata.fpsAttribute + metadata.frameCountAttribute + metadata.frameTimesAttribute + '>'
    + sideHeading
    + '<div class="portable-frame-surface" data-frame-surface tabindex="-1" aria-label="' + escapeHtml(sideLabel + '影格畫面') + '">'
    + '<video playsinline preload="metadata" data-player-video src="' + escapeHtml(encodeAssetPath(asset.relativePath)) + '"' + poster + '>'
    + '此瀏覽器不支援內嵌影片。'
    + '</video>'
    + '<span data-frame-placeholder>正在載入第一幀…</span>'
    + '</div>'
    + '<p class="portable-frame-side-status" data-frame-side-status role="status">正在載入影片…</p>'
    + (comparison ? '' : '<div class="portable-frame-controls" data-frame-controls role="group" aria-label="' + escapeHtml(sideLabel + '影格播放器控制') + '">'
    + '<div class="portable-frame-navigation">'
    + '<button type="button" class="portable-frame-toggle" data-frame-action="toggle" disabled aria-pressed="false" aria-label="播放" title="播放">▶</button>'
    + '<button type="button" class="portable-frame-step" data-frame-action="previous" disabled aria-label="上一幀" title="上一幀">←</button>'
    + '<output data-frame-position data-frame-current>尚未準備</output>'
    + '<input data-frame-timeline type="range" min="0" max="0" step="1" value="0" disabled aria-label="' + escapeHtml(sideLabel + '影格時間軸') + '">'
    + '<output data-frame-total>共 -- 幀</output>'
    + '<button type="button" class="portable-frame-step" data-frame-action="next" disabled aria-label="下一幀" title="下一幀">→</button>'
    + '</div>'
    + '<div class="portable-frame-rate-row" data-frame-rate-row>'
    + '<input data-frame-rate-input type="number" min="' + PLAYBACK_RATE_MIN + '" max="' + PLAYBACK_RATE_MAX + '" step="any" value="' + formatPlaybackRate(settings.rate) + '" disabled aria-label="' + escapeHtml(sideLabel + '播放速度數值') + '">'
    + '<input data-frame-rate type="range" min="' + PLAYBACK_RATE_SLIDER_MIN + '" max="' + PLAYBACK_RATE_SLIDER_MAX + '" step="' + PLAYBACK_RATE_SLIDER_STEP + '" value="' + playbackRateToSliderValue(settings.rate) + '" disabled aria-label="' + escapeHtml(sideLabel + '播放速度控制條') + '">'
    + '<button type="button" data-frame-action="reset-rate" disabled aria-label="' + escapeHtml(sideLabel + '重置播放速度為 1 倍') + '" title="重置為 1 倍">↻</button>'
    + '</div>'
    + '<label class="portable-frame-loop"><input data-frame-loop type="checkbox"' + (settings.loop.enabled ? ' checked' : '') + '>循環</label>'
    + '<span class="portable-frame-player-status" data-frame-player-status role="status" data-state="pending">正在載入影片…</span>'
    + '</div>')
    + '</div>';
}
function renderNativeSharedControls(label, block) {
  const escaped = escapeHtml(label);
  const leftSettings = playbackSettings(sideConfig(block, 'left'));
  const commonLoop = block?.loop?.enabled !== false;
  return '<div class="portable-frame-controls portable-frame-shared-controls" data-frame-controls data-frame-shared-controls role="group" aria-label="' + escaped + '影格播放器控制">'
    + '<div class="portable-frame-navigation">'
    + '<button type="button" class="portable-frame-toggle" data-frame-action="toggle" disabled aria-pressed="false" aria-label="播放" title="播放">▶</button>'
    + '<button type="button" class="portable-frame-step" data-frame-action="previous" disabled aria-label="上一幀" title="上一幀">←</button>'
    + '<output data-frame-position data-frame-current>尚未準備</output>'
    + '<input data-frame-timeline type="range" min="0" max="0" step="1" value="0" disabled aria-label="' + escaped + '影格時間軸">'
    + '<output data-frame-total>共 -- 幀</output>'
    + '<button type="button" class="portable-frame-step" data-frame-action="next" disabled aria-label="下一幀" title="下一幀">→</button>'
    + '</div>'
    + '<div class="portable-frame-rate-row" data-frame-rate-row>'
    + '<input data-frame-rate-input type="number" min="' + PLAYBACK_RATE_MIN + '" max="' + PLAYBACK_RATE_MAX + '" step="any" value="' + formatPlaybackRate(leftSettings.rate) + '" disabled aria-label="' + escaped + '播放速度數值">'
    + '<input data-frame-rate type="range" min="' + PLAYBACK_RATE_SLIDER_MIN + '" max="' + PLAYBACK_RATE_SLIDER_MAX + '" step="' + PLAYBACK_RATE_SLIDER_STEP + '" value="0" disabled aria-label="' + escaped + '播放速度控制條">'
    + '<button type="button" data-frame-action="reset-rate" disabled aria-label="重置播放速度為 1 倍" title="重置為 1 倍">↻</button>'
    + '</div>'
    + '<label class="portable-frame-loop"><input data-frame-loop type="checkbox"' + (commonLoop ? ' checked' : '') + '>循環播放</label>'
    + '<span class="portable-frame-player-status" data-frame-player-status role="status" data-state="pending">正在載入影片…</span>'
    + '</div>';
}
function renderPlayer(block, byId, comparison) {
  const sides = comparison ? ['left', 'right'] : ['single'];
  const renderedSides = sides.map((side) => {
    const assetId = sideAssetId(block, side);
    const asset = assetId ? byId.get(assetId) : null;
    const posterId = sidePosterAssetId(block, side);
    const posterAsset = posterId ? byId.get(posterId) : null;
    return renderPlayerVideo(block, side, asset, posterAsset, comparison);
  }).join('');
  if (!renderedSides) return renderText(block);
  const layout = comparison ? (block.layout === 'stacked' ? 'stacked' : 'side-by-side') : 'stacked';
  const blockLabel = typeof block.label === 'string' ? block.label.trim() : '';
  const accessibleBlockLabel = blockLabel || (comparison ? '雙影片' : '單一影片');
  return `<figure class="report-media report-video portable-player" data-portable-player data-native-frame-player-block data-frame-selected="false" aria-selected="false" tabindex="0" aria-label="${escapeHtml(`${accessibleBlockLabel}播放器`)}" data-player-layout="${layout}" data-sync-left-frame="${block.sync?.leftFrame ?? ''}" data-sync-right-frame="${block.sync?.rightFrame ?? ''}" data-common-segment-in="${block.commonSegment?.in ?? 0}" data-common-segment-out="${block.commonSegment?.out ?? 0}" data-common-loop-enabled="${block.loop?.enabled !== false ? 'true' : 'false'}">
    ${blockLabel ? `<header class="portable-player-header"><h3>${escapeHtml(blockLabel)}</h3></header>` : ''}
    <div class="portable-player-grid portable-player-grid-${layout}">${renderedSides}</div>
    ${comparison ? renderNativeSharedControls(accessibleBlockLabel, block) : ''}
  </figure>`;
}
function renderComparison(block, byId) {
  return renderPlayer(block, byId, true);
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
    return renderPlayer(safeBlock, byId, false);
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
  return renderXp7ReaderTheme();
}
function renderPlayerScript({ includeNative = true } = {}) {
  const body = includeNative ? renderNativeFramePlayerScript() : '';
  return '<script>' + String.fromCharCode(10) + body + String.fromCharCode(10) + '</script>';
}
function renderReportHtml(
  reportDocument,
  { assetManifest = [] } = {},
) {
  assertReportDocument(reportDocument);
  const safeReportDocument = toPortableReportDocument(reportDocument);
  const { manifest } = validateReferencedVideoAssetReferences(safeReportDocument, assetManifest);
  const byId = new Map(manifest.map((asset) => [asset.id, asset]));
  const title = typeof safeReportDocument.title === 'string' && safeReportDocument.title.length > 0
    ? safeReportDocument.title
    : 'Pitching analysis report';
  let nativePlayerCount = 0;
  const sections = safeReportDocument.sections.map((section, sectionIndex) => {
    const safeSection = section && typeof section === 'object' ? section : {};
    const sectionId = typeof safeSection.id === 'string' && safeSection.id.length > 0
      ? safeSection.id
      : `section-${sectionIndex + 1}`;
    const sectionTitle = typeof safeSection.title === 'string' ? safeSection.title : '';
    const blocks = Array.isArray(safeSection.blocks) ? safeSection.blocks : [];
    return `<section class="report-section" id="${escapeHtml(sectionId)}">`
      + `${sectionTitle ? `<h2>${escapeHtml(sectionTitle)}</h2>` : ''}`
      + `${blocks.length > 0 ? blocks.map((block) => {
        const blockType = typeof block?.type === 'string' ? block.type.toLowerCase() : '';
        const isVideo = ['singlevideo', 'comparisonvideo'].includes(blockType);
        const sides = blockType === 'comparisonvideo' ? ['left', 'right'] : ['single'];
        if (isVideo) nativePlayerCount += 1;
        return renderBlock(block, byId);
      }).join('') : renderEmptyContent()}`
      + '</section>';
  }).join('');
  return `<!doctype html>
<html lang="zh-Hant">
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
    ${renderPlayerScript({ includeNative: nativePlayerCount > 0 })}
  </body>
</html>
`;
}
module.exports = {
  encodeAssetPath,
  escapeHtml,
  renderReportHtml,
  toPortableReportDocument,
};
