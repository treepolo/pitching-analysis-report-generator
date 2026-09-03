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
    selectedPlayerKey: null,
    runtime: null,
    generation: 0,
    notice: '',
  },
  richText: {
    editor: null,
    range: null,
    offsets: null,
    linkMode: false,
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
  richTextToolbar: document.querySelector('#rich-text-toolbar'),
  richTextToolbarMain: document.querySelector('[data-rich-text-toolbar-main]'),
  richTextLinkForm: document.querySelector('[data-rich-text-link-form]'),
  richTextLinkInput: document.querySelector('[data-rich-text-link-input]'),
  richTextLinkError: document.querySelector('[data-rich-text-link-error]'),
};

const PLAYBACK_RATE_MIN = 1 / 64;
const PLAYBACK_RATE_MAX = 64;
const PLAYBACK_RATE_DEFAULT = 1;
const PLAYBACK_RATE_SLIDER_MIN = -6;
const PLAYBACK_RATE_SLIDER_MAX = 6;
const PLAYBACK_RATE_SLIDER_STEP = 0.01;

function clampPlaybackRate(value, fallback = PLAYBACK_RATE_DEFAULT) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(PLAYBACK_RATE_MAX, Math.max(PLAYBACK_RATE_MIN, parsed));
}

function playbackRateToSliderValue(rate) {
  return Math.log2(clampPlaybackRate(rate));
}

function sliderValueToPlaybackRate(value) {
  const exponent = Math.min(
    PLAYBACK_RATE_SLIDER_MAX,
    Math.max(PLAYBACK_RATE_SLIDER_MIN, Number(value) || 0),
  );
  return clampPlaybackRate(2 ** exponent);
}

function setNativePlaybackRate(video, rate) {
  if (!video) return false;
  try {
    video.playbackRate = rate;
    const actual = Number(video.playbackRate);
    return Number.isFinite(actual) && Math.abs(actual - rate) < 0.001;
  } catch {
    return false;
  }
}

function setSafePlaybackRate(card, video, rate) {
  const runtime = framePlayerRuntimeForCard(card);
  runtime.rateSyncGuard = true;
  try {
    if (setNativePlaybackRate(video, rate)) return true;
    // Chromium rejects rates outside its native media range.  Keep the
    // requested project rate in the frame runtime and hold the video at 1x;
    // the manual frame clock takes over when playback starts.
    setNativePlaybackRate(video, PLAYBACK_RATE_DEFAULT);
    return false;
  } finally {
    runtime.rateSyncGuard = false;
  }
}

function unsupportedPlaybackRateError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  // A generic NotSupportedError can mean the source is not ready or decodable.
  // Only an explicit playback-rate message should enter the manual clock.
  return message.includes('playbackrate')
    || message.includes('playback rate')
    || message.includes('supported playback range');
}

function formatPlaybackRate(rate) {
  const normalized = clampPlaybackRate(rate);
  if (normalized < 0.1) return normalized.toFixed(4);
  if (normalized < 1) return normalized.toFixed(3);
  return normalized.toFixed(2);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


const richTextApi = globalThis.pitchingRichText || {};
const RICH_TEXT_HTML_FORMAT = 'html';

function richTextPlainHtml(value) {
  if (typeof richTextApi.escapeRichTextPlain === 'function') return richTextApi.escapeRichTextPlain(value);
  return escapeHtml(value).replace(/\r\n?/gu, '\n').replaceAll('\n', '<br>');
}

function richTextStoredHtml(block) {
  const content = typeof block?.content === 'string' ? block.content : '';
  if (block?.contentFormat === RICH_TEXT_HTML_FORMAT
    && typeof richTextApi.sanitizeRichTextEditorHtml === 'function') {
    return richTextApi.sanitizeRichTextEditorHtml(content);
  }
  return richTextPlainHtml(content);
}

function renderRichTextEditor(block) {
  return '<div class="block-text-editor">'
    + '<span class="block-text-label">文字內容</span>'
    + '<div class="rich-text-editor" data-block-field="content" data-rich-text-editor contenteditable="true" role="textbox" aria-label="文字內容" aria-multiline="true" spellcheck="true">'
    + richTextStoredHtml(block)
    + '</div>'
    + '</div>';
}

function richTextEditorFromNode(node) {
  const element = node?.nodeType === 1 ? node : node?.parentElement;
  return element?.closest?.('[data-rich-text-editor]') || null;
}

function richTextRangeTextOffset(root, node, offset) {
  const range = document.createRange();
  range.selectNodeContents(root);
  try {
    range.setEnd(node, offset);
    return range.toString().length;
  } catch {
    return 0;
  }
}

function richTextCaptureOffsets(root, range) {
  return {
    start: richTextRangeTextOffset(root, range.startContainer, range.startOffset),
    end: richTextRangeTextOffset(root, range.endContainer, range.endOffset),
  };
}

function richTextPointAtOffset(root, requestedOffset) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = Math.max(0, Number(requestedOffset) || 0);
  let last = null;
  while (walker.nextNode()) {
    last = walker.currentNode;
    const length = last.nodeValue?.length || 0;
    if (remaining <= length) return { node: last, offset: remaining };
    remaining -= length;
  }
  return last
    ? { node: last, offset: last.nodeValue?.length || 0 }
    : { node: root, offset: root.childNodes.length };
}

function richTextRestoreOffsets(root, offsets) {
  if (!offsets) return null;
  const selection = window.getSelection();
  if (!selection) return null;
  const range = document.createRange();
  const start = richTextPointAtOffset(root, offsets.start);
  const end = richTextPointAtOffset(root, offsets.end);
  try {
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
  } catch {
    range.selectNodeContents(root);
    range.collapse(false);
  }
  selection.removeAllRanges();
  selection.addRange(range);
  return range;
}

function richTextSelectionForEditor(editor) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const owner = richTextEditorFromNode(range.commonAncestorContainer);
  if (owner !== editor || !editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return null;
  return { range: range.cloneRange(), offsets: richTextCaptureOffsets(editor, range) };
}

function richTextSaveSelection(editor, range, offsets) {
  state.richText.editor = editor;
  state.richText.range = range?.cloneRange?.() || null;
  state.richText.offsets = offsets || (range ? richTextCaptureOffsets(editor, range) : null);
}

function richTextCurrentSelection() {
  const editor = state.richText.editor;
  if (!editor || !elements.blockCanvas?.contains(editor)) return null;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return null;
  return range;
}

function richTextRestoreSavedSelection() {
  const editor = state.richText.editor;
  if (!editor || !elements.blockCanvas?.contains(editor)) return null;
  editor.focus({ preventScroll: true });
  const selection = window.getSelection();
  if (!selection) return null;
  if (state.richText.offsets) return richTextRestoreOffsets(editor, state.richText.offsets);
  if (state.richText.range) {
    selection.removeAllRanges();
    selection.addRange(state.richText.range.cloneRange());
    return selection.getRangeAt(0);
  }
  return null;
}

function richTextToolbarRect(range) {
  const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 || rect.height > 0);
  return rects[0] || range.getBoundingClientRect();
}

function positionRichTextToolbar() {
  const toolbar = elements.richTextToolbar;
  const range = state.richText.range;
  if (!toolbar || toolbar.hidden || !range) return;
  const rect = richTextToolbarRect(range);
  const width = toolbar.offsetWidth || 260;
  const height = toolbar.offsetHeight || 40;
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left + (rect.width / 2) - (width / 2)));
  const above = rect.top - height - 8;
  const top = above >= 8 ? above : Math.min(window.innerHeight - height - 8, rect.bottom + 8);
  toolbar.style.left = Math.max(8, left) + 'px';
  toolbar.style.top = Math.max(8, top) + 'px';
}

function updateRichTextToolbarState() {
  const toolbar = elements.richTextToolbar;
  if (!toolbar) return;
  for (const action of ['bold', 'italic']) {
    const button = toolbar.querySelector('[data-rich-text-action="' + action + '"]');
    if (!button) continue;
    let active = false;
    try { active = document.queryCommandState(action); } catch { active = false; }
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
}

function showRichTextToolbar() {
  const toolbar = elements.richTextToolbar;
  if (!toolbar) return;
  toolbar.hidden = false;
  if (elements.richTextToolbarMain) elements.richTextToolbarMain.hidden = state.richText.linkMode;
  if (elements.richTextLinkForm) elements.richTextLinkForm.hidden = !state.richText.linkMode;
  updateRichTextToolbarState();
  requestAnimationFrame(positionRichTextToolbar);
}

function hideRichTextToolbar() {
  if (elements.richTextToolbar) elements.richTextToolbar.hidden = true;
  if (elements.richTextToolbarMain) elements.richTextToolbarMain.hidden = false;
  if (elements.richTextLinkForm) elements.richTextLinkForm.hidden = true;
  if (elements.richTextLinkError) {
    elements.richTextLinkError.hidden = true;
    elements.richTextLinkError.textContent = '';
  }
  state.richText.editor = null;
  state.richText.range = null;
  state.richText.offsets = null;
  state.richText.linkMode = false;
}

function commitRichTextEditor(editor) {
  state.richText.editor = editor;
  const selected = richTextSelectionForEditor(editor);
  const offsets = selected?.offsets || state.richText.offsets;
  const sanitized = typeof richTextApi.sanitizeRichTextEditorHtml === 'function'
    ? richTextApi.sanitizeRichTextEditorHtml(editor.innerHTML)
    : editor.innerHTML;
  if (editor.innerHTML !== sanitized) {
    editor.innerHTML = sanitized;
    richTextRestoreOffsets(editor, offsets);
  }
  const card = editor.closest('[data-block-id]');
  const block = blockForEditorCard(card).block;
  if (!block) return;
  block.content = sanitized;
  block.contentFormat = RICH_TEXT_HTML_FORMAT;
  const range = richTextCurrentSelection();
  richTextSaveSelection(editor, range, offsets);
  scheduleSave();
}

function richTextSelectionAnchor() {
  const range = state.richText.range;
  const editor = state.richText.editor;
  if (!range || !editor) return null;
  const element = range.startContainer.nodeType === 1
    ? range.startContainer
    : range.startContainer.parentElement;
  const anchor = element?.closest?.('a');
  return anchor && editor.contains(anchor) ? anchor : null;
}

function openRichTextLinkEditor() {
  if (!state.richText.range || !state.richText.editor) return;
  state.richText.linkMode = true;
  if (elements.richTextLinkInput) elements.richTextLinkInput.value = richTextSelectionAnchor()?.getAttribute('href') || '';
  if (elements.richTextLinkError) {
    elements.richTextLinkError.hidden = true;
    elements.richTextLinkError.textContent = '';
  }
  showRichTextToolbar();
  elements.richTextLinkInput?.focus({ preventScroll: true });
  positionRichTextToolbar();
}

function closeRichTextLinkEditor() {
  state.richText.linkMode = false;
  if (elements.richTextToolbarMain) elements.richTextToolbarMain.hidden = false;
  if (elements.richTextLinkForm) elements.richTextLinkForm.hidden = true;
  positionRichTextToolbar();
  richTextRestoreSavedSelection();
}

function applyRichTextLink() {
  const value = elements.richTextLinkInput?.value || '';
  const href = typeof richTextApi.sanitizeHref === 'function' ? richTextApi.sanitizeHref(value) : value.trim();
  if (!href) {
    if (elements.richTextLinkError) {
      elements.richTextLinkError.hidden = false;
      elements.richTextLinkError.textContent = '請輸入安全的網址';
    }
    return;
  }
  const range = richTextRestoreSavedSelection();
  const editor = state.richText.editor;
  if (!range || !editor) return;
  const anchor = richTextSelectionAnchor();
  if (anchor && anchor.contains(range.startContainer) && anchor.contains(range.endContainer)) {
    anchor.setAttribute('href', href);
  } else {
    try { document.execCommand('createLink', false, href); } catch { return; }
  }
  commitRichTextEditor(editor);
  closeRichTextLinkEditor();
  showRichTextToolbar();
}

function handleRichTextToolbarClick(event) {
  const action = event.target.closest?.('[data-rich-text-action]')?.dataset.richTextAction;
  if (!action) return;
  if (action === 'link') {
    openRichTextLinkEditor();
    return;
  }
  if (action === 'link-confirm') {
    event.preventDefault();
    applyRichTextLink();
    return;
  }
  if (action === 'link-cancel') {
    closeRichTextLinkEditor();
    return;
  }
  if (action !== 'bold' && action !== 'italic') return;
  const editor = state.richText.editor;
  if (!richTextRestoreSavedSelection() || !editor) return;
  try { document.execCommand(action, false, null); } catch { return; }
  commitRichTextEditor(editor);
  showRichTextToolbar();
}

function updateRichTextToolbarFromSelection() {
  if (state.richText.linkMode) return;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    hideRichTextToolbar();
    return;
  }
  const range = selection.getRangeAt(0);
  const editor = richTextEditorFromNode(range.commonAncestorContainer);
  if (!editor || !editor.contains(range.startContainer) || !editor.contains(range.endContainer)
    || selection.toString().length === 0) {
    hideRichTextToolbar();
    return;
  }
  richTextSaveSelection(editor, range, richTextCaptureOffsets(editor, range));
  showRichTextToolbar();
}

