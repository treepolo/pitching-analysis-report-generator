'use strict';

const state = {
  projects: [],
  activeProject: null,
  selectedSectionId: null,
  saveTimer: null,
  saveInFlight: null,
  saveQueued: false,
  dirty: false,
  revision: 0,
  pendingTextImport: null,
  player: {
    selectedBlockId: null,
    runtime: null,
    generation: 0,
    notice: '',
  },
};

const elements = {
  projectList: document.querySelector('#project-list'),
  projectEmpty: document.querySelector('#project-empty'),
  editorEmpty: document.querySelector('#editor-empty'),
  editor: document.querySelector('#editor'),
  projectTitle: document.querySelector('#project-title'),
  projectMeta: document.querySelector('#project-meta'),
  blockSectionTarget: document.querySelector('#block-section-target'),
  addTextBlock: document.querySelector('#add-text-block'),
  addEditorSingleVideo: document.querySelector('#add-editor-single-video'),
  addEditorComparisonVideo: document.querySelector('#add-editor-comparison-video'),
  blockEditorStatus: document.querySelector('#block-editor-status'),
  blockCanvas: document.querySelector('#block-canvas'),
  sectionList: document.querySelector('#section-list'),
  sectionTitle: document.querySelector('#section-title'),
  sectionContent: document.querySelector('#section-content'),
  preview: document.querySelector('#preview'),
  mediaLibrary: document.querySelector('#media-library'),
  mediaList: document.querySelector('#media-list'),
  mediaStatus: document.querySelector('#media-status'),
  importMedia: document.querySelector('#import-media'),
  playerPanel: document.querySelector('#player-panel'),
  playerCapability: document.querySelector('#player-capability'),
  playerStatus: document.querySelector('#player-status'),
  playerBlockSelect: document.querySelector('#player-block-select'),
  addSingleVideo: document.querySelector('#add-single-video'),
  addComparisonVideo: document.querySelector('#add-comparison-video'),
  playerEmpty: document.querySelector('#player-empty'),
  singlePlayer: document.querySelector('#single-player'),
  singleVideo: document.querySelector('#single-video'),
  singleVideoStatus: document.querySelector('#single-video-status'),
  singlePlay: document.querySelector('#single-play'),
  singlePause: document.querySelector('#single-pause'),
  singlePrev: document.querySelector('#single-prev'),
  singleNext: document.querySelector('#single-next'),
  singleSeek: document.querySelector('#single-seek'),
  singleTime: document.querySelector('#single-time'),
  singleRate: document.querySelector('#single-rate'),
  singleLoop: document.querySelector('#single-loop'),
  singleAnchor: document.querySelector('#single-anchor'),
  singleSyncStatus: document.querySelector('#single-sync-status'),
  comparisonPlayer: document.querySelector('#comparison-player'),
  comparisonPlay: document.querySelector('#comparison-play'),
  comparisonPause: document.querySelector('#comparison-pause'),
  comparisonRate: document.querySelector('#comparison-rate'),
  comparisonAlignZero: document.querySelector('#comparison-align-zero'),
  comparisonSyncStatus: document.querySelector('#comparison-sync-status'),
  comparisonLeftVideo: document.querySelector('#comparison-left-video'),
  comparisonLeftVideoStatus: document.querySelector('#comparison-left-video-status'),
  comparisonLeftPlay: document.querySelector('#comparison-left-play'),
  comparisonLeftPause: document.querySelector('#comparison-left-pause'),
  comparisonLeftPrev: document.querySelector('#comparison-left-prev'),
  comparisonLeftNext: document.querySelector('#comparison-left-next'),
  comparisonLeftSeek: document.querySelector('#comparison-left-seek'),
  comparisonLeftTime: document.querySelector('#comparison-left-time'),
  comparisonLeftLoop: document.querySelector('#comparison-left-loop'),
  comparisonLeftAnchor: document.querySelector('#comparison-left-anchor'),
  comparisonRightVideo: document.querySelector('#comparison-right-video'),
  comparisonRightVideoStatus: document.querySelector('#comparison-right-video-status'),
  comparisonRightPlay: document.querySelector('#comparison-right-play'),
  comparisonRightPause: document.querySelector('#comparison-right-pause'),
  comparisonRightPrev: document.querySelector('#comparison-right-prev'),
  comparisonRightNext: document.querySelector('#comparison-right-next'),
  comparisonRightSeek: document.querySelector('#comparison-right-seek'),
  comparisonRightTime: document.querySelector('#comparison-right-time'),
  comparisonRightLoop: document.querySelector('#comparison-right-loop'),
  comparisonRightAnchor: document.querySelector('#comparison-right-anchor'),
  importText: document.querySelector('#import-text'),
  importTextDialog: document.querySelector('#import-text-dialog'),
  importTextName: document.querySelector('#import-text-name'),
  importTextPreview: document.querySelector('#import-text-preview'),
  importTextError: document.querySelector('#import-text-error'),
  cancelImportText: document.querySelector('#cancel-import-text'),
  confirmImportText: document.querySelector('#confirm-import-text'),
  newProjectForm: document.querySelector('#new-project-form'),
  newProjectName: document.querySelector('#new-project-name'),
  newProjectDialog: document.querySelector('#new-project-dialog'),
  saveProject: document.querySelector('#save-project'),
  saveState: document.querySelector('#save-state'),
  rootPath: document.querySelector('#root-path'),
  appError: document.querySelector('#app-error'),
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '時間未知' : date.toLocaleString();
}

function activeSection() {
  return state.activeProject?.sections.find((section) => section.id === state.selectedSectionId);
}

function textBlockFor(section) {
  return section?.blocks.find((block) => block.type === 'rich-text' || block.type === 'text');
}

function editableTextBlockFor(section) {
  const existing = textBlockFor(section);
  if (existing) return existing;
  const block = { id: `${section.id}-text`, type: 'rich-text', content: '' };
  section.blocks.push(block);
  return block;
}

function referenceId(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof value.id === 'string') return value.id;
  if (value && typeof value === 'object' && typeof value.mediaAssetId === 'string') return value.mediaAssetId;
  return null;
}

function mediaAssetFor(assetId) {
  return state.activeProject?.media?.find((asset) => asset?.id === assetId) || null;
}

function mediaStatusLabel(asset) {
  if (!asset) return '找不到此專案媒體';
  const lifecycle = asset.lifecycleStatus || asset.status || 'unknown';
  const compatibility = asset.compatibility || 'unknown';
  return `狀態：${lifecycle} · 相容性：${compatibility}`;
}

function renderMediaLibrary() {
  const project = state.activeProject;
  elements.mediaLibrary.hidden = !project;
  elements.importMedia.disabled = !project;
  elements.importText.disabled = !project;
  if (!project) {
    elements.mediaList.innerHTML = '';
    elements.mediaStatus.textContent = '尚未載入媒體。';
    return;
  }

  const media = Array.isArray(project.media) ? project.media : [];
  elements.mediaStatus.textContent = media.length === 0
    ? '目前沒有專案媒體；匯入後會先以 discovered/unknown 狀態保存，等待後續 inspect pipeline。'
    : `${media.length} 個媒體 asset；目前只顯示 domain status，不宣稱可播放或 metadata 已完成。`;
  elements.mediaList.innerHTML = media.length === 0
    ? '<p class="empty-state">尚未匯入圖片或影片。</p>'
    : media.map((asset) => `
      <article class="media-card">
        <div>
          <div class="media-card-title">${escapeHtml(asset.displayName || asset.id || '未命名媒體')}</div>
          <p class="media-card-meta">${escapeHtml(mediaStatusLabel(asset))} · ${escapeHtml(asset.mediaKind || 'unknown')}</p>
        </div>
        <div class="media-card-actions"><button class="button button-secondary" data-remove-media="${escapeHtml(asset.id)}" type="button">移除</button></div>
      </article>
    `).join('');
  elements.mediaList.querySelectorAll('[data-remove-media]').forEach((button) => {
    button.addEventListener('click', () => { void removeMedia(button.dataset.removeMedia); });
  });
}

