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
  projectRoot: '',
  export: {
    jobId: null,
    status: 'idle',
    snapshot: null,
    outputDirectory: '',
    directoryNotice: '',
    pollTimer: null,
  },
  inlineGeneration: 0,
  inlineRuntimeByCard: new WeakMap(),
  blockCanvasRenderQueued: false,
  player: {
    selectedBlockId: null,
    runtime: null,
    generation: 0,
    notice: '',
  },
};

const elements = {
  projectList: document.querySelector('#project-list, #project-picker'),
  projectPicker: document.querySelector('#project-picker, #project-list'),
  documentCommandBar: document.querySelector('#document-command-bar, .document-command-bar'),
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
  importMedia: document.querySelector('#import-media'),
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
  chooseExportDirectory: document.querySelector('#choose-export-directory'),
  exportDirectoryStatus: document.querySelector('#export-directory-status'),
  exportKind: document.querySelector('#export-kind'),
  exportReport: document.querySelector('#export-report'),
  exportCancel: document.querySelector('#export-cancel'),
  exportRetry: document.querySelector('#export-retry'),
  exportStatus: document.querySelector('#export-status'),
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
  return Number.isNaN(date.getTime()) ? '時間未知' : date.toLocaleString('zh-TW');
}

const DISPLAY_STATUS_LABELS = Object.freeze({
  unknown: '未知',
  missing: '遺失',
  pending: '處理中',
  processing: '處理中',
  ready: '就緒',
  verified: '已驗證',
  unsupported: '不支援',
  unplayable: '無法播放',
  'needs-normalization': '待正規化',
  loaded: '已載入',
  error: '錯誤',
});

const DISPLAY_ERROR_CODE_MAP = Object.freeze({
  EXPORT_VALIDATION_FAILED: Object.freeze({
    code: 'EXPORT_VALIDATION_FAILED',
    reason: '匯出資料驗證失敗，請檢查輸出資料夾與報告引用的媒體。',
  }),
  EXPORT_FAILED: Object.freeze({
    code: 'EXPORT_FAILED',
    reason: '匯出工作失敗，請檢查輸出資料夾、來源檔案與權限。',
  }),
  EXPORT_CANCELLED: Object.freeze({
    code: 'EXPORT_CANCELLED',
    reason: '匯出已取消。',
  }),
  EXPORT_PICKER_UNAVAILABLE: Object.freeze({
    code: 'EXPORT_PICKER_UNAVAILABLE',
    reason: '目前無法使用資料夾選擇器，已改用專案預設位置。',
  }),
  EXPORT_PICKER_INVALID_RESULT: Object.freeze({
    code: 'EXPORT_PICKER_INVALID_RESULT',
    reason: '資料夾選擇器回傳無效結果，已改用專案預設位置。',
  }),
  EXPORT_PICKER_FAILED: Object.freeze({
    code: 'EXPORT_PICKER_FAILED',
    reason: '資料夾選擇橋接失敗，已改用專案預設位置。',
  }),
  EXPORT_START_FAILED: Object.freeze({
    code: 'EXPORT_START_FAILED',
    reason: '匯出工作無法啟動，請檢查輸出資料夾、來源檔案與權限。',
  }),
  IPC_FAILED: Object.freeze({
    code: 'IPC_FAILED',
    reason: '畫面與桌面橋接通訊失敗，請重試。',
  }),
});

const SAFE_ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_-]{1,48}$/u;

function displayStatus(value) {
  if (value === null || value === undefined || value === '') return '未知';
  const normalized = String(value).toLowerCase();
  return DISPLAY_STATUS_LABELS[normalized] || (/[A-Za-z]/u.test(normalized) ? '未知' : String(value));
}

function displayPrecision(value) {
  const labels = {
    'frame-aware': '可辨識影格',
    'time-based': '時間同步',
    'exact-frame': '精確影格',
    'time-only': '僅時間',
    exact: '精確',
    time: '時間',
    approximate: '約略',
    unsupported: '不支援',
    unknown: '未知',
  };
  return labels[String(value).toLowerCase()] || displayStatus(value);
}

function displayBlockType(value) {
  const labels = {
    'rich-text': '文字',
    text: '文字',
    heading: '標題',
    subheading: '子標題',
    image: '圖片',
    imageblock: '圖片',
    photo: '照片',
    singleVideo: '單一影片',
    comparisonVideo: '影片比較',
  };
  return labels[value] || '未知區塊';
}

function errorCodeText(error) {
  const candidates = [
    error?.code,
    error?.error?.code,
    error?.details?.code,
    error?.cause?.code,
  ];
  return candidates.find((value) => typeof value === 'string' && value.trim() !== '')?.trim().toUpperCase() || '';
}

function displayErrorMessage(error, fallbackCode = 'APP_ERROR') {
  const explicitCode = errorCodeText(error);
  const descriptor = DISPLAY_ERROR_CODE_MAP[explicitCode];
  if (descriptor) return `${descriptor.reason}（錯誤碼：${descriptor.code}）`;
  const safeCode = SAFE_ERROR_CODE_PATTERN.test(fallbackCode) ? fallbackCode : 'APP_ERROR';
  return `發生未分類錯誤，請重試。（錯誤碼：${safeCode}）`;
}