function handleRichTextOutsidePointerDown(event) {
  if (elements.richTextToolbar?.contains(event.target)) return;
  if (richTextEditorFromNode(event.target)) return;
  hideRichTextToolbar();
}

function handleRichTextEditorFocusOut() {
  setTimeout(() => {
    if (state.richText.linkMode) return;
    const active = document.activeElement;
    if (!elements.richTextToolbar?.contains(active) && !richTextEditorFromNode(active)) hideRichTextToolbar();
  }, 0);
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
  const block = { id: `${section.id}-text`, type: 'rich-text', content: '', contentFormat: 'html' };
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
  const configuredLabel = typeof (side === 'single' ? config.sourceLabel : config.label) === 'string'
    ? (side === 'single' ? config.sourceLabel : config.label)
    : '';
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
    contentFormat: 'html',
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
    sourceLabel: asset?.displayName || '影片來源',
    segment: { in: 0, out: 0 },
    segmentUnit: 'frames',
    loop: { enabled: true }
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
      segment: { in: 0, out: 0 },
      segmentUnit: 'frames',
    },
    right: {
      mediaAssetId: right?.id || null,
      label: right?.displayName || '右側影片',
      segment: { in: 0, out: 0 },
      segmentUnit: 'frames',
    },
    sync: { leftFrame: 0, rightFrame: 0 },
    commonSegment: { in: 0, out: 0 },
    loop: { enabled: true },
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

const EXPORT_DIRECTORY_STORAGE_KEY = 'pitching-analysis-report-generator.last-export-directory.v1';
const EXPORT_DIRECTORY_MAX_PATH_LENGTH = 4096;
const EXPORT_DIRECTORY_CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;

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

function normalizeRememberedExportDirectory(value) {
  if (typeof value !== 'string') return '';
  const directory = value.trim();
  if (!directory
    || directory.length > EXPORT_DIRECTORY_MAX_PATH_LENGTH
    || EXPORT_DIRECTORY_CONTROL_CHARACTER_PATTERN.test(directory)) return '';
  return directory;
}

function readRememberedExportDirectory() {
  try {
    return normalizeRememberedExportDirectory(window.localStorage?.getItem(EXPORT_DIRECTORY_STORAGE_KEY));
  } catch {
    return '';
  }
}

function rememberExportDirectory(value) {
  const directory = normalizeRememberedExportDirectory(value);
  if (!directory) return false;
  try {
    window.localStorage?.setItem(EXPORT_DIRECTORY_STORAGE_KEY, directory);
    return true;
  } catch {
    return false;
  }
}

function restoreRememberedExportDirectory() {
  const directory = readRememberedExportDirectory();
  if (!directory || !state?.export) return false;
  state.export.outputDirectory = directory;
  state.export.directoryNotice = '';
  return true;
}

function resetExportSelection() {
  state.export.outputDirectory = '';
  state.export.directoryNotice = '';
  restoreRememberedExportDirectory();
}