function playerBlockType(block) {
  return typeof block?.type === 'string' ? block.type.toLowerCase() : '';
}

function playerBlockEntries(project) {
  if (!project || !Array.isArray(project.sections)) return [];
  const entries = [];
  project.sections.forEach((section) => {
    (section.blocks || []).forEach((block) => {
      const type = playerBlockType(block);
      if (type === 'singlevideo' || type === 'comparisonvideo') {
        entries.push({ sectionId: section.id, block });
      }
    });
  });
  return entries;
}

function isVideoAsset(asset) {
  if (!asset || typeof asset !== 'object') return false;
  if (asset.mediaKind === 'video') return true;
  const candidate = asset.metadata?.extension || asset.sourceReference?.relativePath || asset.displayName || '';
  return /\.(mp4|m4v|mov|webm|avi|mkv)$/iu.test(candidate);
}

function videoAssetsForProject(project) {
  return (Array.isArray(project?.media) ? project.media : []).filter(isVideoAsset);
}

function playerSideConfig(block, side) {
  if (side === 'single') return block || {};
  return block?.[side] || block?.sides?.[side] || {};
}

function playerAssetIdFor(block, side) {
  const config = playerSideConfig(block, side);
  return referenceId(
    config.mediaAssetId
    ?? config.videoAssetId
    ?? config.assetId
    ?? config.assetRef
    ?? config,
  );
}

function playerAnchorFor(block, side) {
  const config = playerSideConfig(block, side);
  return config.anchor || (side === 'single' ? block?.syncAnchor : null) || null;
}

function playerTimingForAsset(asset, duration) {
  const metadata = asset?.metadata || {};
  const fps = Number(metadata.fps);
  const frameTiming = typeof metadata.frameTiming === 'string'
    ? metadata.frameTiming.toLowerCase()
    : '';
  if (frameTiming === 'cfr' && Number.isFinite(fps) && fps > 0) {
    return { kind: 'cfr', fps, duration };
  }
  if (frameTiming === 'vfr') return { kind: 'vfr', duration };
  return { kind: 'unknown', duration };
}

function sideElements(side) {
  if (side === 'single') {
    return {
      video: elements.singleVideo,
      status: elements.singleVideoStatus,
      play: elements.singlePlay,
      pause: elements.singlePause,
      prev: elements.singlePrev,
      next: elements.singleNext,
      seek: elements.singleSeek,
      time: elements.singleTime,
      rate: elements.singleRate,
      loop: elements.singleLoop,
      anchor: elements.singleAnchor,
    };
  }
  const prefix = side === 'left' ? 'Left' : 'Right';
  return {
    video: elements[`comparison${prefix}Video`],
    status: elements[`comparison${prefix}VideoStatus`],
    play: elements[`comparison${prefix}Play`],
    pause: elements[`comparison${prefix}Pause`],
    prev: elements[`comparison${prefix}Prev`],
    next: elements[`comparison${prefix}Next`],
    seek: elements[`comparison${prefix}Seek`],
    time: elements[`comparison${prefix}Time`],
    rate: null,
    loop: elements[`comparison${prefix}Loop`],
    anchor: elements[`comparison${prefix}Anchor`],
  };
}

function frameStepCapability(sideState) {
  return { supportsFrameStep: typeof sideState.video?.seekToNextFrame === 'function' };
}

function setPlayerVideoStatus(sideState, message, stateName = '') {
  sideState.status.textContent = message;
  sideState.status.dataset.state = stateName;
}

function resetPlayerVideo(sideState) {
  const video = sideState.video;
  video.onloadedmetadata = null;
  video.onloadeddata = null;
  video.onerror = null;
  video.ontimeupdate = null;
  video.onseeked = null;
  video.onended = null;
  video.onplay = null;
  video.onpause = null;
  video.pause();
  video.removeAttribute('src');
  video.load();
  sideState.loaded = false;
  sideState.statusName = 'pending';
  sideState.duration = null;
  sideState.timing = { kind: 'unknown' };
  sideState.sourceUrl = null;
  sideState.lastFrameMetadata = null;
}

function startFrameObservation(runtime, sideState) {
  const callback = sideState.video?.requestVideoFrameCallback;
  if (typeof callback !== 'function') return;
  const generation = runtime.generation;
  const observe = (_now, metadata) => {
    if (state.player.runtime !== runtime || runtime.generation !== generation) return;
    sideState.lastFrameMetadata = {
      mediaTime: Number.isFinite(metadata?.mediaTime) ? metadata.mediaTime : null,
      presentedFrames: Number.isInteger(metadata?.presentedFrames) ? metadata.presentedFrames : null,
    };
    if (!sideState.video.paused) sideState.video.requestVideoFrameCallback(observe);
  };
  sideState.video.requestVideoFrameCallback(observe);
}

function updatePlayerSideControls(runtime, side) {
  const sideState = runtime.sides[side];
  const controls = sideElements(side);
  const enabled = sideState.loaded && sideState.statusName === 'loaded';
  [controls.play, controls.pause, controls.prev, controls.next, controls.seek, controls.rate, controls.loop, controls.anchor]
    .filter(Boolean)
    .forEach((control) => { control.disabled = !enabled; });
  if (enabled) {
    controls.seek.max = String(sideState.duration);
    controls.seek.value = String(Math.min(sideState.video.currentTime, sideState.duration));
    controls.time.textContent = `${sideState.video.currentTime.toFixed(2)}s / ${sideState.duration.toFixed(2)}s`;
    controls.loop.checked = Boolean(sideState.loop?.enabled);
    if (controls.rate && sideState.rate) controls.rate.value = String(sideState.rate);
  } else {
    controls.seek.value = '0';
    controls.seek.max = '0';
    controls.time.textContent = '0.00s';
  }
}

function playerCapabilityLabel(runtime) {
  const sides = Object.values(runtime.sides);
  if (sides.some((side) => !side.loaded)) return '尚未完整載入';
  if (sides.every((side) => typeof side.video.seekToNextFrame === 'function')) return 'Frame step available';
  if (sides.some((side) => side.timing.kind === 'unknown')) return 'Time-based fallback · timing unknown';
  return 'Time-based fallback · frame API unavailable';
}

function renderPlayerStatus(runtime) {
  if (!runtime) {
    elements.playerCapability.textContent = '尚未載入影片';
    elements.playerCapability.classList.add('status-planned');
    return;
  }
  elements.playerCapability.textContent = playerCapabilityLabel(runtime);
  elements.playerCapability.classList.toggle('status-planned', Object.values(runtime.sides).some((side) => !side.loaded));
  const sideMessages = Object.entries(runtime.sides).map(([side, value]) => {
    const name = side === 'single' ? '影片' : side === 'left' ? '左側' : '右側';
    return `${name}：${value.statusName === 'loaded' ? '已載入' : value.statusName === 'pending' ? '載入中' : value.statusName}`;
  });
  elements.playerStatus.textContent = state.player.notice || sideMessages.join('；');
}

function renderPlayerControls() {
  const runtime = state.player.runtime;
  if (!runtime) return;
  Object.keys(runtime.sides).forEach((side) => updatePlayerSideControls(runtime, side));
  const comparison = runtime.mode === 'comparison';
  const bothLoaded = comparison && Object.values(runtime.sides).every((side) => side.loaded);
  [elements.comparisonPlay, elements.comparisonPause, elements.comparisonRate, elements.comparisonAlignZero]
    .forEach((control) => { if (control) control.disabled = !bothLoaded; });
  if (bothLoaded) elements.comparisonRate.value = String(runtime.rate || 1);
  if (runtime.mode === 'single') {
    const anchor = runtime.sides.single.anchor;
    elements.singleSyncStatus.textContent = anchor
      ? `同步點：${anchor.precision || 'unknown'} · ${Number(anchor.observedTime).toFixed(2)}s`
      : '尚未設定同步點；目前僅能顯示單影片播放狀態。';
  } else {
    const leftAnchor = runtime.sides.left.anchor;
    const rightAnchor = runtime.sides.right.anchor;
    const alignment = runtime.alignment;
    elements.comparisonSyncStatus.textContent = alignment
      ? `relative t=${alignment.relativeTime.toFixed(2)}s · precision=${alignment.precision} · resolution=${alignment.resolution}`
      : (leftAnchor && rightAnchor
        ? '兩側同步點已存在；移動任一 seek bar 會依 relative time 對齊。'
        : '尚未設定兩側同步點；精度 unknown，不會假裝已同步。');
  }
  renderPlayerStatus(runtime);
}

