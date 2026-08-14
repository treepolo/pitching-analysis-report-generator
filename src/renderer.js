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

function makePlayerBlockId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function addPlayerBlock(block) {
  const section = activeSection();
  if (!section) return;
  section.blocks.push(block);
  state.player.selectedBlockId = block.id;
  state.player.notice = 'Player block created; loading project-local media only.';
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
  return segments.at(-1) || 'selected folder';
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
    state.export.directoryNotice = 'Folder picker unavailable; using the project default.';
    renderExportControls();
    return;
  }
  try {
    const picked = normalizeExportDirectoryPick(await picker());
    if (picked.canceled) {
      state.export.directoryNotice = 'Folder selection cancelled; no export started.';
    } else if (!picked.directory) {
      state.export.directoryNotice = 'Folder picker returned no usable folder; using the project default.';
    } else {
      state.export.outputDirectory = picked.directory;
      state.export.directoryNotice = `Selected folder: ${displaySafeDirectoryLabel(picked.directory)}`;
    }
  } catch {
    state.export.directoryNotice = 'Folder selection failed; using the project default.';
  }
  renderExportControls();
}

function exportResultLabel(snapshot) {
  const result = snapshot?.result;
  if (!result) return '';
  const output = result.zipPath || result.folderPath;
  return output ? `Output ready: ${output}` : 'Export completed without an output path.';
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
    if (elements.exportDirectoryStatus) elements.exportDirectoryStatus.textContent = 'Open a project to choose an output folder.';
    if (elements.exportStatus) elements.exportStatus.textContent = 'Export is unavailable until a project is open.';
  } else if (exportState.outputDirectory) {
    if (elements.exportDirectoryStatus) {
      elements.exportDirectoryStatus.textContent = exportState.directoryNotice
        || `Selected folder: ${displaySafeDirectoryLabel(exportState.outputDirectory)}`;
    }
  } else if (exportState.status === 'running') {
    if (elements.exportDirectoryStatus) {
      elements.exportDirectoryStatus.textContent = `Using project default: ${displaySafeDirectoryLabel(defaultExportDirectory())}`;
    }
    if (elements.exportStatus) {
      elements.exportStatus.textContent = 'Export running; referenced assets are being copied into a self-contained output.';
    }
  } else if (exportState.directoryNotice) {
    if (elements.exportDirectoryStatus) elements.exportDirectoryStatus.textContent = exportState.directoryNotice;
  } else if (!pickerAvailable) {
    if (elements.exportDirectoryStatus) {
      elements.exportDirectoryStatus.textContent = 'Folder picker unavailable; using the project default.';
    }
  } else {
    if (elements.exportDirectoryStatus) {
      elements.exportDirectoryStatus.textContent = `Using project default: ${displaySafeDirectoryLabel(defaultExportDirectory())}`;
    }
  }
  if (!project) {
    return;
  }
  if (exportState.status === 'running') {
    if (elements.exportStatus) {
      elements.exportStatus.textContent = 'Export running; referenced assets are being copied into a self-contained output.';
    }
  } else if (exportState.status === 'cancelling') {
    if (elements.exportStatus) elements.exportStatus.textContent = 'Cancelling export; waiting for cleanup.';
  } else if (exportState.status === 'completed') {
    if (elements.exportStatus) elements.exportStatus.textContent = exportResultLabel(snapshot);
  } else if (exportState.status === 'failed') {
    if (elements.exportStatus) {
      elements.exportStatus.textContent = `Export failed: ${snapshot?.error?.message || 'unknown error'}`;
    }
  } else if (exportState.status === 'cancelled') {
    if (elements.exportStatus) {
      elements.exportStatus.textContent = `Export cancelled: ${snapshot?.error?.message || 'no output was created'}`;
    }
  } else {
    if (elements.exportStatus) {
      elements.exportStatus.textContent = exportState.outputDirectory
        ? `Exports use the selected folder: ${displaySafeDirectoryLabel(exportState.outputDirectory)}.`
        : `Exports use ${defaultExportDirectory() || 'the project output folder'}.`;
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
    if (!outputDirectory) throw new Error('Project output directory is unavailable.');
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
    if (!started?.jobId) throw new Error('Export bridge returned no job id.');
    state.export.jobId = started.jobId;
    setExportSnapshot(started);
    await monitorExportJob(started.jobId);
  } catch (error) {
    state.export.jobId = null;
    setExportSnapshot({ status: 'failed', error: { message: error.message } });
  }
}