async function chooseExportDirectory() {
  if (!state.activeProject || ['running', 'cancelling'].includes(state.export.status)) {
    rememberExportDirectory(state?.export?.outputDirectory);
    return;
  }
  const picker = exportDirectoryPicker();
  if (!picker) {
    state.export.directoryNotice = displayErrorMessage({ code: 'EXPORT_PICKER_UNAVAILABLE' });
    renderExportControls();
    rememberExportDirectory(state?.export?.outputDirectory);
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
  rememberExportDirectory(state?.export?.outputDirectory);
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
  const sourceTitle = playerSideTitle(block, side);
  const sourceLabelPath = comparison ? `${prefix}label` : 'sourceLabel';
  return `
    <fieldset class="video-side-config">
      <legend>${label}</legend>
      <label>檔名
        <select data-block-path="${prefix}mediaAssetId" aria-label="${label}檔名">${editorVideoAssetOptions(config.mediaAssetId)}</select>
      </label>
      <label>來源標題 <input type="text" data-block-path="${sourceLabelPath}" value="${editorValue(sourceTitle)}" /></label>
      <div class="block-inline-fields">
        <label>起點（幀）<input type="number" min="0" step="1" data-block-path="${prefix}segment.in" value="${editorValue(config.segment?.in)}" /></label>
        <label>終點（幀）<input type="number" min="0" step="1" data-block-path="${prefix}segment.out" value="${editorValue(config.segment?.out)}" /></label>
        ${comparison ? '' : `<label>循環播放 <input type="checkbox" data-block-path="loop.enabled"${loop.enabled !== false ? ' checked' : ''} /></label>`}
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

function renderFramePlayerControls(label, { shared = false, block = null } = {}) {
  const commonSegment = block?.commonSegment || { in: 0, out: 0 };
  const commonLoopEnabled = block?.loop?.enabled !== false;
  const escapedLabel = escapeHtml(label);
  return `
      <div class="inline-frame-controls${shared ? ' inline-frame-shared-controls' : ''}" data-frame-controls${shared ? ' data-frame-shared-controls' : ''} aria-label="${escapedLabel}影格播放器控制">
        <div class="inline-frame-navigation">
          <button class="button button-secondary inline-frame-toggle" type="button" data-frame-action="toggle" disabled aria-pressed="false" aria-label="播放" title="播放">▶</button>
          <button class="button button-quiet inline-frame-step" type="button" data-frame-action="previous" disabled aria-label="上一幀" title="上一幀">←</button>
          <output class="inline-frame-position inline-frame-current" data-frame-position data-frame-current>尚未準備</output>
          <input class="inline-frame-timeline" data-frame-timeline type="range" min="0" max="0" step="1" value="0" disabled aria-label="${escapedLabel}影格時間軸" />
          <output class="inline-frame-position inline-frame-total" data-frame-total>共 -- 幀</output>
          <button class="button button-quiet inline-frame-step" type="button" data-frame-action="next" disabled aria-label="下一幀" title="下一幀">→</button>
        </div>
        <div class="inline-frame-rate-row" data-frame-rate-row>
          <input class="inline-frame-rate-input" data-frame-rate-input type="number" min="${PLAYBACK_RATE_MIN}" max="${PLAYBACK_RATE_MAX}" step="any" value="1" disabled aria-label="${escapedLabel}播放速度數值" />
          <input class="inline-frame-rate-slider" data-frame-rate type="range" min="${PLAYBACK_RATE_SLIDER_MIN}" max="${PLAYBACK_RATE_SLIDER_MAX}" step="${PLAYBACK_RATE_SLIDER_STEP}" value="0" disabled aria-label="${escapedLabel}播放速度控制條" />
          <button class="button button-quiet inline-frame-rate-reset" type="button" data-frame-action="reset-rate" disabled aria-label="重置播放速度為 1 倍" title="重置為 1 倍">↻</button>
        </div>
        ${shared ? `<div class="inline-frame-sync-row"><button class="button button-quiet" type="button" data-frame-action="sync" disabled>同步</button><output data-frame-sync-info>尚未設定同步點</output></div>
        <div class="inline-frame-common-row" data-frame-common-row>
          <label>共同起點（幀） <input type="number" min="0" step="1" value="${editorValue(commonSegment.in)}" data-frame-common-range="in" aria-label="共同播放區間起點（幀）" /></label>
          <label>共同終點（幀） <input type="number" min="0" step="1" value="${editorValue(commonSegment.out)}" data-frame-common-range="out" aria-label="共同播放區間終點（幀）" /></label>
          <label>循環播放 <input type="checkbox" data-frame-common-loop${commonLoopEnabled ? ' checked' : ''} aria-label="雙影片共同循環播放" /></label>
        </div>` : ''}
        <span class="inline-frame-player-status" data-frame-player-status role="status" data-state="pending">正在載入影片…</span>
      </div>`;
}
function renderInlineVideoSide(block, side, { playerCard = false, sideControls = false } = {}) {
  const title = playerSideTitle(block, side);
  const escapedTitle = escapeHtml(title);
  const sideHeading = side === 'single' ? '' : `<h3 data-inline-side-title>${escapedTitle}</h3>`;
  return `
    <div class="inline-video-side" data-inline-side="${side}">
      ${sideHeading}
      <div class="inline-video-frame inline-frame-surface" data-frame-surface tabindex="0" aria-label="${escapedTitle}影格畫面">
        <video data-inline-video preload="auto" playsinline aria-label="${escapedTitle}影片"></video>
        <span class="inline-frame-placeholder" data-frame-placeholder>正在載入第一幀…</span>
      </div>
      <p class="inline-video-status" data-inline-status role="status">尚未準備播放影片。</p>
      ${playerCard ? renderFramePlayerControls(title) : ''}
      ${sideControls ? renderFramePlayerControls(title).replace('data-frame-controls', 'data-frame-side-controls data-frame-control-side="' + side + '" data-frame-controls') : ''}
    </div>`;
}
function renderInlineVideoBlock(section, block) {
  const comparison = block.type === 'comparisonVideo';
  // A single-video block is always one vertical player card.  Only dual
  // blocks read the persisted layout choice.
  const layout = comparison && block.layout === 'stacked' ? 'stacked' : (comparison ? 'side-by-side' : 'stacked');
  const sides = comparison
    ? `${renderInlineVideoSide(block, 'left', { sideControls: true })}${renderInlineVideoSide(block, 'right', { sideControls: true })}`
    : renderInlineVideoSide(block, 'single', { playerCard: true });
  return `
    <article class="inline-video-block" data-section-id="${escapeHtml(section.id)}" data-block-id="${escapeHtml(block.id)}" data-inline-video-block data-frame-player data-frame-player-kind="${comparison ? 'comparison' : 'single'}" tabindex="0" aria-selected="false" data-frame-selected="false">
      <header class="inline-video-header">
        <div class="inline-video-title"><strong>${escapeHtml(block.label || (comparison ? '雙影片' : '影片區塊'))}</strong><span>${comparison ? `雙影片 · ${layout === 'stacked' ? '堆疊' : '並排'}` : '單一來源 · 專案內媒體'}</span></div>
        <div class="inline-video-actions">
          <button class="button button-quiet" type="button" data-frame-action="open">開啟控制項</button>
        </div>
      </header>
      <div class="inline-video-grid" data-layout="${layout}">${sides}</div>
      ${comparison ? renderFramePlayerControls(block.label || '雙影片', { shared: true, block }) : ''}
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
      manualPlayback: false,
      manualPlaybackFrame: null,
      manualPlaybackCancel: null,
      manualPlaybackTimestamp: null,
      manualPlaybackTime: null,
      manualPlaybackSerial: 0,
      rateTransition: false,
      rateSerial: 0,
      rateSyncGuard: false,
      rateInteractionGuard: false,
      frameEngineGuard: false,
      primarySide: 'single',
      controlMap: null,
      sideControls: Object.create(null),
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
  return block?.type === 'comparisonVideo' ? ['left', 'right'] : ['single'];
}

function framePlayerPrimarySide(block, runtime, card) {
  return framePlayerSides(block, card)[0];
}
function commonFrameRangeConfig(block) {
  const value = block?.commonSegment && typeof block.commonSegment === 'object' ? block.commonSegment : {};
  const inValue = Number(value.in);
  const outValue = Number(value.out);
  return {
    in: Number.isInteger(inValue) && inValue > 0 ? inValue : 0,
    out: Number.isInteger(outValue) && outValue > 0 ? outValue : 0,
  };
}
function commonLoopEnabled(block) {
  return block?.loop?.enabled !== false;
}
function framePlayerSelectionKey(card) {
  const owner = card?.closest?.('[data-block-id]');
  const blockId = owner?.dataset.blockId;
  return blockId || null;
}

function syncFramePlayerSelectionDom() {
  const players = elements.blockCanvas
    ? [...elements.blockCanvas.querySelectorAll('[data-frame-player]')]
    : [];
  const selectedKey = state.player.selectedPlayerKey;
  if (selectedKey && !players.some((card) => framePlayerSelectionKey(card) === selectedKey)) {
    state.player.selectedPlayerKey = null;
  }
  players.forEach((card) => {
    const selected = Boolean(state.player.selectedPlayerKey)
      && framePlayerSelectionKey(card) === selectedKey;
    card.dataset.frameSelected = selected ? 'true' : 'false';
    card.setAttribute('aria-selected', selected ? 'true' : 'false');
  });
}

function selectFramePlayer(card) {
  const key = framePlayerSelectionKey(card);
  if (!key) return false;
  state.player.selectedPlayerKey = key;
  state.player.selectedBlockId = card.closest('[data-block-id]')?.dataset.blockId || state.player.selectedBlockId;
  syncFramePlayerSelectionDom();
  return true;
}

function selectedFramePlayerCard() {
  const key = state.player.selectedPlayerKey;
  if (!key || !elements.blockCanvas) return null;
  return [...elements.blockCanvas.querySelectorAll('[data-frame-player]')].find((card) => framePlayerSelectionKey(card) === key) || null;
}

function framePlayerKeyTargetIsEditable(target) {
  return Boolean(target?.closest?.('[data-frame-side-controls]')
    || target?.matches?.('input, textarea, select, [contenteditable="true"]')
    || target?.isContentEditable);
}

function framePlayerReady(block, runtime, card) {
  return framePlayerSides(block, card).every((side) => {
    const cache = runtime.caches[side];
    return cache && Number.isInteger(cache.frameCount) && cache.frameCount > 0;
  });
}

function framePlayerSideConfiguredRange(block, runtime, side) {
  const cache = runtime.caches[side];
  if (!cache || !Number.isInteger(cache.frameCount) || cache.frameCount <= 0) return null;
  const config = playerSideConfig(block, side) || {};
  const inValue = Number(config.segment?.in);
  const outValue = Number(config.segment?.out);
  const start = Math.max(0, Math.min(cache.frameCount - 1, Number.isFinite(inValue) && inValue >= 0 ? Math.round(inValue) : 0));
  const end = Number.isFinite(outValue) && outValue > 0
    ? Math.max(start, Math.min(cache.frameCount - 1, Math.round(outValue)))
    : cache.frameCount - 1;
  return { start, end };
}

function framePlayerSideRuntime(card, side) {
  const runtime = framePlayerRuntimeForCard(card);
  if (!runtime.sideControls[side]) {
    runtime.sideControls[side] = {
      active: false,
      playing: false,
      frame: 0,
      scrubActive: false,
      dragTarget: null,
      dragFrame: null,
      exactTarget: null,
      exactPromise: null,
      seekRuntime: { seekSerial: 0, pendingSeeks: new Map() },
    };
  }
  return runtime.sideControls[side];
}

function framePlayerSideControls(card, side) {
  return inlineSideElementForCard(card, side)?.querySelector('[data-frame-side-controls]') || null;
}
function updateFramePlayerSideControls(card, side) {
  const entry = blockForEditorCard(card);
  const block = entry.block;
  const runtime = framePlayerRuntimeForCard(card);
  const controls = framePlayerSideControls(card, side);
  if (!controls || !block) return;
  const state = framePlayerSideRuntime(card, side);
  const range = framePlayerSideConfiguredRange(block, runtime, side);
  const cache = runtime.caches[side];
  const count = cache?.frameCount || 0;
  const video = framePlayerVideoForSide(card, side);
  const fallbackFrame = video && cache
    ? Math.max(0, Math.min(count - 1, Math.round((Number(video.currentTime) || 0) * (Number(cache.fps) || 30))))
    : 0;
  const frame = range
    ? Math.max(range.start, Math.min(range.end, Number.isInteger(state.frame) ? state.frame : fallbackFrame))
    : fallbackFrame;
  state.frame = frame;
  const timeline = controls.querySelector('[data-frame-timeline]');
  const current = controls.querySelector('[data-frame-current], [data-frame-position]');
  const total = controls.querySelector('[data-frame-total]');
  const previous = controls.querySelector('[data-frame-action="previous"]');
  const next = controls.querySelector('[data-frame-action="next"]');
  const toggle = controls.querySelector('[data-frame-action="toggle"]');
  const available = Boolean(range && count > 0 && runtime.lifecycle !== 'loading' && state.exactTarget === null);
  if (timeline) {
    timeline.min = String(range?.start ?? 0);
    timeline.max = String(range?.end ?? Math.max(0, count - 1));
    timeline.value = String(frame);
    timeline.disabled = !available;
  }
  if (current) current.textContent = count > 0 ? ('第 ' + (frame + 1) + ' 幀') : '尚未準備';
  if (total) total.textContent = count > 0 ? ('共 ' + count + ' 幀') : '共 -- 幀';
  if (previous) previous.disabled = !available || !range || frame <= range.start;
  if (next) next.disabled = !available || !range || frame >= range.end;
  if (toggle) {
    toggle.disabled = !available;
    toggle.textContent = state.playing ? '⏸' : '▶';
    toggle.setAttribute('aria-pressed', state.playing ? 'true' : 'false');
    toggle.setAttribute('aria-label', state.playing ? '暫停' : '播放');
    toggle.title = state.playing ? '暫停' : '播放';
  }
}

function clearIndependentSideControls(card, except = null) {
  const entry = blockForEditorCard(card);

  for (const side of framePlayerSides(entry.block, card)) {
    if (side === except) continue;
    const state = framePlayerSideRuntime(card, side);
    state.seekRuntime.seekSerial += 1;
    cancelPendingVideoSeek(state.seekRuntime, framePlayerVideoForSide(card, side));
    state.active = false;
    state.playing = false;
    state.scrubActive = false;
    state.dragTarget = null;
    const video = framePlayerVideoForSide(card, side);
    if (video) video.pause();
    updateFramePlayerSideControls(card, side);
  }
}


function framePlayerControlMap(block, runtime, card) {
  const sides = framePlayerSides(block, card);
  if (sides.length !== 2) return null;
  const ranges = Object.fromEntries(sides.map((side) => [side, framePlayerSideConfiguredRange(block, runtime, side)]));
  if (!ranges.left || !ranges.right) return { ranges, count: 0, synced: false, syncValid: false };
  const configuredSync = block.sync && Number.isInteger(Number(block.sync.leftFrame)) && Number.isInteger(Number(block.sync.rightFrame))
    ? { leftFrame: Number(block.sync.leftFrame), rightFrame: Number(block.sync.rightFrame) }
    : null;
  const syncValid = Boolean(configuredSync
    && configuredSync.leftFrame >= ranges.left.start && configuredSync.leftFrame <= ranges.left.end
    && configuredSync.rightFrame >= ranges.right.start && configuredSync.rightFrame <= ranges.right.end);
  const backward = syncValid
    ? Math.max(0, Math.min(configuredSync.leftFrame - ranges.left.start, configuredSync.rightFrame - ranges.right.start))
    : 0;
  const forward = syncValid
    ? Math.max(0, Math.min(ranges.left.end - configuredSync.leftFrame, ranges.right.end - configuredSync.rightFrame))
    : Math.max(0, Math.min(ranges.left.end - ranges.left.start, ranges.right.end - ranges.right.start));
  const baseStarts = syncValid
    ? { left: configuredSync.leftFrame - backward, right: configuredSync.rightFrame - backward }
    : { left: ranges.left.start, right: ranges.right.start };
  const baseEnds = syncValid
    ? { left: configuredSync.leftFrame + forward, right: configuredSync.rightFrame + forward }
    : { left: baseStarts.left + forward, right: baseStarts.right + forward };
  const baseCount = Math.max(0, forward + backward + 1);
  const common = commonFrameRangeConfig(block);
  const commonStart = baseCount > 0 && common.in > 0 ? Math.min(baseCount - 1, common.in) : 0;
  let commonEnd = baseCount > 0 && common.out > 0 ? Math.min(baseCount - 1, common.out) : Math.max(0, baseCount - 1);
  if (commonEnd < commonStart) commonEnd = commonStart;
  const starts = { left: baseStarts.left + commonStart, right: baseStarts.right + commonStart };
  const ends = { left: baseStarts.left + commonEnd, right: baseStarts.right + commonEnd };
  const count = baseCount > 0 ? commonEnd - commonStart + 1 : 0;
  const syncIndex = syncValid && count > 0
    ? Math.max(0, Math.min(count - 1, backward - commonStart))
    : 0;
  return { ranges, baseStarts, baseEnds, starts, ends, baseCount, commonStart, commonEnd, count, synced: syncValid, syncValid, sync: configuredSync, syncIndex };
}
function framePlayerSideFrameForControl(block, runtime, card, side, index) {
  const map = framePlayerControlMap(block, runtime, card);
  if (!map || !Number.isFinite(map.starts?.[side])) return Math.max(0, Math.round(Number(index) || 0));
  const end = map.ends?.[side] ?? map.ranges?.[side]?.end ?? Number.MAX_SAFE_INTEGER;
  return Math.min(end, Math.max(map.starts[side], map.starts[side] + Math.round(Number(index) || 0)));
}
function framePlayerControlForSideFrame(block, runtime, card, side, frame) {
  const map = framePlayerControlMap(block, runtime, card);
  if (!map || !Number.isFinite(map.starts?.[side])) return Math.max(0, Math.round(Number(frame) || 0));
  return Math.max(0, Math.min(Math.max(0, map.count - 1), Math.round(Number(frame) - map.starts[side])));
}

function framePlayerFrameCount(block, runtime, card) {
  if (!framePlayerReady(block, runtime, card)) return 0;
  if (block?.type === 'comparisonVideo') return framePlayerControlMap(block, runtime, card)?.count || 0;
  const primary = framePlayerPrimarySide(block, runtime, card);
  return runtime.caches[primary]?.frameCount || 0;
}

function framePlayerSegmentStartIndex(block, runtime, card) {
  if (block?.type === 'comparisonVideo') return 0;
  const primarySide = framePlayerPrimarySide(block, runtime, card);
  const cache = runtime.caches[primarySide];
  if (!cache || !Number.isInteger(cache.frameCount) || cache.frameCount <= 0) return 0;
  const segmentIn = Number(playerSideConfig(block, primarySide).segment?.in);
  return Math.max(0, Math.min(cache.frameCount - 1, Number.isFinite(segmentIn) && segmentIn >= 0 ? Math.round(segmentIn) : 0));
}

function setFramePlayerStatus(card, message, stateName = '') {
  const status = card?.querySelector('[data-frame-shared-controls] [data-frame-player-status]')
    || card?.querySelector('[data-frame-player-status]');
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
  const sharedControls = card.querySelector('[data-frame-shared-controls]');
  const controlRoot = sharedControls || card;
  const timeline = controlRoot.querySelector('[data-frame-timeline]');
  const currentPosition = controlRoot.querySelector('[data-frame-current], [data-frame-position]');
  const totalPosition = controlRoot.querySelector('[data-frame-total]');
  const previous = controlRoot.querySelector('[data-frame-action="previous"]');
  const next = controlRoot.querySelector('[data-frame-action="next"]');
  const toggle = controlRoot.querySelector('[data-frame-action="toggle"]');
  const resetRate = controlRoot.querySelector('[data-frame-action="reset-rate"]');
  const rateSlider = controlRoot.querySelector('[data-frame-rate]');
  const rateInput = controlRoot.querySelector('[data-frame-rate-input]');
  const syncButton = controlRoot.querySelector('[data-frame-action="sync"]');
  const syncInfo = controlRoot.querySelector('[data-frame-sync-info]');
  const commonStartInput = controlRoot.querySelector('[data-frame-common-range="in"]');
  const commonEndInput = controlRoot.querySelector('[data-frame-common-range="out"]');
  const commonLoopInput = controlRoot.querySelector('[data-frame-common-loop]');
  const pendingSeek = runtime.lifecycle === 'loading' || runtime.exactSeek !== null;
  const available = count > 0 && !pendingSeek;
  const rateAvailable = entry.block?.type === 'comparisonVideo'
    ? count > 0 && runtime.lifecycle !== 'loading'
    : available;
  const map = entry.block?.type === 'comparisonVideo' ? framePlayerControlMap(entry.block, runtime, card) : null;
  if (timeline) {
    timeline.min = '0';
    timeline.max = String(maxIndex);
    timeline.value = String(index);
    timeline.disabled = !available;
  }
  if (currentPosition) currentPosition.textContent = count > 0 ? ('第 ' + (index + 1) + ' 幀') : '尚未準備';
  if (totalPosition) totalPosition.textContent = count > 0 ? ('共 ' + count + ' 幀') : '共 -- 幀';
  if (previous) previous.disabled = !available || index <= 0;
  if (next) next.disabled = !available || index >= maxIndex;
  if (toggle) {
    const playing = runtime.playing;
    toggle.disabled = !available || runtime.rateTransition;
    toggle.textContent = playing ? '⏸' : '▶';
    toggle.setAttribute('aria-pressed', playing ? 'true' : 'false');
    toggle.setAttribute('aria-label', playing ? '暫停' : '播放');
    toggle.title = playing ? '暫停' : '播放';
  }
  if (resetRate) resetRate.disabled = !rateAvailable;
  const rate = clampPlaybackRate(runtime.playbackRate);
  if (rateSlider) {
    rateSlider.value = String(playbackRateToSliderValue(rate));
    rateSlider.disabled = !rateAvailable;
  }
  if (rateInput) {
    rateInput.value = formatPlaybackRate(rate);
    rateInput.disabled = !rateAvailable;
  }
  if (syncButton) syncButton.disabled = !available || !map || !map.ranges?.left || !map.ranges?.right;
  if (syncInfo) {
    const sync = entry.block?.sync;
    syncInfo.textContent = map?.syncValid && sync ? ('左 Frame: ' + sync.leftFrame + ' · 右 Frame: ' + sync.rightFrame) : '尚未設定同步點';
  }
  if (commonStartInput && map) {
    commonStartInput.max = String(Math.max(0, (map.baseCount || map.count || 1) - 1));
    commonStartInput.value = String(commonFrameRangeConfig(entry.block).in);
    commonStartInput.disabled = !available;
  }
  if (commonEndInput && map) {
    commonEndInput.max = String(Math.max(0, (map.baseCount || map.count || 1) - 1));
    commonEndInput.value = String(commonFrameRangeConfig(entry.block).out);
    commonEndInput.disabled = !available;
  }
  if (commonLoopInput && entry.block?.type === 'comparisonVideo') {
    commonLoopInput.checked = commonLoopEnabled(entry.block);
    commonLoopInput.disabled = !available;
  }
  for (const side of framePlayerSides(entry.block, card)) updateFramePlayerSideControls(card, side);
}
function bindFramePlayerActionButtons(card) {
  card?.querySelectorAll('[data-frame-action="previous"], [data-frame-action="next"], [data-frame-action="toggle"], [data-frame-action="sync"]')
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
        const sideControls = button.closest('[data-frame-side-controls]');
        const side = sideControls?.dataset.frameControlSide;
        if (side) {
          if (action === 'previous') void stepFramePlayerSide(card, side, -1);
          else if (action === 'next') void stepFramePlayerSide(card, side, 1);
          else if (action === 'toggle') void toggleFramePlayerSide(card, side);
          return;
        }
        if (action === 'previous') void stepFramePlayer(card, -1);
        else if (action === 'next') void stepFramePlayer(card, 1);
        else if (action === 'toggle') void toggleFramePlayer(card);
        else if (action === 'sync') void syncDualFramePlayer(card);
      });
    });
}