function findPlayerEntry(blockId = state.player.selectedBlockId) {
  return playerBlockEntries(state.activeProject).find((entry) => entry.block.id === blockId) || null;
}

function clearPlayerRuntime() {
  if (state.player.runtime) Object.keys(state.player.runtime.sides).forEach((side) => resetPlayerVideo(state.player.runtime.sides[side]));
  state.player.runtime = null;
  elements.singlePlayer.hidden = true;
  elements.comparisonPlayer.hidden = true;
}

function buildPlayerRuntime(entry) {
  const mode = playerBlockType(entry.block) === 'comparisonvideo' ? 'comparison' : 'single';
  const sides = mode === 'comparison' ? ['left', 'right'] : ['single'];
  const runtime = {
    mode,
    blockId: entry.block.id,
    sectionId: entry.sectionId,
    block: entry.block,
    generation: state.player.generation,
    rate: Number(entry.block.playback?.rate) || 1,
    alignment: null,
    syncGuard: false,
    sides: {},
  };
  sides.forEach((side) => {
    const controls = sideElements(side);
    const assetId = playerAssetIdFor(entry.block, side);
    const asset = mediaAssetFor(assetId);
    runtime.sides[side] = {
      side,
      assetId,
      asset,
      video: controls.video,
      status: controls.status,
      statusName: 'pending',
      loaded: false,
      sourceUrl: null,
      duration: null,
      timing: { kind: 'unknown' },
      anchor: playerAnchorFor(entry.block, side),
      loop: playerSideConfig(entry.block, side).loop || { enabled: false, start: 0, end: 0 },
      rate: runtime.rate,
      suppressSeek: false,
    };
  });
  return runtime;
}

function setPlayerCurrentTime(sideState, targetTime) {
  sideState.suppressSeek = true;
  sideState.video.currentTime = Math.max(0, Math.min(sideState.duration, targetTime));
}

function attachPlayerVideoEvents(runtime, side) {
  const sideState = runtime.sides[side];
  const video = sideState.video;
  video.onloadedmetadata = () => {
    if (state.player.runtime !== runtime) return;
    sideState.duration = Number.isFinite(video.duration) && video.duration >= 0 ? video.duration : null;
    if (sideState.duration === null) {
      sideState.statusName = 'unknown';
      setPlayerVideoStatus(sideState, '影片 metadata 不可用；維持 unknown。', 'error');
      renderPlayerControls();
      return;
    }
    sideState.timing = playerTimingForAsset(sideState.asset, sideState.duration);
    sideState.loaded = true;
    sideState.statusName = 'loaded';
    sideState.loop = sideState.loop?.end > 0
      ? sideState.loop
      : { enabled: false, start: 0, end: sideState.duration };
    sideState.video.loop = false;
    setPlayerVideoStatus(
      sideState,
      sideState.timing.kind === 'unknown'
        ? '已載入實際影片；timing unknown，逐幀將使用 time-based fallback。'
        : `已載入實際影片；timing ${sideState.timing.kind}。`,
      'loaded',
    );
    startFrameObservation(runtime, sideState);
    renderPlayerControls();
  };
  video.onloadeddata = () => renderPlayerControls();
  video.onerror = () => {
    if (state.player.runtime !== runtime) return;
    sideState.loaded = false;
    sideState.statusName = 'error';
    setPlayerVideoStatus(sideState, '影片無法播放；可能是來源遺失或 codec 不相容。', 'error');
    renderPlayerControls();
  };
  const restartLoop = () => {
    if (state.player.runtime !== runtime || !sideState.loaded || !sideState.loop?.enabled) return false;
    const start = Number.isFinite(sideState.loop.start) ? sideState.loop.start : 0;
    const end = Number.isFinite(sideState.loop.end) && sideState.loop.end > start
      ? sideState.loop.end
      : sideState.duration;
    if (!Number.isFinite(end) || video.currentTime < end) return false;
    setPlayerCurrentTime(sideState, start);
    void video.play().catch(() => {});
    return true;
  };
  video.ontimeupdate = () => {
    restartLoop();
    if (state.player.runtime === runtime) renderPlayerControls();
  };
  video.onended = () => {
    restartLoop();
    if (state.player.runtime === runtime) renderPlayerControls();
  };
  video.onseeked = () => {
    if (state.player.runtime !== runtime || sideState.suppressSeek) {
      sideState.suppressSeek = false;
      return;
    }
    if (runtime.mode === 'comparison') void alignComparisonFrom(side);
  };
  video.onplay = () => { if (state.player.runtime === runtime) renderPlayerControls(); };
  video.onpause = () => { if (state.player.runtime === runtime) renderPlayerControls(); };
}

async function loadPlayerSide(runtime, side) {
  const sideState = runtime.sides[side];
  const asset = sideState.asset;
  if (!asset) {
    sideState.statusName = 'missing';
    setPlayerVideoStatus(sideState, '找不到此 block 的媒體 asset。', 'error');
    renderPlayerControls();
    return;
  }
  if (asset.lifecycleStatus === 'missing' || ['unsupported', 'unplayable'].includes(asset.compatibility)) {
    sideState.statusName = 'unsupported';
    setPlayerVideoStatus(sideState, '此媒體標記為不可播放或來源遺失；未載入假影片。', 'error');
    renderPlayerControls();
    return;
  }
  if (asset.compatibility === 'needs-normalization' && !asset.normalizedReference) {
    sideState.statusName = 'pending';
    setPlayerVideoStatus(sideState, 'Metadata 已檢查，但 normalization 尚未完成；暫停直接播放。', 'pending');
    renderPlayerControls();
    return;
  }
  sideState.statusName = 'loading';
  setPlayerVideoStatus(sideState, '正在解析 project-local media source…');
  renderPlayerControls();
  try {
    const source = await window.pitchingApp.resolveMediaSource(state.activeProject.id, sideState.assetId);
    if (state.player.runtime !== runtime || runtime.generation !== state.player.generation) return;
    sideState.sourceUrl = source.sourceUrl;
    sideState.video.src = source.sourceUrl;
    sideState.video.load();
  } catch (error) {
    if (state.player.runtime !== runtime) return;
    sideState.statusName = 'error';
    setPlayerVideoStatus(sideState, `來源解析失敗：${error.message}`, 'error');
    renderPlayerControls();
  }
}

function makePlayerBlockId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function currentPlayerEntry() {
  return findPlayerEntry(state.player.selectedBlockId);
}

async function savePlayerMutation(message, mutate) {
  const entry = currentPlayerEntry();
  if (!entry) return null;
  mutate(entry.block);
  state.player.notice = message;
  renderPlayer();
  renderPreview();
  scheduleSave();
  try {
    const saved = await requestSave();
    state.player.notice = message;
    renderPlayer();
    return saved;
  } catch (error) {
    state.player.notice = `Save failed: ${error.message}`;
    renderPlayer();
    throw error;
  }
}

function addPlayerBlock(block) {
  const section = activeSection();
  if (!section) return;
  section.blocks.push(block);
  state.player.selectedBlockId = block.id;
  state.player.notice = 'Player block created; loading project-local media only.';
  renderSectionList();
  renderBlockCanvas();
  renderPlayer();
  renderPreview();
  scheduleSave();
  void requestSave().catch(() => {});
}

function addTextBlock() {
  const section = activeSection();
  if (!section) return;
  section.blocks.push({
    id: makePlayerBlockId('text'),
    type: 'rich-text',
    content: '',
  });
  state.player.notice = 'Text block created.';
  renderBlockCanvas();
  renderPreview();
  scheduleSave();
}

