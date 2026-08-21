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
  framePlayerByCard: new WeakMap(),
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
  projectEmpty: document.querySelector('#project-empty'),
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
  EXPORT_OUTPUT_NOT_WRITABLE: Object.freeze({
    code: 'EXPORT_OUTPUT_NOT_WRITABLE',
    reason: '匯出資料夾目前無法寫入；請重新選擇資料夾，或關閉正在使用該資料夾的程式後重試。',
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
const EXPORT_PHASE_REASON_MAP = Object.freeze({
  'prepare-output': '匯出資料夾準備失敗，請確認資料夾仍存在且可寫入。',
  'create-staging': '匯出暫存區建立失敗，請確認資料夾可建立檔案與子資料夾。',
  'stage-asset': '來源媒體複製失敗，請確認來源檔案仍存在且未被其他程式鎖定。',
  'stage-frame-cache': '影格快取複製失敗，請重試匯出。',
  'write-report': '報告檔寫入失敗，請確認輸出資料夾可寫入。',
  'write-manifest': '匯出清單寫入失敗，請確認輸出資料夾可寫入。',
  'commit-folder': '輸出資料夾提交失敗，請關閉正在使用輸出資料夾的程式後重試。',
  'create-zip': 'ZIP 檔建立失敗，請確認輸出資料夾可寫入且檔案未被鎖定。',
  'validate-zip': 'ZIP 完整性驗證失敗，請重試匯出。',
});

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
    comparisonVideo: '雙影片',
  };
  return labels[value] || '未知區塊';
}

function errorCodeText(error) {
  const candidates = [
    error?.reasonCode,
    error?.error?.reasonCode,
    error?.details?.reasonCode,
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
  if (descriptor) {
    const reason = explicitCode === 'EXPORT_FAILED' && EXPORT_PHASE_REASON_MAP[error?.phase]
      ? EXPORT_PHASE_REASON_MAP[error.phase]
      : descriptor.reason;
    const systemCode = typeof error?.systemCode === 'string'
      && /^[A-Z][A-Z0-9_]{1,32}$/u.test(error.systemCode)
      ? `；系統：${error.systemCode}`
      : '';
    return `${reason}（錯誤碼：${descriptor.code}${systemCode}）`;
  }
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

function playerSideFallbackLabel(side) {
  if (side === 'left') return '左側來源';
  if (side === 'right') return '右側來源';
  return '影片來源';
}

function playerSideTitle(block, side) {
  const config = playerSideConfig(block, side);
  const configuredLabel = typeof config.label === 'string' ? config.label : '';
  if (configuredLabel.trim() !== '') return configuredLabel;
  const asset = mediaAssetFor(playerAssetIdFor(block, side));
  const fileName = asset?.metadata?.fileName || asset?.displayName || asset?.id;
  return fileName || playerSideFallbackLabel(side);
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
    playback: { rate: 1 },
    segment: { in: 0, out: null },
    loop: { enabled: false },
  });
}

