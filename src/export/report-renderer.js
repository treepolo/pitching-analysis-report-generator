'use strict';
const {
  ExportValidationError,
  normalizeRelativeAssetPath,
  portableAssetPathKey,
  validateReferencedVideoAssetReferences,
} = require('./asset-paths');
const { toReportDocument } = require('../report-contract');
const { renderNativeFramePlayerScript } = require('./native-frame-player');
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
  const content = blockText(block);
  return `<p class="report-text">${content ? escapeHtml(content) : renderEmptyContent()}</p>`;
}
function renderCaption(label) {
  return label ? `<figcaption>${escapeHtml(label)}</figcaption>` : '';
}
function finiteSetting(value, fallback = null) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
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
function formatSeconds(value) {
  return value === null || value === undefined ? '未設定' : `${Number(value).toFixed(2)} 秒`;
}
function formatLoop(loop, segment = { in: 0, out: 0 }) {
  if (!loop.enabled) return '關閉';
  return !(segment.out > 0)
    ? `開啟（${formatSeconds(segment.in)}起）`
    : `開啟（${formatSeconds(segment.in)}–${formatSeconds(segment.out)}）`;
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
  const metadata = frameMetadataAttributes(asset);
  return '<div class="portable-player-side native-frame-player-side" data-native-frame-player data-player-side="' + escapeHtml(side) + '" tabindex="0" aria-selected="false" data-frame-selected="false"'
    + ' data-segment-in="' + escapeHtml(String(settings.segment.in)) + '"'
    + ' data-segment-out="' + escapeHtml(segmentOut) + '"'
    + ' data-loop-enabled="' + (settings.loop.enabled ? 'true' : 'false') + '"'
    + metadata.fpsAttribute + metadata.frameCountAttribute + metadata.frameTimesAttribute + '>'
    + '<div class="portable-player-side-heading"><h3>' + escapeHtml(label) + '</h3></div>'
    + '<div class="portable-frame-surface" data-frame-surface tabindex="0" aria-label="' + escapeHtml(sideLabel + '影格畫面') + '">'
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
function frameCacheFramePath(frame, assetId, frameIndex) {
  if (!frame || typeof frame !== 'object' || typeof frame.relativePath !== 'string') {
    throw new ExportValidationError(`Frame cache ${assetId} frame ${frameIndex} is invalid`);
  }
  try {
    return normalizeRelativeAssetPath(frame.relativePath, { allowRootFile: true });
  } catch (error) {
    throw new ExportValidationError(`Frame cache ${assetId} frame ${frameIndex} path is invalid`, { cause: error });
  }
}
function frameCachePathInside(root, candidate) {
  const relative = root === candidate ? '' : candidate.slice(`${root}/`.length);
  return root === candidate || (candidate.startsWith(`${root}/`) && relative.length > 0 && !relative.startsWith('../'));
}
function normalizeRendererFrameCaches(frameCacheManifest) {
  if (frameCacheManifest === null || frameCacheManifest === undefined) return new Map();
  const entries = Array.isArray(frameCacheManifest)
    ? frameCacheManifest
    : (frameCacheManifest && typeof frameCacheManifest === 'object'
      ? Object.entries(frameCacheManifest).map(([assetId, value]) => ({
        ...(value && typeof value === 'object' ? value : {}),
        assetId: value?.assetId ?? assetId,
      }))
      : null);
  if (!entries) throw new ExportValidationError('Frame cache manifest must be an array or object');
  const byAssetId = new Map();
  entries.forEach((entry, entryIndex) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new ExportValidationError(`Frame cache manifest entry ${entryIndex} is invalid`);
    }
    const assetId = typeof entry.assetId === 'string' && entry.assetId.length > 0
      ? entry.assetId
      : null;
    if (!assetId) throw new ExportValidationError(`Frame cache manifest entry ${entryIndex} has no assetId`);
    if (byAssetId.has(assetId)) throw new ExportValidationError(`Duplicate frame cache manifest asset id: ${assetId}`);
    const status = typeof entry.status === 'string' ? entry.status : 'ready';
    if (status !== 'ready') {
      byAssetId.set(assetId, {
        assetId,
        status,
        ready: false,
        error: entry.error || null,
      });
      return;
    }
    const cache = entry.cache && typeof entry.cache === 'object' && !Array.isArray(entry.cache)
      ? entry.cache
      : entry;
    const frames = Array.isArray(cache.frames) ? cache.frames : entry.frames;
    if (!Array.isArray(frames) || frames.length === 0) {
      throw new ExportValidationError(`Ready frame cache manifest for asset ${assetId} has no frames`);
    }
    const seen = new Set();
    const normalizedFrames = frames.map((frame, frameIndex) => {
      if (!frame || typeof frame !== 'object' || frame.frameNumber !== frameIndex) {
        throw new ExportValidationError(`Frame cache ${assetId} frame mapping is invalid`);
      }
      const relativePath = frameCacheFramePath(frame, assetId, frameIndex);
      const key = portableAssetPathKey(relativePath);
      if (seen.has(key)) throw new ExportValidationError(`Frame cache ${assetId} contains duplicate frame paths`);
      seen.add(key);
      return {
        frameNumber: frameIndex,
        pts: finiteSetting(frame.pts, null),
        time: finiteSetting(frame.time, null),
        width: finiteSetting(frame.width, null),
        height: finiteSetting(frame.height, null),
        relativePath,
      };
    });
    const descriptor = cache.cache && typeof cache.cache === 'object' ? cache.cache : entry.cache;
    if (!descriptor || descriptor.format !== 'png') {
      throw new ExportValidationError(`Frame cache ${assetId} does not declare PNG format`);
    }
    const indexRelativePath = frameCacheFramePath(
      { relativePath: descriptor.indexRelativePath },
      assetId,
      'index',
    );
    const frameDirectoryRelativePath = frameCacheFramePath(
      { relativePath: descriptor.frameDirectoryRelativePath },
      assetId,
      'directory',
    );
    const rootRelativePath = frameCacheFramePath(
      { relativePath: descriptor.rootRelativePath },
      assetId,
      'root',
    );
    if (!frameCachePathInside(rootRelativePath, indexRelativePath)
      || !frameCachePathInside(rootRelativePath, frameDirectoryRelativePath)
      || indexRelativePath === rootRelativePath
      || frameDirectoryRelativePath === rootRelativePath) {
      throw new ExportValidationError(`Frame cache ${assetId} paths are outside its root`);
    }
    if (normalizedFrames.some((frame) => !frameCachePathInside(frameDirectoryRelativePath, frame.relativePath)
      || !/\.png$/iu.test(frame.relativePath))) {
      throw new ExportValidationError(`Frame cache ${assetId} frame paths are outside its directory`);
    }
    const output = {
      ...entry,
      assetId,
      status: 'ready',
      ready: true,
      cache: {
        ...cache,
        cache: {
          ...descriptor,
          rootRelativePath,
          indexRelativePath,
          frameDirectoryRelativePath,
          format: 'png',
        },
        frames: normalizedFrames,
        frameCount: normalizedFrames.length,
      },
    };
    byAssetId.set(assetId, output);
  });
  return byAssetId;
}
function frameCacheForSide(block, side, byId, frameCaches) {
  const assetId = sideAssetId(block, side);
  if (!assetId) return null;
  const asset = byId.get(assetId);
  const cache = frameCaches.get(assetId);
  if (!asset || !cache || cache.ready !== true || !cache.cache?.frames?.length) return null;
  return { asset, cache: cache.cache };
}
function frameCacheFallbackStatus(block, frameCaches) {
  const sides = block.type === 'comparisonVideo' ? ['left', 'right'] : ['single'];
  return sides
    .map((side) => sideAssetId(block, side))
    .filter(Boolean)
    .map((assetId) => frameCaches.get(assetId))
    .find((entry) => entry && entry.ready !== true) || null;
}
function frameCacheJson(cache) {
  return escapeHtml(JSON.stringify(cache.frames).replaceAll('<', '\\u003c'));
}
function renderFramePlayerSide(block, side, frameBinding, comparison) {
  const { asset, cache } = frameBinding;
  const config = sideConfig(block, side);
  const settings = playbackSettings(config);
  const label = sideTitle(block, side, asset);
  const firstFrame = cache.frames[0];
  const sideLabel = side === 'left' ? '左側來源' : side === 'right' ? '右側來源' : '影片來源';
  const segmentOut = settings.segment.out > 0 ? String(settings.segment.out) : '';
  return `<div class="portable-player-side portable-frame-side" data-player-side="${side}"
    data-segment-in="${escapeHtml(String(settings.segment.in))}"
    data-segment-out="${escapeHtml(segmentOut)}"
    data-loop-enabled="${settings.loop.enabled ? 'true' : 'false'}"
    data-frame-index="${frameCacheJson(cache)}"
    data-frame-index-path="${escapeHtml(cache.cache.indexRelativePath)}"
    data-frame-count="${cache.frames.length}"
    data-frame-fps="${escapeHtml(String(cache.fps ?? cache.metadata?.fps ?? cache.metadata?.averageFps ?? 30))}">
    <div class="portable-player-side-heading"><h3>${escapeHtml(label)}</h3></div>
    <div class="portable-frame-surface" data-frame-surface tabindex="0" aria-label="${escapeHtml(`${sideLabel}影格畫面`)}">
      <img data-player-frame data-inline-frame src="${escapeHtml(encodeAssetPath(firstFrame.relativePath))}" alt="${escapeHtml(`${label}目前影格`)}">
      <span data-frame-placeholder hidden>尚未準備影格</span>
    </div>
    <p class="portable-frame-side-status" data-frame-side-status role="status">影格快取已就緒 · ${cache.frames.length} 幀。</p>
  </div>`;
}
function renderFramePlayer(block, byId, comparison, frameCaches) {
  const sides = comparison ? ['left', 'right'] : ['single'];
  const bindings = sides.map((side) => frameCacheForSide(block, side, byId, frameCaches));
  if (bindings.some((binding) => !binding)) return '';
  const layout = block.layout === 'stacked' ? 'stacked' : 'side-by-side';
  const blockLabel = typeof block.label === 'string' ? block.label.trim() : '';
  const accessibleBlockLabel = blockLabel || (comparison ? '雙影片' : '單一影片');
  const renderedPlayers = bindings.map((binding, index) => {
    const side = sides[index];
    const count = binding.cache.frames.length;
    const sideLabel = side === 'left' ? '左側影片' : side === 'right' ? '右側影片' : accessibleBlockLabel;
    const settings = playbackSettings(sideConfig(block, side));
    return `<div class="portable-player portable-frame-player" data-portable-player data-frame-player data-frame-mode="cache" tabindex="0" aria-label="${escapeHtml(`${sideLabel}播放器`)}">
      ${renderFramePlayerSide(block, side, binding, comparison)}
      <div class="portable-frame-controls" data-frame-controls role="group" aria-label="${escapeHtml(`${sideLabel}影格播放器控制`)}">
        <div class="portable-frame-navigation">
          <button type="button" data-frame-action="previous">上一幀</button>
          <input data-frame-timeline type="range" min="0" max="${Math.max(0, count - 1)}" step="1" value="0" aria-label="${escapeHtml(`${sideLabel}影格時間軸`)}">
          <button type="button" data-frame-action="next">下一幀</button>
          <output data-frame-position>第 1 / ${count} 幀</output>
          <button type="button" data-frame-action="toggle" aria-pressed="false">播放</button>
        </div>
        <div class="portable-frame-rate-row" data-frame-rate-row>
          <input data-frame-rate-input type="number" min="${PLAYBACK_RATE_MIN}" max="${PLAYBACK_RATE_MAX}" step="any" value="${escapeHtml(formatPlaybackRate(settings.rate))}" aria-label="${escapeHtml(`${sideLabel}播放速度數值`)}">
          <input data-frame-rate type="range" min="${PLAYBACK_RATE_SLIDER_MIN}" max="${PLAYBACK_RATE_SLIDER_MAX}" step="${PLAYBACK_RATE_SLIDER_STEP}" value="${escapeHtml(String(playbackRateToSliderValue(settings.rate)))}" aria-label="${escapeHtml(`${sideLabel}播放速度控制條`)}">
          <button type="button" data-frame-action="reset-rate" aria-label="${escapeHtml(`${sideLabel}重置播放速度為 1 倍`)}" title="重置為 1 倍">↻</button>
        </div>
        <span data-frame-player-status role="status" data-state="loaded">影格快取已就緒；可獨立逐幀播放。</span>
      </div>
    </div>`;
  }).join('');
  return `<figure class="report-media report-video portable-player portable-dual-player" data-portable-player aria-label="${escapeHtml(`${accessibleBlockLabel}播放器`)}" data-player-layout="${layout}">
    ${blockLabel ? `<header class="portable-player-header"><h3>${escapeHtml(blockLabel)}</h3></header>` : ''}
    <div class="portable-player-grid portable-player-grid-${layout}">${renderedPlayers}</div>
  </figure>`;
}
function renderNativeSharedControls(label, block) {
  const escaped = escapeHtml(label);
  const leftSettings = playbackSettings(sideConfig(block, 'left'));
  const commonSegment = block?.commonSegment && typeof block.commonSegment === 'object' ? block.commonSegment : {};
  const commonStart = Number.isInteger(Number(commonSegment.in)) && Number(commonSegment.in) > 0 ? Number(commonSegment.in) : 0;
  const commonEnd = Number.isInteger(Number(commonSegment.out)) && Number(commonSegment.out) > 0 ? Number(commonSegment.out) : 0;
  const commonLoop = block?.loop?.enabled !== false;
  const sync = block?.sync && Number.isInteger(Number(block.sync.leftFrame)) && Number.isInteger(Number(block.sync.rightFrame)) ? block.sync : null;
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
    + '<div class="portable-frame-common-readonly" data-frame-common-info>共同區間：' + (commonStart > 0 ? ('第 ' + (commonStart + 1) + ' 幀起') : '起點未設定') + ' · ' + (commonEnd > 0 ? ('第 ' + (commonEnd + 1) + ' 幀止') : '終點未設定') + '</div>'
    + '<div class="portable-frame-sync-row"><span class="portable-frame-sync-label">同步位置</span><output data-frame-sync-info>' + (sync ? ('左 Frame: ' + sync.leftFrame + ' · 右 Frame: ' + sync.rightFrame) : '尚未設定同步點') + '</output></div>'
    + '<span data-frame-player-status role="status" data-state="pending">正在載入影片…</span>'
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
function renderBlock(block, byId, frameCaches) {
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
    return renderPlayer(safeBlock, byId, false, frameCaches);
  }
  if (type === 'comparisonvideo' || type === 'comparison-video' || type === 'comparison') {
    return renderComparison(safeBlock, byId, frameCaches);
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
    body, body button, body output, body label, body h1, body h2, body h3, body h4, body p, body span { user-select: text; }
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
    .portable-player { padding: 1rem; border: 1px solid #ccd6e5; border-radius: .9rem; background: #fbfcff; }
    .portable-player-header, .portable-player-side-heading, .portable-player-actions { display: flex; align-items: center; gap: .75rem; }
    .portable-player-header { margin-bottom: .75rem; }
    .portable-player-header h3, .portable-player-side-heading h3 { margin: 0; }
    .portable-player-grid { display: grid; gap: 1rem; }
    .portable-player-grid-side-by-side { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .portable-player-grid-stacked { grid-template-columns: 1fr; }
    .portable-player-side { min-width: 0; padding: .75rem; border: 1px solid #dfe5ef; border-radius: .75rem; background: #fff; }
    .portable-player[data-frame-selected="true"] { box-shadow: 0 0 0 3px rgba(42, 104, 214, .78), 0 0 18px rgba(42, 104, 214, .34); }
    .portable-player-side-heading { justify-content: space-between; margin-bottom: .5rem; }
    .portable-player-side-heading h3 { font-size: 1rem; }
    .portable-player-side-heading span { overflow-wrap: anywhere; color: #596780; font-size: .9rem; }
    .portable-player-side video { max-height: 460px; }
    .portable-frame-surface { display: grid; min-height: 220px; place-items: center; overflow: hidden; border-radius: .75rem; background: #111827; }
    .portable-frame-surface img, .portable-frame-surface video { width: 100%; max-height: 460px; object-fit: contain; }
    .portable-frame-surface [hidden] { display: none; }
    .portable-frame-side-status, .portable-frame-fallback { margin: .55rem 0 0; color: #596780; font-size: .82rem; }
    .portable-frame-controls { display: grid; grid-template-columns: max-content max-content max-content minmax(0, 1fr) max-content max-content; column-gap: .6rem; row-gap: .6rem; margin-top: .8rem; }
    .portable-frame-navigation { display: contents; }
    .portable-frame-navigation > button { width: 28px; min-width: 28px; min-height: 28px; height: 28px; padding: 0; display: inline-flex; align-items: center; justify-content: center; overflow: hidden; font-family: inherit; font-size: 16px; line-height: 1; text-align: center; }
    .portable-frame-navigation [data-frame-current] { grid-column: 3; }
    .portable-frame-navigation input[type="range"] { grid-column: 4; min-width: 0; width: 100%; padding: 0; margin: 0; }
    .portable-frame-rate-row input[type="range"] { padding: 0; margin: 0; }
    .portable-frame-navigation [data-frame-total] { grid-column: 5; }
    .portable-frame-rate-row { grid-column: 1 / -1; display: flex; align-items: center; gap: .6rem; width: 100%; }
    .portable-frame-sync-row { grid-column: 1 / -1; display: flex; align-items: center; gap: .6rem; min-width: 0; }
    .portable-frame-common-readonly { grid-column: 1 / -1; color: #596780; font-size: .85rem; font-variant-numeric: tabular-nums; }
    .portable-frame-loop { grid-column: 1 / -1; display: inline-flex; align-items: center; gap: .35rem; color: #33415c; font-size: .85rem; }
    .portable-frame-sync-row output { color: #596780; font-variant-numeric: tabular-nums; }
    .portable-frame-shared-controls { grid-column: 1 / -1; width: 100%; }
    .portable-frame-rate-row input[type="range"] { flex: 1 1 auto; min-width: 0; }
    .portable-frame-controls button, .portable-player-rate-row button, .portable-frame-rate-row button { padding: .45rem .7rem; border: 1px solid #b9c5d8; border-radius: .45rem; background: #fff; color: #172033; cursor: pointer; }
    .portable-frame-controls button:hover, .portable-player-rate-row button:hover, .portable-frame-rate-row button:hover { background: #eef3fa; }
    .portable-frame-controls output, .portable-player-side-controls output { color: #596780; font-variant-numeric: tabular-nums; white-space: nowrap; text-align: center; }
    .portable-frame-player-status { grid-column: 1 / -1; }
    .portable-player-side-controls { display: grid; grid-template-columns: minmax(0, 1fr) max-content; column-gap: .6rem; row-gap: .6rem; margin-top: .65rem; }
    .portable-player-timeline-row { display: contents; }
    .portable-player-timeline-row input[type="range"] { grid-column: 1; min-width: 0; width: 100%; }
    .portable-player-timeline-row output { grid-column: 2; }
    .portable-player-rate-row { grid-column: 1 / -1; display: flex; align-items: center; gap: .6rem; width: 100%; }
    .portable-player-loop, .portable-frame-loop { grid-column: 1 / -1; display: inline-flex; align-items: center; gap: .35rem; color: #33415c; font-size: .85rem; }
    .portable-player-side-controls label { display: inline-flex; align-items: center; gap: .35rem; color: #33415c; font-size: .85rem; }
    .portable-player-rate-input { flex: 0 0 5.5rem; width: 5.5rem; }
    .portable-player-rate-reset, .portable-frame-rate-row button { flex: 0 0 2.2rem; width: 2.2rem; height: 2.2rem; padding: 0 !important; border-radius: 50% !important; font-size: 1.1rem; line-height: 1; }
    .portable-player-rate-row input[type="number"] { flex: 0 0 5.5rem; width: 5.5rem; }
    .portable-frame-rate-row input[type="number"] { flex: 0 0 4.5rem; width: 4.5rem; }
    .portable-player-actions { margin-top: .8rem; }
    .portable-player-actions button { padding: .45rem .7rem; border: 1px solid #b9c5d8; border-radius: .45rem; background: #fff; color: #172033; cursor: pointer; }
    .portable-player-actions button:hover { background: #eef3fa; }
    @media (max-width: 700px) {
      main { width: min(100% - 1rem, 980px); padding-top: 1rem; }
      .report-section { padding: 1rem; }
      .comparison-media, .portable-player-grid-side-by-side { grid-template-columns: 1fr; }
      .portable-frame-controls { grid-template-columns: 1fr; }
      .portable-frame-navigation { display: flex; flex-wrap: wrap; }
      .portable-frame-navigation input[type="range"] { flex: 1 1 10rem; }
      .portable-frame-rate-row { grid-column: 1; }
      .portable-player-side-controls { grid-template-columns: minmax(0, 1fr) max-content; }
    }
  `;
}
function renderFramePlayerScript() {
  return `
  document.querySelectorAll('[data-frame-player]').forEach((player) => {
    const side = player.querySelector('[data-player-side]');
    if (!side) return;
    const frames = JSON.parse(side.dataset.frameIndex || '[]');
    const image = side.querySelector('[data-player-frame]');
    const sideStatus = side.querySelector('[data-frame-side-status]');
    const start = numberValue(side.dataset.segmentIn, 0);
    const end = numberValue(side.dataset.segmentOut);
    const rateInput = player.querySelector('[data-frame-rate-input]');
    const rateSlider = player.querySelector('[data-frame-rate]');
    const resetRate = player.querySelector('[data-frame-action="reset-rate"]');
    let rate = 1;
    const loopEnabled = side.dataset.loopEnabled === 'true';
    const count = frames.length;
    const timeline = player.querySelector('[data-frame-timeline]');
    const position = player.querySelector('[data-frame-position]');
    const status = player.querySelector('[data-frame-player-status]');
    const toggle = player.querySelector('[data-frame-action="toggle"]');
    let index = 0;
    let playing = false;
    let timer = null;
    let playbackTime = null;
    let lastTimestamp = null;
    let scheduleTick = null;
    const setStatus = (message) => { if (status) status.textContent = message; };
    const rateToSlider = (value) => Math.log2(clamp(value, ${PLAYBACK_RATE_MIN}, ${PLAYBACK_RATE_MAX}));
    const sliderToRate = (value) => 2 ** clamp(numberValue(value, 0), ${PLAYBACK_RATE_SLIDER_MIN}, ${PLAYBACK_RATE_SLIDER_MAX});
    const formatRate = (value) => {
      const normalized = clamp(value, ${PLAYBACK_RATE_MIN}, ${PLAYBACK_RATE_MAX});
      if (normalized < 0.1) return normalized.toFixed(4);
      if (normalized < 1) return normalized.toFixed(3);
      return normalized.toFixed(2);
    };
    const updateRateControls = () => {
      if (rateInput) rateInput.value = formatRate(rate);
      if (rateSlider) rateSlider.value = String(rateToSlider(rate));
      const videos = [...player.querySelectorAll('[data-player-video]')];
      videos.forEach((video) => { video.playbackRate = rate; });
    };
    const clockNow = () => (typeof performance !== 'undefined' && Number.isFinite(performance.now()) ? performance.now() : Date.now());
    const setRate = (value) => {
      rate = clamp(value, ${PLAYBACK_RATE_MIN}, ${PLAYBACK_RATE_MAX});
      updateRateControls();
      if (playing) {
        lastTimestamp = clockNow();
        scheduleTick?.();
      }
    };
    const frameTime = (value) => {
      const frame = frames[value];
      return Number.isFinite(frame?.time) ? frame.time : value / Math.max(1, numberValue(side.dataset.frameFps, 30));
    };
    const frameDuration = (value) => {
      const current = frameTime(value);
      const duration = value < count - 1
        ? frameTime(value + 1) - current
        : current - frameTime(Math.max(0, value - 1));
      return Number.isFinite(duration) && duration > 0
        ? duration
        : 1 / Math.max(1, numberValue(side.dataset.frameFps, 30));
    };
    const frameIndexAtTime = (value) => {
      if (count <= 0) return 0;
      let low = 0;
      let high = count - 1;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (frameTime(middle) <= value) low = middle;
        else high = middle - 1;
      }
      return low;
    };
    const updateControls = () => {
      const maximum = Math.max(0, count - 1);
      if (timeline) { timeline.max = String(maximum); timeline.value = String(index); timeline.disabled = count <= 0; }
      if (position) position.textContent = count > 0 ? ('第 ' + (index + 1) + ' / ' + count + ' 幀') : '尚未準備';
      const previous = player.querySelector('[data-frame-action="previous"]');
      const next = player.querySelector('[data-frame-action="next"]');
      if (previous) previous.disabled = count <= 0 || index <= 0;
      if (next) next.disabled = count <= 0 || index >= maximum;
      if (toggle) { toggle.textContent = playing ? '暫停' : '播放'; toggle.setAttribute('aria-pressed', playing ? 'true' : 'false'); }
    };
    const renderIndex = (nextIndex) => {
      if (count <= 0) return;
      index = Math.min(Math.max(0, Math.round(nextIndex)), count - 1);
      if (!playing) playbackTime = frameTime(index);
      const frame = frames[index];
      if (frame && image) image.src = frame.relativePath.split('/').map((segment) => encodeURIComponent(segment)).join('/');
      if (sideStatus) sideStatus.textContent = '已顯示第 ' + (index + 1) + ' 幀。';
      updateControls();
    };
    const stop = (message) => { playing = false; lastTimestamp = null; if (timer) clearTimeout(timer); timer = null; updateControls(); if (message) setStatus(message); };
    const tick = () => {
      if (!playing || count <= 0) return;
      const timestamp = clockNow();
      if (!Number.isFinite(lastTimestamp)) lastTimestamp = timestamp;
      const elapsed = Math.max(0, timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;
      if (!Number.isFinite(playbackTime)) playbackTime = frameTime(index);
      playbackTime += elapsed * rate;
      const loopStartIndex = frames.findIndex((frame, frameIndex) => frameTime(frameIndex) >= start);
      const loopStartTime = frameTime(loopStartIndex >= 0 ? loopStartIndex : 0);
      const finalFrameTime = frameTime(count - 1);
      const loopEndTime = end === null
        ? finalFrameTime + frameDuration(count - 1)
        : Math.max(loopStartTime + 0.000001, end);
      if (loopEnabled) {
        const loopDuration = loopEndTime - loopStartTime;
        if (loopDuration > 0 && playbackTime >= loopEndTime) {
          playbackTime = loopStartTime + ((playbackTime - loopStartTime) % loopDuration);
        }
        if (playbackTime < loopStartTime) playbackTime = loopStartTime;
      } else if (playbackTime >= finalFrameTime) {
        renderIndex(count - 1);
        stop('已到達最後一幀。');
        return;
      }
      const renderTime = loopEnabled
        ? Math.min(playbackTime, Math.max(loopStartTime, loopEndTime - 0.000001))
        : Math.min(playbackTime, finalFrameTime);
      renderIndex(frameIndexAtTime(renderTime));
      scheduleTick?.();
    };
    scheduleTick = () => {
      if (!playing || count <= 0) return;
      if (timer) clearTimeout(timer);
      const nextIndex = Math.min(count - 1, index + 1);
      const nextTime = nextIndex > index ? frameTime(nextIndex) : frameTime(index) + frameDuration(index);
      const waitSeconds = Math.max(0.001, nextTime - (Number.isFinite(playbackTime) ? playbackTime : frameTime(index)));
      timer = setTimeout(() => { timer = null; tick(); }, Math.max(4, Math.round(waitSeconds * 1000 / Math.max(rate, ${PLAYBACK_RATE_MIN}))));
    };
    player.querySelector('[data-frame-action="previous"]')?.addEventListener('click', () => { stop(); renderIndex(index - 1); setStatus('已顯示上一幀。'); });
    player.querySelector('[data-frame-action="next"]')?.addEventListener('click', () => { stop(); renderIndex(index + 1); setStatus('已顯示下一幀。'); });
    toggle?.addEventListener('click', () => {
      if (playing) stop('已暫停。');
      else {
        if (index >= count - 1 && !loopEnabled) renderIndex(segmentStartIndex >= 0 ? segmentStartIndex : 0);
        if (!Number.isFinite(playbackTime)) playbackTime = frameTime(index);
        lastTimestamp = clockNow();
        playing = true;
        updateControls();
        setStatus('已開始逐幀播放。');
        tick();
      }
    });
    timeline?.addEventListener('input', (event) => { stop(); renderIndex(numberValue(event.target.value, 0)); setStatus('已切換至指定影格。'); });
    rateSlider?.addEventListener('input', (event) => { setRate(sliderToRate(event.target.value)); });
    rateInput?.addEventListener('input', (event) => {
      const value = numberValue(event.target.value, null);
      if (value !== null) setRate(value);
    });
    rateInput?.addEventListener('change', (event) => { setRate(numberValue(event.target.value, rate)); });
    resetRate?.addEventListener('click', () => { setRate(1); setStatus('播放速度已重置為 1.00 倍。'); });
    player.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || ['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return;
      event.preventDefault(); stop(); renderIndex(index + (event.key === 'ArrowLeft' ? -1 : 1)); setStatus('已用鍵盤逐幀切換。');
    });
    const segmentStartIndex = frames.findIndex((frame, frameIndex) => frameTime(frameIndex) >= start);
    updateRateControls();
    renderIndex(segmentStartIndex >= 0 ? segmentStartIndex : 0);
    updateControls();
  });`;
}
function renderLegacyPlayerScript() {
  return `
  document.querySelectorAll('[data-portable-player]:not([data-frame-player])').forEach((player) => {
    const sides = [...player.querySelectorAll('[data-player-side]')];
    const settingsFor = (side) => {
      const video = side.querySelector('[data-player-video]');
      const rateInput = side.querySelector('[data-player-rate-input]');
      const rateSlider = side.querySelector('[data-player-rate]');
      const resetRate = side.querySelector('[data-player-rate-reset]');
      const loopInput = side.querySelector('[data-player-loop]');
      return { side, video, rateInput, rateSlider, resetRate, loopInput, start: numberValue(side.dataset.segmentIn, 0), end: numberValue(side.dataset.segmentOut), rate: 1, loopEnabled: side.dataset.loopEnabled === 'true' };
    };
    const updateRateControls = (settings) => { if (settings.rateInput) settings.rateInput.value = settings.rate < .1 ? settings.rate.toFixed(4) : settings.rate < 1 ? settings.rate.toFixed(3) : settings.rate.toFixed(2); if (settings.rateSlider) settings.rateSlider.value = String(Math.log2(settings.rate)); };
    const rateCandidates = (requested) => {
      const desired = clamp(requested, ${PLAYBACK_RATE_MIN}, ${PLAYBACK_RATE_MAX});
      return desired >= 1
        ? [desired, 16, 8, 4, 2, 1, .5, .25, .125, .0625]
        : [desired, .0625, .125, .25, .5, 1, 2, 4, 8, 16];
    };
    const setPlaybackRate = (settings, requested, candidates = null) => {
      const desired = clamp(requested, ${PLAYBACK_RATE_MIN}, ${PLAYBACK_RATE_MAX});
      const values = Array.isArray(candidates) && candidates.length > 0
        ? candidates
        : rateCandidates(desired);
      for (const candidate of values) {
        try {
          settings.video.playbackRate = candidate;
          const actual = Number(settings.video.playbackRate);
          if (Number.isFinite(actual) && Math.abs(actual - candidate) < 0.001) {
            settings.rate = actual;
            updateRateControls(settings);
            return actual;
          }
        } catch {}
      }
      settings.rate = 1;
      try { settings.video.playbackRate = 1; } catch {}
      updateRateControls(settings);
      return settings.rate;
    };
    const unsupportedPlaybackRateError = (error) => {
      const message = String(error?.message || error || '').toLowerCase();
      return message.includes('playbackrate')
        || message.includes('playback rate')
        || message.includes('supported playback range');
    };
    const playVideo = async (settings) => {
      let lastError = null;
      const attemptedRates = new Set();
      for (const requested of rateCandidates(settings.rate)) {
        const actual = setPlaybackRate(settings, requested, [requested]);
        if (!Number.isFinite(actual) || attemptedRates.has(actual)) continue;
        attemptedRates.add(actual);
        try {
          await settings.video.play();
          return actual;
        } catch (error) {
          lastError = error;
          if (!unsupportedPlaybackRateError(error)) throw error;
        }
      }
      throw lastError || new Error('影片無法播放。');
    };
    const updateSide = (settings) => { const { video, side } = settings; if (!video) return; const seek = side.querySelector('[data-player-seek]'); const output = side.querySelector('[data-player-time]'); const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : settings.end; if (seek) { seek.min = String(settings.start); seek.max = String(Math.max(settings.start, settings.end ?? duration ?? settings.start)); seek.value = String(clamp(video.currentTime || settings.start, settings.start, Number(seek.max))); seek.disabled = false; } if (output) output.textContent = String((video.currentTime || 0).toFixed(2)) + ' 秒'; updateRateControls(settings); };
    const applySettings = (settings, seekToStart = true) => { if (!settings.video) return; setPlaybackRate(settings, settings.rate); if (settings.loopInput) settings.loopInput.checked = settings.loopEnabled; if (seekToStart && Number.isFinite(settings.start)) settings.video.currentTime = settings.start; updateSide(settings); };
    sides.forEach((side) => {
      const settings = settingsFor(side);
      applySettings(settings);
      settings.video?.addEventListener('loadedmetadata', () => applySettings(settings));
      settings.video?.addEventListener('timeupdate', () => {
        const loopEnabled = settings.loopInput?.checked;
        if (settings.end !== null && settings.video.currentTime >= settings.end) {
          if (loopEnabled) { settings.video.currentTime = settings.start; playVideo(settings).catch(() => {}); }
          else { settings.video.currentTime = settings.end; settings.video.pause(); }
        }
        updateSide(settings);
      });
      settings.video?.addEventListener('ended', () => {
        if (settings.loopInput?.checked) { settings.video.currentTime = settings.start; playVideo(settings).catch(() => {}); }
      });
      settings.video?.addEventListener('error', () => { const status = side.querySelector('[data-player-time]'); if (status) status.textContent = '媒體載入失敗'; });
      side.querySelector('[data-player-seek]')?.addEventListener('input', (event) => { settings.video.currentTime = numberValue(event.target.value, settings.start); updateSide(settings); });
      settings.rateInput?.addEventListener('input', (event) => { const value = numberValue(event.target.value, null); if (value !== null) setPlaybackRate(settings, value); });
      settings.rateInput?.addEventListener('change', (event) => { setPlaybackRate(settings, numberValue(event.target.value, settings.rate)); });
      settings.rateSlider?.addEventListener('input', (event) => { setPlaybackRate(settings, 2 ** clamp(numberValue(event.target.value, 0), -6, 6)); });
      settings.resetRate?.addEventListener('click', () => { setPlaybackRate(settings, 1); });
      settings.loopInput?.addEventListener('change', () => { settings.loopEnabled = settings.loopInput.checked; });
    });
    const primary = sides.length === 1 ? settingsFor(sides[0]) : null;
    if (primary?.video) {
      const reset = () => { primary.video.pause(); primary.video.currentTime = primary.start; updateSide(primary); };
      player.querySelector('[data-player-action="play"]')?.addEventListener('click', () => playVideo(primary).catch(() => {}));
      player.querySelector('[data-player-action="pause"]')?.addEventListener('click', () => primary.video.pause());
      player.querySelector('[data-player-action="reset"]')?.addEventListener('click', reset);
      player.addEventListener('keydown', (event) => { if (event.target !== player || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); const duration = Number.isFinite(primary.video.duration) && primary.video.duration > 0 ? primary.video.duration : primary.end; const maximum = primary.end ?? duration ?? primary.start; primary.video.currentTime = clamp(primary.video.currentTime + (event.key === 'ArrowLeft' ? -1 : 1) * 0.1, primary.start, Math.max(primary.start, maximum)); updateSide(primary); });
    }
  });`;
}
function renderPlayerScript({ includeNative = true } = {}) {
  const body = includeNative ? renderNativeFramePlayerScript() : '';
  return '<script>' + String.fromCharCode(10) + body + String.fromCharCode(10) + '</script>';
}
function renderReportHtml(
  reportDocument,
  { assetManifest = [], frameCacheManifest = [], frameCacheWarnings = [] } = {},
) {
  assertReportDocument(reportDocument);
  const safeReportDocument = toPortableReportDocument(reportDocument);
  const { manifest } = validateReferencedVideoAssetReferences(safeReportDocument, assetManifest);
  const byId = new Map(manifest.map((asset) => [asset.id, asset]));
  // Portable reports always use the native video player. The optional
  // frame-cache arguments remain accepted for backwards-compatible callers,
  // but are intentionally ignored so exports never depend on PNG caches.
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