function addSingleVideoBlock({ allowEmpty = false } = {}) {
  const videos = videoAssetsForProject(state.activeProject);
  if (videos.length === 0 && !allowEmpty) {
    state.player.notice = 'No video asset is loaded. Import a real project-local video first.';
    renderPlayer();
    return;
  }
  const asset = videos[0];
  addPlayerBlock({
    id: makePlayerBlockId('single-video'),
    type: 'singleVideo',
    mediaAssetId: asset?.id || null,
    label: asset?.displayName || 'Single video',
    layout: 'side-by-side',
    playback: { rate: 1 },
    segment: { in: 0, out: null },
    sync: { mode: 'time', startAnchor: null },
    anchor: null,
  });
}

function addComparisonVideoBlock({ allowEmpty = false } = {}) {
  const videos = videoAssetsForProject(state.activeProject);
  if (videos.length < 2 && !allowEmpty) {
    state.player.notice = 'Comparison requires two real project-local video assets.';
    renderPlayer();
    return;
  }
  const left = videos[0];
  const right = videos[1];
  addPlayerBlock({
    id: makePlayerBlockId('comparison-video'),
    type: 'comparisonVideo',
    label: 'Comparison video',
    layout: 'side-by-side',
    playback: { rate: 1 },
    sync: { mode: 'time', startAnchor: null },
    left: {
      mediaAssetId: left?.id || null,
      label: left?.displayName || 'Left video',
      segment: { in: 0, out: null },
      playback: { rate: 1 },
      anchor: null,
    },
    right: {
      mediaAssetId: right?.id || null,
      label: right?.displayName || 'Right video',
      segment: { in: 0, out: null },
      playback: { rate: 1 },
      anchor: null,
    },
  });
}

function playerSideState(side) {
  return state.player.runtime?.sides?.[side] || null;
}

function setPlayerSeek(side, value) {
  const sideState = playerSideState(side);
  const target = Number(value);
  if (!sideState?.loaded || !Number.isFinite(target)) return;
  setPlayerCurrentTime(sideState, target);
  renderPlayerControls();
}

async function playPlayerSide(side) {
  const sideState = playerSideState(side);
  if (!sideState?.loaded) return;
  try {
    await sideState.video.play();
    state.player.notice = `${side === 'single' ? 'Single video' : `${side} video`} is playing.`;
  } catch (error) {
    sideState.statusName = 'error';
    setPlayerVideoStatus(sideState, `Playback failed: ${error.message}`, 'error');
    state.player.notice = 'Playback failed; the source or codec may be unsupported.';
  }
  renderPlayerControls();
  renderPlayerStatus(state.player.runtime);
}

function pausePlayerSide(side) {
  const sideState = playerSideState(side);
  if (!sideState?.loaded) return;
  sideState.video.pause();
  state.player.notice = `${side === 'single' ? 'Single video' : `${side} video`} paused.`;
  renderPlayerControls();
  renderPlayerStatus(state.player.runtime);
}

async function playComparison() {
  const runtime = state.player.runtime;
  const left = playerSideState('left');
  const right = playerSideState('right');
  if (!runtime || runtime.mode !== 'comparison' || !left?.loaded || !right?.loaded) return;
  try {
    await Promise.all([left.video.play(), right.video.play()]);
    state.player.notice = 'Comparison playback started on both loaded sources.';
  } catch (error) {
    left.video.pause();
    right.video.pause();
    state.player.notice = `Comparison playback failed: ${error.message}`;
  }
  renderPlayerControls();
  renderPlayerStatus(runtime);
}

function pauseComparison() {
  const runtime = state.player.runtime;
  if (!runtime || runtime.mode !== 'comparison') return;
  Object.values(runtime.sides).forEach((sideState) => sideState.video.pause());
  state.player.notice = 'Comparison playback paused.';
  renderPlayerControls();
  renderPlayerStatus(runtime);
}

async function stepPlayerSide(side, direction) {
  const runtime = state.player.runtime;
  const sideState = playerSideState(side);
  if (!runtime || !sideState?.loaded) return;
  try {
    const capability = frameStepCapability(sideState);
    const plan = await window.pitchingApp.sync.planFrameStep({
      timing: sideState.timing,
      duration: sideState.duration,
      currentTime: sideState.video.currentTime,
      direction,
      capability,
    });
    if (plan.exact && direction > 0 && typeof sideState.video.seekToNextFrame === 'function') {
      await sideState.video.seekToNextFrame();
    } else {
      setPlayerCurrentTime(sideState, plan.targetTime);
    }
    state.player.notice = `${side} step: ${plan.resolution} (${plan.reason}).`;
    renderPlayerControls();
    if (runtime.mode === 'comparison') await alignComparisonFrom(side);
  } catch (error) {
    state.player.notice = `Frame step unavailable: ${error.message}`;
    renderPlayerControls();
    renderPlayerStatus(runtime);
  }
}

async function capturePlayerAnchor(side) {
  const runtime = state.player.runtime;
  const sideState = playerSideState(side);
  if (!runtime || !sideState?.loaded) return;
  const domainSide = runtime.mode === 'single' ? 'left' : side;
  try {
    const anchor = await window.pitchingApp.sync.captureAnchor({
      player: {
        blockId: runtime.blockId,
        comparisonBlockId: runtime.blockId,
        side: domainSide,
        mediaAssetId: sideState.assetId,
        duration: sideState.duration,
        timing: sideState.timing,
        currentTime: sideState.video.currentTime,
      },
      capability: frameStepCapability(sideState),
      frameObservation: sideState.lastFrameMetadata || undefined,
      observedTime: sideState.video.currentTime,
      capturedAt: new Date().toISOString(),
    });
    await savePlayerMutation(`Anchor captured with ${anchor.precision} precision.`, (block) => {
      if (runtime.mode === 'single') {
        block.anchor = anchor;
        return;
      }
      const config = { ...playerSideConfig(block, side) };
      config.anchor = anchor;
      block[side] = config;
    });
    if (state.player.runtime === runtime) runtime.sides[side].anchor = anchor;
  } catch (error) {
    state.player.notice = `Anchor capture unavailable: ${error.message}`;
    renderPlayerStatus(runtime);
  }
}

async function setPlayerRate(side, value) {
  const runtime = state.player.runtime;
  const rate = Number(value);
  if (!runtime || !Number.isFinite(rate) || rate <= 0) return;
  const sides = runtime.mode === 'comparison' ? ['left', 'right'] : [side];
  sides.forEach((name) => {
    const sideState = playerSideState(name);
    if (sideState?.loaded) sideState.video.playbackRate = rate;
    if (sideState) sideState.rate = rate;
  });
  runtime.rate = rate;
  await savePlayerMutation(`Playback rate set to ${rate}x.`, (block) => {
    block.playback = { ...(block.playback || {}), rate };
    if (runtime.mode === 'comparison') {
      ['left', 'right'].forEach((name) => {
        const config = { ...playerSideConfig(block, name) };
        config.playback = { ...(config.playback || {}), rate };
        block[name] = config;
      });
    }
  });
}

async function setPlayerLoop(side, enabled) {
  const runtime = state.player.runtime;
  const sideState = playerSideState(side);
  if (!runtime || !sideState?.loaded) return;
  const loop = {
    enabled: Boolean(enabled),
    start: Number.isFinite(sideState.loop?.start) ? sideState.loop.start : 0,
    end: sideState.duration,
  };
  try {
    await window.pitchingApp.sync.createPlayerBlock({
      blockId: runtime.blockId,
      comparisonBlockId: runtime.blockId,
      side: runtime.mode === 'single' ? 'left' : side,
      mediaAssetId: sideState.assetId,
      duration: sideState.duration,
      timing: sideState.timing,
      currentTime: sideState.video.currentTime,
      loop,
    });
    sideState.loop = loop;
    await savePlayerMutation(`${side} loop ${loop.enabled ? 'enabled' : 'disabled'}.`, (block) => {
      if (runtime.mode === 'single') {
        block.loop = loop;
        return;
      }
      const config = { ...playerSideConfig(block, side) };
      config.loop = loop;
      block[side] = config;
    });
  } catch (error) {
    state.player.notice = `Loop range rejected: ${error.message}`;
    renderPlayerControls();
    renderPlayerStatus(runtime);
  }
}

