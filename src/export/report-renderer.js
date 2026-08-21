'use strict';

const {
  ExportValidationError,
  normalizeRelativeAssetPath,
  portableAssetPathKey,
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

function normalizeSegment(value) {
  const segment = value && typeof value === 'object' ? value : {};
  const start = Math.max(0, finiteSetting(segment.in ?? segment.start, 0));
  const endValue = finiteSetting(segment.out ?? segment.end, null);
  return {
    in: start,
    out: endValue !== null && endValue > start ? endValue : null,
  };
}

function normalizeLoop(value, segment) {
  const loop = value && typeof value === 'object' ? value : null;
  if (!loop && value !== true) {
    return { enabled: false };
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
  const explicitRate = finiteSetting(playback.rate ?? playbackOptions.rate, null);
  return {
    segment,
    rate: Math.max(0.1, Math.min(8, explicitRate ?? 1)),
    loop: normalizeLoop(loopSource, segment),
  };
}

function sideConfig(block, side) {
  if (side === 'single') return block;
  return block[side] || block.sides?.[side] || {};
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

function formatLoop(loop, segment = { in: 0, out: null }) {
  if (!loop.enabled) return '關閉';
  return segment.out === null
    ? `開啟（${formatSeconds(segment.in)}起）`
    : `開啟（${formatSeconds(segment.in)}–${formatSeconds(segment.out)}）`;
}

function renderPlayerSettings(block, side, asset, settings, comparison) {
  const config = sideConfig(block, side);
  const fileName = asset
    ? (asset.fileName || asset.originalFileName || asset.label || asset.relativePath?.split('/').pop() || '')
    : '';
  const assetBindingLabel = asset
    ? `已載入${fileName ? `：${fileName}` : ''}`
    : '未載入影片檔案';
  const sideLabel = side === 'left' ? '左側' : side === 'right' ? '右側' : '影片';
  return `<dl class="portable-player-settings" data-player-settings="${side}">
    <div><dt>影片來源</dt><dd>${escapeHtml(`${sideLabel}；${assetBindingLabel}`)}</dd></div>
    <div><dt>播放區段</dt><dd>${escapeHtml(`${formatSeconds(settings.segment.in)} 至 ${formatSeconds(settings.segment.out)}`)}</dd></div>
    <div><dt>播放速率</dt><dd>${escapeHtml(`${settings.rate.toFixed(2)} 倍`)}</dd></div>
    <div><dt>循環播放</dt><dd>${escapeHtml(formatLoop(settings.loop, settings.segment))}</dd></div>
  </dl>`;
}

function renderImage(asset, label) {
  const alt = label || asset.label || 'Report image';
  return '<figure class="report-media report-image">'
    + `<img loading="lazy" src="${escapeHtml(encodeAssetPath(asset.relativePath))}" alt="${escapeHtml(alt)}">`
    + renderCaption(label || asset.label)
    + '</figure>';
}

function renderPlayerVideo(block, side, asset, posterAsset, comparison) {
  if (!asset) return '';
  const config = sideConfig(block, side);
  const settings = playbackSettings(config);
  const label = typeof config.label === 'string' && config.label
    ? config.label
    : (asset.label || (side === 'left' ? '左側影片' : side === 'right' ? '右側影片' : '單一影片'));
  const poster = posterAsset ? ` poster="${escapeHtml(encodeAssetPath(posterAsset.relativePath))}"` : '';
  const segmentOut = settings.segment.out === null ? '' : String(settings.segment.out);
  const sideLabel = side === 'left' ? '左側來源' : side === 'right' ? '右側來源' : '影片來源';
  return `<div class="portable-player-side" data-player-side="${side}"
    data-segment-in="${escapeHtml(String(settings.segment.in))}"
    data-segment-out="${escapeHtml(segmentOut)}"
    data-playback-rate="${escapeHtml(String(settings.rate))}"
    data-loop-enabled="${settings.loop.enabled ? 'true' : 'false'}"
    >
    <div class="portable-player-side-heading">
      <h3>${escapeHtml(sideLabel)}</h3>
      <span>${escapeHtml(label)}</span>
    </div>
    <video controls playsinline preload="metadata" data-player-video src="${escapeHtml(encodeAssetPath(asset.relativePath))}"${poster}>
      此瀏覽器不支援內嵌影片。
    </video>
    ${renderCaption(label)}
    <div class="portable-player-side-controls">
      <label>播放速率
        <input data-player-rate type="number" min="0.1" max="8" step="0.05" value="${escapeHtml(String(settings.rate))}" aria-label="${escapeHtml(`${sideLabel}播放速率`)}">
      </label>
      <label class="portable-player-loop"><input data-player-loop type="checkbox"${settings.loop.enabled ? ' checked' : ''}>循環</label>
      <input data-player-seek type="range" min="${escapeHtml(String(settings.segment.in))}" max="${escapeHtml(String(settings.segment.out ?? settings.segment.in))}" step="0.001" value="${escapeHtml(String(settings.segment.in))}" disabled aria-label="${escapeHtml(`${sideLabel}時間軸`)}">
      <output data-player-time>0.00 秒</output>
    </div>
    ${renderPlayerSettings(block, side, asset, settings, comparison)}
  </div>`;
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
  const label = typeof config.label === 'string' && config.label
    ? config.label
    : (asset.label || (side === 'left' ? '左側影片' : side === 'right' ? '右側影片' : '單一影片'));
  const firstFrame = cache.frames[0];
  const sideLabel = side === 'left' ? '左側來源' : side === 'right' ? '右側來源' : '影片來源';
  const segmentOut = settings.segment.out === null ? '' : String(settings.segment.out);
  return `<div class="portable-player-side portable-frame-side" data-player-side="${side}"
    data-segment-in="${escapeHtml(String(settings.segment.in))}"
    data-segment-out="${escapeHtml(segmentOut)}"
    data-playback-rate="${escapeHtml(String(settings.rate))}"
    data-loop-enabled="${settings.loop.enabled ? 'true' : 'false'}"
    data-frame-index="${frameCacheJson(cache)}"
    data-frame-index-path="${escapeHtml(cache.cache.indexRelativePath)}"
    data-frame-count="${cache.frames.length}"
    data-frame-fps="${escapeHtml(String(cache.fps ?? cache.metadata?.fps ?? cache.metadata?.averageFps ?? 30))}">
    <div class="portable-player-side-heading"><h3>${escapeHtml(sideLabel)}</h3><span>${escapeHtml(label)}</span></div>
    <div class="portable-frame-surface" data-frame-surface tabindex="0" aria-label="${escapeHtml(`${sideLabel}影格畫面`)}">
      <img data-player-frame data-inline-frame src="${escapeHtml(encodeAssetPath(firstFrame.relativePath))}" alt="${escapeHtml(`${label}目前影格`)}">
      <span data-frame-placeholder hidden>尚未準備影格</span>
    </div>
    <p class="portable-frame-side-status" data-frame-side-status role="status">影格快取已就緒 · ${cache.frames.length} 幀。</p>
    ${renderCaption(label)}
    ${renderPlayerSettings(block, side, asset, settings, comparison)}
  </div>`;
}

function renderFramePlayer(block, byId, comparison, frameCaches) {
  const sides = comparison ? ['left', 'right'] : ['single'];
  const bindings = sides.map((side) => frameCacheForSide(block, side, byId, frameCaches));
  if (bindings.some((binding) => !binding)) return '';
  const layout = block.layout === 'stacked' ? 'stacked' : 'side-by-side';
  const blockLabel = typeof block.label === 'string' && block.label
    ? block.label
    : (comparison ? '雙影片' : '單一影片');
  const renderedPlayers = bindings.map((binding, index) => {
    const side = sides[index];
    const count = binding.cache.frames.length;
    const sideLabel = side === 'left' ? '左側影片' : side === 'right' ? '右側影片' : blockLabel;
    return `<div class="portable-player portable-frame-player" data-portable-player data-frame-player data-frame-mode="cache" tabindex="0" aria-label="${escapeHtml(`${sideLabel}播放器`)}">
      ${renderFramePlayerSide(block, side, binding, comparison)}
      <div class="portable-frame-controls" data-frame-controls role="group" aria-label="${escapeHtml(`${sideLabel}影格播放器控制`)}">
        <button type="button" data-frame-action="previous">上一幀</button>
        <input data-frame-timeline type="range" min="0" max="${Math.max(0, count - 1)}" step="1" value="0" aria-label="${escapeHtml(`${sideLabel}影格時間軸`)}">
        <button type="button" data-frame-action="next">下一幀</button>
        <output data-frame-position>第 1 / ${count} 幀</output>
        <button type="button" data-frame-action="toggle" aria-pressed="false">播放</button>
        <span data-frame-player-status role="status" data-state="loaded">影格快取已就緒；可獨立逐幀播放。</span>
      </div>
    </div>`;
  }).join('');
  return `<figure class="report-media report-video portable-player portable-dual-player" data-portable-player aria-label="${escapeHtml(`${blockLabel}播放器`)}" data-player-layout="${layout}">
    <header class="portable-player-header"><div><p class="portable-player-eyebrow">${comparison ? '雙影片播放器' : '單一影片播放器'}</p><h3>${escapeHtml(blockLabel)}</h3></div>${comparison ? `<span class="portable-player-layout">${layout === 'stacked' ? '堆疊版面' : '並排版面'}</span>` : ''}</header>
    <div class="portable-player-grid portable-player-grid-${layout}">${renderedPlayers}</div>
    ${renderCaption(blockLabel)}
  </figure>`;
}

function renderPlayer(block, byId, comparison, frameCaches) {
  const framePlayer = renderFramePlayer(block, byId, comparison, frameCaches);
  if (framePlayer) return framePlayer;
  const sides = comparison ? ['left', 'right'] : ['single'];
  const renderedSides = sides.map((side) => {
    const assetId = sideAssetId(block, side);
    const asset = assetId ? byId.get(assetId) : null;
    const posterId = sidePosterAssetId(block, side);
    const posterAsset = posterId ? byId.get(posterId) : null;
    return renderPlayerVideo(block, side, asset, posterAsset, comparison);
  }).join('');
  if (!renderedSides) return renderText(block);

  const layout = block.layout === 'stacked' ? 'stacked' : 'side-by-side';
  const blockLabel = typeof block.label === 'string' && block.label
    ? block.label
    : (comparison ? '雙影片' : '單一影片');
  const fallback = frameCacheFallbackStatus(block, frameCaches);
  const fallbackNotice = fallback
    ? `<p class="portable-frame-fallback" data-frame-cache-status="${escapeHtml(fallback.status || 'not-ready')}" role="status">影格快取未就緒，已降級為影片播放（${escapeHtml(fallback.status || 'unknown')}）。</p>`
    : '';
  const actions = comparison ? '' : `<div class="portable-player-actions" role="group" aria-label="${escapeHtml(`${blockLabel}播放器控制`)}">
      <button type="button" data-player-action="play">播放</button>
      <button type="button" data-player-action="pause">暫停</button>
      <button type="button" data-player-action="reset">回到區段起點</button>
    </div>`;
  return `<figure class="report-media report-video portable-player" data-portable-player tabindex="0" aria-label="${escapeHtml(`${blockLabel}播放器`)}" data-player-layout="${layout}">
    <header class="portable-player-header">
      <div><p class="portable-player-eyebrow">${comparison ? '雙影片播放器' : '單一影片播放器'}</p><h3>${escapeHtml(blockLabel)}</h3></div>
      ${comparison ? `<span class="portable-player-layout">${layout === 'stacked' ? '堆疊版面' : '並排版面'}</span>` : ''}
    </header>
    <div class="portable-player-grid portable-player-grid-${layout}">${renderedSides}</div>
    ${actions}
    ${fallbackNotice}
    ${renderCaption(blockLabel)}
  </figure>`;
}

function renderComparison(block, byId, frameCaches) {
  return renderPlayer(block, byId, true, frameCaches);
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
    .portable-player-header { justify-content: space-between; margin-bottom: .75rem; }
    .portable-player-header h3, .portable-player-side-heading h3 { margin: 0; }
    .portable-player-eyebrow { margin: 0 0 .25rem; color: #596780; font-size: .75rem; font-weight: 700; }
    .portable-player-layout { color: #596780; font-size: .85rem; }
    .portable-player-grid { display: grid; gap: 1rem; }
    .portable-player-grid-side-by-side { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .portable-player-grid-stacked { grid-template-columns: 1fr; }
    .portable-player-side { min-width: 0; padding: .75rem; border: 1px solid #dfe5ef; border-radius: .75rem; background: #fff; }
    .portable-player-side-heading { justify-content: space-between; margin-bottom: .5rem; }
    .portable-player-side-heading h3 { font-size: 1rem; }
    .portable-player-side-heading span { overflow-wrap: anywhere; color: #596780; font-size: .9rem; }
    .portable-player-side video { max-height: 460px; }
    .portable-frame-surface { display: grid; min-height: 220px; place-items: center; overflow: hidden; border-radius: .75rem; background: #111827; }
    .portable-frame-surface img { width: 100%; max-height: 460px; object-fit: contain; }
    .portable-frame-surface [hidden] { display: none; }
    .portable-frame-side-status, .portable-frame-fallback { margin: .55rem 0 0; color: #596780; font-size: .82rem; }
    .portable-frame-controls { display: flex; flex-wrap: wrap; align-items: center; gap: .6rem; margin-top: .8rem; }
    .portable-frame-controls input[type="range"] { flex: 1 1 12rem; min-width: 8rem; }
    .portable-frame-controls button { padding: .45rem .7rem; border: 1px solid #b9c5d8; border-radius: .45rem; background: #fff; color: #172033; cursor: pointer; }
    .portable-frame-controls button:hover { background: #eef3fa; }
    .portable-frame-controls output { color: #596780; font-variant-numeric: tabular-nums; }
    .portable-player-side-controls { display: flex; flex-wrap: wrap; align-items: center; gap: .6rem; margin-top: .65rem; }
    .portable-player-side-controls label { display: inline-flex; align-items: center; gap: .35rem; color: #33415c; font-size: .85rem; }
    .portable-player-side-controls input[type="number"] { width: 5rem; }
    .portable-player-side-controls input[type="range"] { flex: 1 1 10rem; min-width: 8rem; }
    .portable-player-side-controls output { color: #596780; font-variant-numeric: tabular-nums; }
    .portable-player-actions { margin-top: .8rem; }
    .portable-player-actions button { padding: .45rem .7rem; border: 1px solid #b9c5d8; border-radius: .45rem; background: #fff; color: #172033; cursor: pointer; }
    .portable-player-actions button:hover { background: #eef3fa; }
    .portable-player-settings { display: grid; gap: .3rem; margin: .7rem 0 0; color: #596780; font-size: .8rem; }
    .portable-player-settings div { display: grid; grid-template-columns: 5.5rem minmax(0, 1fr); gap: .5rem; }
    .portable-player-settings dt { font-weight: 700; }
    .portable-player-settings dd { margin: 0; overflow-wrap: anywhere; }
    @media (max-width: 700px) { main { width: min(100% - 1rem, 980px); padding-top: 1rem; } .report-section { padding: 1rem; } .comparison-media, .portable-player-grid-side-by-side { grid-template-columns: 1fr; } }
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
    const rate = clamp(numberValue(side.dataset.playbackRate, 1), .1, 8);
    const loopEnabled = side.dataset.loopEnabled === 'true';
    const count = frames.length;
    const timeline = player.querySelector('[data-frame-timeline]');
    const position = player.querySelector('[data-frame-position]');
    const status = player.querySelector('[data-frame-player-status]');
    const toggle = player.querySelector('[data-frame-action="toggle"]');
    let index = 0;
    let playing = false;
    let timer = null;
    const setStatus = (message) => { if (status) status.textContent = message; };
    const frameTime = (value) => {
      const frame = frames[value];
      return Number.isFinite(frame?.time) ? frame.time : value / Math.max(1, numberValue(side.dataset.frameFps, 30));
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
      const frame = frames[index];
      if (frame && image) image.src = frame.relativePath.split('/').map((segment) => encodeURIComponent(segment)).join('/');
      if (sideStatus) sideStatus.textContent = '已顯示第 ' + (index + 1) + ' 幀。';
      updateControls();
    };
    const stop = (message) => { playing = false; if (timer) clearTimeout(timer); timer = null; updateControls(); if (message) setStatus(message); };
    const tick = () => {
      if (!playing || count <= 0) return;
      const nextIndex = index + 1;
      const loopStartIndex = frames.findIndex((frame) => frame.time !== null && frame.time >= start);
      const loopEndIndex = end === null
        ? -1
        : frames.findIndex((frame) => frame.time !== null && frame.time >= end);
      if (nextIndex >= count || (loopEnabled && loopEndIndex >= 0 && nextIndex >= loopEndIndex)) {
        if (loopEnabled) renderIndex(loopStartIndex >= 0 ? loopStartIndex : 0);
        else { renderIndex(count - 1); stop('已到達最後一幀。'); return; }
      } else renderIndex(nextIndex);
      const currentFrameTime = frameTime(index);
      const nextFrameTime = frameTime(Math.min(count - 1, index + 1));
      timer = setTimeout(tick, Math.max(16, Math.round(Math.max(.016, nextFrameTime - currentFrameTime) * 1000 / rate)));
    };
    player.querySelector('[data-frame-action="previous"]')?.addEventListener('click', () => { stop(); renderIndex(index - 1); setStatus('已顯示上一幀。'); });
    player.querySelector('[data-frame-action="next"]')?.addEventListener('click', () => { stop(); renderIndex(index + 1); setStatus('已顯示下一幀。'); });
    toggle?.addEventListener('click', () => { if (playing) stop('已暫停。'); else { playing = true; updateControls(); setStatus('已開始逐幀播放。'); tick(); } });
    timeline?.addEventListener('input', (event) => { stop(); renderIndex(numberValue(event.target.value, 0)); setStatus('已切換至指定影格。'); });
    player.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || ['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return;
      event.preventDefault(); stop(); renderIndex(index + (event.key === 'ArrowLeft' ? -1 : 1)); setStatus('已用鍵盤逐幀切換。');
    });
    const segmentStartIndex = frames.findIndex((frame) => frame.time !== null && frame.time >= start);
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
      const rateInput = side.querySelector('[data-player-rate]');
      const loopInput = side.querySelector('[data-player-loop]');
      return { side, video, rateInput, loopInput, start: numberValue(side.dataset.segmentIn, 0), end: numberValue(side.dataset.segmentOut), rate: clamp(numberValue(side.dataset.playbackRate, 1), .1, 8), loopEnabled: side.dataset.loopEnabled === 'true' };
    };
    const updateSide = (settings) => { const { video, side } = settings; if (!video) return; const seek = side.querySelector('[data-player-seek]'); const output = side.querySelector('[data-player-time]'); const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : settings.end; if (seek) { seek.min = String(settings.start); seek.max = String(Math.max(settings.start, settings.end ?? duration ?? settings.start)); seek.value = String(clamp(video.currentTime || settings.start, settings.start, Number(seek.max))); seek.disabled = false; } if (output) output.textContent = String((video.currentTime || 0).toFixed(2)) + ' 秒'; };
    const applySettings = (settings, seekToStart = true) => { if (!settings.video) return; settings.video.playbackRate = settings.rate; if (settings.rateInput) settings.rateInput.value = String(settings.rate); if (settings.loopInput) settings.loopInput.checked = settings.loopEnabled; if (seekToStart && Number.isFinite(settings.start)) settings.video.currentTime = settings.start; updateSide(settings); };
    sides.forEach((side) => {
      const settings = settingsFor(side);
      applySettings(settings);
      settings.video?.addEventListener('loadedmetadata', () => applySettings(settings));
      settings.video?.addEventListener('timeupdate', () => {
        const loopEnabled = settings.loopInput?.checked;
        if (settings.end !== null && settings.video.currentTime >= settings.end) {
          if (loopEnabled) { settings.video.currentTime = settings.start; settings.video.play().catch(() => {}); }
          else { settings.video.currentTime = settings.end; settings.video.pause(); }
        }
        updateSide(settings);
      });
      settings.video?.addEventListener('ended', () => {
        if (settings.loopInput?.checked) { settings.video.currentTime = settings.start; settings.video.play().catch(() => {}); }
      });
      settings.video?.addEventListener('error', () => { const status = side.querySelector('[data-player-time]'); if (status) status.textContent = '媒體載入失敗'; });
      side.querySelector('[data-player-seek]')?.addEventListener('input', (event) => { settings.video.currentTime = numberValue(event.target.value, settings.start); updateSide(settings); });
      settings.rateInput?.addEventListener('change', (event) => { settings.rate = clamp(numberValue(event.target.value, settings.rate), .1, 8); settings.video.playbackRate = settings.rate; event.target.value = String(settings.rate); });
      settings.loopInput?.addEventListener('change', () => { settings.loopEnabled = settings.loopInput.checked; });
    });
    const primary = sides.length === 1 ? settingsFor(sides[0]) : null;
    if (primary?.video) {
      const reset = () => { primary.video.pause(); primary.video.currentTime = primary.start; updateSide(primary); };
      player.querySelector('[data-player-action="play"]')?.addEventListener('click', () => primary.video.play().catch(() => {}));
      player.querySelector('[data-player-action="pause"]')?.addEventListener('click', () => primary.video.pause());
      player.querySelector('[data-player-action="reset"]')?.addEventListener('click', reset);
      player.addEventListener('keydown', (event) => { if (event.target !== player || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); const duration = Number.isFinite(primary.video.duration) && primary.video.duration > 0 ? primary.video.duration : primary.end; const maximum = primary.end ?? duration ?? primary.start; primary.video.currentTime = clamp(primary.video.currentTime + (event.key === 'ArrowLeft' ? -1 : 1) * 0.1, primary.start, Math.max(primary.start, maximum)); updateSide(primary); });
    }
  });`;
}

function renderPlayerScript({ includeFrame = false, includeLegacy = true } = {}) {
  const body = [
    '(() => {',
    '  const numberValue = (value, fallback = null) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; };',
    '  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));',
    includeFrame ? renderFramePlayerScript() : '',
    includeLegacy ? renderLegacyPlayerScript() : '',
    '})();',
  ].filter(Boolean).join('\n');
  return `<script>\n${body}\n</script>`;
}

function renderReportHtml(
  reportDocument,
  { assetManifest = [], frameCacheManifest = [], frameCacheWarnings = [] } = {},
) {
  assertReportDocument(reportDocument);
  const safeReportDocument = toPortableReportDocument(reportDocument);
  const { manifest } = validateReferencedVideoAssetReferences(safeReportDocument, assetManifest);
  const byId = new Map(manifest.map((asset) => [asset.id, asset]));
  const frameCaches = normalizeRendererFrameCaches(frameCacheManifest);
  const title = typeof safeReportDocument.title === 'string' && safeReportDocument.title.length > 0
    ? safeReportDocument.title
    : 'Pitching analysis report';
  let framePlayerCount = 0;
  let legacyPlayerCount = 0;
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
        const hasFramePlayer = isVideo && sides.every((side) => Boolean(frameCacheForSide(block, side, byId, frameCaches)));
        if (hasFramePlayer) framePlayerCount += 1;
        else if (isVideo) legacyPlayerCount += 1;
        return renderBlock(block, byId, frameCaches);
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
    ${frameCacheWarnings.length > 0 ? `<meta name="frame-cache-warnings" content="${escapeHtml(frameCacheWarnings.join(' | '))}">` : ''}
    ${renderPlayerScript({ includeFrame: framePlayerCount > 0, includeLegacy: legacyPlayerCount > 0 })}
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