function addComparisonVideoBlock({ allowEmpty = false } = {}) {
  const videos = videoAssetsForProject(state.activeProject);
  if (videos.length < 2 && !allowEmpty) {
    state.player.notice = '雙影片需要兩個專案內的實際影片資產。';
    renderPlayer();
    return;
  }
  const left = videos[0];
  const right = videos[1];
  addPlayerBlock({
    id: makePlayerBlockId('comparison-video'),
    type: 'comparisonVideo',
    label: '雙影片',
    layout: 'side-by-side',
    left: {
      mediaAssetId: left?.id || null,
      label: left?.displayName || '左側影片',
      segment: { in: 0, out: null },
      playback: { rate: 1 },
      loop: { enabled: false },
    },
    right: {
      mediaAssetId: right?.id || null,
      label: right?.displayName || '右側影片',
      segment: { in: 0, out: null },
      playback: { rate: 1 },
      loop: { enabled: false },
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
  const warnings = Array.isArray(result.warnings) && result.warnings.length > 0
    ? `；警告：${result.warnings.join('；')}`
    : '';
  return output ? `輸出就緒：${output}${warnings}` : `匯出完成，但沒有輸出路徑${warnings}。`;
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
  if (elements.projectEmpty) elements.projectEmpty.hidden = state.projects.length > 0;
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
  const options = [`<option value="">尚未選擇檔名</option>`];
  if (selected && !assets.some((asset) => asset.id === selected)) {
    options.push(`<option value="${escapeHtml(selected)}" selected>找不到檔名：${escapeHtml(selected)}</option>`);
  }
  assets.forEach((asset) => {
    const fileName = asset.metadata?.fileName || asset.displayName || asset.id;
    options.push(`<option value="${escapeHtml(asset.id)}"${asset.id === selected ? ' selected' : ''}>${escapeHtml(fileName)}</option>`);
  });
  return options.join('');
}

function renderVideoSideEditor(block, side) {
  const comparison = side !== 'single';
  const config = comparison ? (block[side] || {}) : block;
  const prefix = comparison ? `${side}.` : '';
  const label = comparison ? (side === 'left' ? '左側來源' : '右側來源') : '影片來源';
  const loop = config.loop || {};
  return `
    <fieldset class="video-side-config">
      <legend>${label}</legend>
      <label>檔名
        <select data-block-path="${prefix}mediaAssetId" aria-label="${label}檔名">${editorVideoAssetOptions(config.mediaAssetId)}</select>
      </label>
      <label>來源標題 <input type="text" data-block-path="${prefix}label" value="${editorValue(config.label)}" /></label>
      <div class="block-inline-fields">
        <label>起點 <input type="number" min="0" step="0.001" data-block-path="${prefix}segment.in" value="${editorValue(config.segment?.in)}" /></label>
        <label>終點 <input type="number" min="0" step="0.001" data-block-path="${prefix}segment.out" value="${editorValue(config.segment?.out)}" /></label>
        <label>播放速度 <input type="number" min="0.1" max="8" step="0.1" data-block-path="${prefix}playback.rate" value="${editorValue(config.playback?.rate || 1)}" /></label>
        <label>循環播放 <input type="checkbox" data-block-path="${prefix}loop.enabled"${loop.enabled === true ? ' checked' : ''} /></label>
      </div>
    </fieldset>`;
}

function renderVideoBlockEditor(block) {
  const comparison = block.type === 'comparisonVideo';
  return `
    <div class="block-config-grid">
      <label>模式
        <select data-block-mode>
          <option value="single"${comparison ? '' : ' selected'}>單一影片</option>
          <option value="comparison"${comparison ? ' selected' : ''}>雙影片</option>
        </select>
      </label>
      <label>影片區塊標題 <input type="text" data-block-path="label" value="${editorValue(block.label)}" aria-label="影片區塊左上角標題" /></label>
      ${comparison ? `<label>版面
        <select data-block-path="layout">
          <option value="side-by-side"${block.layout !== 'stacked' ? ' selected' : ''}>並排</option>
          <option value="stacked"${block.layout === 'stacked' ? ' selected' : ''}>堆疊</option>
        </select>
      </label>` : ''}
      <div class="video-side-configs">
        ${comparison ? `${renderVideoSideEditor(block, 'left')}${renderVideoSideEditor(block, 'right')}` : renderVideoSideEditor(block, 'single')}
      </div>
    </div>`;
}

function renderFramePlayerControls(label) {
  const escapedLabel = escapeHtml(label);
  return `
      <div class="inline-frame-controls" data-frame-controls aria-label="${escapedLabel}影格播放器控制">
        <button class="button button-quiet" type="button" data-frame-action="previous" disabled>上一幀</button>
        <input class="inline-frame-timeline" data-frame-timeline type="range" min="0" max="0" step="1" value="0" disabled aria-label="${escapedLabel}影格時間軸" />
        <button class="button button-quiet" type="button" data-frame-action="next" disabled>下一幀</button>
        <output class="inline-frame-position" data-frame-position>尚未準備</output>
        <button class="button button-secondary" type="button" data-frame-action="toggle" disabled aria-pressed="false">播放</button>
        <label class="inline-frame-rate">速度
          <input class="inline-frame-rate-slider" data-frame-rate type="range" min="0.25" max="2" step="0.05" value="1" disabled aria-label="${escapedLabel}播放速度" />
          <output data-frame-rate-value>1.00×</output>
          <button class="button button-quiet inline-frame-rate-reset" type="button" data-frame-action="reset-rate" disabled aria-label="重置播放速度為 1 倍" title="重置為 1 倍">↻</button>
        </label>
        <span class="inline-frame-player-status" data-frame-player-status role="status" data-state="pending">正在載入影片…</span>
      </div>`;
}

function renderInlineVideoSide(block, side, { playerCard = false } = {}) {
  const title = playerSideTitle(block, side);
  const escapedTitle = escapeHtml(title);
  const playerAttributes = playerCard
    ? ` data-frame-player data-frame-player-side="${side}"`
    : '';
  return `
    <div class="inline-video-side" data-inline-side="${side}"${playerAttributes}>
      <h3 data-inline-side-title>${escapedTitle}</h3>
      <div class="inline-video-frame inline-frame-surface" data-frame-surface tabindex="0" aria-label="${escapedTitle}影格畫面">
        <video data-inline-video preload="auto" playsinline aria-label="${escapedTitle}影片"></video>
        <span class="inline-frame-placeholder" data-frame-placeholder>正在載入第一幀…</span>
      </div>
      <p class="inline-video-status" data-inline-status role="status">尚未準備；等待影片來源。</p>
      ${playerCard ? renderFramePlayerControls(title) : ''}
    </div>`;
}

function renderInlineVideoBlock(section, block) {
  const comparison = block.type === 'comparisonVideo';
  // A single-video block is always one vertical player card.  Only dual
  // blocks read the persisted layout choice.
  const layout = comparison && block.layout === 'stacked' ? 'stacked' : (comparison ? 'side-by-side' : 'stacked');
  const sides = comparison
    ? `${renderInlineVideoSide(block, 'left', { playerCard: true })}${renderInlineVideoSide(block, 'right', { playerCard: true })}`
    : renderInlineVideoSide(block, 'single', { playerCard: true });
  return `
    <article class="inline-video-block" data-section-id="${escapeHtml(section.id)}" data-block-id="${escapeHtml(block.id)}" data-inline-video-block>
      <header class="inline-video-header">
        <div class="inline-video-title"><strong>${escapeHtml(block.label || (comparison ? '雙影片' : '影片區塊'))}</strong><span>${comparison ? `雙影片 · ${layout === 'stacked' ? '堆疊' : '並排'}` : '單一來源 · 專案內媒體'}</span></div>
        <div class="inline-video-actions">
          <button class="button button-quiet" type="button" data-frame-action="open">開啟控制項</button>
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

function framePlayerRuntimeForCard(card) {
  let runtime = state.framePlayerByCard.get(card);
  if (!runtime) {
    runtime = {
      caches: Object.create(null),
      currentFrameIndex: 0,
      requestSerial: 0,
      playing: false,
      dragTarget: null,
      dragFrame: null,
      seekSerial: 0,
      exactSeek: null,
      scrubActive: false,
      pendingSeeks: new Map(),
      exactScrubTarget: null,
      exactScrubPromise: null,
      playbackRate: 1,
      frameEngineGuard: false,
      primarySide: card?.dataset.framePlayerSide || 'single',
      lifecycle: 'idle',
    };
    state.framePlayerByCard.set(card, runtime);
  }
  return runtime;
}

function videoBlockSides(block) {
  return block?.type === 'comparisonVideo' ? ['left', 'right'] : ['single'];
}

function framePlayerSides(block, card) {
  const sourceSide = card?.dataset.framePlayerSide;
  return sourceSide === 'left' || sourceSide === 'right' ? [sourceSide] : ['single'];
}

function framePlayerPrimarySide(block, runtime, card) {
  return framePlayerSides(block, card)[0];
}

function framePlayerReady(block, runtime, card) {
  return framePlayerSides(block, card).every((side) => {
    const cache = runtime.caches[side];
    return cache && Number.isInteger(cache.frameCount) && cache.frameCount > 0;
  });
}

function framePlayerFrameCount(block, runtime, card) {
  const primary = framePlayerPrimarySide(block, runtime, card);
  const primaryCount = runtime.caches[primary]?.frameCount || 0;
  if (!framePlayerReady(block, runtime, card)) return 0;
  if (primaryCount > 0) return primaryCount;
  return framePlayerSides(block, card).reduce((highest, side) => Math.max(highest, runtime.caches[side]?.frameCount || 0), 0);
}

function framePlayerSegmentStartIndex(block, runtime, card) {
  const primarySide = framePlayerPrimarySide(block, runtime, card);
  const cache = runtime.caches[primarySide];
  if (!cache || !Number.isFinite(cache.fps) || cache.fps <= 0) return 0;
  const segmentIn = Number(playerSideConfig(block, primarySide).segment?.in);
  const time = Number.isFinite(segmentIn) && segmentIn >= 0 ? segmentIn : 0;
  return Math.max(0, Math.min(cache.frameCount - 1, Math.round(time * cache.fps)));
}

function setFramePlayerStatus(card, message, stateName = '') {
  const status = card?.querySelector('[data-frame-player-status]');
  if (!status) return;
  status.textContent = message;
  status.dataset.state = stateName;
}

function updateFramePlayerControls(card) {
  const entry = blockForEditorCard(card);
  const runtime = framePlayerRuntimeForCard(card);
  const count = framePlayerFrameCount(entry.block, runtime, card);
  const maxIndex = Math.max(0, count - 1);
  const index = Math.min(Math.max(0, runtime.currentFrameIndex), maxIndex);
  runtime.currentFrameIndex = index;
  runtime.primarySide = framePlayerPrimarySide(entry.block, runtime, card);
  const timeline = card.querySelector('[data-frame-timeline]');
  const position = card.querySelector('[data-frame-position]');
  const previous = card.querySelector('[data-frame-action="previous"]');
  const next = card.querySelector('[data-frame-action="next"]');
  const toggle = card.querySelector('[data-frame-action="toggle"]');
  const resetRate = card.querySelector('[data-frame-action="reset-rate"]');
  const rateSlider = card.querySelector('[data-frame-rate]');
  const rateValue = card.querySelector('[data-frame-rate-value]');
  const available = count > 0;
  if (timeline) {
    timeline.max = String(maxIndex);
    timeline.value = String(index);
    timeline.disabled = !available;
  }
  if (position) position.textContent = available ? `第 ${index + 1} / ${count} 幀` : '尚未準備';
  if (previous) previous.disabled = !available || index <= 0;
  if (next) next.disabled = !available || index >= maxIndex;
  if (toggle) {
    toggle.disabled = !available;
    toggle.textContent = runtime.playing ? '暫停' : '播放';
    toggle.setAttribute('aria-pressed', runtime.playing ? 'true' : 'false');
  }
  if (resetRate) resetRate.disabled = !available;
  const rate = Number(runtime.playbackRate) > 0 ? Number(runtime.playbackRate) : 1;
  if (rateSlider) {
    rateSlider.value = String(Math.min(2, Math.max(0.25, rate)));
    rateSlider.disabled = !available;
  }
  if (rateValue) rateValue.textContent = `${rate.toFixed(2)}×`;
}

function bindFramePlayerActionButtons(card) {
  card?.querySelectorAll('[data-frame-action="previous"], [data-frame-action="next"], [data-frame-action="toggle"]')
    .forEach((button) => {
      if (button.dataset.frameActionBound === 'true') return;
      button.dataset.frameActionBound = 'true';
      button.addEventListener('click', (event) => {
        // These controls have a direct listener so a focus/repaint change in
        // the block canvas cannot swallow a frame-step click. Stop bubbling
        // to avoid running the delegated handler a second time.
        event.stopPropagation();
        if (button.disabled) return;
        const action = button.dataset.frameAction;
        if (action === 'previous') void stepFramePlayer(card, -1);
        else if (action === 'next') void stepFramePlayer(card, 1);
        else if (action === 'toggle') void toggleFramePlayer(card);
      });
    });
}

function framePlayerIndexForSide(block, runtime, side, primaryIndex) {
  const cache = runtime.caches[side];
  if (!cache || cache.frameCount <= 1) return 0;
  return Math.min(cache.frameCount - 1, Math.max(0, Math.round(primaryIndex)));
}

function inlineSideElementForCard(card, side) {
  if (!card) return null;
  if (card.matches?.(`[data-inline-side="${side}"]`)) return card;
  return card.querySelector(`[data-inline-side="${side}"]`);
}

function framePlayerVideoForSide(card, side) {
  return inlineSideElementForCard(card, side)?.querySelector('[data-inline-video]') || null;
}

function framePlayerTimeForSide(runtime, side, index) {
  const cache = runtime.caches[side];
  const video = cache?.video;
  if (!cache || !video) return 0;
  if (Array.isArray(cache.frameTimes) && Number.isFinite(cache.frameTimes[index])) {
    return Math.max(0, Math.min(cache.duration, Number(cache.frameTimes[index])));
  }
  const fps = Number(cache.fps) > 0 ? Number(cache.fps) : 30;
  const duration = Number.isFinite(cache.duration) && cache.duration > 0
    ? cache.duration
    : Number.isFinite(video.duration) ? video.duration : 0;
  return Math.max(0, Math.min(Math.max(0, duration - 0.0001), index / fps));
}

function waitForPresentedVideoFrame(video, targetTime = null, tolerance = 0.05, timeout = 500) {
  if (!video || typeof video.requestVideoFrameCallback !== 'function') return Promise.resolve(true);
  return new Promise((resolve) => {
    let done = false;
    let callbackId = null;
    const finish = (presented) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (!presented && callbackId !== null && typeof video.cancelVideoFrameCallback === 'function') {
        video.cancelVideoFrameCallback(callbackId);
      }
      resolve(presented);
    };
    const timer = setTimeout(() => finish(false), timeout);
    const onFrame = (_now, metadata) => {
      if (done) return;
      const mediaTime = Number(metadata?.mediaTime);
      const currentTime = Number(video.currentTime);
      const atTarget = targetTime === null
        || (Number.isFinite(mediaTime) && Math.abs(mediaTime - targetTime) <= tolerance)
        || (!video.seeking && Number.isFinite(currentTime) && Math.abs(currentTime - targetTime) <= tolerance);
      if (atTarget) {
        finish(true);
        return;
      }
      callbackId = video.requestVideoFrameCallback(onFrame);
    };
    callbackId = video.requestVideoFrameCallback(onFrame);
  });
}

function cancelPendingVideoSeek(runtime, video) {
  const pending = runtime?.pendingSeeks?.get(video);
  if (pending) pending.cancel();
}

function seekVideoExact(video, targetTime, serial, runtime, tolerance = 0.05) {
  if (!video) return Promise.resolve(false);
  cancelPendingVideoSeek(runtime, video);
  return new Promise((resolve) => {
    let finished = false;
    let frameWait = null;
    let waitingForFrame = false;
    const operation = { cancel: () => finish(false) };
    const readyAtTarget = () => !video.seeking
      && video.readyState >= 2
      && Math.abs((Number(video.currentTime) || 0) - targetTime) <= tolerance;
    const finish = async (success) => {
      if (finished) return;
      finished = true;
      video.removeEventListener('seeked', onSeeked);
      clearTimeout(timer);
      if (runtime.pendingSeeks?.get(video) === operation) runtime.pendingSeeks.delete(video);
      if (frameWait) await frameWait;
      resolve(Boolean(success) && serial === runtime.seekSerial);
    };
    const waitForFrame = () => {
      if (serial !== runtime.seekSerial) {
        void finish(false);
        return;
      }
      if (typeof video.requestVideoFrameCallback !== 'function') {
        void finish(readyAtTarget());
        return;
      }
      if (waitingForFrame) return;
      waitingForFrame = true;
      frameWait = waitForPresentedVideoFrame(video, targetTime, tolerance, 500);
      void frameWait.then((presented) => finish(presented || readyAtTarget()));
    };
    const onSeeked = () => {
      if (serial !== runtime.seekSerial) {
        void finish(false);
        return;
      }
      if (Math.abs((Number(video.currentTime) || 0) - targetTime) > tolerance) {
        try {
          video.currentTime = targetTime;
        } catch {
          void finish(false);
        }
        return;
      }
      waitForFrame();
    };
    const timer = setTimeout(() => { void finish(readyAtTarget()); }, 1_500);
    runtime.pendingSeeks?.set(video, operation);
    video.addEventListener('seeked', onSeeked);
    if (Math.abs((Number(video.currentTime) || 0) - targetTime) < 0.0001 && video.readyState >= 2) {
      waitForFrame();
      return;
    }
    try {
      video.currentTime = targetTime;
    } catch {
      void finish(false);
    }
  });
}

async function seekFramePlayerIndex(card, frameIndex, { exact = true, status = true } = {}) {
  const entry = blockForEditorCard(card);
  const runtime = framePlayerRuntimeForCard(card);
  const count = framePlayerFrameCount(entry.block, runtime, card);
  if (count <= 0) return false;
  const target = Math.min(count - 1, Math.max(0, Math.round(Number(frameIndex) || 0)));
  runtime.dragTarget = null;
  if (runtime.dragFrame !== null) {
    cancelAnimationFrame(runtime.dragFrame);
    runtime.dragFrame = null;
  }
  const previousFrameIndex = runtime.currentFrameIndex;
  const serial = ++runtime.seekSerial;
  runtime.currentFrameIndex = target;
  runtime.playing = false;
  if (exact) runtime.exactSeek = serial;
  else {
    runtime.exactSeek = null;
    runtime.scrubActive = true;
  }
  const previousGuard = runtime.frameEngineGuard;
  runtime.frameEngineGuard = true;
  framePlayerSides(entry.block, card).forEach((side) => {
    const video = framePlayerVideoForSide(card, side);
    cancelPendingVideoSeek(runtime, video);
    video?.pause();
  });
  runtime.frameEngineGuard = previousGuard;
  updateFramePlayerControls(card);
  if (status) setFramePlayerStatus(card, `正在定位第 ${target + 1} 幀…`, 'pending');
  const results = await Promise.all(framePlayerSides(entry.block, card).map(async (side) => {
    const video = framePlayerVideoForSide(card, side);
    const sideIndex = framePlayerIndexForSide(entry.block, runtime, side, target);
    const targetTime = framePlayerTimeForSide(runtime, side, sideIndex);
    if (!video) return false;
    if (!exact) {
      try {
        // While a seek is already in flight, assigning currentTime retargets
        // that operation. Calling fastSeek repeatedly can enqueue stale
        // keyframe seeks and is the source of the drag backlog.
        if (video.seeking || typeof video.fastSeek !== 'function') video.currentTime = targetTime;
        else video.fastSeek(targetTime);
        return true;
      } catch {
        return false;
      }
    }
    const fps = Number(runtime.caches[side]?.fps) > 0 ? Number(runtime.caches[side].fps) : 30;
    return seekVideoExact(video, targetTime, serial, runtime, Math.max(0.02, (0.5 / fps) + 0.01));
  }));
  if (serial !== runtime.seekSerial || !card.isConnected) return false;
  if (runtime.exactSeek === serial) runtime.exactSeek = null;
  if (results.every(Boolean)) {
    updateFramePlayerControls(card);
    if (status) setFramePlayerStatus(card, `已顯示第 ${target + 1} 幀。`, 'loaded');
    return true;
  }
  runtime.currentFrameIndex = previousFrameIndex;
  updateFramePlayerControls(card);
  if (status) setFramePlayerStatus(card, '影片定位未完成，請重試。', 'error');
  return false;
}

function requestFramePlayerScrub(card, frameIndex, { exact = false } = {}) {
  const runtime = framePlayerRuntimeForCard(card);
  const entry = blockForEditorCard(card);
  const count = framePlayerFrameCount(entry.block, runtime, card);
  if (count <= 0) return Promise.resolve(false);
  const target = Math.min(count - 1, Math.max(0, Math.round(Number(frameIndex) || 0)));
  const timeline = card.querySelector('[data-frame-timeline]');
  if (timeline) timeline.value = String(target);
  runtime.dragTarget = target;
  if (exact) {
    runtime.scrubActive = false;
    if (runtime.exactScrubTarget === target && runtime.exactScrubPromise) return runtime.exactScrubPromise;
    const promise = seekFramePlayerIndex(card, target, { exact: true });
    runtime.exactScrubTarget = target;
    runtime.exactScrubPromise = promise;
    void promise.then(() => {
      if (runtime.exactScrubPromise === promise) {
        runtime.exactScrubPromise = null;
        runtime.exactScrubTarget = null;
      }
    }, () => {
      if (runtime.exactScrubPromise === promise) {
        runtime.exactScrubPromise = null;
        runtime.exactScrubTarget = null;
      }
    });
    return promise;
  }
  if (runtime.dragFrame !== null) return Promise.resolve(true);
  const schedule = typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame.bind(window)
    : (callback) => setTimeout(callback, 0);
  runtime.dragFrame = schedule(() => {
    runtime.dragFrame = null;
    const latest = runtime.dragTarget;
    runtime.dragTarget = null;
    if (latest === null || !card.isConnected) return;
    void seekFramePlayerIndex(card, latest, { exact: false, status: false });
  });
  return Promise.resolve(true);
}

async function prepareFramePlayerCard(card, block, generation) {
  const runtime = framePlayerRuntimeForCard(card);
  bindFramePlayerActionButtons(card);
  runtime.playing = false;
  runtime.currentFrameIndex = 0;
  runtime.seekSerial += 1;
  runtime.exactSeek = null;
  runtime.scrubActive = false;
  runtime.caches = Object.create(null);
  runtime.lifecycle = 'loading';
  if (runtime.dragFrame !== null) cancelAnimationFrame(runtime.dragFrame);
  runtime.dragFrame = null;
  framePlayerSides(block, card).forEach((side) => {
    const video = framePlayerVideoForSide(card, side);
    if (video) {
      cancelPendingVideoSeek(runtime, video);
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    const placeholder = card.querySelector(`[data-inline-side="${side}"] [data-frame-placeholder]`);
    if (placeholder) placeholder.hidden = false;
  });
  updateFramePlayerControls(card);
  setFramePlayerStatus(card, '正在載入影片與第一幀…', 'pending');
  const results = await Promise.all(framePlayerSides(block, card).map(async (side) => {
    const sideElement = inlineSideElementForCard(card, side);
    const video = framePlayerVideoForSide(card, side);
    const assetId = playerAssetIdFor(block, side);
    const asset = mediaAssetFor(assetId);
    if (!sideElement || !video || !assetId || !asset) {
      setInlineVideoStatus(sideElement, '尚未選擇專案內影片。', 'pending');
      return false;
    }
    try {
      bindInlineVideoRuntime(card, block, side, video);
      video.dataset.mediaAssetId = assetId;
      const source = await window.pitchingApp.resolveMediaSource(state.activeProject.id, assetId);
      if (generation !== state.inlineGeneration || !card.isConnected) return false;
      const metadata = asset.metadata || {};
      const fps = Number(metadata.fps) > 0 ? Number(metadata.fps) : 30;
      await new Promise((resolve, reject) => {
        const onLoaded = () => { cleanup(); resolve(); };
        const onError = () => { cleanup(); reject(new Error('影片無法播放。')); };
        const cleanup = () => {
          video.removeEventListener('loadedmetadata', onLoaded);
          video.removeEventListener('error', onError);
        };
        video.addEventListener('loadedmetadata', onLoaded, { once: true });
        video.addEventListener('error', onError, { once: true });
        video.src = safeInlineMediaSourceUrl(source);
        video.preload = 'auto';
        video.load();
      });
      if (generation !== state.inlineGeneration || !card.isConnected) return false;
      const duration = Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : Number(metadata.durationSeconds) || 0;
      const frameCount = Number(metadata.frameCount) > 0
        ? Number(metadata.frameCount)
        : Math.max(1, Math.ceil(duration * fps));
      runtime.caches[side] = {
        video,
        assetId,
        fps,
        duration,
        frameCount,
        frameTimes: Array.isArray(metadata.frameTimes) ? metadata.frameTimes : null,
      };
      if (side === framePlayerPrimarySide(block, runtime, card)) {
        runtime.playbackRate = Number(playerSideConfig(block, side).playback?.rate) || 1;
      }
      video.playbackRate = Number(playerSideConfig(block, side).playback?.rate) || 1;
      setInlineVideoStatus(sideElement, `影片已就緒 · ${frameCount} 幀。`, 'loaded');
      return true;
    } catch (error) {
      setInlineVideoStatus(sideElement, `影片載入失敗：${error?.message || '來源無法播放。'}`, 'error');
      return false;
    }
  }));
  if (generation !== state.inlineGeneration || !card.isConnected) return;
  if (!results.every(Boolean) || !framePlayerReady(block, runtime, card)) {
    runtime.lifecycle = 'error';
    setFramePlayerStatus(card, '影片尚未全部準備完成。', 'error');
    updateFramePlayerControls(card);
    return;
  }
  runtime.lifecycle = 'ready';
  updateFramePlayerControls(card);
  const ready = await seekFramePlayerIndex(card, framePlayerSegmentStartIndex(block, runtime, card), { exact: true, status: false });
  framePlayerSides(block, card).forEach((side) => {
    const placeholder = inlineSideElementForCard(card, side)?.querySelector('[data-frame-placeholder]');
    if (placeholder) placeholder.hidden = !ready;
  });
  setFramePlayerStatus(card, ready ? '已顯示第 1 幀。' : '第一幀尚未呈現，請重試。', ready ? 'loaded' : 'error');
  updateFramePlayerControls(card);
}

function stopFramePlayer(card) {
  const runtime = framePlayerRuntimeForCard(card);
  runtime.playing = false;
  runtime.seekSerial += 1;
  runtime.exactSeek = null;
  runtime.scrubActive = false;
  framePlayerSides(blockForEditorCard(card).block, card).forEach((side) => {
    const video = framePlayerVideoForSide(card, side);
    cancelPendingVideoSeek(runtime, video);
    video?.pause();
  });
  runtime.lifecycle = 'paused';
  updateFramePlayerControls(card);
}

function scheduleFramePlayerTick(card) {
  // Playback is driven by the browser video clock; this compatibility hook
  // intentionally does not invent a renderer-side timer.
}

async function toggleFramePlayer(card) {
  const runtime = framePlayerRuntimeForCard(card);
  const entry = blockForEditorCard(card);
  const videos = framePlayerSides(entry.block, card).map((side) => framePlayerVideoForSide(card, side)).filter(Boolean);
  if (framePlayerFrameCount(entry.block, runtime, card) <= 0 || videos.length === 0) {
    setFramePlayerStatus(card, '影片尚未準備，無法播放。', 'error');
    return;
  }
  const desiredPlaying = !runtime.playing;
  runtime.frameEngineGuard = true;
  try {
    if (desiredPlaying && runtime.currentFrameIndex >= framePlayerFrameCount(entry.block, runtime, card) - 1) {
      await seekFramePlayerIndex(card, framePlayerSegmentStartIndex(entry.block, runtime, card), { exact: true, status: false });
    }
    const rate = Number(runtime.playbackRate) > 0 ? Number(runtime.playbackRate) : 1;
    videos.forEach((video) => { video.playbackRate = Number.isFinite(rate) && rate > 0 ? rate : 1; });
    if (desiredPlaying) await Promise.all(videos.map((video) => video.play()));
    else videos.forEach((video) => video.pause());
    runtime.playing = desiredPlaying;
    runtime.lifecycle = desiredPlaying ? 'playing' : 'paused';
    setFramePlayerStatus(card, desiredPlaying ? '播放中。' : '已暫停。', 'loaded');
  } catch (error) {
    runtime.playing = false;
    runtime.lifecycle = 'error';
    setFramePlayerStatus(card, `播放失敗：${error?.message || '請重試。'}`, 'error');
  } finally {
    runtime.frameEngineGuard = false;
    updateFramePlayerControls(card);
  }
}

async function stepFramePlayer(card, direction) {
  const runtime = framePlayerRuntimeForCard(card);
  stopFramePlayer(card);
  const count = framePlayerFrameCount(blockForEditorCard(card).block, runtime, card);
  if (count <= 0) {
    setFramePlayerStatus(card, '影片尚未準備，無法定位影格。', 'error');
    updateFramePlayerControls(card);
    return;
  }
  const maxIndex = Math.max(0, count - 1);
  const target = Math.min(maxIndex, Math.max(0, runtime.currentFrameIndex + direction));
  await seekFramePlayerIndex(card, target, { exact: true });
}

function resetFramePlayerRate(card) {
  const entry = blockForEditorCard(card);
  const block = entry.block;
  const runtime = framePlayerRuntimeForCard(card);
  if (!block || framePlayerFrameCount(block, runtime, card) <= 0) return;
  runtime.playbackRate = 1;
  const side = framePlayerSides(block, card)[0];
  const video = framePlayerVideoForSide(card, side);
  if (video) video.playbackRate = 1;
  const config = playerSideConfig(block, side);
  config.playback = { ...(config.playback || {}), rate: 1 };
  updateFramePlayerControls(card);
  setFramePlayerStatus(card, '播放速度已重置為 1.00 倍。', 'loaded');
  scheduleSave();
}

function handleFramePlayerEvent(event) {
  const target = event.target;
  const card = target.closest('[data-frame-player]');
  if (!card) return false;
  if (target.matches('[data-frame-timeline]')) {
    if (event.type === 'change' || event.type === 'pointerup') {
      void requestFramePlayerScrub(card, Number(target.value), { exact: true });
    } else if (['input', 'pointerdown', 'pointermove'].includes(event.type)) {
      void requestFramePlayerScrub(card, Number(target.value), { exact: false });
    }
    return true;
  }
  if (target.matches('[data-frame-rate]')) {
    if (!['input', 'change'].includes(event.type)) return true;
    const runtime = framePlayerRuntimeForCard(card);
    const rate = Math.min(2, Math.max(0.25, Number(target.value) || 1));
    runtime.playbackRate = rate;
    framePlayerSides(blockForEditorCard(card).block, card).forEach((side) => {
      const video = framePlayerVideoForSide(card, side);
      if (video) video.playbackRate = rate;
    });
    if (event.type === 'change') {
      const block = blockForEditorCard(card).block;
      const side = block ? framePlayerSides(block, card)[0] : null;
      if (block && side) {
        const config = playerSideConfig(block, side);
        config.playback = { ...(config.playback || {}), rate };
      }
      scheduleSave();
    }
    updateFramePlayerControls(card);
    return true;
  }
  const surface = target.closest('[data-frame-surface]');
  if (surface) {
    surface.focus({ preventScroll: true });
    return true;
  }
  // The block canvas also delegates pointer movement for the video timeline
  // dragging. Action buttons must only run on an actual click; otherwise
  // merely hovering a button would step or toggle the player.
  if (event.type !== 'click') return true;
  const action = target.closest('[data-frame-action]')?.dataset.frameAction;
  if (!action) return false;
  if (action === 'open') {
    const details = card.querySelector('details');
    if (details) details.open = true;
  } else if (action === 'toggle') {
    void toggleFramePlayer(card);
  } else if (action === 'previous') {
    void stepFramePlayer(card, -1);
  } else if (action === 'next') {
    void stepFramePlayer(card, 1);
  } else if (action === 'reset-rate') {
    resetFramePlayerRate(card);
  }
  return true;
}

function handleFramePlayerKeydown(event) {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  const card = event.target.closest?.('[data-frame-player]');
  if (!card || event.target.matches('[data-frame-timeline]')) return;
  if (!event.target.closest?.('[data-frame-surface], [data-frame-controls]')) return;
  event.preventDefault();
  stepFramePlayer(card, event.key === 'ArrowRight' ? 1 : -1);
}

function inlinePlaybackBounds(block, side, video) {
  const config = playerSideConfig(block, side);
  const duration = Number.isFinite(video?.duration) && video.duration > 0 ? video.duration : null;
  const startValue = Number(config.segment?.in);
  const start = Number.isFinite(startValue) && startValue >= 0 ? startValue : 0;
  const endValue = Number(config.segment?.out);
  const configuredEnd = Number.isFinite(endValue) && endValue > start ? endValue : null;
  const end = configuredEnd === null
    ? duration
    : (duration === null ? configuredEnd : Math.min(configuredEnd, duration));
  return { start, end };
}

function enforceInlinePlaybackBounds(block, side, video, { starting = false } = {}) {
  if (!video) return;
  const config = playerSideConfig(block, side);
  const { start, end } = inlinePlaybackBounds(block, side, video);
  const current = Number(video.currentTime);
  if (!Number.isFinite(current)) return;
  if (current < start - 0.01) {
    video.currentTime = start;
    return;
  }
  if (end === null || end <= start || current < end - 0.005) return;
  if (config.loop?.enabled === true) {
    video.currentTime = start;
    if (!starting && !video.paused) void video.play().catch(() => {});
    return;
  }
  video.currentTime = end;
  video.pause();
}

function applyInlineSideSettings(card, block, side) {
  const playerCard = card?.matches?.('[data-frame-player]')
    ? card
    : card?.querySelector?.(`[data-frame-player][data-frame-player-side="${side}"]`);
  const targetCard = playerCard || card;
  const video = framePlayerVideoForSide(targetCard, side);
  if (!video) return;
  const config = playerSideConfig(block, side);
  const rate = Number(config.playback?.rate) || 1;
  // Native looping always wraps the complete media file.  The editor uses
  // the block's segment.in/segment.out as the only loop bounds instead.
  video.loop = false;
  video.playbackRate = rate;
  enforceInlinePlaybackBounds(block, side, video);
  updateFramePlayerControls(targetCard);
}

function hideFramePlayerPlaceholder(video) {
  const placeholder = video?.closest('[data-inline-side]')?.querySelector('[data-frame-placeholder]');
  if (!placeholder) return;
  // A playing video is already presenting real frames even if the initial
  // exact-seek bookkeeping completed a little later than the media pipeline.
  if (video.readyState >= 2 || !video.paused) placeholder.hidden = true;
}

function syncFramePlayerProgress(card, block, side, video) {
  const runtime = framePlayerRuntimeForCard(card);
  const cache = runtime.caches[side];
  if (!cache || side !== framePlayerPrimarySide(block, runtime, card)) return;
  // Do not let an intermediate paused drag seek overwrite the thumb. Once
  // playback or a seek has produced a real clock position, the video clock is
  // authoritative and must keep the frame timeline in lockstep with it.
  if ((runtime.scrubActive && video.paused) || (video.paused && video.seeking)) return;
  const fps = Number(cache.fps) > 0 ? Number(cache.fps) : 30;
  runtime.currentFrameIndex = Math.max(0, Math.min(
    cache.frameCount - 1,
    Math.round((Number(video.currentTime) || 0) * fps),
  ));
  updateFramePlayerControls(card);
}

function bindInlineVideoRuntime(card, block, side, video) {
  if (!video || video.dataset.inlineRuntimeBound === 'true') return;
  video.dataset.inlineRuntimeBound = 'true';
  video.addEventListener('timeupdate', () => {
    hideFramePlayerPlaceholder(video);
    const sideElement = video.closest('[data-inline-side]');
    const current = blockForEditorCard(card).block;
    if (current?.type === 'singleVideo' || current?.type === 'comparisonVideo') {
      enforceInlinePlaybackBounds(current, side, video);
      syncFramePlayerProgress(card, current, side, video);
    }
  });
  ['loadeddata', 'canplay', 'playing'].forEach((eventName) => {
    video.addEventListener(eventName, () => {
      hideFramePlayerPlaceholder(video);
      const current = blockForEditorCard(card).block;
      if (eventName === 'playing' && (current?.type === 'singleVideo' || current?.type === 'comparisonVideo')) {
        const frameRuntime = framePlayerRuntimeForCard(card);
        if (side === framePlayerPrimarySide(current, frameRuntime, card)) {
          frameRuntime.playing = true;
          frameRuntime.lifecycle = 'playing';
          frameRuntime.scrubActive = false;
        }
        syncFramePlayerProgress(card, current, side, video);
      }
    });
  });
  video.addEventListener('seeked', () => {
    hideFramePlayerPlaceholder(video);
    const current = blockForEditorCard(card).block;
    if (current?.type === 'singleVideo' || current?.type === 'comparisonVideo') {
      syncFramePlayerProgress(card, current, side, video);
    }
  });
  video.addEventListener('play', () => {
    const current = blockForEditorCard(card).block;
    const frameRuntime = framePlayerRuntimeForCard(card);
    hideFramePlayerPlaceholder(video);
    if (current?.type === 'singleVideo' || current?.type === 'comparisonVideo') {
      enforceInlinePlaybackBounds(current, side, video, { starting: true });
      if (side === framePlayerPrimarySide(current, frameRuntime, card)) {
        frameRuntime.playing = true;
        frameRuntime.lifecycle = 'playing';
        frameRuntime.scrubActive = false;
      }
      syncFramePlayerProgress(card, current, side, video);
    }
  });
  video.addEventListener('pause', () => {
    const current = blockForEditorCard(card).block;
    const frameRuntime = framePlayerRuntimeForCard(card);
    if ((current?.type === 'singleVideo' || current?.type === 'comparisonVideo')
      && side === framePlayerPrimarySide(current, frameRuntime, card)
      && !frameRuntime.frameEngineGuard
      && !video.ended) {
      frameRuntime.playing = false;
      frameRuntime.lifecycle = 'paused';
      updateFramePlayerControls(card);
    }
  });
  video.addEventListener('ratechange', () => {
    const current = blockForEditorCard(card).block;
    if (!current || !['singleVideo', 'comparisonVideo'].includes(current.type)) return;
    const config = playerSideConfig(current, side);
    const rate = Number(video.playbackRate);
    if (!Number.isFinite(rate) || rate <= 0 || Math.abs(Number(config.playback?.rate) - rate) < 0.001) return;
    config.playback = { ...(config.playback || {}), rate };
    scheduleSave();
  });
  video.addEventListener('ended', () => {
    const current = blockForEditorCard(card).block;
    const config = current ? playerSideConfig(current, side) : null;
    const frameRuntime = framePlayerRuntimeForCard(card);
    if (current && config?.loop?.enabled === true) {
      const { start } = inlinePlaybackBounds(current, side, video);
      video.currentTime = start;
      void video.play().catch(() => {});
      if (side === framePlayerPrimarySide(current, frameRuntime, card)) {
        frameRuntime.playing = true;
        frameRuntime.lifecycle = 'playing';
        updateFramePlayerControls(card);
      }
      return;
    }
    if (side === framePlayerPrimarySide(current, frameRuntime, card)) {
      frameRuntime.playing = false;
      frameRuntime.lifecycle = 'ended';
      const count = framePlayerFrameCount(current, frameRuntime, card);
      frameRuntime.currentFrameIndex = Math.max(0, count - 1);
      updateFramePlayerControls(card);
      setFramePlayerStatus(card, '已到達最後一幀。', 'loaded');
    }
  });
}

function hydrateInlineVideoCards() {
  if (!elements.blockCanvas || !state.activeProject) return;
  const generation = ++state.inlineGeneration;
  elements.blockCanvas.querySelectorAll('[data-inline-video-block]').forEach((card) => {
    const entry = blockForEditorCard(card);
    if (!entry.block) return;
    const playerCards = card.matches('[data-frame-player]')
      ? [card]
      : [...card.querySelectorAll('[data-frame-player]')];
    playerCards.forEach((playerCard) => {
      void prepareFramePlayerCard(playerCard, entry.block, generation);
    });
  });
}

function patchInlineVideoCard(card, block) {
  if (!card || !block || !card.matches('[data-inline-video-block]')) return;
  const comparison = block.type === 'comparisonVideo';
  const layout = comparison && block.layout === 'stacked' ? '堆疊' : '並排';
  const title = card.querySelector('.inline-video-title strong');
  const summary = card.querySelector('.inline-video-title span');
  const grid = card.querySelector('.inline-video-grid');
  if (title) title.textContent = block.label || (comparison ? '雙影片' : '影片區塊');
  if (summary) summary.textContent = comparison ? `雙影片 · ${layout}` : '單一來源 · 專案內媒體';
  if (grid) grid.dataset.layout = comparison
    ? (block.layout === 'stacked' ? 'stacked' : 'side-by-side')
    : 'stacked';
  for (const side of videoBlockSides(block)) {
    const sideTitle = playerSideTitle(block, side);
    const sideElement = card.querySelector(`[data-inline-side="${side}"]`);
    const sideTitleElement = sideElement?.querySelector('[data-inline-side-title]');
    const surface = sideElement?.querySelector('[data-frame-surface]');
    const video = sideElement?.querySelector('[data-inline-video]');
    const controls = sideElement?.querySelector('[data-frame-controls]');
    const timeline = sideElement?.querySelector('[data-frame-timeline]');
    const rate = sideElement?.querySelector('[data-frame-rate]');
    if (sideTitleElement) sideTitleElement.textContent = sideTitle;
    if (surface) surface.setAttribute('aria-label', `${sideTitle}影格畫面`);
    if (video) video.setAttribute('aria-label', `${sideTitle}影片`);
    if (controls) controls.setAttribute('aria-label', `${sideTitle}影格播放器控制`);
    if (timeline) timeline.setAttribute('aria-label', `${sideTitle}影格時間軸`);
    if (rate) rate.setAttribute('aria-label', `${sideTitle}播放速度`);
  }
}

function renderBlockEditor(section, block, index) {
  const typeLabel = block.type === 'comparisonVideo'
    ? '雙影片'
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
  const owner = card?.matches?.('[data-block-id]') ? card : card?.closest?.('[data-block-id]');
  const sectionId = card?.dataset?.sectionId || owner?.dataset?.sectionId;
  const blockId = card?.dataset?.blockId || owner?.dataset?.blockId;
  const section = state.activeProject?.sections.find((item) => item.id === sectionId);
  const block = section?.blocks.find((item) => item.id === blockId);
  return { section, block };
}

function convertVideoBlockMode(block, mode) {
  if (mode === 'comparison' && block.type !== 'comparisonVideo') {
    const singleAsset = referenceId(block.mediaAssetId);
    block.type = 'comparisonVideo';
    block.layout = block.layout === 'stacked' ? 'stacked' : 'side-by-side';
    block.left = {
      mediaAssetId: singleAsset,
      label: block.label || '左側影片',
      segment: block.segment || { in: 0, out: null },
      playback: block.playback || { rate: 1 },
      loop: block.loop || { enabled: false },
    };
    block.right = {
      mediaAssetId: null,
      label: '右側影片',
      segment: { in: 0, out: null },
      playback: { rate: 1 },
      loop: { enabled: false },
    };
    delete block.mediaAssetId;
    delete block.segment;
    delete block.playback;
    delete block.loop;
    delete block.anchor;
    delete block.sync;
    delete block.binding;
    return;
  }
  if (mode === 'single' && block.type !== 'singleVideo') {
    block.type = 'singleVideo';
    block.mediaAssetId = referenceId(block.left?.mediaAssetId);
    block.segment = block.left?.segment || { in: 0, out: null };
    block.playback = block.left?.playback || { rate: 1 };
    block.loop = block.left?.loop || { enabled: false };
    delete block.left;
    delete block.right;
    delete block.layout;
    delete block.anchor;
    delete block.sync;
    delete block.binding;
  }
}

function inlineSideFromPath(pathValue) {
  if (pathValue.startsWith('left.')) return 'left';
  if (pathValue.startsWith('right.')) return 'right';
  return null;
}

function refreshInlineVideoAfterEditorChange(card, block, pathValue) {
  if (!block) return;
  const side = block.type === 'comparisonVideo' ? inlineSideFromPath(pathValue) : 'single';
  if (side) applyInlineSideSettings(card, block, side);
  patchInlineVideoCard(card, block);
}

function handleBlockEditorEvent(event) {
  const target = event.target;
  if (target.closest('[data-inline-video-block]') && target.closest('[data-frame-action="open"]')) {
    if (event.type !== 'click') return;
    const details = target.closest('[data-inline-video-block]')?.querySelector('details');
    if (details) details.open = true;
    return;
  }
  if (target.closest('[data-frame-player]')
    && (target.matches('[data-frame-timeline]')
      || target.matches('[data-frame-rate]')
      || target.closest('[data-frame-action]')
      || target.closest('[data-frame-surface]'))) {
    handleFramePlayerEvent(event);
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
    refreshInlineVideoAfterEditorChange(card, block, target.dataset.blockPath);
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
    return `<div class="preview-block"><strong>${escapeHtml(block.label || '雙影片')}</strong><div class="preview-comparison">${previewMediaReference(left, '左側媒體')}${previewMediaReference(right, '右側媒體')}</div></div>`;
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

function mostRecentlyOpenedProject() {
  return [...state.projects].sort((left, right) => {
    const leftTimestamp = left.lastOpenedAt || left.updatedAt || '';
    const rightTimestamp = right.lastOpenedAt || right.updatedAt || '';
    return rightTimestamp.localeCompare(leftTimestamp);
  })[0] || null;
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
elements.blockCanvas?.addEventListener('pointerdown', handleBlockEditorEvent);
elements.blockCanvas?.addEventListener('pointermove', handleBlockEditorEvent);
elements.blockCanvas?.addEventListener('pointerup', handleBlockEditorEvent);
elements.blockCanvas?.addEventListener('keydown', handleFramePlayerKeydown);
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
    const recentProject = mostRecentlyOpenedProject();
    if (recentProject) await openProject(recentProject.id);
  } catch (error) {
    if (elements.rootPath) elements.rootPath.textContent = '無法讀取';
    setSaveState('啟動失敗', 'error');
    setError(`應用程式啟動失敗：${displayErrorMessage(error)}`);
  }
})();