function serializeRendererError(error, fallbackCode) {
  const explicitCode = errorCodeText(error);
  const descriptor = DISPLAY_ERROR_CODE_MAP[explicitCode];
  if (descriptor) return { code: descriptor.code, message: descriptor.reason };
  const safeCode = SAFE_ERROR_CODE_PATTERN.test(fallbackCode) ? fallbackCode : 'APP_ERROR';
  return { code: safeCode, message: '發生未分類錯誤，請重試。' };
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
  return `狀態：${displayStatus(lifecycle)} · 相容性：${displayStatus(compatibility)}`;
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

function inlineBindingSegment(config) {
  const segment = config?.segment || {};
  const start = Number.isFinite(Number(segment.in)) ? Number(segment.in) : 0;
  const rawEnd = segment.out ?? null;
  const end = rawEnd === null || rawEnd === '' || !Number.isFinite(Number(rawEnd))
    ? null
    : Number(rawEnd);
  return { in: Math.max(0, start), out: end === null ? null : Math.max(0, end) };
}

function inlineBindingAnchor(block, side, rawAnchor) {
  if (!rawAnchor || typeof rawAnchor !== 'object') return null;
  const assetId = playerAssetIdFor(block, side);
  const asset = mediaAssetFor(assetId);
  const metadata = asset?.metadata || {};
  const frameTiming = typeof metadata.frameTiming === 'string'
    ? metadata.frameTiming.toLowerCase()
    : '';
  const kind = frameTiming === 'cfr' || frameTiming === 'vfr' ? frameTiming : 'unknown';
  const fps = Number(metadata.fps);
  const timingSnapshot = {
    ...(rawAnchor.timingSnapshot
      || (rawAnchor.timingMetadata?.isVfr === true ? { kind: 'vfr' } : { kind })),
  };
  if (kind === 'cfr' && Number.isFinite(fps) && fps > 0 && timingSnapshot.fps === undefined) {
    timingSnapshot.fps = fps;
  }
  if (Number.isFinite(Number(metadata.duration)) && timingSnapshot.duration === undefined) {
    timingSnapshot.duration = Number(metadata.duration);
  }
  const observedFrameIndex = rawAnchor.observedFrameIndex ?? rawAnchor.frameIndex ?? null;
  const frameEvidence = Number.isInteger(observedFrameIndex)
    && timingSnapshot.kind === 'cfr'
    && Number.isFinite(Number(timingSnapshot.fps));
  const precision = frameEvidence && rawAnchor.precision === 'frame-aware'
    ? 'frame-aware'
    : rawAnchor.precision === 'unknown' || timingSnapshot.kind === 'unknown'
      ? 'unknown'
      : 'time-based';
  return {
    ...rawAnchor,
    comparisonBlockId: rawAnchor.comparisonBlockId || block.id,
    side,
    mediaAssetId: rawAnchor.mediaAssetId || assetId,
    observedFrameIndex,
    precision,
    timingSnapshot,
    capturedAt: rawAnchor.capturedAt || '1970-01-01T00:00:00.000Z',
  };
}

function inlineBindingForBlock(block) {
  const sync = block?.sync || {};
  const stored = { ...(block?.binding || {}), ...(sync.binding || {}) };
  const sides = {};
  const anchors = {};
  for (const side of ['left', 'right']) {
    const config = playerSideConfig(block, side);
    const storedSide = stored.sides?.[side] || {};
    const segment = config.segment ?? storedSide.segment;
    const offset = config.offsetSeconds
      ?? config.offset
      ?? storedSide.offsetSeconds
      ?? stored.offsets?.[side];
    sides[side] = {
      segment: inlineBindingSegment(segment),
      offsetSeconds: Number.isFinite(Number(offset))
        ? Number(offset)
        : 0,
    };
    anchors[side] = inlineBindingAnchor(block, side, config.anchor || stored.anchors?.[side]);
  }
  const mode = stored.mode === 'frame' || sync.mode === 'frame' ? 'frame' : 'time';
  const masterSide = ['left', 'right'].includes(stored.masterSide ?? stored.clockSide)
    ? (stored.masterSide ?? stored.clockSide)
    : 'left';
  const playbackRate = Number.isFinite(Number(stored.playbackRate))
    ? Number(stored.playbackRate)
    : Number(block?.playback?.rate) || Number(playerSideConfig(block, masterSide).playback?.rate) || 1;
  return {
    enabled: stored.enabled === true,
    masterSide,
    mode,
    playbackRate,
    fallbackPrecision: stored.fallbackPrecision || 'unknown',
    anchors,
    sides,
  };
}

function persistInlineBinding(block, patch = {}) {
  if (!block || block.type !== 'comparisonVideo') return inlineBindingForBlock(block);
  const current = inlineBindingForBlock(block);
  const next = {
    ...current,
    ...patch,
    anchors: { ...current.anchors, ...(patch.anchors || {}) },
    sides: {
      left: { ...current.sides.left, ...(patch.sides?.left || {}) },
      right: { ...current.sides.right, ...(patch.sides?.right || {}) },
    },
  };
  const portableBinding = {
    enabled: next.enabled,
    masterSide: next.masterSide,
    mode: next.mode,
    anchors: { left: next.anchors.left, right: next.anchors.right },
    offsets: {
      left: next.sides.left.offsetSeconds,
      right: next.sides.right.offsetSeconds,
    },
    fallbackPrecision: next.fallbackPrecision,
    segmentRelation: 'independent',
    loopRelation: 'independent',
  };
  block.binding = portableBinding;
  block.sync = { ...(block.sync || {}), mode: next.mode, binding: next };
  block.playback = { ...(block.playback || {}), rate: next.playbackRate };
  for (const side of ['left', 'right']) {
    const config = playerSideConfig(block, side);
    config.segment = next.sides[side].segment;
    config.offsetSeconds = next.sides[side].offsetSeconds;
    if (next.anchors[side]) config.anchor = next.anchors[side];
  }
  return next;
}

function inlineBindingSummary(block) {
  if (block?.type !== 'comparisonVideo') return '單一來源 · 專案內媒體';
  const binding = inlineBindingForBlock(block);
  const mode = binding.mode === 'frame' ? '明確影格模式' : '共用經過時間';
  const master = binding.masterSide === 'right' ? '右側' : '左側';
  const precision = displayPrecision(binding.fallbackPrecision);
  return binding.enabled
    ? `持續綁定 · 控制側：${master} · ${mode} · 精度：${precision}`
    : `未啟用持續綁定 · ${mode} · 控制側：${master}`;
}

function makePlayerBlockId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function addPlayerBlock(block) {
  const section = activeSection();
  if (!section) return;
  section.blocks.push(block);
  state.player.selectedBlockId = block.id;
  state.player.notice = '已建立影片區塊；僅載入專案內媒體。';
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
  state.player.notice = '已建立文字區塊。';
  renderBlockCanvas();
  renderPreview();
  scheduleSave();
}

function addSingleVideoBlock({ allowEmpty = false } = {}) {
  const videos = videoAssetsForProject(state.activeProject);
  if (videos.length === 0 && !allowEmpty) {
    state.player.notice = '尚未載入影片資產。請先匯入專案內的實際影片。';
    renderPlayer();
    return;
  }
  const asset = videos[0];
  addPlayerBlock({
    id: makePlayerBlockId('single-video'),
    type: 'singleVideo',
    mediaAssetId: asset?.id || null,
    label: asset?.displayName || '單一影片',
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
    state.player.notice = '比較模式需要兩個專案內的實際影片資產。';
    renderPlayer();
    return;
  }
  const left = videos[0];
  const right = videos[1];
  addPlayerBlock({
    id: makePlayerBlockId('comparison-video'),
    type: 'comparisonVideo',
    label: '影片比較',
    layout: 'side-by-side',
    playback: { rate: 1 },
    sync: {
      mode: 'time',
      startAnchor: null,
      binding: {
        enabled: false,
        masterSide: 'left',
        mode: 'time',
        playbackRate: 1,
        fallbackPrecision: 'unknown',
        anchors: { left: null, right: null },
        sides: {
          left: { segment: { in: 0, out: null }, offsetSeconds: 0 },
          right: { segment: { in: 0, out: null }, offsetSeconds: 0 },
        },
      },
    },
    binding: {
      enabled: false,
      masterSide: 'left',
      mode: 'time',
      anchors: { left: null, right: null },
      offsets: { left: 0, right: 0 },
      fallbackPrecision: 'unknown',
      segmentRelation: 'independent',
      loopRelation: 'independent',
    },
    left: {
      mediaAssetId: left?.id || null,
      label: left?.displayName || '左側影片',
      segment: { in: 0, out: null },
      playback: { rate: 1 },
      anchor: null,
    },
    right: {
      mediaAssetId: right?.id || null,
      label: right?.displayName || '右側影片',
      segment: { in: 0, out: null },
      playback: { rate: 1 },
      anchor: null,
    },
  });
}

function renderPlayer() {
  if (state.activeProject) renderBlockCanvas();
}

function cloneProject(project) {
  return JSON.parse(JSON.stringify(project));
}

function setError(message) {
  if (!elements.appError) return;
  elements.appError.textContent = message ? String(message) : '';
  elements.appError.hidden = !message;
}

function setSaveState(value, stateName = '') {
  if (!elements.saveState) return;
  elements.saveState.textContent = value;
  elements.saveState.dataset.state = stateName;
}

function defaultExportDirectory() {
  const root = typeof state.projectRoot === 'string' ? state.projectRoot.replace(/[\\/]+$/u, '') : '';
  if (!root) return '';
  return `${root}${root.includes('\\') ? '\\' : '/'}output`;
}

function exportDirectoryPicker() {
  return typeof window.pitchingApp?.pickExportDirectory === 'function'
    ? window.pitchingApp.pickExportDirectory
    : null;
}

function displaySafeDirectoryLabel(directory) {
  const normalized = typeof directory === 'string' ? directory.replace(/[\\/]+$/u, '') : '';
  const segments = normalized.split(/[\\/]/u).filter(Boolean);
  return segments.at(-1) || '已選資料夾';
}

function normalizeExportDirectoryPick(result) {
  if (result === null || result === undefined || result?.canceled === true) {
    return { canceled: true, directory: '' };
  }
  const candidate = typeof result === 'string'
    ? result
    : (result.path ?? result.directory ?? result.outputDirectory);
  if (typeof candidate !== 'string' || candidate.trim() === '') {
    return { canceled: false, directory: '' };
  }
  return { canceled: false, directory: candidate.trim() };
}

function resetExportSelection() {
  state.export.outputDirectory = '';
  state.export.directoryNotice = '';
}

async function chooseExportDirectory() {
  if (!state.activeProject || ['running', 'cancelling'].includes(state.export.status)) return;
  const picker = exportDirectoryPicker();
  if (!picker) {
    state.export.directoryNotice = displayErrorMessage({ code: 'EXPORT_PICKER_UNAVAILABLE' });
    renderExportControls();
    return;
  }
  try {
    const picked = normalizeExportDirectoryPick(await picker());
    if (picked.canceled) {
      state.export.directoryNotice = '已取消資料夾選擇；尚未開始匯出。';
    } else if (!picked.directory) {
      state.export.directoryNotice = displayErrorMessage({ code: 'EXPORT_PICKER_INVALID_RESULT' });
    } else {
      state.export.outputDirectory = picked.directory;
      state.export.directoryNotice = `已選資料夾：${displaySafeDirectoryLabel(picked.directory)}`;
    }
  } catch (error) {
    state.export.directoryNotice = displayErrorMessage(error, 'EXPORT_PICKER_FAILED');
  }
  renderExportControls();
}

function exportResultLabel(snapshot) {
  const result = snapshot?.result;
  if (!result) return '';
  const output = result.zipPath || result.folderPath;
  return output ? `輸出就緒：${output}` : '匯出完成，但沒有輸出路徑。';
}

function renderExportControls() {
  const project = state.activeProject;
  const exportState = state.export;
  const snapshot = exportState.snapshot;
  const running = exportState.status === 'running' || exportState.status === 'cancelling';
  const pickerAvailable = Boolean(exportDirectoryPicker());
  if (elements.chooseExportDirectory) elements.chooseExportDirectory.disabled = !project || running || !pickerAvailable;
  if (elements.exportKind) elements.exportKind.disabled = !project || running;
  if (elements.exportReport) elements.exportReport.disabled = !project || running;
  if (elements.exportCancel) elements.exportCancel.hidden = !running;
  if (elements.exportRetry) {
    elements.exportRetry.hidden = !exportState.jobId || !snapshot || !['failed', 'cancelled'].includes(exportState.status);
  }
  if (elements.exportStatus) elements.exportStatus.dataset.state = exportState.status;
  if (!project) {
    if (elements.exportDirectoryStatus) elements.exportDirectoryStatus.textContent = '開啟專案以選擇輸出資料夾。';
    if (elements.exportStatus) elements.exportStatus.textContent = '開啟專案後才能匯出。';
  } else if (exportState.outputDirectory) {
    if (elements.exportDirectoryStatus) {
      elements.exportDirectoryStatus.textContent = exportState.directoryNotice
        || `已選資料夾：${displaySafeDirectoryLabel(exportState.outputDirectory)}`;
    }
  } else if (exportState.status === 'running') {
    if (elements.exportDirectoryStatus) {
      elements.exportDirectoryStatus.textContent = `使用專案預設位置：${displaySafeDirectoryLabel(defaultExportDirectory())}`;
    }
    if (elements.exportStatus) {
      elements.exportStatus.textContent = '匯出進行中；正在將引用的資產複製到自包含輸出。';
    }
  } else if (exportState.directoryNotice) {
    if (elements.exportDirectoryStatus) elements.exportDirectoryStatus.textContent = exportState.directoryNotice;
  } else if (!pickerAvailable) {
    if (elements.exportDirectoryStatus) {
      elements.exportDirectoryStatus.textContent = '無法使用資料夾選擇器；改用專案預設位置。';
    }
  } else {
    if (elements.exportDirectoryStatus) {
      elements.exportDirectoryStatus.textContent = `使用專案預設位置：${displaySafeDirectoryLabel(defaultExportDirectory())}`;
    }
  }
  if (!project) {
    return;
  }
  if (exportState.status === 'running') {
    if (elements.exportStatus) {
      elements.exportStatus.textContent = '匯出進行中；正在將引用的資產複製到自包含輸出。';
    }
  } else if (exportState.status === 'cancelling') {
    if (elements.exportStatus) elements.exportStatus.textContent = '正在取消匯出；等待清理完成。';
  } else if (exportState.status === 'completed') {
    if (elements.exportStatus) elements.exportStatus.textContent = exportResultLabel(snapshot);
  } else if (exportState.status === 'failed') {
    if (elements.exportStatus) {
      elements.exportStatus.textContent = `匯出失敗：${displayErrorMessage(snapshot?.error, 'EXPORT_FAILED')}`;
    }
  } else if (exportState.status === 'cancelled') {
    if (elements.exportStatus) {
      elements.exportStatus.textContent = `匯出已取消：${displayErrorMessage(snapshot?.error || { code: 'EXPORT_CANCELLED' })}`;
    }
  } else {
    if (elements.exportStatus) {
      elements.exportStatus.textContent = exportState.outputDirectory
        ? `匯出將使用已選資料夾：${displaySafeDirectoryLabel(exportState.outputDirectory)}。`
        : `匯出將使用${defaultExportDirectory() || '專案輸出資料夾'}。`;
    }
  }
}

function setExportSnapshot(snapshot) {
  state.export.snapshot = snapshot;
  state.export.status = snapshot?.status || 'failed';
  renderExportControls();
}

function exportDelay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function monitorExportJob(jobId) {
  while (state.export.jobId === jobId) {
    const snapshot = await window.pitchingApp.getExportStatus(jobId);
    setExportSnapshot(snapshot);
    if (!['running', 'cancelling'].includes(snapshot.status)) return snapshot;
    await exportDelay(180);
  }
  return state.export.snapshot;
}

async function startReportExport() {
  if (!state.activeProject || state.export.status === 'running' || state.export.status === 'cancelling') return;
  try {
    await flushPendingChanges();
    const project = state.activeProject;
    const outputDirectory = state.export.outputDirectory || defaultExportDirectory();
    if (!outputDirectory) throw new Error('專案輸出資料夾無法使用。');
    const request = {
      projectId: project.id,
      outputDirectory,
      reportName: project.reportTitle || project.displayName,
      outputKind: elements.exportKind?.value || 'folder',
    };
    state.export.jobId = null;
    state.export.snapshot = null;
    state.export.status = 'running';
    renderExportControls();
    const started = await window.pitchingApp.startExport(request);
    if (!started?.jobId) throw new Error('匯出橋接未回傳工作編號。');
    state.export.jobId = started.jobId;
    setExportSnapshot(started);
    await monitorExportJob(started.jobId);
  } catch (error) {
    state.export.jobId = null;
    setExportSnapshot({ status: 'failed', error: serializeRendererError(error, 'EXPORT_START_FAILED') });
  }
}

async function cancelReportExport() {
  const jobId = state.export.jobId;
  if (!jobId || !['running', 'cancelling'].includes(state.export.status)) return;
  try {
    setExportSnapshot(await window.pitchingApp.cancelExport(jobId));
  } catch (error) {
    setExportSnapshot({ status: 'failed', error: { message: `取消失敗：${displayErrorMessage(error)}` } });
  }
}

async function retryReportExport() {
  const jobId = state.export.jobId;
  if (!jobId || !['failed', 'cancelled'].includes(state.export.status)) return;
  try {
    const started = await window.pitchingApp.retryExport(jobId);
    state.export.jobId = started.jobId;
    setExportSnapshot(started);
    await monitorExportJob(started.jobId);
  } catch (error) {
    setExportSnapshot({ status: 'failed', error: { message: `重試失敗：${displayErrorMessage(error)}` } });
  }
}

function renderProjects() {
  const control = elements.projectList || elements.projectPicker;
  if (!control) return;
  if (control.tagName === 'SELECT') {
    control.innerHTML = state.projects.length > 0
      ? state.projects.map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.displayName)}</option>`).join('')
      : '<option value="">尚無文件</option>';
    control.disabled = state.projects.length === 0;
    if (state.activeProject) control.value = state.activeProject.id;
    return;
  }
  control.innerHTML = state.projects.map((project) => `
    <button class="project-card" data-project-id="${escapeHtml(project.id)}" type="button">
      <span>${escapeHtml(project.displayName)}</span><small>${project.sectionCount} 個段落</small>
    </button>`).join('');
  control.querySelectorAll('[data-project-id]').forEach((button) => {
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
  const options = [`<option value="">尚未選擇資產</option>`];
  if (selected && !assets.some((asset) => asset.id === selected)) {
    options.push(`<option value="${escapeHtml(selected)}" selected>找不到資產：${escapeHtml(selected)}</option>`);
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
  const label = comparison ? (side === 'left' ? '左側來源' : '右側來源') : '影片來源';
  const anchorTime = config.anchor?.observedTime;
  const loop = config.loop || {};
  return `
    <fieldset class="video-side-config">
      <legend>${label}</legend>
      <label>資產
        <select data-block-path="${prefix}mediaAssetId">${editorVideoAssetOptions(config.mediaAssetId)}</select>
      </label>
      <label>標籤 <input type="text" data-block-path="${prefix}label" value="${editorValue(config.label)}" /></label>
      <div class="block-inline-fields">
        <label>起點 <input type="number" min="0" step="0.001" data-block-path="${prefix}segment.in" value="${editorValue(config.segment?.in)}" /></label>
        <label>終點 <input type="number" min="0" step="0.001" data-block-path="${prefix}segment.out" value="${editorValue(config.segment?.out)}" /></label>
        <label>相對偏移（秒） <input type="number" step="0.001" data-block-path="${prefix}offsetSeconds" value="${editorValue(config.offsetSeconds || 0)}" /></label>
        <label>播放速度 <input type="number" min="0.1" max="8" step="0.1" data-block-path="${prefix}playback.rate" value="${editorValue(config.playback?.rate || 1)}" /></label>
        ${comparison ? `<label>同步錨點 <input type="number" min="0" step="0.001" data-inline-anchor-value="${side}" value="${editorValue(anchorTime)}" readonly aria-label="${label}同步錨點（由播放器位置取得）" /></label>` : ''}
        <label>循環播放 <input type="checkbox" data-block-path="${prefix}loop.enabled"${loop.enabled === true ? ' checked' : ''} /></label>
        <label>循環起點 <input type="number" min="0" step="0.001" data-block-path="${prefix}loop.start" value="${editorValue(loop.start)}" /></label>
        <label>循環終點 <input type="number" min="0" step="0.001" data-block-path="${prefix}loop.end" value="${editorValue(loop.end)}" /></label>
      </div>
      ${comparison ? `<button class="button button-quiet" type="button" data-inline-action="capture-anchor" data-inline-anchor-side="${side}">以目前${label}位置設定同步錨點</button>` : ''}
    </fieldset>`;
}

function renderVideoBlockEditor(block) {
  const comparison = block.type === 'comparisonVideo';
  const binding = inlineBindingForBlock(block);
  return `
    <div class="block-config-grid">
      <label>模式
        <select data-block-mode>
          <option value="single"${comparison ? '' : ' selected'}>單一影片</option>
          <option value="comparison"${comparison ? ' selected' : ''}>影片比較</option>
        </select>
      </label>
      <label>標籤 <input type="text" data-block-path="label" value="${editorValue(block.label)}" /></label>
      <label>版面
        <select data-block-path="layout">
          <option value="side-by-side"${block.layout !== 'stacked' ? ' selected' : ''}>並排</option>
          <option value="stacked"${block.layout === 'stacked' ? ' selected' : ''}>堆疊</option>
        </select>
      </label>
      ${comparison ? `<label>綁定模式
        <select data-block-path="sync.mode">
          <option value="time"${binding.mode !== 'frame' ? ' selected' : ''}>時間／共用經過時間</option>
          <option value="frame"${binding.mode === 'frame' ? ' selected' : ''}>明確影格（能力不足時降級）</option>
        </select>
      </label>
      <label>持續綁定
        <input type="checkbox" data-block-path="sync.binding.enabled"${binding.enabled ? ' checked' : ''} aria-label="啟用持續雙側綁定" />
      </label>
      <label>控制側
        <select data-block-path="sync.binding.masterSide">
          <option value="left"${binding.masterSide === 'left' ? ' selected' : ''}>左側控制播放軸</option>
          <option value="right"${binding.masterSide === 'right' ? ' selected' : ''}>右側控制播放軸</option>
        </select>
      </label>
      <p class="inline-binding-status" data-inline-binding-status role="status">${escapeHtml(inlineBindingSummary(block))}</p>` : ''}
      <div class="video-side-configs">
        ${comparison ? `${renderVideoSideEditor(block, 'left')}${renderVideoSideEditor(block, 'right')}` : renderVideoSideEditor(block, 'single')}
      </div>
    </div>`;
}

function renderInlineVideoSide(block, side) {
  const config = playerSideConfig(block, side);
  const label = side === 'left' ? '左側來源' : side === 'right' ? '右側來源' : '影片來源';
  return `
    <div class="inline-video-side" data-inline-side="${side}">
      <h3>${label}</h3>
      <div class="inline-video-frame"><video data-inline-video tabindex="0" playsinline preload="metadata"></video></div>
      <p class="inline-video-status" data-inline-status role="status">尚未載入；請選擇專案內資產。</p>
      <div class="inline-video-controls">
        <button class="button button-quiet" type="button" data-inline-action="play">播放</button>
        <button class="button button-quiet" type="button" data-inline-action="pause">暫停</button>
        <button class="button button-quiet" type="button" data-inline-action="step-prev">上一幀</button>
        <button class="button button-quiet" type="button" data-inline-action="step-next">下一幀</button>
        <input class="inline-video-seek" data-inline-seek type="range" min="0" max="0" step="0.001" value="0" disabled aria-label="${label}時間軸" />
        <output class="inline-video-time" data-inline-time>0.00s</output>
        <button class="button button-quiet" type="button" data-inline-action="fullscreen">全螢幕</button>
      </div>
    </div>`;
}

function renderInlineVideoBlock(section, block) {
  const comparison = block.type === 'comparisonVideo';
  const layout = block.layout === 'stacked' ? 'stacked' : 'side-by-side';
  const sides = comparison ? `${renderInlineVideoSide(block, 'left')}${renderInlineVideoSide(block, 'right')}` : renderInlineVideoSide(block, 'single');
  const syncMode = inlineBindingSummary(block);
  return `
    <article class="inline-video-block" data-section-id="${escapeHtml(section.id)}" data-block-id="${escapeHtml(block.id)}" data-inline-video-block>
      <header class="inline-video-header">
        <div class="inline-video-title"><strong>${escapeHtml(block.label || (comparison ? '影片比較' : '影片區塊'))}</strong><span>${comparison ? `${escapeHtml(syncMode)} · ${layout === 'stacked' ? '堆疊' : '並排'}` : '單一來源 · 專案內媒體'}</span></div>
        <div class="inline-video-actions">
          <button class="button button-quiet" type="button" data-inline-action="open">開啟控制項</button>
          <button class="button button-secondary" type="button" data-inline-action="play-all">播放</button>
          <button class="button button-quiet" type="button" data-inline-action="pause-all">暫停</button>
          ${comparison ? '<button class="button button-quiet" type="button" data-inline-action="align-zero">對齊 0 秒</button>' : ''}
        </div>
      </header>
      <div class="inline-video-grid" data-layout="${layout}">${sides}</div>
      <details class="inline-video-details"><summary>區塊設定</summary>${renderVideoBlockEditor(block)}</details>
    </article>`;
}

function setInlineVideoStatus(sideElement, message, stateName = '') {
  const status = sideElement?.querySelector('[data-inline-status]');
  if (!status) return;
  status.textContent = message;
  status.dataset.state = stateName;
}

function updateInlineVideoTime(sideElement) {
  const video = sideElement?.querySelector('[data-inline-video]');
  const seek = sideElement?.querySelector('[data-inline-seek]');
  const time = sideElement?.querySelector('[data-inline-time]');
  if (!video || !seek || !time) return;
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  seek.max = String(duration);
  seek.value = String(Math.min(Number(video.currentTime) || 0, duration));
  seek.disabled = duration <= 0;
  time.textContent = `${(Number(video.currentTime) || 0).toFixed(2)}s${duration > 0 ? ` / ${duration.toFixed(2)}s` : ''}`;
}

function safeInlineMediaSourceUrl(source) {
  const sourceUrl = source && typeof source === 'object' ? source.sourceUrl : null;
  if (typeof sourceUrl !== 'string' || sourceUrl.trim() === '') {
    throw new Error('Media source bridge returned no source URL');
  }
  let parsed;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new Error('Media source bridge returned an invalid source URL');
  }
  if (parsed.protocol !== 'file:') {
    throw new Error('Media source bridge returned a non-local source URL');
  }
  return parsed.href;
}

function inlineRuntimeForCard(card) {
  let runtime = state.inlineRuntimeByCard.get(card);
  if (!runtime) {
    runtime = {
      guard: false,
      syncQueued: false,
      syncInFlight: false,
      pendingSync: null,
      lastPrecision: null,
    };
    state.inlineRuntimeByCard.set(card, runtime);
  }
  return runtime;
}

function scheduleInlineRuntimeTask(callback) {
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(callback);
    return;
  }
  setTimeout(callback, 0);
}

function inlineVideoForSide(card, side) {
  return card?.querySelector(`[data-inline-side="${side}"] [data-inline-video]`) || null;
}

function inlineBindingSource(block, side, video) {
  const binding = inlineBindingForBlock(block);
  const asset = mediaAssetFor(playerAssetIdFor(block, side));
  return {
    anchor: binding.anchors[side],
    duration: Number.isFinite(video?.duration) ? video.duration : undefined,
    timing: playerTimingForAsset(asset, Number.isFinite(video?.duration) ? video.duration : undefined),
    capability: { supportsFrameStep: typeof video?.seekToNextFrame === 'function' },
    segment: binding.sides[side].segment,
    offsetSeconds: binding.sides[side].offsetSeconds,
  };
}

function setInlineBindingStatus(card, message, stateName = '') {
  const status = card?.querySelector('[data-inline-binding-status]');
  if (!status) return;
  status.textContent = message;
  status.dataset.state = stateName;
}

function inlineRelativeTimeForSide(block, side, video) {
  const binding = inlineBindingForBlock(block);
  const anchor = binding.anchors[side];
  if (!anchor || !video || !Number.isFinite(video.currentTime)) return null;
  return Math.max(0, video.currentTime - anchor.observedTime - binding.sides[side].offsetSeconds);
}

function inlineAlignmentStatus(alignment, binding) {
  if (binding.mode === 'frame' && alignment.fallback) {
    return '持續綁定中；雙側不具精確影格能力，已降級為時間同步。';
  }
  if (alignment.effectiveMode === 'frame') return '持續綁定中；雙側精確影格。';
  return `持續綁定中；${displayPrecision(alignment.fallbackPrecision || alignment.precision)}。`;
}

async function applyInlineBindingAtRelativeTime(card, block, relativeTime, { force = false } = {}) {
  const binding = inlineBindingForBlock(block);
  if (!binding.enabled || block.type !== 'comparisonVideo') return null;
  if (!binding.anchors.left || !binding.anchors.right) {
    setInlineBindingStatus(card, '持續綁定需要左右兩側同步錨點。', 'pending');
    return null;
  }
  if (!window.pitchingApp?.sync?.alignComparisonAtRelativeTime) return null;
  const leftVideo = inlineVideoForSide(card, 'left');
  const rightVideo = inlineVideoForSide(card, 'right');
  if (!leftVideo || !rightVideo) return null;
  const runtime = inlineRuntimeForCard(card);
  const previousGuard = runtime.guard;
  runtime.guard = true;
  try {
    const alignment = await window.pitchingApp.sync.alignComparisonAtRelativeTime({
      left: inlineBindingSource(block, 'left', leftVideo),
      right: inlineBindingSource(block, 'right', rightVideo),
    }, Math.max(0, relativeTime), { mode: binding.mode });
    for (const side of ['left', 'right']) {
      const video = inlineVideoForSide(card, side);
      const targetTime = alignment.sides[side].playbackTime;
      if (video && (force || Math.abs(video.currentTime - targetTime) > 0.02)) {
        video.currentTime = targetTime;
      }
      if (video) video.playbackRate = binding.playbackRate;
    }
    if (binding.fallbackPrecision !== alignment.fallbackPrecision) {
      persistInlineBinding(block, { fallbackPrecision: alignment.fallbackPrecision });
      scheduleSave();
    }
    setInlineBindingStatus(card, inlineAlignmentStatus(alignment, binding), alignment.fallback ? 'fallback' : 'loaded');
    return alignment;
  } catch {
    setInlineBindingStatus(card, '持續同步暫時無法解析，請檢查兩側媒體與錨點。', 'error');
    return null;
  } finally {
    runtime.guard = previousGuard;
  }
}

function queueInlineBindingSync(card, block, sourceSide, { force = false } = {}) {
  const binding = inlineBindingForBlock(block);
  if (!binding.enabled || block.type !== 'comparisonVideo') return;
  const side = sourceSide === 'left' || sourceSide === 'right'
    ? sourceSide
    : binding.masterSide;
  const video = inlineVideoForSide(card, side);
  const relativeTime = inlineRelativeTimeForSide(block, side, video);
  if (relativeTime === null) return;
  const runtime = inlineRuntimeForCard(card);
  runtime.pendingSync = { relativeTime, force };
  if (runtime.syncQueued) return;
  runtime.syncQueued = true;
  scheduleInlineRuntimeTask(() => {
    runtime.syncQueued = false;
    if (runtime.syncInFlight || !runtime.pendingSync) return;
    const pending = runtime.pendingSync;
    runtime.pendingSync = null;
    runtime.syncInFlight = true;
    void applyInlineBindingAtRelativeTime(card, block, pending.relativeTime, pending)
      .finally(() => {
        runtime.syncInFlight = false;
        if (runtime.pendingSync) queueInlineBindingSync(card, block, binding.masterSide);
      });
  });
}

function applyInlineSideSettings(card, block, side) {
  const video = inlineVideoForSide(card, side);
  if (!video) return;
  const config = playerSideConfig(block, side);
  const binding = inlineBindingForBlock(block);
  video.loop = config.loop?.enabled === true;
  video.playbackRate = binding.enabled && block.type === 'comparisonVideo'
    ? binding.playbackRate
    : Number(config.playback?.rate) || 1;
}

async function propagateInlinePlayback(card, action, sourceSide) {
  const entry = blockForEditorCard(card);
  const block = entry.block;
  const binding = inlineBindingForBlock(block);
  if (!block || block.type !== 'comparisonVideo' || !binding.enabled) return false;
  const runtime = inlineRuntimeForCard(card);
  runtime.guard = true;
  try {
    if (action === 'play') {
      const controlSide = binding.masterSide;
      const relativeTime = inlineRelativeTimeForSide(block, controlSide, inlineVideoForSide(card, controlSide));
      if (relativeTime !== null) {
        await applyInlineBindingAtRelativeTime(card, block, relativeTime, { force: true });
      }
      await Promise.all(['left', 'right'].map((side) => inlineVideoForSide(card, side)?.play()));
    } else if (action === 'pause') {
      ['left', 'right'].forEach((side) => inlineVideoForSide(card, side)?.pause());
    }
  } finally {
    runtime.guard = false;
  }
  return true;
}

function waitForInlineFrame(video, timeout = 250) {
  if (!video || typeof video.requestVideoFrameCallback !== 'function') return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const timer = setTimeout(finish, timeout);
    video.requestVideoFrameCallback(() => {
      clearTimeout(timer);
      finish();
    });
  });
}

async function stepInlineVideo(card, side, direction) {
  const entry = blockForEditorCard(card);
  const block = entry.block;
  const video = inlineVideoForSide(card, side);
  if (!block || !video || !window.pitchingApp?.sync?.planFrameStep) return;
  const plan = await window.pitchingApp.sync.planFrameStep({
    timing: playerTimingForAsset(mediaAssetFor(playerAssetIdFor(block, side)), video.duration),
    duration: Number.isFinite(video.duration) ? video.duration : undefined,
    currentTime: Number(video.currentTime) || 0,
    direction,
    capability: { supportsFrameStep: typeof video.seekToNextFrame === 'function' },
  });
  const targetTime = plan.targetTime;
  if (plan.exact && direction > 0 && typeof video.seekToNextFrame === 'function') {
    video.seekToNextFrame();
  } else {
    video.currentTime = targetTime;
  }
  await waitForInlineFrame(video);
  const binding = inlineBindingForBlock(block);
  const precisionLabel = plan.fallback ? '時間同步 fallback' : '精確影格';
  setInlineVideoStatus(
    card.querySelector(`[data-inline-side="${side}"]`),
    `${direction > 0 ? '下一幀' : '上一幀'}：${precisionLabel}`,
    plan.fallback ? 'fallback' : 'loaded',
  );
  if (binding.enabled) queueInlineBindingSync(card, block, binding.masterSide, { force: true });
}

function bindInlineVideoRuntime(card, block, side, video) {
  if (!video || video.dataset.inlineRuntimeBound === 'true') return;
  video.dataset.inlineRuntimeBound = 'true';
  video.addEventListener('timeupdate', () => {
    updateInlineVideoTime(video.closest('[data-inline-side]'));
    const current = blockForEditorCard(card).block;
    const binding = inlineBindingForBlock(current);
    const runtime = inlineRuntimeForCard(card);
    if (current && binding.enabled && !runtime.guard && side === binding.masterSide) {
      queueInlineBindingSync(card, current, side);
    }
  });
  video.addEventListener('seeked', () => {
    const current = blockForEditorCard(card).block;
    const binding = inlineBindingForBlock(current);
    const runtime = inlineRuntimeForCard(card);
    if (current && binding.enabled && !runtime.guard) {
      queueInlineBindingSync(card, current, binding.masterSide, { force: true });
    }
  });
  video.addEventListener('play', () => {
    const current = blockForEditorCard(card).block;
    const runtime = inlineRuntimeForCard(card);
    if (current && !runtime.guard) void propagateInlinePlayback(card, 'play', side);
  });
  video.addEventListener('pause', () => {
    const current = blockForEditorCard(card).block;
    const runtime = inlineRuntimeForCard(card);
    if (current && !runtime.guard) void propagateInlinePlayback(card, 'pause', side);
  });
  video.addEventListener('ratechange', () => {
    const current = blockForEditorCard(card).block;
    const binding = inlineBindingForBlock(current);
    const runtime = inlineRuntimeForCard(card);
    if (!current || !binding.enabled || runtime.guard || side !== binding.masterSide) return;
    persistInlineBinding(current, { playbackRate: video.playbackRate });
    ['left', 'right'].forEach((item) => applyInlineSideSettings(card, current, item));
    scheduleSave();
  });
  video.addEventListener('ended', () => {
    const current = blockForEditorCard(card).block;
    const binding = inlineBindingForBlock(current);
    if (current && binding.enabled && side === binding.masterSide) {
      setInlineBindingStatus(card, '持續綁定已到達控制側結束位置。', 'loaded');
    }
  });
}

async function captureInlineAnchor(card, side) {
  const entry = blockForEditorCard(card);
  const block = entry.block;
  const video = inlineVideoForSide(card, side);
  const assetId = playerAssetIdFor(block, side);
  if (!block || block.type !== 'comparisonVideo' || !video || !assetId || !Number.isFinite(video.currentTime)) return;
  if (!window.pitchingApp?.sync?.captureAnchor) return;
  try {
    const anchor = await window.pitchingApp.sync.captureAnchor({
      comparisonBlockId: block.id,
      side,
      mediaAssetId: assetId,
      observedTime: video.currentTime,
      timingSnapshot: playerTimingForAsset(mediaAssetFor(assetId), video.duration),
      capability: { supportsFrameStep: typeof video.seekToNextFrame === 'function' },
      capturedAt: new Date().toISOString(),
    });
    persistInlineBinding(block, { anchors: { [side]: anchor } });
    patchInlineVideoCard(card, block);
    scheduleSave();
    setInlineVideoStatus(
      card.querySelector(`[data-inline-side="${side}"]`),
      `${side === 'left' ? '左側' : '右側'}同步錨點已保存（${displayPrecision(anchor.precision)}）。`,
      'loaded',
    );
    const binding = inlineBindingForBlock(block);
    if (binding.enabled) queueInlineBindingSync(card, block, binding.masterSide, { force: true });
  } catch {
    setInlineVideoStatus(card.querySelector(`[data-inline-side="${side}"]`), '同步錨點無法保存，請確認媒體位置有效。', 'error');
  }
}

async function loadInlineVideoSide(card, block, side, generation) {
  const sideElement = card.querySelector(`[data-inline-side="${side}"]`);
  const video = sideElement?.querySelector('[data-inline-video]');
  if (!sideElement || !video || generation !== state.inlineGeneration) return;
  bindInlineVideoRuntime(card, block, side, video);
  const assetId = playerAssetIdFor(block, side);
  const asset = mediaAssetFor(assetId);
  if (!assetId || !asset) {
    setInlineVideoStatus(sideElement, '尚未選擇專案內資產。', 'pending');
    return;
  }
  if (asset.lifecycleStatus === 'missing' || ['unsupported', 'unplayable'].includes(asset.compatibility)) {
    setInlineVideoStatus(sideElement, '此資產無法使用或不受支援。', 'error');
    return;
  }
  if (asset.compatibility === 'needs-normalization' && !asset.normalizedReference) {
    setInlineVideoStatus(sideElement, '中繼資料尚待正規化；目前無法播放。', 'pending');
    return;
  }
  setInlineVideoStatus(sideElement, '正在載入專案內媒體…', 'pending');
  video.dataset.mediaAssetId = assetId;
  video.removeAttribute('src');
  video.load();
  try {
    const source = await window.pitchingApp.resolveMediaSource(state.activeProject.id, assetId);
    if (generation !== state.inlineGeneration || !card.isConnected) return;
    video.onloadedmetadata = () => {
      setInlineVideoStatus(sideElement, '準備就緒；已載入實際媒體來源。', 'loaded');
      updateInlineVideoTime(sideElement);
      applyInlineSideSettings(card, block, side);
    };
    video.onerror = () => setInlineVideoStatus(sideElement, '此執行環境無法播放媒體。', 'error');
    video.src = safeInlineMediaSourceUrl(source);
    video.playbackRate = Number(playerSideConfig(block, side).playback?.rate) || 1;
    video.load();
  } catch {
    setInlineVideoStatus(sideElement, '無法安全解析媒體來源。', 'error');
  }
}

function hydrateInlineVideoCards() {
  if (!elements.blockCanvas || !state.activeProject) return;
  const generation = ++state.inlineGeneration;
  elements.blockCanvas.querySelectorAll('[data-inline-video-block]').forEach((card) => {
    const entry = blockForEditorCard(card);
    if (!entry.block) return;
    const sides = entry.block.type === 'comparisonVideo' ? ['left', 'right'] : ['single'];
    sides.forEach((side) => { void loadInlineVideoSide(card, entry.block, side, generation); });
  });
}

async function playInlineCard(card) {
  const videos = [...card.querySelectorAll('[data-inline-video]')];
  const ready = videos.filter((video) => video.readyState > 0 && video.src);
  if (ready.length === 0) {
    card.querySelectorAll('[data-inline-side]').forEach((side) => setInlineVideoStatus(side, '載入可播放來源後才能播放。', 'pending'));
    return;
  }
  const entry = blockForEditorCard(card);
  const binding = inlineBindingForBlock(entry.block);
  try {
    const runtime = inlineRuntimeForCard(card);
    if (entry.block?.type === 'comparisonVideo' && binding.enabled) {
      const masterVideo = inlineVideoForSide(card, binding.masterSide);
      const relativeTime = inlineRelativeTimeForSide(entry.block, binding.masterSide, masterVideo);
      if (relativeTime !== null) await applyInlineBindingAtRelativeTime(card, entry.block, relativeTime, { force: true });
      runtime.guard = true;
      await Promise.all(['left', 'right'].map((side) => inlineVideoForSide(card, side)?.play()));
      runtime.guard = false;
      return;
    }
    await Promise.all(ready.map((video) => video.play()));
  } catch {
    inlineRuntimeForCard(card).guard = false;
    card.querySelectorAll('[data-inline-side]').forEach((side) => setInlineVideoStatus(side, '播放遭阻擋或無法使用。', 'error'));
  }
}

async function alignInlineComparison(card) {
  const entry = blockForEditorCard(card);
  const binding = inlineBindingForBlock(entry.block);
  const leftElement = card.querySelector('[data-inline-side="left"]');
  const rightElement = card.querySelector('[data-inline-side="right"]');
  const leftVideo = leftElement?.querySelector('[data-inline-video]');
  const rightVideo = rightElement?.querySelector('[data-inline-video]');
  const left = playerSideConfig(entry.block, 'left');
  const right = playerSideConfig(entry.block, 'right');
  if (entry.block && binding.enabled) {
    const masterVideo = inlineVideoForSide(card, binding.masterSide);
    const relativeTime = inlineRelativeTimeForSide(entry.block, binding.masterSide, masterVideo);
    if (relativeTime !== null) {
      await applyInlineBindingAtRelativeTime(card, entry.block, relativeTime, { force: true });
    }
    return;
  }
  if (!entry.block || !leftVideo || !rightVideo || !leftVideo.src || !rightVideo.src || !left.anchor || !right.anchor) {
    setInlineVideoStatus(leftElement, '兩個來源都必須載入媒體，並分別設定錨點。', 'pending');
    return;
  }
  try {
    const alignment = await window.pitchingApp.sync.alignComparisonAtRelativeTime({
      left: inlineBindingSource(entry.block, 'left', leftVideo),
      right: inlineBindingSource(entry.block, 'right', rightVideo),
    }, 0, { mode: binding.mode });
    leftVideo.currentTime = alignment.sides.left.playbackTime;
    rightVideo.currentTime = alignment.sides.right.playbackTime;
    setInlineVideoStatus(leftElement, `已對齊至 0 秒（${displayPrecision(alignment.precision)}）。`, 'loaded');
    setInlineVideoStatus(rightElement, `已對齊至 0 秒（${displayPrecision(alignment.precision)}）。`, 'loaded');
  } catch {
    setInlineVideoStatus(leftElement, '這些來源無法進行比較對齊。', 'error');
  }
}

function handleInlineVideoEvent(event) {
  const target = event.target;
  const card = target.closest('[data-inline-video-block]');
  if (!card) return false;
  const sideElement = target.closest('[data-inline-side]');
  const video = sideElement?.querySelector('[data-inline-video]');
  const actionElement = target.closest('[data-inline-action]');
  const action = actionElement?.dataset.inlineAction;
  const actionSide = actionElement?.dataset.inlineAnchorSide || sideElement?.dataset.inlineSide;
  if (target.matches('[data-inline-seek]') && video) {
    video.currentTime = Number(target.value) || 0;
    updateInlineVideoTime(sideElement);
    const entry = blockForEditorCard(card);
    if (entry.block && inlineBindingForBlock(entry.block).enabled) {
      const binding = inlineBindingForBlock(entry.block);
      queueInlineBindingSync(card, entry.block, binding.masterSide, { force: true });
    }
    return true;
  }
  if (!action) return false;
  if (action === 'open') {
    const details = card.querySelector('details');
    if (details) details.open = true;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else if (action === 'play-all') {
    void playInlineCard(card);
  } else if (action === 'pause-all') {
    const entry = blockForEditorCard(card);
    if (entry.block && inlineBindingForBlock(entry.block).enabled) {
      void propagateInlinePlayback(card, 'pause', inlineBindingForBlock(entry.block).masterSide);
    } else {
      card.querySelectorAll('[data-inline-video]').forEach((item) => item.pause());
    }
  } else if (action === 'play' && video) {
    const entry = blockForEditorCard(card);
    if (entry.block && inlineBindingForBlock(entry.block).enabled) {
      void playInlineCard(card);
    } else {
      void video.play().catch(() => setInlineVideoStatus(sideElement, '播放遭阻擋或無法使用。', 'error'));
    }
  } else if (action === 'pause' && video) {
    const entry = blockForEditorCard(card);
    if (entry.block && inlineBindingForBlock(entry.block).enabled) {
      void propagateInlinePlayback(card, 'pause', actionSide || inlineBindingForBlock(entry.block).masterSide);
    } else {
      video.pause();
    }
  } else if (action === 'fullscreen' && video && typeof video.requestFullscreen === 'function') {
    void video.requestFullscreen().catch(() => {});
  } else if (action === 'align-zero') {
    void alignInlineComparison(card);
  } else if (action === 'capture-anchor' && actionSide) {
    void captureInlineAnchor(card, actionSide);
  } else if ((action === 'step-prev' || action === 'step-next') && actionSide) {
    void stepInlineVideo(card, actionSide, action === 'step-next' ? 1 : -1);
  }
  return true;
}

function handleInlineVideoKeydown(event) {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  const video = event.target.closest?.('[data-inline-video]');
  if (!video) return;
  const sideElement = video.closest('[data-inline-side]');
  const card = video.closest('[data-inline-video-block]');
  const side = sideElement?.dataset.inlineSide;
  if (!card || !side) return;
  event.preventDefault();
  void stepInlineVideo(card, side, event.key === 'ArrowRight' ? 1 : -1);
}

function patchInlineVideoCard(card, block) {
  if (!card || !block || !card.matches('[data-inline-video-block]')) return;
  const comparison = block.type === 'comparisonVideo';
  const layout = block.layout === 'stacked' ? '堆疊' : '並排';
  const syncMode = inlineBindingSummary(block);
  const title = card.querySelector('.inline-video-title strong');
  const summary = card.querySelector('.inline-video-title span');
  const grid = card.querySelector('.inline-video-grid');
  if (title) title.textContent = block.label || (comparison ? '影片比較' : '影片區塊');
  if (summary) summary.textContent = comparison ? `${syncMode} · ${layout}` : '單一來源 · 專案內媒體';
  if (grid) grid.dataset.layout = block.layout === 'stacked' ? 'stacked' : 'side-by-side';
  const bindingStatus = card.querySelector('[data-inline-binding-status]');
  if (bindingStatus) bindingStatus.textContent = inlineBindingSummary(block);
  for (const side of ['left', 'right']) {
    const anchorInput = card.querySelector(`[data-inline-anchor-value="${side}"]`);
    const anchorTime = inlineBindingForBlock(block).anchors[side]?.observedTime;
    if (anchorInput) anchorInput.value = anchorTime === undefined ? '' : String(anchorTime);
  }
}

function renderBlockEditor(section, block, index) {
  const typeLabel = block.type === 'comparisonVideo'
    ? '影片比較'
    : block.type === 'singleVideo' ? '單一影片' : '';
  const headerLabel = typeLabel ? `<strong>${typeLabel}</strong>` : '';
  const body = block.type === 'rich-text' || block.type === 'text'
    ? `<label class="block-text-editor">文字內容 <textarea rows="5" data-block-field="content">${escapeHtml(block.content || '')}</textarea></label>`
    : (block.type === 'singleVideo' || block.type === 'comparisonVideo')
      ? renderInlineVideoBlock(section, block)
      : `<p class="hint">不支援的區塊類型：${displayBlockType(block.type)}</p>`;
  return `
    <article class="content-block-card" data-section-id="${escapeHtml(section.id)}" data-block-id="${escapeHtml(block.id)}">
      <header class="content-block-header">
        ${headerLabel}
        <div class="content-block-actions">
          <button class="icon-button" type="button" data-block-action="move-up" aria-label="將區塊上移">↑</button>
          <button class="icon-button" type="button" data-block-action="move-down" aria-label="將區塊下移">↓</button>
          <button class="button button-secondary" type="button" data-block-action="delete">刪除</button>
        </div>
      </header>
      ${body}
    </article>`;
}

function captureBlockEditorFocus() {
  const active = document.activeElement;
  if (!active || !elements.blockCanvas?.contains(active)) return null;
  const card = active.closest('[data-block-id]');
  const section = active.closest('[data-section-id]');
  if (!card && !section) return null;
  return {
    sectionId: card?.dataset.sectionId || section?.dataset.sectionId || '',
    blockId: card?.dataset.blockId || '',
    blockPath: active.dataset.blockPath || '',
    blockMode: active.matches('[data-block-mode]'),
    sectionTitle: active.matches('[data-section-title]'),
    value: typeof active.value === 'string' ? active.value : null,
    selectionStart: Number.isInteger(active.selectionStart) ? active.selectionStart : null,
    selectionEnd: Number.isInteger(active.selectionEnd) ? active.selectionEnd : null,
    selectionDirection: active.selectionDirection || 'none',
  };
}

function restoreBlockEditorFocus(snapshot) {
  if (!snapshot) return;
  let target = null;
  if (snapshot.sectionTitle) {
    target = [...elements.blockCanvas.querySelectorAll('[data-section-title]')]
      .find((item) => item.closest('[data-section-id]')?.dataset.sectionId === snapshot.sectionId);
  } else {
    const card = [...elements.blockCanvas.querySelectorAll('[data-block-id]')]
      .find((item) => item.dataset.blockId === snapshot.blockId && item.dataset.sectionId === snapshot.sectionId);
    if (card) {
      target = snapshot.blockMode
        ? card.querySelector('[data-block-mode]')
        : [...card.querySelectorAll('[data-block-path]')]
          .find((item) => item.dataset.blockPath === snapshot.blockPath);
    }
  }
  if (!target) return;
  if (target.tagName === 'SELECT' && snapshot.value !== null
    && [...target.options].some((option) => option.value === snapshot.value)) {
    target.value = snapshot.value;
  }
  target.focus({ preventScroll: true });
  if (snapshot.selectionStart !== null && snapshot.selectionEnd !== null
    && typeof target.setSelectionRange === 'function') {
    try {
      target.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd, snapshot.selectionDirection);
    } catch {
      // Number inputs and select controls do not expose a text selection range.
    }
  }
}

function isFocusedBlockSelect() {
  return Boolean(elements.blockCanvas?.contains(document.activeElement)
    && document.activeElement?.matches('select'));
}

function flushQueuedBlockCanvasRender() {
  if (!state.blockCanvasRenderQueued || isFocusedBlockSelect()) return;
  state.blockCanvasRenderQueued = false;
  renderBlockCanvas();
}

function renderBlockCanvas({ preserveFocus = false, allowFocusedSelect = false } = {}) {
  if (isFocusedBlockSelect() && !allowFocusedSelect) {
    state.blockCanvasRenderQueued = true;
    return;
  }
  state.blockCanvasRenderQueued = false;
  const focusSnapshot = preserveFocus ? captureBlockEditorFocus() : null;
  const project = state.activeProject;
  [elements.blockSectionTarget, elements.addTextBlock, elements.addEditorSingleVideo, elements.addEditorComparisonVideo]
    .filter(Boolean)
    .forEach((element) => { element.disabled = !project; });
  if (!elements.blockCanvas) return;
  if (!project) {
    elements.blockCanvas.innerHTML = '<p class="empty-state">開啟專案以編輯區塊。</p>';
    return;
  }

  if (!project.sections.some((section) => section.id === state.selectedSectionId)) {
    state.selectedSectionId = project.sections[0]?.id || null;
  }
  if (elements.blockSectionTarget) {
    elements.blockSectionTarget.innerHTML = project.sections.map((section) => (
      `<option value="${escapeHtml(section.id)}"${section.id === state.selectedSectionId ? ' selected' : ''}>${escapeHtml(section.title || '未命名段落')}</option>`
    )).join('');
  }
  if (elements.blockEditorStatus) {
    elements.blockEditorStatus.textContent = `${project.sections.reduce((count, section) => count + section.blocks.length, 0)} 個長篇文件區塊`;
  }
  elements.blockCanvas.innerHTML = project.sections.map((section) => `
    <section class="block-section ${section.id === state.selectedSectionId ? 'is-target' : ''}" data-section-id="${escapeHtml(section.id)}">
      <header class="block-section-header">
        <input type="text" data-section-title value="${editorValue(section.title)}" aria-label="段落標題" />
        <span class="muted">${section.blocks.length} 個區塊</span>
      </header>
      <div class="block-list">${section.blocks.map((block, index) => renderBlockEditor(section, block, index)).join('')}</div>
    </section>`).join('');
  hydrateInlineVideoCards();
  restoreBlockEditorFocus(focusSnapshot);
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
  if (target.type === 'checkbox') return target.checked;
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
    block.sync = {
      ...(block.sync || {}),
      mode: block.sync?.mode === 'frame' ? 'frame' : 'time',
    };
    block.left = { mediaAssetId: singleAsset, label: block.label || '左側影片', segment: block.segment, playback: block.playback, anchor: block.anchor };
    block.right = { mediaAssetId: null, label: '右側影片', segment: { in: 0, out: null }, playback: { rate: 1 }, anchor: null };
    persistInlineBinding(block, inlineBindingForBlock(block));
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

function inlineSideFromPath(pathValue) {
  if (pathValue.startsWith('left.')) return 'left';
  if (pathValue.startsWith('right.')) return 'right';
  return null;
}

function refreshInlineBindingAfterEditorChange(card, block, pathValue) {
  if (block.type !== 'comparisonVideo') return;
  const bindingPatch = {};
  if (pathValue === 'sync.mode') bindingPatch.mode = block.sync?.mode === 'frame' ? 'frame' : 'time';
  if (pathValue === 'sync.binding.enabled') bindingPatch.enabled = block.sync?.binding?.enabled === true;
  if (pathValue === 'sync.binding.masterSide') bindingPatch.masterSide = block.sync?.binding?.masterSide;
  if (pathValue === 'sync.binding.playbackRate') bindingPatch.playbackRate = block.sync?.binding?.playbackRate;
  const side = inlineSideFromPath(pathValue);
  if (side) {
    bindingPatch.sides = { [side]: inlineBindingForBlock(block).sides[side] };
    if (pathValue.endsWith('playback.rate')) {
      const sideRate = Number(playerSideConfig(block, side).playback?.rate);
      if (Number.isFinite(sideRate) && sideRate > 0) bindingPatch.playbackRate = sideRate;
    }
  }
  const binding = Object.keys(bindingPatch).length > 0
    ? persistInlineBinding(block, bindingPatch)
    : inlineBindingForBlock(block);
  if (side) applyInlineSideSettings(card, block, side);
  if (binding.enabled && block.type === 'comparisonVideo') {
    applyInlineSideSettings(card, block, 'left');
    applyInlineSideSettings(card, block, 'right');
    queueInlineBindingSync(card, block, binding.masterSide, { force: true });
  }
  patchInlineVideoCard(card, block);
}

function handleBlockEditorEvent(event) {
  const target = event.target;
  if (target.closest('[data-inline-video-block]') && (target.matches('[data-inline-seek]') || target.closest('[data-inline-action]'))) {
    handleInlineVideoEvent(event);
    return;
  }
  const card = target.closest('[data-block-id]');
  if (target.matches('[data-section-title]')) {
    if (!['input', 'change'].includes(event.type)) return;
    const section = state.activeProject?.sections.find((item) => item.id === target.closest('[data-section-id]')?.dataset.sectionId);
    if (!section) return;
    section.title = target.value;
    scheduleSave();
    return;
  }
  if (!card) return;
  const { section, block } = blockForEditorCard(card);
  if (!section || !block) return;

  if (target.matches('[data-block-mode]')) {
    if (event.type !== 'change') return;
    convertVideoBlockMode(block, target.value);
    renderBlockCanvas({ preserveFocus: true, allowFocusedSelect: true });
    scheduleSave();
    return;
  }
  if (target.matches('[data-block-field="content"]')) {
    if (!['input', 'change'].includes(event.type)) return;
    block.content = target.value;
    scheduleSave();
    return;
  }
  if (target.matches('[data-block-path]')) {
    if (!['input', 'change'].includes(event.type)) return;
    setEditorPath(block, target.dataset.blockPath, editorControlValue(target));
    refreshInlineBindingAfterEditorChange(card, block, target.dataset.blockPath);
    if (event.type === 'change' && target.dataset.blockPath.endsWith('mediaAssetId')) {
      hydrateInlineVideoCards();
    }
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
  scheduleSave();
}

function renderEditor() {
  const project = state.activeProject;
  if (elements.editorEmpty) elements.editorEmpty.hidden = Boolean(project);
  if (elements.editor) elements.editor.hidden = !project;
  if (elements.saveProject) elements.saveProject.disabled = !project;
  if (elements.importText) elements.importText.disabled = !project;
  if (elements.importMedia) elements.importMedia.disabled = !project;
  renderBlockCanvas();
  renderExportControls();
  if (!project) return;

  if (elements.projectTitle) elements.projectTitle.textContent = project.displayName;
  if (elements.projectMeta) elements.projectMeta.textContent = `本機優先文件 · ${formatDate(project.updatedAt)}`;
}

function previewMediaReference(value, role = '媒體') {
  const assetId = referenceId(value);
  const asset = assetId ? mediaAssetFor(assetId) : null;
  const title = asset?.displayName || assetId || `${role}找不到引用來源`;
  return `<div class="preview-media-placeholder" data-asset-id="${escapeHtml(assetId || '')}">`
    + `<strong>${escapeHtml(title)}</strong>`
    + `<span>${escapeHtml(mediaStatusLabel(asset))}</span>`
    + '<small>僅供畫面層使用的媒體接縫；實際播放與中繼資料檢查留待後續切片。</small>'
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
  renderExportControls();
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
        renderPreview();
        setSaveState('已儲存', 'saved');
      } else {
        state.dirty = true;
        setSaveState('尚有未儲存變更', 'dirty');
      }
      return saved;
    } catch (error) {
      setSaveState('儲存失敗', 'error');
      setError(`儲存失敗：${displayErrorMessage(error)}`);
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
    resetExportSelection();
    state.selectedSectionId = project.sections[0]?.id || null;
    state.dirty = false;
    state.revision = 0;
    renderProjects();
    renderEditor();
    renderPreview();
    setSaveState('已載入', 'saved');
  } catch (error) {
    setSaveState('開啟失敗', 'error');
    setError(`開啟專案失敗：${displayErrorMessage(error)}`);
  }
}

function resetTextImportDialog() {
  state.pendingTextImport = null;
  if (elements.importTextName) elements.importTextName.textContent = '—';
  if (elements.importTextPreview) elements.importTextPreview.textContent = '';
  if (elements.importTextError) {
    elements.importTextError.textContent = '';
    elements.importTextError.hidden = true;
  }
}

async function requestTextImport() {
  if (!state.activeProject) return;
  setError('');
  try {
    const imported = await window.pitchingApp.pickTextFile();
    if (!imported) return;
    state.pendingTextImport = imported;
    if (elements.importTextName) elements.importTextName.textContent = imported.fileName;
    if (elements.importTextPreview) elements.importTextPreview.textContent = imported.content;
    if (elements.importTextError) {
      elements.importTextError.textContent = '';
      elements.importTextError.hidden = true;
    }
    elements.importTextDialog?.showModal();
  } catch (error) {
    setSaveState('匯入失敗', 'error');
    setError(`讀取文字檔失敗：${displayErrorMessage(error)}`);
  }
}

async function confirmTextImport() {
  const imported = state.pendingTextImport;
  const project = state.activeProject;
  if (!imported || !project || !state.selectedSectionId || !window.pitchingApp?.insertTextBlock) return;
  if (elements.confirmImportText) elements.confirmImportText.disabled = true;
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
    elements.importTextDialog?.close();
    resetTextImportDialog();
    renderProjects();
    renderEditor();
    renderPreview();
    setSaveState('文字已匯入並儲存', 'saved');
  } catch (error) {
    if (elements.importTextError) {
      elements.importTextError.textContent = `匯入失敗：${displayErrorMessage(error)}`;
      elements.importTextError.hidden = false;
    }
    setError(`匯入文字失敗：${displayErrorMessage(error)}`);
  } finally {
    if (elements.confirmImportText) elements.confirmImportText.disabled = false;
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
    setSaveState('媒體已登錄；等待檢查', 'saved');
  } catch (error) {
    setSaveState('媒體匯入失敗', 'error');
    setError(`媒體匯入失敗：${displayErrorMessage(error)}`);
  }
}

async function removeMedia(assetId) {
  if (!state.activeProject || !assetId) return;
  if (!window.confirm('確定要從此專案移除這個媒體資產嗎？')) return;
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
    setError(`媒體移除失敗：${displayErrorMessage(error)}`);
  }
}

if (elements.newProjectForm) {
  elements.newProjectForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setError('');
    try {
      if (state.activeProject && state.dirty) await requestSave();
      const project = await window.pitchingApp.createProject(elements.newProjectName?.value || '');
      elements.newProjectDialog?.close();
      elements.newProjectForm.reset();
      await refreshProjects();
      await openProject(project.id);
    } catch (error) {
      setSaveState('建立失敗', 'error');
      setError(`建立專案失敗：${displayErrorMessage(error)}`);
    }
  });
}

document.querySelector('#new-project')?.addEventListener('click', () => {
  setError('');
  if (elements.newProjectDialog && !elements.newProjectDialog.open) elements.newProjectDialog.showModal();
  elements.newProjectName?.focus();
});

document.querySelector('#empty-new-project')?.addEventListener('click', () => {
  document.querySelector('#new-project')?.click();
});

document.querySelectorAll('[data-close-dialog]').forEach((button) => {
  button.addEventListener('click', () => elements.newProjectDialog?.close());
});

elements.projectPicker?.addEventListener('change', () => {
  if (elements.projectPicker.value) void openProject(elements.projectPicker.value);
});
elements.saveProject?.addEventListener('click', () => {
  void requestSave().catch(() => {});
});
elements.chooseExportDirectory?.addEventListener('click', () => { void chooseExportDirectory(); });
elements.exportReport?.addEventListener('click', () => { void startReportExport(); });
elements.exportCancel?.addEventListener('click', () => { void cancelReportExport(); });
elements.exportRetry?.addEventListener('click', () => { void retryReportExport(); });

elements.importText?.addEventListener('click', () => { void requestTextImport(); });
elements.importMedia?.addEventListener('click', () => { void importMedia(); });
elements.cancelImportText?.addEventListener('click', () => {
  elements.importTextDialog?.close();
  resetTextImportDialog();
});
elements.confirmImportText?.addEventListener('click', () => { void confirmTextImport(); });

elements.blockSectionTarget?.addEventListener('change', () => {
  state.selectedSectionId = elements.blockSectionTarget.value || null;
  renderBlockCanvas();
});
elements.addTextBlock?.addEventListener('click', addTextBlock);
elements.addEditorSingleVideo?.addEventListener('click', () => addSingleVideoBlock({ allowEmpty: true }));
elements.addEditorComparisonVideo?.addEventListener('click', () => addComparisonVideoBlock({ allowEmpty: true }));
elements.blockCanvas?.addEventListener('input', handleBlockEditorEvent);
elements.blockCanvas?.addEventListener('change', handleBlockEditorEvent);
elements.blockCanvas?.addEventListener('click', handleBlockEditorEvent);
elements.blockCanvas?.addEventListener('keydown', handleInlineVideoKeydown);
elements.blockCanvas?.addEventListener('focusout', () => {
  setTimeout(flushQueuedBlockCanvasRender, 0);
});

if (typeof window.pitchingApp?.onBeforeClose === 'function') {
  window.pitchingApp.onBeforeClose(() => flushPendingChanges());
}

(async function bootstrap() {
  try {
    if (!window.pitchingApp || typeof window.pitchingApp.getAppInfo !== 'function') {
      throw new Error('無法使用畫面層橋接');
    }
    const info = await window.pitchingApp.getAppInfo();
    state.projectRoot = info.projectRoot;
    if (elements.rootPath) elements.rootPath.textContent = info.projectRoot;
    await refreshProjects();
    renderEditor();
    renderPreview();
  } catch (error) {
    if (elements.rootPath) elements.rootPath.textContent = '無法讀取';
    setSaveState('啟動失敗', 'error');
    setError(`應用程式啟動失敗：${displayErrorMessage(error)}`);
  }
})();