async function alignComparisonAt(relativeTime) {
  const runtime = state.player.runtime;
  if (!runtime || runtime.mode !== 'comparison') return;
  const left = playerSideState('left');
  const right = playerSideState('right');
  if (!left?.loaded || !right?.loaded || !left.anchor || !right.anchor) {
    state.player.notice = 'Both comparison sources must be loaded and anchored before alignment.';
    renderPlayerStatus(runtime);
    return;
  }
  try {
    const alignment = await window.pitchingApp.sync.alignComparisonAtRelativeTime({
      left: { anchor: left.anchor, duration: left.duration, timing: left.timing, capability: frameStepCapability(left) },
      right: { anchor: right.anchor, duration: right.duration, timing: right.timing, capability: frameStepCapability(right) },
    }, relativeTime);
    runtime.syncGuard = true;
    setPlayerCurrentTime(left, alignment.sides.left.playbackTime);
    setPlayerCurrentTime(right, alignment.sides.right.playbackTime);
    runtime.alignment = alignment;
    state.player.notice = `Aligned at relative time ${relativeTime.toFixed(2)}s (${alignment.precision}).`;
  } catch (error) {
    state.player.notice = `Alignment unavailable: ${error.message}`;
  } finally {
    runtime.syncGuard = false;
    renderPlayerControls();
    renderPlayerStatus(runtime);
  }
}

async function alignComparisonFrom(side) {
  const runtime = state.player.runtime;
  const sideState = playerSideState(side);
  if (!runtime || runtime.mode !== 'comparison' || !sideState?.loaded || !sideState.anchor) return;
  const relativeTime = sideState.video.currentTime - sideState.anchor.observedTime;
  await alignComparisonAt(relativeTime);
}

function activatePlayerBlock(entry) {
  state.player.generation += 1;
  clearPlayerRuntime();
  const runtime = buildPlayerRuntime(entry);
  state.player.runtime = runtime;
  elements.singlePlayer.hidden = runtime.mode !== 'single';
  elements.comparisonPlayer.hidden = runtime.mode !== 'comparison';
  Object.keys(runtime.sides).forEach((side) => {
    resetPlayerVideo(runtime.sides[side]);
    attachPlayerVideoEvents(runtime, side);
  });
  renderPlayerControls();
  Object.keys(runtime.sides).forEach((side) => { void loadPlayerSide(runtime, side); });
}

function renderPlayer() {
  const project = state.activeProject;
  elements.playerPanel.hidden = !project;
  if (!project) {
    state.player.selectedBlockId = null;
    clearPlayerRuntime();
    elements.playerEmpty.textContent = '尚未載入影片；請先開啟專案。';
    elements.playerEmpty.hidden = false;
    elements.playerBlockSelect.innerHTML = '<option value="">尚未建立 player block</option>';
    elements.playerBlockSelect.disabled = true;
    elements.addSingleVideo.disabled = true;
    elements.addComparisonVideo.disabled = true;
    return;
  }
  const entries = playerBlockEntries(project);
  const videos = videoAssetsForProject(project);
  elements.addSingleVideo.disabled = videos.length === 0;
  elements.addComparisonVideo.disabled = videos.length < 2;
  elements.playerBlockSelect.innerHTML = entries.length > 0
    ? entries.map((entry) => `<option value="${escapeHtml(entry.block.id)}">${escapeHtml(entry.block.label || `${playerBlockType(entry.block) === 'comparisonvideo' ? '兩影片比較' : '單影片'} · ${entry.block.id}`)}</option>`).join('')
    : '<option value="">尚未建立 player block</option>';
  const selectedEntry = entries.find((entry) => entry.block.id === state.player.selectedBlockId) || entries[0];
  if (!selectedEntry) {
    state.player.selectedBlockId = null;
    clearPlayerRuntime();
    elements.playerBlockSelect.disabled = true;
    elements.playerEmpty.hidden = false;
    elements.playerEmpty.textContent = videos.length === 0
      ? '目前專案沒有影片；請先從 Media Library 匯入。未載入影片。'
      : '尚未建立 player block；可新增單影片或兩影片比較。';
    renderPlayerStatus(null);
    return;
  }
  state.player.selectedBlockId = selectedEntry.block.id;
  elements.playerBlockSelect.disabled = false;
  elements.playerBlockSelect.value = selectedEntry.block.id;
  elements.playerEmpty.hidden = true;
  if (!state.player.runtime || state.player.runtime.blockId !== selectedEntry.block.id) {
    activatePlayerBlock(selectedEntry);
    return;
  }
  state.player.runtime.block = selectedEntry.block;
  Object.keys(state.player.runtime.sides).forEach((side) => {
    state.player.runtime.sides[side].anchor = playerAnchorFor(selectedEntry.block, side);
  });
  renderPlayerControls();
}

function cloneProject(project) {
  return JSON.parse(JSON.stringify(project));
}

function setError(message) {
  elements.appError.textContent = message ? String(message) : '';
  elements.appError.hidden = !message;
}

function setSaveState(value, stateName = '') {
  elements.saveState.textContent = value;
  elements.saveState.dataset.state = stateName;
}

function renderProjects() {
  elements.projectList.innerHTML = state.projects.map((project) => `
    <button class="project-card ${project.id === state.activeProject?.id ? 'is-active' : ''}" data-project-id="${escapeHtml(project.id)}" type="button">
      <span class="project-card-title">${escapeHtml(project.displayName)}</span>
      <span class="project-card-meta">${project.sectionCount} 個 section · ${escapeHtml(formatDate(project.updatedAt))}</span>
    </button>
  `).join('');
  elements.projectEmpty.hidden = state.projects.length !== 0;
  elements.projectList.querySelectorAll('[data-project-id]').forEach((button) => {
    button.addEventListener('click', () => { void openProject(button.dataset.projectId); });
  });
}

function editorValue(value) {
  return value === null || value === undefined ? '' : escapeHtml(String(value));
}

function valueAtPath(value, pathValue) {
  return pathValue.split('.').reduce((current, key) => current?.[key], value);
}

function editorVideoAssetOptions(selectedId) {
  const assets = videoAssetsForProject(state.activeProject);
  const selected = referenceId(selectedId);
  const options = [`<option value="">No asset selected</option>`];
  if (selected && !assets.some((asset) => asset.id === selected)) {
    options.push(`<option value="${escapeHtml(selected)}" selected>Missing asset: ${escapeHtml(selected)}</option>`);
  }
  assets.forEach((asset) => {
    options.push(`<option value="${escapeHtml(asset.id)}"${asset.id === selected ? ' selected' : ''}>${escapeHtml(asset.displayName || asset.id)}</option>`);
  });
  return options.join('');
}

function renderVideoSideEditor(block, side) {
  const comparison = side !== 'single';
  const config = comparison ? (block[side] || {}) : block;
  const prefix = comparison ? `${side}.` : '';
  const label = comparison ? (side === 'left' ? 'Left source' : 'Right source') : 'Video source';
  return `
    <fieldset class="video-side-config">
      <legend>${label}</legend>
      <label>Asset
        <select data-block-path="${prefix}mediaAssetId">${editorVideoAssetOptions(config.mediaAssetId)}</select>
      </label>
      <label>Label <input type="text" data-block-path="${prefix}label" value="${editorValue(config.label)}" /></label>
      <div class="block-inline-fields">
        <label>In <input type="number" min="0" step="0.001" data-block-path="${prefix}segment.in" value="${editorValue(config.segment?.in)}" /></label>
        <label>Out <input type="number" min="0" step="0.001" data-block-path="${prefix}segment.out" value="${editorValue(config.segment?.out)}" /></label>
        <label>Rate <input type="number" min="0.1" max="8" step="0.1" data-block-path="${prefix}playback.rate" value="${editorValue(config.playback?.rate || 1)}" /></label>
        <label>Anchor (s) <input type="number" min="0" step="0.001" data-block-path="${prefix}anchor.observedTime" value="${editorValue(config.anchor?.observedTime)}" /></label>
      </div>
    </fieldset>`;
}