async function cancelReportExport() {
  const jobId = state.export.jobId;
  if (!jobId || !['running', 'cancelling'].includes(state.export.status)) return;
  try {
    setExportSnapshot(await window.pitchingApp.cancelExport(jobId));
  } catch (error) {
    setExportSnapshot({ status: 'failed', error: { message: `Cancel failed: ${error.message}` } });
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
    setExportSnapshot({ status: 'failed', error: { message: `Retry failed: ${error.message}` } });
  }
}

function renderProjects() {
  const control = elements.projectList || elements.projectPicker;
  if (!control) return;
  if (control.tagName === 'SELECT') {
    control.innerHTML = state.projects.length > 0
      ? state.projects.map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.displayName)}</option>`).join('')
      : '<option value="">No documents yet</option>';
    control.disabled = state.projects.length === 0;
    if (state.activeProject) control.value = state.activeProject.id;
    return;
  }
  control.innerHTML = state.projects.map((project) => `
    <button class="project-card" data-project-id="${escapeHtml(project.id)}" type="button">
      <span>${escapeHtml(project.displayName)}</span><small>${project.sectionCount} sections</small>
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

function renderInlineVideoSide(block, side) {
  const config = playerSideConfig(block, side);
  const label = side === 'left' ? 'Left source' : side === 'right' ? 'Right source' : 'Video source';
  return `
    <div class="inline-video-side" data-inline-side="${side}">
      <h3>${label}</h3>
      <div class="inline-video-frame"><video data-inline-video playsinline preload="metadata"></video></div>
      <p class="inline-video-status" data-inline-status role="status">Not loaded; select a project-local asset.</p>
      <div class="inline-video-controls">
        <button class="button button-quiet" type="button" data-inline-action="play">Play</button>
        <button class="button button-quiet" type="button" data-inline-action="pause">Pause</button>
        <input class="inline-video-seek" data-inline-seek type="range" min="0" max="0" step="0.001" value="0" disabled aria-label="${label} seek" />
        <output class="inline-video-time" data-inline-time>0.00s</output>
        <button class="button button-quiet" type="button" data-inline-action="fullscreen">Fullscreen</button>
      </div>
    </div>`;
}

