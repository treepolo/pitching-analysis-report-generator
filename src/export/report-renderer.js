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

function clonePortableAnchor(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const anchor = {};
  for (const key of ['observedTime', 'frameIndex']) {
    const number = finiteSetting(value[key], null);
    if (number !== null) anchor[key] = number;
  }
  for (const key of ['precision', 'capturedAt']) {
    if (typeof value[key] === 'string') anchor[key] = value[key];
  }
  return Object.keys(anchor).length > 0 ? anchor : undefined;
}

function clonePortableBinding(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const binding = {};
  if (typeof value.enabled === 'boolean') binding.enabled = value.enabled;
  if (value.masterSide === 'left' || value.masterSide === 'right' || value.masterSide === 'shared') {
    binding.masterSide = value.masterSide;
  }
  if (value.mode === 'time' || value.mode === 'frame') binding.mode = value.mode;
  if (['unknown', 'time', 'frame', 'estimated', 'exact', 'time-based', 'frame-aware'].includes(value.fallbackPrecision)) {
    binding.fallbackPrecision = value.fallbackPrecision;
  }
  const playbackRate = finiteSetting(value.playbackRate ?? value.rate, null);
  if (playbackRate !== null) binding.playbackRate = playbackRate;

  const anchors = {};
  for (const side of ['left', 'right']) {
    const anchor = clonePortableAnchor(value.anchors?.[side]);
    if (anchor) anchors[side] = anchor;
  }
  if (Object.keys(anchors).length > 0) binding.anchors = anchors;

  const sides = {};
  for (const side of ['left', 'right']) {
    const source = value.sides?.[side] || {};
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
    const output = {};
    const segment = source.segment === undefined ? undefined : normalizeSegment(source.segment);
    if (segment) output.segment = segment;
    const offsetSeconds = finiteSetting(source.offsetSeconds ?? source.offset ?? value.offsets?.[side], null);
    if (offsetSeconds !== null) output.offsetSeconds = offsetSeconds;
    if (Object.keys(output).length > 0) sides[side] = output;
  }
  if (Object.keys(sides).length > 0) binding.sides = sides;
  return Object.keys(binding).length > 0 ? binding : undefined;
}

function toPortableReportDocument(reportDocument) {
  const safeReportDocument = toReportDocument(reportDocument);
  const rawSections = Array.isArray(reportDocument.sections) ? reportDocument.sections : [];
  safeReportDocument.sections.forEach((safeSection, sectionIndex) => {
    const rawBlocks = Array.isArray(rawSections[sectionIndex]?.blocks) ? rawSections[sectionIndex].blocks : [];
    safeSection.blocks.forEach((safeBlock, blockIndex) => {
      if (!['singleVideo', 'comparisonVideo'].includes(safeBlock.type)) return;
      const rawBlock = rawBlocks[blockIndex];
      // Prefer the report-contract-sanitized canonical binding.  The raw sync
      // mirror is only a fallback for older editor snapshots that kept the
      // runtime binding under sync.binding.
      const binding = clonePortableBinding(
        safeBlock.binding ?? rawBlock?.sync?.binding ?? rawBlock?.binding,
      );
      if (binding) safeBlock.sync = { ...(safeBlock.sync || {}), binding };
    });
  });
  return safeReportDocument;
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
    return { enabled: false, start: segment.in, end: segment.out };
  }
  const start = Math.max(0, finiteSetting(loop?.start ?? loop?.startTime, segment.in));
  const endValue = finiteSetting(loop?.end ?? loop?.endTime, segment.out);
  return {
    enabled: loop ? loop.enabled !== false : true,
    start,
    end: endValue !== null && endValue > start ? endValue : null,
  };
}

function playbackSettings(config, binding = null, side = null) {
  const source = config && typeof config === 'object' ? config : {};
  const playback = source.playback && typeof source.playback === 'object' ? source.playback : {};
  const playbackOptions = source.playbackOptions && typeof source.playbackOptions === 'object'
    ? source.playbackOptions
    : {};
  const bindingSide = binding?.sides?.[side];
  const segment = normalizeSegment(source.segment ?? bindingSide?.segment);
  const loopSource = source.loop
    ?? playback.loop
    ?? source.loopRange
    ?? playback.loopRange
    ?? playbackOptions.loop
    ?? playbackOptions.loopRange;
  const explicitRate = finiteSetting(playback.rate ?? playbackOptions.rate, null);
  return {
    segment,
    rate: Math.max(0.1, Math.min(8, explicitRate ?? finiteSetting(binding?.playbackRate, 1))),
    loop: normalizeLoop(loopSource, segment),
    offsetSeconds: finiteSetting(bindingSide?.offsetSeconds, 0),
  };
}