function renderVideoBlockEditor(block) {
  const comparison = block.type === 'comparisonVideo';
  return `
    <div class="block-config-grid">
      <label>Mode
        <select data-block-mode>
          <option value="single"${comparison ? '' : ' selected'}>Single video</option>
          <option value="comparison"${comparison ? ' selected' : ''}>Comparison video</option>
        </select>
      </label>
      <label>Label <input type="text" data-block-path="label" value="${editorValue(block.label)}" /></label>
      <label>Layout
        <select data-block-path="layout">
          <option value="side-by-side"${block.layout !== 'stacked' ? ' selected' : ''}>Side by side</option>
          <option value="stacked"${block.layout === 'stacked' ? ' selected' : ''}>Stacked</option>
        </select>
      </label>
      <label>Sync mode
        <select data-block-path="sync.mode">
          <option value="time"${block.sync?.mode !== 'frame' ? ' selected' : ''}>Time / elapsed playhead</option>
          <option value="frame"${block.sync?.mode === 'frame' ? ' selected' : ''}>Explicit frame mode</option>
        </select>
      </label>
      <label>Sync-start anchor (s) <input type="number" min="0" step="0.001" data-block-path="sync.startAnchor.observedTime" value="${editorValue(block.sync?.startAnchor?.observedTime)}" /></label>
      <div class="video-side-configs">
        ${comparison ? `${renderVideoSideEditor(block, 'left')}${renderVideoSideEditor(block, 'right')}` : renderVideoSideEditor(block, 'single')}
      </div>
    </div>`;
}

function renderBlockEditor(section, block, index) {
  const typeLabel = block.type === 'comparisonVideo' ? 'Comparison video' : block.type === 'singleVideo' ? 'Single video' : 'Text';
  const body = block.type === 'rich-text' || block.type === 'text'
    ? `<label class="block-text-editor">Text <textarea rows="5" data-block-field="content">${escapeHtml(block.content || '')}</textarea></label>`
    : (block.type === 'singleVideo' || block.type === 'comparisonVideo')
      ? renderVideoBlockEditor(block)
      : `<p class="hint">Unsupported block type: ${escapeHtml(block.type || 'unknown')}</p>`;
  return `
    <article class="content-block-card" data-section-id="${escapeHtml(section.id)}" data-block-id="${escapeHtml(block.id)}">
      <header class="content-block-header">
        <strong>${typeLabel}</strong>
        <div class="content-block-actions">
          <button class="icon-button" type="button" data-block-action="move-up" aria-label="Move block up">↑</button>
          <button class="icon-button" type="button" data-block-action="move-down" aria-label="Move block down">↓</button>
          <button class="button button-secondary" type="button" data-block-action="delete">Delete</button>
        </div>
      </header>
      ${body}
    </article>`;
}

function renderBlockCanvas() {
  const project = state.activeProject;
  elements.blockSectionTarget.disabled = !project;
  elements.addTextBlock.disabled = !project;
  elements.addEditorSingleVideo.disabled = !project;
  elements.addEditorComparisonVideo.disabled = !project;
  if (!project) {
    elements.blockSectionTarget.innerHTML = '';
    elements.blockCanvas.innerHTML = '<p class="empty-state">Open a project to edit blocks.</p>';
    return;
  }

  if (!project.sections.some((section) => section.id === state.selectedSectionId)) {
    state.selectedSectionId = project.sections[0]?.id || null;
  }
  elements.blockSectionTarget.innerHTML = project.sections.map((section) => (
    `<option value="${escapeHtml(section.id)}"${section.id === state.selectedSectionId ? ' selected' : ''}>${escapeHtml(section.title || 'Untitled section')}</option>`
  )).join('');
  elements.blockEditorStatus.textContent = `${project.sections.reduce((count, section) => count + section.blocks.length, 0)} blocks in long-form document`;
  elements.blockCanvas.innerHTML = project.sections.map((section) => `
    <section class="block-section ${section.id === state.selectedSectionId ? 'is-target' : ''}" data-section-id="${escapeHtml(section.id)}">
      <header class="block-section-header">
        <input type="text" data-section-title value="${editorValue(section.title)}" aria-label="Section title" />
        <span class="muted">${section.blocks.length} blocks</span>
      </header>
      <div class="block-list">${section.blocks.map((block, index) => renderBlockEditor(section, block, index)).join('')}</div>
    </section>`).join('');
}

function renderSectionList() {
  const project = state.activeProject;
  elements.sectionList.innerHTML = project.sections.map((section) => `
    <button class="section-item ${section.id === state.selectedSectionId ? 'is-active' : ''}" data-section-id="${escapeHtml(section.id)}" type="button">
      <span>${escapeHtml(section.title || '未命名 section')}</span><small>${section.blocks.length} blocks</small>
    </button>
  `).join('');
  elements.sectionList.querySelectorAll('[data-section-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedSectionId = button.dataset.sectionId;
      renderEditor();
      renderPreview();
    });
  });
}

function setEditorPath(target, pathValue, value) {
  const keys = pathValue.split('.');
  let current = target;
  keys.slice(0, -1).forEach((key) => {
    if (!current[key] || typeof current[key] !== 'object') current[key] = {};
    current = current[key];
  });
  current[keys.at(-1)] = value;
}

function editorControlValue(target) {
  if (target.type === 'number') return target.value === '' ? null : Number(target.value);
  return target.value;
}

function blockForEditorCard(card) {
  const section = state.activeProject?.sections.find((item) => item.id === card.dataset.sectionId);
  const block = section?.blocks.find((item) => item.id === card.dataset.blockId);
  return { section, block };
}

function convertVideoBlockMode(block, mode) {
  if (mode === 'comparison' && block.type !== 'comparisonVideo') {
    const singleAsset = referenceId(block.mediaAssetId);
    block.type = 'comparisonVideo';
    block.left = { mediaAssetId: singleAsset, label: block.label || 'Left video', segment: block.segment, playback: block.playback, anchor: block.anchor };
    block.right = { mediaAssetId: null, label: 'Right video', segment: { in: 0, out: null }, playback: { rate: 1 }, anchor: null };
    return;
  }
  if (mode === 'single' && block.type !== 'singleVideo') {
    block.type = 'singleVideo';
    block.mediaAssetId = referenceId(block.left?.mediaAssetId);
    block.segment = block.left?.segment || { in: 0, out: null };
    block.playback = block.left?.playback || { rate: 1 };
    block.anchor = block.left?.anchor || null;
    delete block.left;
    delete block.right;
  }
}

function handleBlockEditorEvent(event) {
  const target = event.target;
  const card = target.closest('[data-block-id]');
  if (target.matches('[data-section-title]')) {
    const section = state.activeProject?.sections.find((item) => item.id === target.closest('[data-section-id]')?.dataset.sectionId);
    if (!section) return;
    section.title = target.value;
    renderSectionList();
    renderPreview();
    scheduleSave();
    return;
  }
  if (!card) return;
  const { section, block } = blockForEditorCard(card);
  if (!section || !block) return;

  if (target.matches('[data-block-mode]')) {
    convertVideoBlockMode(block, target.value);
    renderBlockCanvas();
    renderPlayer();
    renderPreview();
    scheduleSave();
    return;
  }
  if (target.matches('[data-block-field="content"]')) {
    block.content = target.value;
    renderPreview();
    scheduleSave();
    return;
  }
  if (target.matches('[data-block-path]')) {
    setEditorPath(block, target.dataset.blockPath, editorControlValue(target));
    renderPreview();
    renderPlayer();
    scheduleSave();
    return;
  }
  if (event.type !== 'click') return;
  const action = target.closest('[data-block-action]')?.dataset.blockAction;
  if (!action) return;
  const index = section.blocks.findIndex((item) => item.id === block.id);
  if (action === 'delete') section.blocks.splice(index, 1);
  if (action === 'move-up' && index > 0) [section.blocks[index - 1], section.blocks[index]] = [section.blocks[index], section.blocks[index - 1]];
  if (action === 'move-down' && index >= 0 && index < section.blocks.length - 1) [section.blocks[index], section.blocks[index + 1]] = [section.blocks[index + 1], section.blocks[index]];
  renderBlockCanvas();
  renderPlayer();
  renderPreview();
  scheduleSave();
}