function updateCommonFrameRange(block, field, rawValue) {
  if (!block || block.type !== 'comparisonVideo' || !['in', 'out'].includes(field)) return false;
  const current = commonFrameRangeConfig(block);
  const parsed = Number(rawValue);
  const value = Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
  current[field] = value;
  if (current.in > 0 && current.out > 0 && current.out < current.in) {
    if (field === 'in') current.out = current.in;
    else current.in = current.out;
  }
  block.commonSegment = current;
  return true;
}
function applyCommonFrameRangeFromControl(card, target, eventType) {
  const entry = blockForEditorCard(card);
  if (!entry.block || !target?.dataset?.frameCommonRange) return false;
  if (!['input', 'change'].includes(eventType)) return false;
  updateCommonFrameRange(entry.block, target.dataset.frameCommonRange, target.value);
  const runtime = framePlayerRuntimeForCard(card);
  const map = framePlayerControlMap(entry.block, runtime, card);
  runtime.currentFrameIndex = Math.max(0, Math.min(Math.max(0, (map?.count || 1) - 1), runtime.currentFrameIndex));
  updateFramePlayerControls(card);
  scheduleSave();
  return true;
}
function setCommonLoopFromControl(card, enabled) {
  const entry = blockForEditorCard(card);
  if (!entry.block || entry.block.type !== 'comparisonVideo') return false;
  entry.block.loop = { enabled: enabled === true };
  updateFramePlayerControls(card);
  scheduleSave();
  return true;
}
async function syncDualFramePlayer(card) {
  const entry = blockForEditorCard(card);
  const block = entry.block;
  const runtime = framePlayerRuntimeForCard(card);
  if (!block || block.type !== 'comparisonVideo' || !framePlayerReady(block, runtime, card)) return false;
  const frames = {};
  for (const side of ['left', 'right']) {
    const video = framePlayerVideoForSide(card, side);
    const cache = runtime.caches[side];
    if (!video || !cache) return false;
    const value = Math.max(0, Math.min(cache.frameCount - 1, Math.round((Number(video.currentTime) || 0) * (Number(cache.fps) || 30))));
    const range = framePlayerSideConfiguredRange(block, runtime, side);
    if (!range || value < range.start || value > range.end) {
      setFramePlayerStatus(card, '同步點必須位於左右影片各自的起終點範圍內。', 'error');
      return false;
    }
    frames[side] = value;
  }
  block.sync = { leftFrame: frames.left, rightFrame: frames.right };
  scheduleSave();
  const map = framePlayerControlMap(block, runtime, card);
  runtime.currentFrameIndex = map?.syncIndex ?? 0;
  updateFramePlayerControls(card);
  const ready = await seekFramePlayerIndex(card, runtime.currentFrameIndex, { exact: true, status: false });
  setFramePlayerStatus(card, ready ? '同步點已設定。' : '同步點已設定，但定位尚未完成。', ready ? 'loaded' : 'error');
  updateFramePlayerControls(card);
  return ready;
}