function renderInlineVideoBlock(section, block) {
  const comparison = block.type === 'comparisonVideo';
  const layout = block.layout === 'stacked' ? 'stacked' : 'side-by-side';
  const sides = comparison ? `${renderInlineVideoSide(block, 'left')}${renderInlineVideoSide(block, 'right')}` : renderInlineVideoSide(block, 'single');
  const syncMode = block.sync?.mode === 'frame' ? 'Explicit frame mode' : 'Shared elapsed-time sync';
  return `
    <article class="inline-video-block" data-section-id="${escapeHtml(section.id)}" data-block-id="${escapeHtml(block.id)}" data-inline-video-block>
      <header class="inline-video-header">
        <div class="inline-video-title"><strong>${escapeHtml(block.label || (comparison ? 'Comparison video' : 'Video block'))}</strong><span>${comparison ? `${syncMode} · ${layout}` : 'Single source · project-local media'}</span></div>
        <div class="inline-video-actions">
          <button class="button button-quiet" type="button" data-inline-action="open">Open controls</button>
          <button class="button button-secondary" type="button" data-inline-action="play-all">Play</button>
          <button class="button button-quiet" type="button" data-inline-action="pause-all">Pause</button>
          ${comparison ? '<button class="button button-quiet" type="button" data-inline-action="align-zero">Align 0s</button>' : ''}
        </div>
      </header>
      <div class="inline-video-grid" data-layout="${layout}">${sides}</div>
      <details class="inline-video-details"><summary>Block settings</summary>${renderVideoBlockEditor(block)}</details>
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

async function loadInlineVideoSide(card, block, side, generation) {
  const sideElement = card.querySelector(`[data-inline-side="${side}"]`);
  const video = sideElement?.querySelector('[data-inline-video]');
  if (!sideElement || !video || generation !== state.inlineGeneration) return;
  const assetId = playerAssetIdFor(block, side);
  const asset = mediaAssetFor(assetId);
  if (!assetId || !asset) {
    setInlineVideoStatus(sideElement, 'No project-local asset selected.', 'pending');
    return;
  }
  if (asset.lifecycleStatus === 'missing' || ['unsupported', 'unplayable'].includes(asset.compatibility)) {
    setInlineVideoStatus(sideElement, 'This asset is unavailable or unsupported.', 'error');
    return;
  }
  if (asset.compatibility === 'needs-normalization' && !asset.normalizedReference) {
    setInlineVideoStatus(sideElement, 'Metadata is pending normalization; playback is unavailable.', 'pending');
    return;
  }
  setInlineVideoStatus(sideElement, 'Loading project-local media…', 'pending');
  try {
    const source = await window.pitchingApp.resolveMediaSource(state.activeProject.id, assetId);
    if (generation !== state.inlineGeneration || !card.isConnected) return;
    video.src = source.sourceUrl;
    video.playbackRate = Number(playerSideConfig(block, side).playback?.rate) || 1;
    video.onloadedmetadata = () => {
      setInlineVideoStatus(sideElement, 'Ready; real media source loaded.', 'loaded');
      updateInlineVideoTime(sideElement);
    };
    video.ontimeupdate = () => updateInlineVideoTime(sideElement);
    video.onerror = () => setInlineVideoStatus(sideElement, 'Media could not be played by this runtime.', 'error');
    video.load();
  } catch {
    setInlineVideoStatus(sideElement, 'Media source could not be resolved safely.', 'error');
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
    card.querySelectorAll('[data-inline-side]').forEach((side) => setInlineVideoStatus(side, 'Playback unavailable until a playable source is loaded.', 'pending'));
    return;
  }
  try {
    await Promise.all(ready.map((video) => video.play()));
  } catch {
    card.querySelectorAll('[data-inline-side]').forEach((side) => setInlineVideoStatus(side, 'Playback was blocked or unavailable.', 'error'));
  }
}

async function alignInlineComparison(card) {
  const entry = blockForEditorCard(card);
  const leftElement = card.querySelector('[data-inline-side="left"]');
  const rightElement = card.querySelector('[data-inline-side="right"]');
  const leftVideo = leftElement?.querySelector('[data-inline-video]');
  const rightVideo = rightElement?.querySelector('[data-inline-video]');
  const left = playerSideConfig(entry.block, 'left');
  const right = playerSideConfig(entry.block, 'right');
  if (!entry.block || !leftVideo || !rightVideo || !leftVideo.src || !rightVideo.src || !left.anchor || !right.anchor) {
    setInlineVideoStatus(leftElement, 'Both sources need loaded media and separate anchors.', 'pending');
    return;
  }
  try {
    const alignment = await window.pitchingApp.sync.alignComparisonAtRelativeTime({
      left: { anchor: left.anchor, duration: leftVideo.duration, timing: playerTimingForAsset(mediaAssetFor(playerAssetIdFor(entry.block, 'left')), leftVideo.duration), capability: { supportsFrameStep: typeof leftVideo.seekToNextFrame === 'function' } },
      right: { anchor: right.anchor, duration: rightVideo.duration, timing: playerTimingForAsset(mediaAssetFor(playerAssetIdFor(entry.block, 'right')), rightVideo.duration), capability: { supportsFrameStep: typeof rightVideo.seekToNextFrame === 'function' } },
    }, 0);
    leftVideo.currentTime = alignment.sides.left.playbackTime;
    rightVideo.currentTime = alignment.sides.right.playbackTime;
    setInlineVideoStatus(leftElement, `Aligned at 0s (${alignment.precision}).`, 'loaded');
    setInlineVideoStatus(rightElement, `Aligned at 0s (${alignment.precision}).`, 'loaded');
  } catch {
    setInlineVideoStatus(leftElement, 'Comparison alignment is unavailable for these sources.', 'error');
  }
}

function handleInlineVideoEvent(event) {
  const target = event.target;
  const card = target.closest('[data-inline-video-block]');
  if (!card) return false;
  const sideElement = target.closest('[data-inline-side]');
  const video = sideElement?.querySelector('[data-inline-video]');
  if (target.matches('[data-inline-seek]') && video) {
    video.currentTime = Number(target.value) || 0;
    updateInlineVideoTime(sideElement);
    return true;
  }
  const action = target.closest('[data-inline-action]')?.dataset.inlineAction;
  if (!action) return false;
  if (action === 'open') {
    const details = card.querySelector('details');
    if (details) details.open = true;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else if (action === 'play-all') {
    void playInlineCard(card);
  } else if (action === 'pause-all') {
    card.querySelectorAll('[data-inline-video]').forEach((item) => item.pause());
  } else if (action === 'play' && video) {
    void video.play().catch(() => setInlineVideoStatus(sideElement, 'Playback was blocked or unavailable.', 'error'));
  } else if (action === 'pause' && video) {
    video.pause();
  } else if (action === 'fullscreen' && video && typeof video.requestFullscreen === 'function') {
    void video.requestFullscreen().catch(() => {});
  } else if (action === 'align-zero') {
    void alignInlineComparison(card);
  }
  return true;
}

function renderBlockEditor(section, block, index) {
  const typeLabel = block.type === 'comparisonVideo' ? 'Comparison video' : block.type === 'singleVideo' ? 'Single video' : 'Text';
  const body = block.type === 'rich-text' || block.type === 'text'
    ? `<label class="block-text-editor">Text <textarea rows="5" data-block-field="content">${escapeHtml(block.content || '')}</textarea></label>`
    : (block.type === 'singleVideo' || block.type === 'comparisonVideo')
      ? renderInlineVideoBlock(section, block)
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
  [elements.blockSectionTarget, elements.addTextBlock, elements.addEditorSingleVideo, elements.addEditorComparisonVideo]
    .filter(Boolean)
    .forEach((element) => { element.disabled = !project; });
  if (!elements.blockCanvas) return;
  if (!project) {
    elements.blockCanvas.innerHTML = '<p class="empty-state">Open a project to edit blocks.</p>';
    return;
  }

  if (!project.sections.some((section) => section.id === state.selectedSectionId)) {
    state.selectedSectionId = project.sections[0]?.id || null;
  }
  if (elements.blockSectionTarget) {
    elements.blockSectionTarget.innerHTML = project.sections.map((section) => (
      `<option value="${escapeHtml(section.id)}"${section.id === state.selectedSectionId ? ' selected' : ''}>${escapeHtml(section.title || 'Untitled section')}</option>`
    )).join('');
  }
  if (elements.blockEditorStatus) {
    elements.blockEditorStatus.textContent = `${project.sections.reduce((count, section) => count + section.blocks.length, 0)} blocks in long-form document`;
  }
  elements.blockCanvas.innerHTML = project.sections.map((section) => `
    <section class="block-section ${section.id === state.selectedSectionId ? 'is-target' : ''}" data-section-id="${escapeHtml(section.id)}">
      <header class="block-section-header">
        <input type="text" data-section-title value="${editorValue(section.title)}" aria-label="Section title" />
        <span class="muted">${section.blocks.length} blocks</span>
      </header>
      <div class="block-list">${section.blocks.map((block, index) => renderBlockEditor(section, block, index)).join('')}</div>
    </section>`).join('');
  hydrateInlineVideoCards();
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
  if (target.closest('[data-inline-video-block]') && (target.matches('[data-inline-seek]') || target.closest('[data-inline-action]'))) {
    handleInlineVideoEvent(event);
    return;
  }
  const card = target.closest('[data-block-id]');
  if (target.matches('[data-section-title]')) {
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
    convertVideoBlockMode(block, target.value);
    renderBlockCanvas();
    scheduleSave();
    return;
  }
  if (target.matches('[data-block-field="content"]')) {
    block.content = target.value;
    scheduleSave();
    return;
  }
  if (target.matches('[data-block-path]')) {
    setEditorPath(block, target.dataset.blockPath, editorControlValue(target));
    if (event.type !== 'input' || target.type !== 'text') renderBlockCanvas();
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
  if (elements.projectMeta) elements.projectMeta.textContent = `Local-first document · ${formatDate(project.updatedAt)}`;
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
    setError(`開啟專案失敗：${error.message}`);
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
    setError(`讀取文字檔失敗：${error.message}`);
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
      elements.importTextError.textContent = `匯入失敗：${error.message}`;
      elements.importTextError.hidden = false;
    }
    setError(`匯入文字失敗：${error.message}`);
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
      setError(`建立專案失敗：${error.message}`);
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

if (typeof window.pitchingApp?.onBeforeClose === 'function') {
  window.pitchingApp.onBeforeClose(() => flushPendingChanges());
}

(async function bootstrap() {
  try {
    if (!window.pitchingApp || typeof window.pitchingApp.getAppInfo !== 'function') {
      throw new Error('Renderer bridge unavailable');
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
    setError(`應用程式啟動失敗：${error.message}`);
  }
})();