function sideConfig(block, side) {
  if (side === 'single') return block;
  return block[side] || block.sides?.[side] || {};
}

function bindingConfig(block) {
  return block.sync?.binding || block.binding || null;
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

function formatLoop(loop) {
  if (!loop.enabled) return '關閉';
  return loop.end === null
    ? `開啟（${formatSeconds(loop.start)}起）`
    : `開啟（${formatSeconds(loop.start)}–${formatSeconds(loop.end)}）`;
}

function formatAnchor(anchor) {
  if (!anchor || typeof anchor !== 'object') return '未設定';
  const time = finiteSetting(anchor.observedTime, null);
  const precision = typeof anchor.precision === 'string' ? anchor.precision : 'unknown';
  const precisionLabel = precision === 'frame-aware' ? '影格' : precision === 'time-based' ? '時間' : '未知精度';
  return `${formatSeconds(time)}（${precisionLabel}）`;
}

function syncModeLabel(block) {
  if ((bindingConfig(block)?.mode ?? block.sync?.mode) === 'frame') {
    return '明確影格模式（可攜式時間同步 fallback）';
  }
  return '時間／經過時間同步';
}

function fallbackPrecisionLabel(value) {
  if (value === 'frame-aware' || value === 'frame' || value === 'exact') return '影格精度';
  if (value === 'time-based' || value === 'time' || value === 'estimated') return '時間精度';
  return '未知精度';
}

function renderPlayerSettings(block, side, asset, settings, comparison) {
  const config = sideConfig(block, side);
  const binding = bindingConfig(block);
  const anchor = binding?.anchors?.[side] || config.anchor || (side === 'single' ? block.anchor : null);
  const assetBindingLabel = asset
    ? `已綁定${asset.label ? `：${asset.label}` : ''}`
    : '未綁定影片資產';
  const sideLabel = side === 'left' ? '左側' : side === 'right' ? '右側' : '影片';
  return `<dl class="portable-player-settings" data-player-settings="${side}">
    <div><dt>來源綁定</dt><dd>${escapeHtml(`${sideLabel}；${assetBindingLabel}`)}</dd></div>
    <div><dt>播放區段</dt><dd>${escapeHtml(`${formatSeconds(settings.segment.in)} 至 ${formatSeconds(settings.segment.out)}`)}</dd></div>
    <div><dt>播放速率</dt><dd>${escapeHtml(`${settings.rate.toFixed(2)} 倍`)}</dd></div>
    <div><dt>循環播放</dt><dd>${escapeHtml(formatLoop(settings.loop))}</dd></div>
    <div><dt>同步錨點</dt><dd>${escapeHtml(formatAnchor(anchor))}</dd></div>
    <div><dt>同步偏移</dt><dd>${escapeHtml(formatSeconds(settings.offsetSeconds))}</dd></div>
    ${comparison ? `<div><dt>同步模式</dt><dd>${escapeHtml(syncModeLabel(block))}</dd></div>` : ''}
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
  const binding = bindingConfig(block);
  const settings = playbackSettings(config, binding, side);
  const anchor = binding?.anchors?.[side] || config.anchor || (side === 'single' ? block.anchor : null);
  const label = typeof config.label === 'string' && config.label
    ? config.label
    : (asset.label || (side === 'left' ? '左側影片' : side === 'right' ? '右側影片' : '單一影片'));
  const poster = posterAsset ? ` poster="${escapeHtml(encodeAssetPath(posterAsset.relativePath))}"` : '';
  const anchorTime = finiteSetting(anchor?.observedTime, 0);
  const loopEnd = settings.loop.end === null ? '' : String(settings.loop.end);
  const segmentOut = settings.segment.out === null ? '' : String(settings.segment.out);
  const sideLabel = side === 'left' ? '左側來源' : side === 'right' ? '右側來源' : '影片來源';
  return `<div class="portable-player-side" data-player-side="${side}"
    data-segment-in="${escapeHtml(String(settings.segment.in))}"
    data-segment-out="${escapeHtml(segmentOut)}"
    data-playback-rate="${escapeHtml(String(settings.rate))}"
    data-loop-enabled="${settings.loop.enabled ? 'true' : 'false'}"
    data-loop-start="${escapeHtml(String(settings.loop.start))}"
    data-loop-end="${escapeHtml(loopEnd)}"
    data-anchor-time="${escapeHtml(String(anchorTime))}"
    data-sync-offset="${escapeHtml(String(settings.offsetSeconds))}"
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

  const layout = block.layout === 'stacked' ? 'stacked' : 'side-by-side';
  const blockLabel = typeof block.label === 'string' && block.label
    ? block.label
    : (comparison ? '影片比較' : '單一影片');
  const binding = bindingConfig(block);
  const syncStartAnchor = formatAnchor(binding?.anchors?.left || block.sync?.startAnchor);
  const syncMode = binding?.mode ?? block.sync?.mode;
  const fallbackPrecision = fallbackPrecisionLabel(binding?.fallbackPrecision);
  const syncStatus = syncMode === 'frame'
    ? `影格同步：離線播放器使用時間同步 fallback（${fallbackPrecision}）。`
    : `時間同步：可在離線 HTML 中運作（fallback：${fallbackPrecision}）。`;
  const bindingStatus = binding
    ? `${binding.enabled === false ? '已設定但未啟用' : '已啟用'}；主控側：${binding.masterSide === 'right' ? '右側' : binding.masterSide === 'shared' ? '共享' : '左側'}`
    : '使用區塊本身的來源與錨點綁定';
  const masterSide = binding?.masterSide === 'right' ? 'right' : 'left';
  return `<figure class="report-media report-video portable-player" data-portable-player tabindex="0" aria-label="${escapeHtml(`${blockLabel}播放器`)}" data-player-layout="${layout}" data-sync-mode="${syncMode === 'frame' ? 'frame' : 'time'}" data-master-side="${masterSide}" data-binding-enabled="${binding ? (binding.enabled === false ? 'false' : 'true') : 'true'}">
    <header class="portable-player-header">
      <div><p class="portable-player-eyebrow">${comparison ? '影片比較播放器' : '單一影片播放器'}</p><h3>${escapeHtml(blockLabel)}</h3></div>
      <span class="portable-player-layout">${layout === 'stacked' ? '堆疊版面' : '並排版面'}</span>
    </header>
    <div class="portable-player-grid portable-player-grid-${layout}">${renderedSides}</div>
    <div class="portable-player-actions" role="group" aria-label="${escapeHtml(`${blockLabel}播放器控制`)}">
      <button type="button" data-player-action="play">${comparison ? '同步播放' : '播放'}</button>
      <button type="button" data-player-action="pause">${comparison ? '同步暫停' : '暫停'}</button>
      <button type="button" data-player-action="reset">回到區段起點</button>
    </div>
    <div class="portable-player-sync-summary">
      <span>同步模式：${escapeHtml(syncModeLabel(block))}</span>
      <span>同步起點錨點：${escapeHtml(syncStartAnchor)}</span>
      <span>同步綁定：${escapeHtml(bindingStatus)}</span>
      <span data-player-runtime-status role="status">${escapeHtml(syncStatus)}</span>
    </div>
    ${renderCaption(blockLabel)}
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
    .portable-player-header, .portable-player-side-heading, .portable-player-actions, .portable-player-sync-summary { display: flex; align-items: center; gap: .75rem; }
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
    .portable-player-side-controls { display: flex; flex-wrap: wrap; align-items: center; gap: .6rem; margin-top: .65rem; }
    .portable-player-side-controls label { display: inline-flex; align-items: center; gap: .35rem; color: #33415c; font-size: .85rem; }
    .portable-player-side-controls input[type="number"] { width: 5rem; }
    .portable-player-side-controls input[type="range"] { flex: 1 1 10rem; min-width: 8rem; }
    .portable-player-side-controls output { color: #596780; font-variant-numeric: tabular-nums; }
    .portable-player-actions { margin-top: .8rem; }
    .portable-player-actions button { padding: .45rem .7rem; border: 1px solid #b9c5d8; border-radius: .45rem; background: #fff; color: #172033; cursor: pointer; }
    .portable-player-actions button:hover { background: #eef3fa; }
    .portable-player-sync-summary { flex-wrap: wrap; margin-top: .75rem; color: #596780; font-size: .82rem; }
    .portable-player-sync-summary span { padding: .25rem .45rem; border-radius: .35rem; background: #eef3fa; }
    .portable-player-settings { display: grid; gap: .3rem; margin: .7rem 0 0; color: #596780; font-size: .8rem; }
    .portable-player-settings div { display: grid; grid-template-columns: 5.5rem minmax(0, 1fr); gap: .5rem; }
    .portable-player-settings dt { font-weight: 700; }
    .portable-player-settings dd { margin: 0; overflow-wrap: anywhere; }
    @media (max-width: 700px) { main { width: min(100% - 1rem, 980px); padding-top: 1rem; } .report-section { padding: 1rem; } .comparison-media, .portable-player-grid-side-by-side { grid-template-columns: 1fr; } }
  `;
}

function renderPlayerScript() {
  return `<script>
(() => {
  const numberValue = (value, fallback = null) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const players = document.querySelectorAll('[data-portable-player]');
  players.forEach((player) => {
    const sides = [...player.querySelectorAll('[data-player-side]')];
    const videos = sides.map((side) => side.querySelector('[data-player-video]')).filter(Boolean);
    const status = player.querySelector('[data-player-runtime-status]');
    const syncMode = player.dataset.syncMode === 'frame' ? 'frame' : 'time';
    const masterSide = player.dataset.masterSide === 'right' ? 'right' : 'left';
    const bindingEnabled = player.dataset.bindingEnabled !== 'false';
    const settingsFor = (side) => {
      const video = side.querySelector('[data-player-video]');
      const rateInput = side.querySelector('[data-player-rate]');
      const loopInput = side.querySelector('[data-player-loop]');
      return {
        side,
        video,
        rateInput,
        loopInput,
        start: numberValue(side.dataset.segmentIn, 0),
        end: numberValue(side.dataset.segmentOut),
        rate: clamp(numberValue(side.dataset.playbackRate, 1), .1, 8),
        loopStart: numberValue(side.dataset.loopStart, numberValue(side.dataset.segmentIn, 0)),
        loopEnd: numberValue(side.dataset.loopEnd, numberValue(side.dataset.segmentOut)),
        loopEnabled: side.dataset.loopEnabled === 'true',
        anchor: numberValue(side.dataset.anchorTime, 0),
        offset: numberValue(side.dataset.syncOffset, 0),
      };
    };
    const allSettings = () => sides.map(settingsFor);
    const setStatus = (message) => { if (status) status.textContent = message; };
    const updateSide = (settings) => {
      const { video, side } = settings;
      if (!video) return;
      const seek = side.querySelector('[data-player-seek]');
      const output = side.querySelector('[data-player-time]');
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : settings.end;
      if (seek) {
        seek.min = String(settings.start);
        seek.max = String(Math.max(settings.start, settings.end ?? duration ?? settings.start));
        seek.value = String(clamp(video.currentTime || settings.start, settings.start, Number(seek.max)));
        seek.disabled = false;
      }
      if (output) output.textContent = String((video.currentTime || 0).toFixed(2)) + ' 秒';
    };
    const applySettings = (settings, seekToStart = true) => {
      if (!settings.video) return;
      settings.video.playbackRate = settings.rate;
      if (settings.rateInput) settings.rateInput.value = String(settings.rate);
      if (settings.loopInput) settings.loopInput.checked = settings.loopEnabled;
      if (seekToStart && Number.isFinite(settings.start)) settings.video.currentTime = settings.start;
      updateSide(settings);
    };
    const syncFrom = (sourceSettings) => {
      if (!bindingEnabled || videos.length < 2 || sourceSettings.side.dataset.playerSide !== masterSide || player.dataset.syncing === 'true') return;
      player.dataset.syncing = 'true';
      const relative = sourceSettings.video.currentTime - sourceSettings.anchor - sourceSettings.offset;
      allSettings().forEach((target) => {
        if (target.video === sourceSettings.video || !target.video) return;
        const duration = Number.isFinite(target.video.duration) && target.video.duration > 0 ? target.video.duration : target.end;
        const maximum = target.end ?? duration;
        const targetTime = clamp(target.anchor + relative + target.offset, target.start, Math.max(target.start, maximum || target.start));
        if (Math.abs(target.video.currentTime - targetTime) > .08) target.video.currentTime = targetTime;
      });
      player.dataset.syncing = 'false';
    };
    const playAll = () => {
      allSettings().forEach((settings) => settings.video?.play().catch(() => setStatus('瀏覽器拒絕自動播放；請按影片上的播放控制。')));
      setStatus(syncMode === 'frame' ? '已播放；影格同步使用時間同步 fallback。' : '已同步播放。');
    };
    const pauseAll = () => {
      videos.forEach((video) => video.pause());
      setStatus('已暫停。');
    };
    const resetAll = () => {
      allSettings().forEach((settings) => {
        settings.video.pause();
        settings.video.currentTime = settings.start;
        updateSide(settings);
      });
      setStatus('已回到各影片區段起點。');
    };
    const stepAll = (direction) => {
      const settingsList = allSettings();
      const source = bindingEnabled && videos.length > 1
        ? settingsList.find((settings) => settings.side.dataset.playerSide === masterSide)
        : settingsList[0];
      if (!source?.video) return;
      const stepSeconds = syncMode === 'frame' ? (1 / 30) : 0.1;
      const duration = Number.isFinite(source.video.duration) && source.video.duration > 0
        ? source.video.duration
        : source.end;
      const maximum = source.end ?? duration ?? source.start;
      source.video.currentTime = clamp(
        source.video.currentTime + direction * stepSeconds,
        source.start,
        Math.max(source.start, maximum),
      );
      syncFrom(source);
      setStatus('已用時間同步 fallback '
        + (direction < 0 ? '向前' : '向後')
        + ' '
        + stepSeconds.toFixed(3)
        + ' 秒。');
      updateSide(source);
    };
    sides.forEach((side) => {
      const settings = settingsFor(side);
      applySettings(settings);
      settings.video?.addEventListener('loadedmetadata', () => {
        applySettings(settings);
        setStatus('媒體已載入；編輯器播放器設定已套用。');
      });
      settings.video?.addEventListener('timeupdate', () => {
        const loopEnabled = settings.loopInput?.checked && settings.loopEnd !== null;
        if (settings.end !== null && settings.video.currentTime >= settings.end) {
          if (loopEnabled) {
            settings.video.currentTime = settings.loopStart;
            settings.video.play().catch(() => {});
          } else {
            settings.video.currentTime = settings.end;
            settings.video.pause();
            setStatus('已到達區段終點。');
          }
        } else if (loopEnabled && settings.video.currentTime >= settings.loopEnd) {
          settings.video.currentTime = settings.loopStart;
        }
        updateSide(settings);
        if (syncMode === 'time' || syncMode === 'frame') syncFrom(settings);
      });
      settings.video?.addEventListener('error', () => setStatus('媒體載入失敗；請確認 export 內的相對路徑。'));
      side.querySelector('[data-player-seek]')?.addEventListener('input', (event) => {
        settings.video.currentTime = numberValue(event.target.value, settings.start);
        updateSide(settings);
        syncFrom(settings);
      });
      settings.rateInput?.addEventListener('change', (event) => {
        settings.rate = clamp(numberValue(event.target.value, settings.rate), .1, 8);
        settings.video.playbackRate = settings.rate;
        event.target.value = String(settings.rate);
        setStatus('播放速率已調整為 ' + settings.rate.toFixed(2) + ' 倍。');
      });
      settings.loopInput?.addEventListener('change', () => {
        setStatus(settings.loopInput.checked ? '已開啟循環播放。' : '已關閉循環播放。');
      });
    });
    player.addEventListener('keydown', (event) => {
      if (event.target !== player || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      stepAll(event.key === 'ArrowLeft' ? -1 : 1);
    });
    player.querySelectorAll('[data-player-action]').forEach((button) => {
      button.addEventListener('click', () => {
        if (button.dataset.playerAction === 'play') playAll();
        if (button.dataset.playerAction === 'pause') pauseAll();
        if (button.dataset.playerAction === 'reset') resetAll();
      });
    });
  });
})();
</script>`;
}

function renderReportHtml(reportDocument, { assetManifest = [] } = {}) {
  assertReportDocument(reportDocument);
  const safeReportDocument = toPortableReportDocument(reportDocument);
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
    ${renderPlayerScript()}
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