function framePlayerIndexForSide(block, runtime, side, primaryIndex) {
  const cache = runtime.caches[side];
  if (!cache || cache.frameCount <= 1) return 0;
  if (block?.type === 'comparisonVideo') return framePlayerSideFrameForControl(block, runtime, null, side, primaryIndex);
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

function cancelManualFramePlayer(card) {
  const runtime = framePlayerRuntimeForCard(card);
  runtime.manualPlaybackSerial += 1;
  if (runtime.manualPlaybackCancel) runtime.manualPlaybackCancel();
  runtime.manualPlaybackFrame = null;
  runtime.manualPlaybackCancel = null;
  runtime.manualPlaybackTimestamp = null;
  runtime.manualPlaybackTime = null;
  runtime.manualPlayback = false;
}

function scheduleManualFramePlayerTick(card, callback) {
  const runtime = framePlayerRuntimeForCard(card);
  const now = () => (typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now());
  if (typeof window.requestAnimationFrame === 'function') {
    const frame = window.requestAnimationFrame(callback);
    runtime.manualPlaybackFrame = frame;
    runtime.manualPlaybackCancel = () => window.cancelAnimationFrame?.(frame);
    return;
  }
  const timer = setTimeout(() => callback(now()), 16);
  runtime.manualPlaybackFrame = timer;
  runtime.manualPlaybackCancel = () => clearTimeout(timer);
}

function startManualDualFramePlayer(card) {
  const entry = blockForEditorCard(card);
  const block = entry.block;
  const runtime = framePlayerRuntimeForCard(card);
  const count = framePlayerFrameCount(block, runtime, card);
  if (!block || block.type !== 'comparisonVideo' || count <= 0) return false;
  cancelManualFramePlayer(card);
  runtime.seekSerial += 1;
  runtime.exactSeek = null;
  runtime.scrubActive = false;
  runtime.manualPlayback = true;
  runtime.playing = true;
  runtime.lifecycle = 'playing';
  runtime.manualPlaybackTimestamp = null;
  runtime.manualPlaybackTime = runtime.currentFrameIndex;
  runtime.rateSyncGuard = true;
  framePlayerSides(block, card).forEach((side) => {
    const video = framePlayerVideoForSide(card, side);
    cancelPendingVideoSeek(runtime, video);
    video?.pause();
    setNativePlaybackRate(video, PLAYBACK_RATE_DEFAULT);
  });
  runtime.rateSyncGuard = false;
  const serial = runtime.manualPlaybackSerial;
  const tick = (timestamp) => {
    if (serial !== runtime.manualPlaybackSerial || !runtime.manualPlayback || !runtime.playing || !card.isConnected) { cancelManualFramePlayer(card); return; }
    const now = Number(timestamp);
    const previous = runtime.manualPlaybackTimestamp;
    runtime.manualPlaybackTimestamp = Number.isFinite(now) ? now : (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const elapsed = Number.isFinite(previous) ? Math.min(0.1, Math.max(0, (runtime.manualPlaybackTimestamp - previous) / 1000)) : 0;
    const fps = Number(runtime.caches.left?.fps) > 0 ? Number(runtime.caches.left.fps) : 30;
    let next = (Number.isFinite(runtime.manualPlaybackTime) ? runtime.manualPlaybackTime : runtime.currentFrameIndex) + elapsed * clampPlaybackRate(runtime.playbackRate) * fps;
    const loopEnabled = commonLoopEnabled(block);
    if (next >= count) {
      if (loopEnabled && count > 1) next = next % count;
      else { runtime.currentFrameIndex = count - 1; void seekFramePlayerIndex(card, count - 1, { exact: false, status: false }); cancelManualFramePlayer(card); runtime.playing = false; runtime.lifecycle = 'paused'; setFramePlayerStatus(card, '已到達最後一幀。', 'loaded'); updateFramePlayerControls(card); return; }
    }
    runtime.manualPlaybackTime = next;
    runtime.currentFrameIndex = Math.max(0, Math.min(count - 1, Math.floor(next)));
    runtime.rateSyncGuard = true;
    framePlayerSides(block, card).forEach((side) => {
      const video = framePlayerVideoForSide(card, side);
      const sideIndex = framePlayerIndexForSide(block, runtime, side, runtime.currentFrameIndex);
      const targetTime = framePlayerTimeForSide(runtime, side, sideIndex);
      if (video && !video.seeking) { try { video.currentTime = targetTime; } catch {} }
    });
    runtime.rateSyncGuard = false;
    updateFramePlayerControls(card);
    scheduleManualFramePlayerTick(card, tick);
  };
  setFramePlayerStatus(card, '播放中（使用擴充速度時鐘）。', 'loaded');
  scheduleManualFramePlayerTick(card, tick);
  updateFramePlayerControls(card);
  return true;
}

function startManualFramePlayer(card) {
  const initialBlock = blockForEditorCard(card).block;
  if (initialBlock?.type === 'comparisonVideo') return startManualDualFramePlayer(card);
  const entry = blockForEditorCard(card);
  const block = entry.block;
  const runtime = framePlayerRuntimeForCard(card);
  const side = framePlayerPrimarySide(block, runtime, card);
  const video = framePlayerVideoForSide(card, side);
  if (!block || !video) return false;
  cancelManualFramePlayer(card);
  const manualPlaybackSerial = runtime.manualPlaybackSerial;
  runtime.seekSerial += 1;
  runtime.exactSeek = null;
  runtime.scrubActive = false;
  framePlayerSides(block, card).forEach((sideName) => {
    cancelPendingVideoSeek(runtime, framePlayerVideoForSide(card, sideName));
  });
  runtime.manualPlayback = true;
  runtime.playing = true;
  runtime.lifecycle = 'playing';
  runtime.manualPlaybackTimestamp = null;
  const initialBounds = inlinePlaybackBounds(block, side, video, runtime);
  const indexedTime = framePlayerTimeForSide(runtime, side, runtime.currentFrameIndex);
  const displayedTime = Number(video.currentTime);
  const initialTime = Number.isFinite(displayedTime) && !video.seeking
    && Math.abs(displayedTime - indexedTime) <= 0.25
    ? displayedTime
    : indexedTime;
  runtime.manualPlaybackTime = Math.max(initialBounds.start, initialTime);
  runtime.rateSyncGuard = true;
  try {
    video.pause();
    setNativePlaybackRate(video, PLAYBACK_RATE_DEFAULT);
  } finally {
    runtime.rateSyncGuard = false;
  }
  const tick = (timestamp) => {
    if (manualPlaybackSerial !== runtime.manualPlaybackSerial
      || !runtime.manualPlayback || !runtime.playing || !card.isConnected) {
      cancelManualFramePlayer(card);
      return;
    }
    const currentBlock = blockForEditorCard(card).block;
    const currentSide = framePlayerPrimarySide(currentBlock, runtime, card);
    const currentVideo = framePlayerVideoForSide(card, currentSide);
    if (!currentBlock || !currentVideo) {
      cancelManualFramePlayer(card);
      runtime.playing = false;
      return;
    }
    const now = Number(timestamp);
    const previous = runtime.manualPlaybackTimestamp;
    runtime.manualPlaybackTimestamp = Number.isFinite(now)
      ? now
      : (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
    const elapsed = Number.isFinite(previous)
      ? Math.min(0.1, Math.max(0, (runtime.manualPlaybackTimestamp - previous) / 1000))
      : 0;
    const config = playerSideConfig(currentBlock, currentSide);
    const bounds = inlinePlaybackBounds(currentBlock, currentSide, currentVideo, runtime);
    const rate = clampPlaybackRate(runtime.playbackRate);
    const currentTime = Number.isFinite(runtime.manualPlaybackTime) ? runtime.manualPlaybackTime : (Number.isFinite(currentVideo.currentTime) ? Math.max(bounds.start, currentVideo.currentTime) : bounds.start);
    let nextTime = currentTime + elapsed * rate;
    const displayedTime = Number(currentVideo.currentTime);
    if (!currentVideo.seeking && Number.isFinite(displayedTime)) {
      nextTime = Math.max(nextTime, displayedTime);
    }
    if (bounds.end !== null && bounds.end > bounds.start && nextTime >= bounds.end) {
      if (config.loop?.enabled === true) {
        const span = bounds.end - bounds.start;
        nextTime = bounds.start + ((nextTime - bounds.start) % span);
      } else {
        runtime.manualPlayback = false;
        runtime.playing = false;
        runtime.lifecycle = 'paused';
        runtime.rateSyncGuard = true;
        try {
          currentVideo.currentTime = bounds.end;
          currentVideo.pause();
        } finally {
          runtime.rateSyncGuard = false;
        }
        updateFramePlayerControls(card);
        setFramePlayerStatus(card, '已到達區段終點。', 'loaded');
        return;
      }
    }
    runtime.manualPlaybackTime = nextTime;
    if (currentVideo.seeking) {
      syncFramePlayerProgress(card, currentBlock, currentSide, currentVideo);
      scheduleManualFramePlayerTick(card, tick);
      return;
    }
    if (Number.isFinite(displayedTime) && Math.abs(displayedTime - nextTime) <= 0.0005) {
      syncFramePlayerProgress(card, currentBlock, currentSide, currentVideo);
      scheduleManualFramePlayerTick(card, tick);
      return;
    }
    runtime.rateSyncGuard = true;
    try {
      currentVideo.currentTime = nextTime;
    } catch {
      runtime.manualPlayback = false;
      runtime.playing = false;
      runtime.lifecycle = 'error';
      updateFramePlayerControls(card);
      setFramePlayerStatus(card, '影片定位未完成，請重試。', 'error');
      runtime.rateSyncGuard = false;
      return;
    }
    runtime.rateSyncGuard = false;
    syncFramePlayerProgress(card, currentBlock, currentSide, currentVideo);
    scheduleManualFramePlayerTick(card, tick);
  };
  setFramePlayerStatus(card, '播放中（使用擴充速度時鐘）。', 'loaded');
  scheduleManualFramePlayerTick(card, tick);
  updateFramePlayerControls(card);
  return true;
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
      const atTarget = !video.seeking && (targetTime === null
        || (Number.isFinite(mediaTime) && Math.abs(mediaTime - targetTime) <= tolerance)
        || (Number.isFinite(currentTime) && Math.abs(currentTime - targetTime) <= tolerance));
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
      && video.readyState >= 1
      && Math.abs((Number(video.currentTime) || 0) - targetTime) <= tolerance;
    const settledAtTarget = () => !video.seeking
      && video.readyState >= 2
      && Number.isFinite(Number(video.currentTime))
      && Math.abs((Number(video.currentTime) || 0) - targetTime) <= Math.max(tolerance * 4, 0.25);
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
      if (readyAtTarget() || settledAtTarget()) {
        void finish(true);
        return;
      }
      if (typeof video.requestVideoFrameCallback !== 'function') {
        if (!video.seeking) void finish(readyAtTarget() || settledAtTarget());
        return;
      }
      if (waitingForFrame) return;
      waitingForFrame = true;
      frameWait = waitForPresentedVideoFrame(video, targetTime, tolerance, 1000);
      void frameWait.then((presented) => finish(presented || readyAtTarget() || settledAtTarget()));
    };
    const onSeeked = () => {
      if (serial !== runtime.seekSerial) {
        void finish(false);
        return;
      }
      if (!readyAtTarget() && !settledAtTarget()) {
        try {
          video.currentTime = targetTime;
        } catch {
          void finish(false);
        }
        return;
      }
      waitForFrame();
    };
    const timer = setTimeout(() => { void finish(readyAtTarget() || settledAtTarget()); }, 2_500);
    runtime.pendingSeeks?.set(video, operation);
    video.addEventListener('seeked', onSeeked);
    if (Math.abs((Number(video.currentTime) || 0) - targetTime) < 0.0001 && video.readyState >= 1) {
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

function sideFrameIndexFromVideo(card, side) {
  const runtime = framePlayerRuntimeForCard(card);
  const cache = runtime.caches[side];
  const video = framePlayerVideoForSide(card, side);
  if (!cache || !video) return 0;
  const fps = Number(cache.fps) > 0 ? Number(cache.fps) : 30;
  return Math.max(0, Math.min(cache.frameCount - 1, Math.round((Number(video.currentTime) || 0) * fps)));
}

async function seekFramePlayerSideIndex(card, side, frameIndex, { exact = true, status = false } = {}) {
  const entry = blockForEditorCard(card);
  const block = entry.block;
  const runtime = framePlayerRuntimeForCard(card);
  if (runtime.playing || runtime.manualPlayback) stopFramePlayer(card);
  clearIndependentSideControls(card, side);
  const state = framePlayerSideRuntime(card, side);
  const cache = runtime.caches[side];
  const video = framePlayerVideoForSide(card, side);
  const range = framePlayerSideConfiguredRange(block, runtime, side);
  if (!block || !cache || !video || !range) return false;
  const target = Math.max(range.start, Math.min(range.end, Math.round(Number(frameIndex) || 0)));
  if (state.dragFrame !== null) {
    window.cancelAnimationFrame?.(state.dragFrame);
    state.dragFrame = null;
  }
  state.dragTarget = null;
  state.seekRuntime.seekSerial += 1;
  const serial = state.seekRuntime.seekSerial;
  state.active = true;
  state.playing = false;
  state.frame = target;
  state.exactTarget = exact ? target : null;
  cancelPendingVideoSeek(state.seekRuntime, video);
  try { video.pause(); } catch {}
  updateFramePlayerSideControls(card, side);
  if (status) setInlineVideoStatus(inlineSideElementForCard(card, side), '正在定位…', 'pending');
  const targetTime = framePlayerTimeForSide(runtime, side, target);
  let success = false;
  if (!exact) {
    try {
      if (video.seeking || typeof video.fastSeek !== 'function') video.currentTime = targetTime;
      else video.fastSeek(targetTime);
      success = true;
    } catch {
      success = false;
    }
  } else {
    const fps = Number(cache.fps) > 0 ? Number(cache.fps) : 30;
    success = await seekVideoExact(video, targetTime, serial, state.seekRuntime, Math.max(0.02, (0.5 / fps) + 0.01));
  }
  if (serial !== state.seekRuntime.seekSerial || !card.isConnected) return false;
  state.exactTarget = null;
  if (!success) {
    state.frame = sideFrameIndexFromVideo(card, side);
    if (status) setInlineVideoStatus(inlineSideElementForCard(card, side), '影片定位未完成，請重試。', 'error');
  } else if (status) {
    setInlineVideoStatus(inlineSideElementForCard(card, side), '已完成定位。', 'loaded');
  }
  updateFramePlayerSideControls(card, side);
  return success;
}

function requestFramePlayerSideScrub(card, side, frameIndex, { exact = false } = {}) {
  const runtime = framePlayerRuntimeForCard(card);
  const state = framePlayerSideRuntime(card, side);
  const block = blockForEditorCard(card).block;
  const range = framePlayerSideConfiguredRange(block, runtime, side);
  if (!range) return Promise.resolve(false);
  const target = Math.max(range.start, Math.min(range.end, Math.round(Number(frameIndex) || 0)));
  const controls = framePlayerSideControls(card, side);
  const timeline = controls?.querySelector('[data-frame-timeline]');
  if (timeline) timeline.value = String(target);
  state.dragTarget = target;
  if (exact) {
    state.scrubActive = false;
    if (state.exactTarget === target && state.exactPromise) return state.exactPromise;
    const promise = seekFramePlayerSideIndex(card, side, target, { exact: true, status: true });
    state.exactTarget = target;
    state.exactPromise = promise;
    void promise.finally(() => {
      if (state.exactPromise === promise) {
        state.exactPromise = null;
        state.exactTarget = null;
        updateFramePlayerSideControls(card, side);
      }
    });
    return promise;
  }
  if (state.dragFrame !== null) return Promise.resolve(true);
  const schedule = typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame.bind(window)
    : (callback) => setTimeout(callback, 0);
  state.dragFrame = schedule(() => {
    state.dragFrame = null;
    const latest = state.dragTarget;
    state.dragTarget = null;
    if (latest === null || !card.isConnected) return;
    void seekFramePlayerSideIndex(card, side, latest, { exact: false, status: false });
  });
  return Promise.resolve(true);
}

function stopFramePlayerSide(card, side) {
  const state = framePlayerSideRuntime(card, side);
  state.seekRuntime.seekSerial += 1;
  cancelPendingVideoSeek(state.seekRuntime, framePlayerVideoForSide(card, side));
  state.active = false;
  state.playing = false;
  state.scrubActive = false;
  state.dragTarget = null;
  state.exactTarget = null;
  if (state.dragFrame !== null) {
    window.cancelAnimationFrame?.(state.dragFrame);
    state.dragFrame = null;
  }
  const video = framePlayerVideoForSide(card, side);
  if (video) video.pause();
  updateFramePlayerSideControls(card, side);
}

async function toggleFramePlayerSide(card, side) {
  const entry = blockForEditorCard(card);
  const block = entry.block;
  const runtime = framePlayerRuntimeForCard(card);
  const state = framePlayerSideRuntime(card, side);
  const video = framePlayerVideoForSide(card, side);
  const range = framePlayerSideConfiguredRange(block, runtime, side);
  if (!block || !video || !range || runtime.lifecycle === 'loading') return false;
  if (state.playing) {
    stopFramePlayerSide(card, side);
    setInlineVideoStatus(inlineSideElementForCard(card, side), '已暫停。', 'loaded');
    return true;
  }
  stopFramePlayer(card);
  state.active = true;
  const atEnd = Number.isInteger(state.frame) && state.frame >= range.end;
  const frame = atEnd ? range.start : Math.max(range.start, Math.min(range.end, Number.isInteger(state.frame) ? state.frame : sideFrameIndexFromVideo(card, side)));
  state.frame = frame;
  const targetTime = framePlayerTimeForSide(runtime, side, frame);
  if (Math.abs((Number(video.currentTime) || 0) - targetTime) > 0.0001) {
    const positioned = await seekFramePlayerSideIndex(card, side, frame, { exact: true, status: false });
    if (!positioned) {
      setInlineVideoStatus(inlineSideElementForCard(card, side), '影片定位未完成，請重試。', 'error');
      return false;
    }
  }
  state.active = true;
  const nativeRate = setSafePlaybackRate(card, video, clampPlaybackRate(runtime.playbackRate));
  if (!nativeRate) setSafePlaybackRate(card, video, PLAYBACK_RATE_DEFAULT);
  enforceInlinePlaybackBounds(block, side, video, { starting: true });
  try {
    await video.play();
    state.active = true;
    state.playing = true;
    setInlineVideoStatus(inlineSideElementForCard(card, side), '播放中。', 'loaded');
    updateFramePlayerSideControls(card, side);
    return true;
  } catch (error) {
    state.playing = false;
    state.active = true;
    setInlineVideoStatus(inlineSideElementForCard(card, side), '播放失敗：' + (error?.message || '請重試。'), 'error');
    updateFramePlayerSideControls(card, side);
    return false;
  }
}

async function stepFramePlayerSide(card, side, direction) {
  const runtime = framePlayerRuntimeForCard(card);
  const block = blockForEditorCard(card).block;
  const range = framePlayerSideConfiguredRange(block, runtime, side);
  if (!range) return false;
  stopFramePlayerSide(card, side);
  const state = framePlayerSideRuntime(card, side);
  const current = Number.isInteger(state.frame) ? state.frame : sideFrameIndexFromVideo(card, side);
  const target = Math.max(range.start, Math.min(range.end, current + (direction < 0 ? -1 : 1)));
  return seekFramePlayerSideIndex(card, side, target, { exact: true, status: true });
}

function handleFramePlayerSideEvent(event, card, side) {
  const target = event.target;
  if (!target.matches('[data-frame-timeline]')) return true;
  const state = framePlayerSideRuntime(card, side);
  if (event.type === 'pointerdown') {
    state.scrubActive = true;
    try { target.setPointerCapture?.(event.pointerId); } catch {}
    void requestFramePlayerSideScrub(card, side, Number(target.value), { exact: false });
  } else if (event.type === 'pointermove') {
    if (!state.scrubActive) return true;
    void requestFramePlayerSideScrub(card, side, Number(target.value), { exact: false });
  } else if (event.type === 'input') {
    if (state.exactTarget !== null) return true;
    void requestFramePlayerSideScrub(card, side, Number(target.value), { exact: false });
  } else if (event.type === 'pointerup' || event.type === 'change') {
    state.scrubActive = false;
    try { target.releasePointerCapture?.(event.pointerId); } catch {}
    void requestFramePlayerSideScrub(card, side, Number(target.value), { exact: true });
  } else if (event.type === 'pointercancel') {
    state.scrubActive = false;
    state.dragTarget = null;
    if (state.dragFrame !== null) {
      window.cancelAnimationFrame?.(state.dragFrame);
      state.dragFrame = null;
    }
    try { target.releasePointerCapture?.(event.pointerId); } catch {}
  }
  return true;
}


async function seekFramePlayerIndex(card, frameIndex, { exact = true, status = true } = {}) {
  const entry = blockForEditorCard(card);
  clearIndependentSideControls(card);
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
  if (runtime.exactSeek === serial) runtime.exactSeek = null;
  if (serial !== runtime.seekSerial || !card.isConnected) return false;
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
    if (runtime.dragFrame !== null) {
      cancelAnimationFrame(runtime.dragFrame);
      runtime.dragFrame = null;
    }
    runtime.dragTarget = null;
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
  runtime.sideControls = Object.create(null);
  runtime.lifecycle = 'loading';
  runtime.rateTransition = false;
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
      const configuredRate = PLAYBACK_RATE_DEFAULT;
      if (side === framePlayerPrimarySide(block, runtime, card)) runtime.playbackRate = configuredRate;
      setSafePlaybackRate(card, video, configuredRate);
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
  const ready = await seekFramePlayerIndex(card, framePlayerSegmentStartIndex(block, runtime, card), { exact: true, status: false });
  runtime.lifecycle = ready ? 'ready' : 'error';
  framePlayerSides(block, card).forEach((side) => {
    const placeholder = inlineSideElementForCard(card, side)?.querySelector('[data-frame-placeholder]');
    if (placeholder) placeholder.hidden = !ready;
  });
  setFramePlayerStatus(card, ready ? '已顯示第 1 幀。' : '第一幀尚未呈現，請重試。', ready ? 'loaded' : 'error');
  updateFramePlayerControls(card);
}

function stopFramePlayer(card) {
  clearIndependentSideControls(card);
  const runtime = framePlayerRuntimeForCard(card);
  runtime.playing = false;
  runtime.rateTransition = false;
  runtime.rateSerial = (runtime.rateSerial || 0) + 1;
  cancelManualFramePlayer(card);
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

async function playFramePlayer(card, { fromRateTransition = false } = {}) {
  const entry = blockForEditorCard(card);
  const block = entry.block;
  const runtime = framePlayerRuntimeForCard(card);
  if (!fromRateTransition
    && (runtime.lifecycle === 'loading' || runtime.exactSeek !== null || runtime.rateTransition)) {
    throw new Error('影片正在準備，請稍候。');
  }
  const videos = framePlayerSides(block, card)
    .map((side) => framePlayerVideoForSide(card, side))
    .filter(Boolean);
  if (!block || videos.length === 0) throw new Error('影片尚未準備。');
  const rate = clampPlaybackRate(runtime.playbackRate);
  const nativeRate = videos.every((video) => setSafePlaybackRate(card, video, rate));
  if (!nativeRate) {
    if (!startManualFramePlayer(card)) throw new Error('影片尚未準備。');
    return;
  }
  runtime.manualPlayback = false;
  try {
    await Promise.all(videos.map((video) => video.play()));
    runtime.playing = true;
    runtime.lifecycle = 'playing';
    setFramePlayerStatus(card, '播放中。', 'loaded');
  } catch (error) {
    if (!unsupportedPlaybackRateError(error) || !startManualFramePlayer(card)) throw error;
  }
}

async function toggleFramePlayer(card) {
  const runtime = framePlayerRuntimeForCard(card);
  const entry = blockForEditorCard(card);
  if (!framePlayerReady(entry.block, runtime, card)
    || runtime.lifecycle === 'idle' || runtime.lifecycle === 'loading'
    || runtime.lifecycle === 'error' || runtime.exactSeek !== null || runtime.rateTransition) {
    setFramePlayerStatus(card, '影片正在準備，請稍候。', 'pending');
    updateFramePlayerControls(card);
    return;
  }
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
    if (desiredPlaying) {
      await playFramePlayer(card);
    } else {
      stopFramePlayer(card);
      runtime.lifecycle = 'paused';
      setFramePlayerStatus(card, '已暫停。', 'loaded');
    }
  } catch (error) {
    cancelManualFramePlayer(card);
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
  const entry = blockForEditorCard(card);
  if (!entry.block || !framePlayerReady(entry.block, runtime, card)
    || runtime.lifecycle === 'idle' || runtime.lifecycle === 'loading' || runtime.lifecycle === 'error') {
    setFramePlayerStatus(card, '影片正在準備，請稍候。', 'pending');
    updateFramePlayerControls(card);
    return;
  }
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
  applyFramePlayerRate(card, PLAYBACK_RATE_DEFAULT);
  setFramePlayerStatus(card, '播放速度已重置為 1.00 倍。', 'loaded');
}

function videosFor(card, block) {
  return framePlayerSides(block, card)
    .map((side) => framePlayerVideoForSide(card, side))
    .filter(Boolean);
}

function independentSideIsActive(card, block) {
  return framePlayerSides(block, card).some((side) => {
    const sideState = framePlayerSideRuntime(card, side);
    return Boolean(sideState?.active || sideState?.playing);
  });
}

function mainPlaybackIsActive(card, block, runtime, videos) {
  if (runtime.playing) return true;
  if (runtime.manualPlayback) return true;
  if (runtime.lifecycle !== 'playing') return false;
  return videos.some((video) => video && !video.paused);
}

function applyRequestedRate(card, runtime, videos, requestedRate) {
  runtime.playbackRate = requestedRate;
  const support = videos.map((video) => setSafePlaybackRate(card, video, requestedRate));
  return videos.length === 0 || support.every(Boolean);
}

function pauseStaleNativeResume(runtime, videos) {
  if (!runtime.manualPlayback) return;
  runtime.rateInteractionGuard = true;
  try {
    videos.forEach((video) => {
      try { video.pause(); } catch {}
    });
  } finally {
    runtime.rateInteractionGuard = false;
  }
}

function resumeNativePlayback(card, runtime, videos, rateSerial) {
  runtime.rateTransition = true;
  runtime.rateInteractionGuard = true;
  runtime.playing = true;
  runtime.lifecycle = 'playing';
  setFramePlayerStatus(card, '正在切換播放速度…', 'pending');
  updateFramePlayerControls(card);

  const playRequests = videos.map((video) => {
    try {
      return video.play();
    } catch (error) {
      return Promise.reject(error);
    }
  });

  void Promise.all(playRequests).then(() => {
    if (runtime.rateSerial !== rateSerial || runtime.manualPlayback) {
      pauseStaleNativeResume(runtime, videos);
      return;
    }
    runtime.rateTransition = false;
    runtime.rateInteractionGuard = false;
    runtime.playing = true;
    runtime.lifecycle = 'playing';
    setFramePlayerStatus(card, '播放中。', 'loaded');
    updateFramePlayerControls(card);
  }).catch((error) => {
    if (runtime.rateSerial !== rateSerial) return;
    runtime.rateTransition = false;
    runtime.rateInteractionGuard = false;
    if (unsupportedPlaybackRateError(error) && startManualFramePlayer(card)) {
      runtime.playing = true;
      runtime.lifecycle = 'playing';
      setFramePlayerStatus(card, '播放中（使用擴充速度時鐘）。', 'loaded');
      updateFramePlayerControls(card);
      return;
    }
    runtime.playing = false;
    runtime.lifecycle = 'error';
    setFramePlayerStatus(card, '播放失敗：' + (error?.message || '請重試。'), 'error');
    updateFramePlayerControls(card);
  });
}

function applyFramePlayerRate(card, rate) {
  const entry = blockForEditorCard(card);
  const block = entry.block;
  if (!block) return false;

  const runtime = framePlayerRuntimeForCard(card);
  const videos = videosFor(card, block);
  const wasPlaying = mainPlaybackIsActive(card, block, runtime, videos);
  const wasManual = runtime.manualPlayback === true;
  const hadIndependentSide = independentSideIsActive(card, block);
  const normalizedRate = clampPlaybackRate(rate, runtime.playbackRate);
  const rateSerial = (runtime.rateSerial || 0) + 1;
  runtime.rateSerial = rateSerial;

  if (hadIndependentSide) {
    runtime.rateInteractionGuard = true;
    try { clearIndependentSideControls(card); }
    finally { runtime.rateInteractionGuard = false; }
  }

  const nativeSupported = applyRequestedRate(card, runtime, videos, normalizedRate);

  if (!wasPlaying) {
    if (wasManual) cancelManualFramePlayer(card);
    runtime.rateTransition = false;
    runtime.rateInteractionGuard = false;
    updateFramePlayerControls(card);
    return true;
  }

  if (wasManual && !nativeSupported) {
    runtime.rateTransition = false;
    runtime.rateInteractionGuard = false;
    runtime.playing = true;
    runtime.lifecycle = 'playing';
    setFramePlayerStatus(card, '播放中（使用擴充速度時鐘）。', 'loaded');
    updateFramePlayerControls(card);
    return true;
  }

  if (!wasManual && nativeSupported) {
    const nativeAlreadyRunning = videos.length > 0 && videos.every((video) => !video.paused);
    if (nativeAlreadyRunning && !runtime.rateTransition) {
      runtime.playing = true;
      runtime.lifecycle = 'playing';
      setFramePlayerStatus(card, '播放中。', 'loaded');
      updateFramePlayerControls(card);
      return true;
    }
    resumeNativePlayback(card, runtime, videos, rateSerial);
    return true;
  }

  if (!nativeSupported) {
    runtime.rateTransition = true;
    runtime.rateInteractionGuard = true;
    const started = startManualFramePlayer(card);
    runtime.rateTransition = false;
    runtime.rateInteractionGuard = false;
    if (!started) {
      runtime.playing = false;
      runtime.lifecycle = 'error';
      setFramePlayerStatus(card, '播放失敗：影片尚未準備。', 'error');
    } else {
      runtime.playing = true;
      runtime.lifecycle = 'playing';
      setFramePlayerStatus(card, '播放中（使用擴充速度時鐘）。', 'loaded');
    }
    updateFramePlayerControls(card);
    return started;
  }

  runtime.rateTransition = true;
  runtime.rateInteractionGuard = true;
  cancelManualFramePlayer(card);
  runtime.playing = true;
  runtime.lifecycle = 'playing';
  resumeNativePlayback(card, runtime, videos, rateSerial);
  return true;
}
function handleFramePlayerEvent(event) {
  const target = event.target;
  const card = target.closest('[data-frame-player]');
  if (!card) return false;
  const sideControls = target.closest('[data-frame-side-controls]');
  if (sideControls) {
    return handleFramePlayerSideEvent(event, card, sideControls.dataset.frameControlSide);
  }
  if (target.matches('[data-frame-common-range]')) {
    applyCommonFrameRangeFromControl(card, target, event.type);
    return true;
  }
  if (target.matches('[data-frame-common-loop]')) {
    if (event.type === 'change' || event.type === 'input') setCommonLoopFromControl(card, target.checked);
    return true;
  }
  if (target.matches('[data-frame-timeline]')) {
    const runtime = framePlayerRuntimeForCard(card);
    if (event.type === 'pointerdown') {
      runtime.scrubActive = true;
      try {
        target.setPointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture is unavailable in some test and legacy WebViews.
      }
      void requestFramePlayerScrub(card, Number(target.value), { exact: false });
    } else if (event.type === 'pointermove') {
      if (!runtime.scrubActive) return true;
      void requestFramePlayerScrub(card, Number(target.value), { exact: false });
    } else if (event.type === 'input') {
      if (runtime.exactSeek !== null) return true;
      void requestFramePlayerScrub(card, Number(target.value), { exact: false });
    } else if (event.type === 'pointerup' || event.type === 'change') {
      try {
        target.releasePointerCapture?.(event.pointerId);
      } catch {
        // The pointer may already have been released by the browser.
      }
      void requestFramePlayerScrub(card, Number(target.value), { exact: true });
    } else if (event.type === 'pointercancel') {
      runtime.scrubActive = false;
      runtime.dragTarget = null;
      if (runtime.dragFrame !== null) {
        window.cancelAnimationFrame(runtime.dragFrame);
        runtime.dragFrame = null;
      }
      try {
        target.releasePointerCapture?.(event.pointerId);
      } catch {
        // The pointer may already have been released by the browser.
      }
    }
    return true;
  }
  if (target.matches('[data-frame-rate], [data-frame-rate-input]')) {
    if (!['input', 'change'].includes(event.type)) return true;
    if (target.matches('[data-frame-rate-input]') && target.value.trim() === '') {
      return true;
    }
    const rate = target.matches('[data-frame-rate]')
      ? sliderValueToPlaybackRate(target.value)
      : clampPlaybackRate(Number(target.value), framePlayerRuntimeForCard(card).playbackRate);
    applyFramePlayerRate(card, rate);
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
  const isArrow = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
  const isSpace = event.key === ' ' || event.key === 'Spacebar';
  if (!isArrow && !isSpace) return;
  if (event.repeat && isSpace) return;
  if (framePlayerKeyTargetIsEditable(event.target)) return;
  const card = selectedFramePlayerCard();
  if (!card) return;
  event.preventDefault();
  if (isSpace) void toggleFramePlayer(card);
  else void stepFramePlayer(card, event.key === 'ArrowRight' ? 1 : -1);
}
function inlinePlaybackBounds(block, side, video, runtime = null) {
  const config = playerSideConfig(block, side);
  const cache = runtime?.caches?.[side] || null;
  const fps = Number(cache?.fps || video?.dataset?.frameFps || 30) > 0
    ? Number(cache?.fps || video?.dataset?.frameFps || 30)
    : 30;
  const frameCount = Number.isInteger(cache?.frameCount) && cache.frameCount > 0 ? cache.frameCount : null;
  const frameTimes = Array.isArray(cache?.frameTimes) ? cache.frameTimes : null;
  const frameTime = (index) => {
    const safeIndex = Math.max(0, Math.round(Number(index) || 0));
    const fromCache = frameTimes && Number.isFinite(Number(frameTimes[safeIndex])) ? Number(frameTimes[safeIndex]) : null;
    return fromCache === null ? safeIndex / fps : fromCache;
  };
  const duration = Number.isFinite(video?.duration) && video.duration > 0 ? video.duration : null;
  const startValue = Number(config.segment?.in);
  const startFrame = Math.max(0, Number.isFinite(startValue) ? Math.round(startValue) : 0);
  const outValue = Number(config.segment?.out);
  const endFrame = Number.isFinite(outValue) && outValue > 0
    ? Math.max(startFrame, Math.round(outValue))
    : null;
  const start = frameTime(startFrame);
  const nextFrameTime = endFrame === null
    ? null
    : (frameCount !== null && endFrame + 1 >= frameCount
      ? duration
      : frameTime(endFrame + 1));
  const end = nextFrameTime === null
    ? duration
    : (duration === null ? nextFrameTime : Math.min(nextFrameTime, duration));
  return { start, end };
}

function enforceInlinePlaybackBounds(block, side, video, { starting = false, runtime = null } = {}) {
  if (!video) return;
  const config = playerSideConfig(block, side);
  const { start, end } = inlinePlaybackBounds(block, side, video, runtime);
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
  const targetCard = card?.closest?.('[data-frame-player]') || card;
  const video = framePlayerVideoForSide(targetCard, side);
  if (!video) return;
  const runtime = framePlayerRuntimeForCard(targetCard);
  const rate = clampPlaybackRate(runtime.playbackRate || PLAYBACK_RATE_DEFAULT);
  runtime.playbackRate = rate;
  // Native looping always wraps the complete media file.  The editor uses
  // the block's segment.in/segment.out as the only loop bounds instead.
  video.loop = false;
  setSafePlaybackRate(targetCard, video, rate);
  if (block.type !== 'comparisonVideo' || framePlayerSideRuntime(targetCard, side).active) enforceInlinePlaybackBounds(block, side, video, { runtime });
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
  if (!cache) return;
  const independentSide = framePlayerSideRuntime(card, side);
  if (independentSide.active) {
    independentSide.frame = sideFrameIndexFromVideo(card, side);
    updateFramePlayerSideControls(card, side);
    return;
  }
  if (block?.type === 'comparisonVideo') {
    const map = framePlayerControlMap(block, runtime, card);
    if (!map || map.count <= 0) { updateFramePlayerControls(card); return; }
    if (runtime.manualPlayback && Number.isFinite(runtime.manualPlaybackTime)) {
      runtime.currentFrameIndex = Math.max(0, Math.min(map.count - 1, Math.round(runtime.manualPlaybackTime)));
      updateFramePlayerControls(card);
      return;
    }
    if ((runtime.scrubActive && video.paused) || (video.paused && video.seeking)) return;
    const controlIndexes = [];
    for (const sideName of ['left', 'right']) {
      const sideVideo = framePlayerVideoForSide(card, sideName);
      const sideCache = runtime.caches[sideName];
      if (!sideVideo || !sideCache) return;
      const sideFrame = Math.max(0, Math.min(sideCache.frameCount - 1, Math.round((Number(sideVideo.currentTime) || 0) * (Number(sideCache.fps) || 30))));
      if (runtime.playing && (sideFrame < map.starts[sideName] || sideFrame > map.ends[sideName])) {
        if (commonLoopEnabled(block) && !runtime.loopTransition) {
          runtime.loopTransition = true;
          void seekFramePlayerIndex(card, 0, { exact: true, status: false }).then(() => playFramePlayer(card)).finally(() => { runtime.loopTransition = false; });
        } else if (!commonLoopEnabled(block)) {
          stopFramePlayer(card);
          setFramePlayerStatus(card, '雙側影片已離開共同播放區間。', 'loaded');
        }
        return;
      }
      controlIndexes.push(framePlayerControlForSideFrame(block, runtime, card, sideName, sideFrame));
    }
    if (controlIndexes.length === 2) runtime.currentFrameIndex = Math.max(0, Math.min(...controlIndexes));
    updateFramePlayerControls(card);
    return;
  }
  if (side !== framePlayerPrimarySide(block, runtime, card)) return;
  if (runtime.manualPlayback && Number.isFinite(runtime.manualPlaybackTime)) {
    const fps = Number(cache.fps) > 0 ? Number(cache.fps) : 30;
    runtime.currentFrameIndex = Math.max(0, Math.min(cache.frameCount - 1, Math.round(runtime.manualPlaybackTime * fps)));
    updateFramePlayerControls(card);
    return;
  }
  if ((runtime.scrubActive && video.paused) || (video.paused && video.seeking)) return;
  const fps = Number(cache.fps) > 0 ? Number(cache.fps) : 30;
  runtime.currentFrameIndex = Math.max(0, Math.min(cache.frameCount - 1, Math.round((Number(video.currentTime) || 0) * fps)));
  updateFramePlayerControls(card);
}

function bindInlineVideoRuntime(card, block, side, video) {
  if (!video || video.dataset.inlineRuntimeBound === 'true') return;
  video.dataset.inlineRuntimeBound = 'true';
  video.addEventListener('ratechange', (event) => {
    const current = blockForEditorCard(card).block;
    if (!current || !['singleVideo', 'comparisonVideo'].includes(current.type)) return;
    event.stopImmediatePropagation();
    updateFramePlayerControls(card);
  }, true);
  video.addEventListener('pause', (event) => {
    const current = blockForEditorCard(card).block;
    if (!current || !['singleVideo', 'comparisonVideo'].includes(current.type)) return;
    const runtime = framePlayerRuntimeForCard(card);
    if (!runtime.rateTransition && !runtime.rateInteractionGuard && !runtime.manualPlayback) return;
    event.stopImmediatePropagation();
    updateFramePlayerControls(card);
  }, true);
  video.addEventListener('timeupdate', () => {
    hideFramePlayerPlaceholder(video);
    const sideElement = video.closest('[data-inline-side]');
    const current = blockForEditorCard(card).block;
    if (current?.type === 'singleVideo' || current?.type === 'comparisonVideo') {
      if (current.type !== 'comparisonVideo' || framePlayerSideRuntime(card, side).active) enforceInlinePlaybackBounds(current, side, video);
      syncFramePlayerProgress(card, current, side, video);
    }
  });
  ['loadeddata', 'canplay', 'playing'].forEach((eventName) => {
    video.addEventListener(eventName, () => {
      hideFramePlayerPlaceholder(video);
      const current = blockForEditorCard(card).block;
      if (eventName === 'playing' && (current?.type === 'singleVideo' || current?.type === 'comparisonVideo')) {
        const frameRuntime = framePlayerRuntimeForCard(card);
        if (side === framePlayerPrimarySide(current, frameRuntime, card)
          && !framePlayerSideRuntime(card, side).active) {
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
      if (current.type !== 'comparisonVideo' || framePlayerSideRuntime(card, side).active) enforceInlinePlaybackBounds(current, side, video, { starting: true });
      if (side === framePlayerPrimarySide(current, frameRuntime, card)
        && !framePlayerSideRuntime(card, side).active) {
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
      && !framePlayerSideRuntime(card, side).active
      && !frameRuntime.frameEngineGuard
      && !frameRuntime.manualPlayback
      && !video.ended) {
      frameRuntime.playing = false;
      frameRuntime.lifecycle = 'paused';
      updateFramePlayerControls(card);
    }
  });
  video.addEventListener('ended', () => {
    const current = blockForEditorCard(card).block;
    const config = current ? playerSideConfig(current, side) : null;
    const frameRuntime = framePlayerRuntimeForCard(card);
    const sideRuntime = framePlayerSideRuntime(card, side);
    if (current?.type === 'comparisonVideo' && !sideRuntime.active) {
      if (frameRuntime.playing) {
        if (commonLoopEnabled(current) && !frameRuntime.loopTransition) {
          frameRuntime.loopTransition = true;
          void seekFramePlayerIndex(card, 0, { exact: true, status: false }).then(() => playFramePlayer(card)).finally(() => { frameRuntime.loopTransition = false; });
        } else if (!commonLoopEnabled(current)) {
          stopFramePlayer(card);
          setFramePlayerStatus(card, '雙側影片已離開共同播放區間。', 'loaded');
        }
      }
      return;
    }
    if (current && sideRuntime.active) {
      if (config?.loop?.enabled === true) {
        const { start } = inlinePlaybackBounds(current, side, video, frameRuntime);
        video.currentTime = start;
        sideRuntime.playing = true;
        void video.play().catch(() => { sideRuntime.playing = false; });
      } else {
        sideRuntime.playing = false;
        sideRuntime.frame = framePlayerSideConfiguredRange(current, frameRuntime, side)?.end ?? sideRuntime.frame;
      }
      updateFramePlayerSideControls(card, side);
      return;
    }
    if (current && config?.loop?.enabled === true) {
      const { start } = inlinePlaybackBounds(current, side, video, frameRuntime);
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
    if (card.matches('[data-frame-player]')) void prepareFramePlayerCard(card, entry.block, generation);
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
    const rateInput = sideElement?.querySelector('[data-frame-rate-input]');
    if (sideTitleElement) sideTitleElement.textContent = sideTitle;
    if (surface) surface.setAttribute('aria-label', `${sideTitle}影格畫面`);
    if (video) video.setAttribute('aria-label', `${sideTitle}影片`);
    if (controls) controls.setAttribute('aria-label', `${sideTitle}影格播放器控制`);
    if (timeline) timeline.setAttribute('aria-label', `${sideTitle}影格時間軸`);
    if (rate) rate.setAttribute('aria-label', `${sideTitle}播放速度`);
    if (rateInput) rateInput.setAttribute('aria-label', `${sideTitle}播放速度數值`);
  }
}

function renderBlockEditor(section, block, index) {
  const typeLabel = block.type === 'comparisonVideo'
    ? '雙影片'
    : block.type === 'singleVideo' ? '單一影片' : '';
  const headerLabel = typeLabel ? `<strong>${typeLabel}</strong>` : '';
  const body = block.type === 'rich-text' || block.type === 'text'
    ? renderRichTextEditor(block)
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
  const richEditor = richTextEditorFromNode(active);
  if (richEditor) {
    const selection = richTextSelectionForEditor(richEditor);
    if (selection) richTextSaveSelection(richEditor, selection.range, selection.offsets);
  }
  if (!active || !elements.blockCanvas?.contains(active)) return null;
  const card = active.closest('[data-block-id]');
  const section = active.closest('[data-section-id]');
  if (!card && !section) return null;
  return {
    sectionId: card?.dataset.sectionId || section?.dataset.sectionId || '',
    blockId: card?.dataset.blockId || '',
    blockPath: active.dataset.blockPath || '',
    blockMode: active.matches('[data-block-mode]'),
    richText: active.matches('[data-rich-text-editor]'),
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
        : snapshot.richText
          ? card.querySelector('[data-rich-text-editor]')
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
  if (snapshot.richText && target.matches('[data-rich-text-editor]')) {
    state.richText.editor = target;
    if (state.richText.offsets) richTextRestoreOffsets(target, state.richText.offsets);
    return;
  }
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
  syncFramePlayerSelectionDom();
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
      label: playerSideTitle(block, 'single') || '左側影片',
      segment: block.segment || { in: 0, out: 0 },
      segmentUnit: 'frames',
    };
    block.right = {
      mediaAssetId: null,
      label: '右側影片',
      segment: { in: 0, out: 0 },
      segmentUnit: 'frames',
    };
    delete block.mediaAssetId;
    delete block.sourceLabel;
    delete block.segment;
    delete block.segmentUnit;
    delete block.playback;
    delete block.loop;
    delete block.anchor;
    block.sync = { leftFrame: 0, rightFrame: 0 };
    block.commonSegment = { in: 0, out: 0 };
    block.loop = { enabled: true };
    delete block.binding;
    return;
  }
  if (mode === 'single' && block.type !== 'singleVideo') {
    block.type = 'singleVideo';
    block.mediaAssetId = referenceId(block.left?.mediaAssetId);
    block.sourceLabel = typeof block.left?.label === 'string' && block.left.label.trim() !== ''
      ? block.left.label
      : (typeof block.sourceLabel === 'string' ? block.sourceLabel : undefined);
    block.segment = block.left?.segment || { in: 0, out: 0 };
    block.segmentUnit = 'frames';
    block.loop = block.loop || { enabled: true };
    delete block.left;
    delete block.right;
    delete block.layout;
    delete block.anchor;
    delete block.sync;
    delete block.commonSegment;
    delete block.binding;
  }
}

function inlineSideFromPath(pathValue) {
  if (pathValue.startsWith('left.')) return 'left';
  if (pathValue.startsWith('right.')) return 'right';
  return null;
}

function constrainDualSegmentToSync(block, pathValue, value) {
  if (block?.type !== 'comparisonVideo' || !block.sync || !['left', 'right'].includes(pathValue.split('.')[0])) return value;
  const match = /^(left|right)\.segment\.(in|out)$/u.exec(pathValue);
  if (!match || typeof value !== 'number' || !Number.isFinite(value)) return value;
  const side = match[1];
  const kind = match[2];
  const syncFrame = Number(block.sync[side === 'left' ? 'leftFrame' : 'rightFrame']);
  if (!Number.isInteger(syncFrame) || syncFrame < 0) return value;
  if (kind === 'in' && value > syncFrame) return syncFrame;
  if (kind === 'out' && value > 0 && value < syncFrame) return syncFrame;
  return value;
}

function refreshInlineVideoAfterEditorChange(card, block, pathValue) {
  if (!block) return;
  const side = block.type === 'comparisonVideo' ? inlineSideFromPath(pathValue) : 'single';
  if (side) applyInlineSideSettings(card, block, side);
  patchInlineVideoCard(card, block);
}

function handleBlockEditorEvent(event) {
  const target = event.target;
  const player = target.closest?.("[data-frame-player]");
  if (player && (event.type === "pointerdown" || event.type === "click")) selectFramePlayer(player);
  if (target.closest('[data-inline-video-block]') && target.closest('[data-frame-action="open"]')) {
    if (event.type !== 'click') return;
    const details = target.closest('[data-inline-video-block]')?.querySelector('details');
    if (details) details.open = true;
    return;
  }
  if (target.closest('[data-frame-player]')
    && (target.matches('[data-frame-timeline]')
      || target.matches('[data-frame-rate]')
      || target.matches('[data-frame-rate-input]')
      || target.matches('[data-frame-common-range]')
      || target.matches('[data-frame-common-loop]')
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
  if (target.matches('[data-rich-text-editor]')) {
    if (!['input', 'keyup', 'blur'].includes(event.type)) return;
    commitRichTextEditor(target);
    return;
  }
  if (target.matches('[data-block-path]')) {
    if (!['input', 'change'].includes(event.type)) return;
    const requestedValue = editorControlValue(target);
    const constrainedValue = constrainDualSegmentToSync(block, target.dataset.blockPath, requestedValue);
    setEditorPath(block, target.dataset.blockPath, constrainedValue);
    if (constrainedValue !== requestedValue && constrainedValue !== null && target.type === 'number') {
      target.value = String(constrainedValue);
    }
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
    const content = block?.contentFormat === RICH_TEXT_HTML_FORMAT
      ? (typeof richTextApi.sanitizeRichTextHtml === 'function'
        ? richTextApi.sanitizeRichTextHtml(block.content || '')
        : richTextPlainHtml(block.content || ''))
      : richTextPlainHtml(block.content || '');
    return content ? '<p>' + content + '</p>' : '<p><span class="muted">尚未填寫</span></p>';
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
elements.blockCanvas?.addEventListener('pointercancel', handleBlockEditorEvent);
elements.richTextToolbar?.addEventListener('pointerdown', (event) => event.preventDefault());
elements.richTextToolbar?.addEventListener('click', handleRichTextToolbarClick);
elements.richTextLinkForm?.addEventListener('submit', (event) => { event.preventDefault(); applyRichTextLink(); });
document.addEventListener('selectionchange', updateRichTextToolbarFromSelection);
document.addEventListener('pointerdown', handleRichTextOutsidePointerDown);
elements.blockCanvas?.addEventListener('focusout', handleRichTextEditorFocusOut);
document.addEventListener("keydown", handleFramePlayerKeydown);
elements.blockCanvas?.addEventListener('focusout', () => {
  setTimeout(flushQueuedBlockCanvasRender, 0);
});

if (typeof window.pitchingApp?.onBeforeClose === 'function') {
  window.pitchingApp.onBeforeClose(() => flushPendingChanges());
}

if (restoreRememberedExportDirectory()) renderExportControls();

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