function renderEditor({ preserveForm = false } = {}) {
  const project = state.activeProject;
  elements.editorEmpty.hidden = Boolean(project);
  elements.editor.hidden = !project;
  elements.saveProject.disabled = !project;
  renderMediaLibrary();
  renderPlayer();
  renderBlockCanvas();
  if (!project) return;

  elements.projectTitle.textContent = project.displayName;
  elements.projectMeta.textContent = `已儲存於專案資料夾 · ${formatDate(project.updatedAt)}`;
  renderSectionList();

  const section = activeSection();
  if (!section) {
    elements.sectionTitle.value = '';
    elements.sectionContent.value = '';
    elements.sectionTitle.disabled = true;
    elements.sectionContent.disabled = true;
    return;
  }

  elements.sectionTitle.disabled = false;
  elements.sectionContent.disabled = false;
  if (!preserveForm) {
    elements.sectionTitle.value = section.title;
    elements.sectionContent.value = textBlockFor(section)?.content || '';
  }
}

function previewMediaReference(value, role = '媒體') {
  const assetId = referenceId(value);
  const asset = assetId ? mediaAssetFor(assetId) : null;
  const title = asset?.displayName || assetId || `${role} reference missing`;
  return `<div class="preview-media-placeholder" data-asset-id="${escapeHtml(assetId || '')}">`
    + `<strong>${escapeHtml(title)}</strong>`
    + `<span>${escapeHtml(mediaStatusLabel(asset))}</span>`
    + '<small>Renderer-only media seam；實際播放與 metadata inspect 留待後續 slice。</small>'
    + '</div>';
}

function renderPreviewBlock(block) {
  const type = typeof block?.type === 'string' ? block.type.toLowerCase() : 'unknown';
  if (type === 'rich-text' || type === 'text') {
    return `<p>${escapeHtml(block.content || '') || '<span class="muted">尚未填寫</span>'}</p>`;
  }
  if (type === 'heading' || type === 'subheading') {
    return `<h4>${escapeHtml(block.label || block.title || block.content || '')}</h4>`;
  }
  if (type === 'image' || type === 'imageblock' || type === 'photo') {
    return `<div class="preview-block"><strong>${escapeHtml(block.caption || block.alt || '圖片')}</strong>${previewMediaReference(block.mediaAssetId || block.imageAssetId || block.assetRef, '圖片')}</div>`;
  }
  if (type === 'singlevideo' || type === 'video' || type === 'video-block') {
    return `<div class="preview-block"><strong>${escapeHtml(block.label || '單影片')}</strong>${previewMediaReference(block.mediaAssetId || block.videoAssetId || block.assetRef, '影片')}</div>`;
  }
  if (type === 'comparisonvideo' || type === 'comparison-video' || type === 'comparison') {
    const left = block.left || block.sides?.left || block.leftAssetId;
    const right = block.right || block.sides?.right || block.rightAssetId;
    return `<div class="preview-block"><strong>${escapeHtml(block.label || '兩影片比較')}</strong><div class="preview-comparison">${previewMediaReference(left, '左側媒體')}${previewMediaReference(right, '右側媒體')}</div></div>`;
  }
  return block.content ? `<p>${escapeHtml(block.content)}</p>` : '';
}

function renderPreview() {
  const project = state.activeProject;
  if (!project) {
    elements.preview.innerHTML = '<p class="muted">建立或開啟專案後，這裡會顯示報告預覽。</p>';
    return;
  }

  const reportDocument = window.pitchingReportContract.toReportDocument(project);
  elements.preview.innerHTML = `
    <article class="report-preview">
      <p class="eyebrow">投球動作分析</p>
      <h2>${escapeHtml(reportDocument.title || '投球動作分析報告')}</h2>
      ${reportDocument.sections.map((section) => {
        const heading = section.title ? `<h3>${escapeHtml(section.title)}</h3>` : '';
        const blocks = section.blocks.map(renderPreviewBlock).join('');
        return `<section>${heading}${blocks || '<p><span class="muted">尚未填寫</span></p>'}</section>`;
      }).join('')}
    </article>
  `;
}

async function refreshProjects() {
  state.projects = await window.pitchingApp.listProjects();
  renderProjects();
}

async function persistActiveProject() {
  if (!state.activeProject) return null;
  if (state.saveInFlight) {
    state.saveQueued = true;
    return state.saveInFlight;
  }

  const projectId = state.activeProject.id;
  const revision = state.revision;
  const snapshot = cloneProject(state.activeProject);
  setSaveState('儲存中…', 'saving');

  state.saveInFlight = (async () => {
    try {
      const saved = await window.pitchingApp.saveProject(snapshot);
      if (state.activeProject?.id === projectId && state.revision === revision) {
        state.activeProject = saved;
        state.dirty = false;
        renderProjects();
        renderMediaLibrary();
        renderPlayer();
        renderPreview();
        setSaveState('已儲存', 'saved');
      } else {
        state.dirty = true;
        setSaveState('尚有未儲存變更', 'dirty');
      }
      return saved;
    } catch (error) {
      setSaveState('儲存失敗', 'error');
      setError(`儲存失敗：${error.message}`);
      throw error;
    } finally {
      state.saveInFlight = null;
      const needsFollowUp = state.saveQueued
        || (state.activeProject?.id === projectId && state.dirty && state.revision !== revision);
      state.saveQueued = false;
      if (needsFollowUp) void persistActiveProject().catch(() => {});
    }
  })();

  return state.saveInFlight;
}

async function requestSave() {
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
  if (!state.activeProject || !state.dirty) return state.saveInFlight;
  return persistActiveProject();
}

async function flushPendingChanges() {
  while (state.activeProject && (state.dirty || state.saveInFlight)) {
    clearTimeout(state.saveTimer);
    state.saveTimer = null;
    if (state.dirty) {
      await requestSave();
    } else if (state.saveInFlight) {
      await state.saveInFlight;
    }
  }
}

function scheduleSave() {
  state.dirty = true;
  state.revision += 1;
  setSaveState('未儲存變更', 'dirty');
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => {
    state.saveTimer = null;
    void requestSave().catch(() => {});
  }, 500);
}

async function openProject(projectId) {
  setError('');
  try {
    if (state.activeProject && state.dirty) await requestSave();
    const project = await window.pitchingApp.openProject(projectId);
    state.activeProject = project;
    state.selectedSectionId = project.sections[0]?.id || null;
    state.dirty = false;
    state.revision = 0;
    renderProjects();
    renderEditor();
    renderPreview();
    setSaveState('已載入', 'saved');
  } catch (error) {
    setSaveState('開啟失敗', 'error');
    setError(`開啟專案失敗：${error.message}`);
  }
}

function resetTextImportDialog() {
  state.pendingTextImport = null;
  elements.importTextName.textContent = '—';
  elements.importTextPreview.textContent = '';
  elements.importTextError.textContent = '';
  elements.importTextError.hidden = true;
}

async function requestTextImport() {
  if (!state.activeProject) return;
  setError('');
  try {
    const imported = await window.pitchingApp.pickTextFile();
    if (!imported) return;
    state.pendingTextImport = imported;
    elements.importTextName.textContent = imported.fileName;
    elements.importTextPreview.textContent = imported.content;
    elements.importTextError.textContent = '';
    elements.importTextError.hidden = true;
    elements.importTextDialog.showModal();
  } catch (error) {
    setSaveState('匯入失敗', 'error');
    setError(`讀取文字檔失敗：${error.message}`);
  }
}

async function confirmTextImport() {
  const imported = state.pendingTextImport;
  const project = state.activeProject;
  if (!imported || !project || !state.selectedSectionId) return;
  elements.confirmImportText.disabled = true;
  try {
    const saved = await window.pitchingApp.insertTextBlock({
      projectId: project.id,
      sectionId: state.selectedSectionId,
      fileName: imported.fileName,
      content: imported.content,
    });
    state.activeProject = saved;
    state.dirty = false;
    state.revision = 0;
    elements.importTextDialog.close();
    resetTextImportDialog();
    renderProjects();
    renderEditor();
    renderPreview();
    setSaveState('文字已匯入並儲存', 'saved');
  } catch (error) {
    elements.importTextError.textContent = `匯入失敗：${error.message}`;
    elements.importTextError.hidden = false;
    setError(`匯入文字失敗：${error.message}`);
  } finally {
    elements.confirmImportText.disabled = false;
  }
}

async function importMedia() {
  if (!state.activeProject) return;
  setError('');
  try {
    const saved = await window.pitchingApp.pickMediaFiles(state.activeProject.id);
    if (!saved) return;
    state.activeProject = saved;
    state.dirty = false;
    state.revision = 0;
    renderProjects();
    renderEditor();
    renderPreview();
    setSaveState('媒體已登錄；等待 inspect', 'saved');
  } catch (error) {
    setSaveState('媒體匯入失敗', 'error');
    setError(`媒體匯入失敗：${error.message}`);
  }
}

async function removeMedia(assetId) {
  if (!state.activeProject || !assetId) return;
  if (!window.confirm('確定從此專案移除這個媒體 asset？')) return;
  setError('');
  try {
    const saved = await window.pitchingApp.removeMedia(state.activeProject.id, assetId);
    state.activeProject = saved;
    state.dirty = false;
    state.revision = 0;
    renderProjects();
    renderEditor();
    renderPreview();
    setSaveState('媒體已移除並儲存', 'saved');
  } catch (error) {
    setSaveState('媒體移除失敗', 'error');
    setError(`媒體移除失敗：${error.message}`);
  }
}

elements.newProjectForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setError('');
  try {
    if (state.activeProject && state.dirty) await requestSave();
    const project = await window.pitchingApp.createProject(elements.newProjectName.value);
    elements.newProjectDialog.close();
    elements.newProjectForm.reset();
    await refreshProjects();
    await openProject(project.id);
  } catch (error) {
    setSaveState('建立失敗', 'error');
    setError(`建立專案失敗：${error.message}`);
  }
});

document.querySelector('#new-project').addEventListener('click', () => {
  setError('');
  if (!elements.newProjectDialog.open) elements.newProjectDialog.showModal();
  elements.newProjectName.focus();
});

document.querySelector('#empty-new-project').addEventListener('click', () => {
  document.querySelector('#new-project').click();
});

document.querySelectorAll('[data-close-dialog]').forEach((button) => {
  button.addEventListener('click', () => elements.newProjectDialog.close());
});

elements.saveProject.addEventListener('click', () => {
  void requestSave().catch(() => {});
});

elements.importText.addEventListener('click', () => { void requestTextImport(); });
elements.importMedia.addEventListener('click', () => { void importMedia(); });
elements.cancelImportText.addEventListener('click', () => {
  elements.importTextDialog.close();
  resetTextImportDialog();
});
elements.confirmImportText.addEventListener('click', () => { void confirmTextImport(); });

elements.playerBlockSelect.addEventListener('change', () => {
  state.player.selectedBlockId = elements.playerBlockSelect.value || null;
  renderPlayer();
});
elements.addSingleVideo.addEventListener('click', addSingleVideoBlock);
elements.addComparisonVideo.addEventListener('click', addComparisonVideoBlock);
elements.blockSectionTarget.addEventListener('change', () => {
  state.selectedSectionId = elements.blockSectionTarget.value || null;
  renderBlockCanvas();
});
elements.addTextBlock.addEventListener('click', addTextBlock);
elements.addEditorSingleVideo.addEventListener('click', () => addSingleVideoBlock({ allowEmpty: true }));
elements.addEditorComparisonVideo.addEventListener('click', () => addComparisonVideoBlock({ allowEmpty: true }));
elements.blockCanvas.addEventListener('input', handleBlockEditorEvent);
elements.blockCanvas.addEventListener('change', handleBlockEditorEvent);
elements.blockCanvas.addEventListener('click', handleBlockEditorEvent);
elements.singlePlay.addEventListener('click', () => { void playPlayerSide('single'); });
elements.singlePause.addEventListener('click', () => pausePlayerSide('single'));
elements.singlePrev.addEventListener('click', () => { void stepPlayerSide('single', -1); });
elements.singleNext.addEventListener('click', () => { void stepPlayerSide('single', 1); });
elements.singleSeek.addEventListener('input', () => setPlayerSeek('single', elements.singleSeek.value));
elements.singleRate.addEventListener('change', () => { void setPlayerRate('single', elements.singleRate.value).catch(() => {}); });
elements.singleLoop.addEventListener('change', () => { void setPlayerLoop('single', elements.singleLoop.checked); });
elements.singleAnchor.addEventListener('click', () => { void capturePlayerAnchor('single'); });

elements.comparisonPlay.addEventListener('click', () => { void playComparison(); });
elements.comparisonPause.addEventListener('click', pauseComparison);
elements.comparisonRate.addEventListener('change', () => { void setPlayerRate('left', elements.comparisonRate.value).catch(() => {}); });
elements.comparisonAlignZero.addEventListener('click', () => { void alignComparisonAt(0); });
elements.comparisonLeftPlay.addEventListener('click', () => { void playPlayerSide('left'); });
elements.comparisonLeftPause.addEventListener('click', () => pausePlayerSide('left'));
elements.comparisonLeftPrev.addEventListener('click', () => { void stepPlayerSide('left', -1); });
elements.comparisonLeftNext.addEventListener('click', () => { void stepPlayerSide('left', 1); });
elements.comparisonLeftSeek.addEventListener('input', () => setPlayerSeek('left', elements.comparisonLeftSeek.value));
elements.comparisonLeftLoop.addEventListener('change', () => { void setPlayerLoop('left', elements.comparisonLeftLoop.checked); });
elements.comparisonLeftAnchor.addEventListener('click', () => { void capturePlayerAnchor('left'); });
elements.comparisonRightPlay.addEventListener('click', () => { void playPlayerSide('right'); });
elements.comparisonRightPause.addEventListener('click', () => pausePlayerSide('right'));
elements.comparisonRightPrev.addEventListener('click', () => { void stepPlayerSide('right', -1); });
elements.comparisonRightNext.addEventListener('click', () => { void stepPlayerSide('right', 1); });
elements.comparisonRightSeek.addEventListener('input', () => setPlayerSeek('right', elements.comparisonRightSeek.value));
elements.comparisonRightLoop.addEventListener('change', () => { void setPlayerLoop('right', elements.comparisonRightLoop.checked); });
elements.comparisonRightAnchor.addEventListener('click', () => { void capturePlayerAnchor('right'); });

elements.sectionTitle.addEventListener('input', () => {
  const section = activeSection();
  if (!section) return;
  section.title = elements.sectionTitle.value;
  renderSectionList();
  renderPreview();
  scheduleSave();
});

elements.sectionContent.addEventListener('input', () => {
  const section = activeSection();
  if (!section) return;
  editableTextBlockFor(section).content = elements.sectionContent.value;
  renderPreview();
  scheduleSave();
});

window.pitchingApp.onBeforeClose(() => flushPendingChanges());

(async function bootstrap() {
  try {
    const info = await window.pitchingApp.getAppInfo();
    elements.rootPath.textContent = info.projectRoot;
    await refreshProjects();
    renderEditor();
    renderPreview();
  } catch (error) {
    elements.rootPath.textContent = '無法讀取';
    setSaveState('啟動失敗', 'error');
    setError(`應用程式啟動失敗：${error.message}`);
  }
})();
