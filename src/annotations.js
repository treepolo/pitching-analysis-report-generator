'use strict';

(() => {
  const model = globalThis.pitchingAnnotationModel;
  if (!model) return;

  const PALETTE = ['#e53935', '#1e88e5', '#43a047', '#f9a825', '#8e24aa', '#00acc1', '#fb8c00', '#6d4c41'];
  const editorState = new Map();
  let activeEditorKey = null;

  function editorKey(card, side) {
    return `${card?.dataset?.blockId || ''}:${side}`;
  }

  function stateFor(card, side) {
    const key = editorKey(card, side);
    if (!editorState.has(key)) {
      editorState.set(key, {
        editing: false,
        activeTrackId: null,
        preview: null,
        undo: [],
        status: '',
        lastFrame: null,
      });
    }
    return editorState.get(key);
  }

  function blockEntry(card) {
    try {
      return typeof blockForEditorCard === 'function' ? blockForEditorCard(card) : { block: null };
    } catch {
      return { block: null };
    }
  }

  function sideConfigFor(card, side) {
    const block = blockEntry(card).block;
    if (!block) return null;
    if (side === 'single') return block;
    if (!block[side] || typeof block[side] !== 'object') block[side] = {};
    return block[side];
  }

  function annotationsFor(card, side, { create = true } = {}) {
    const config = sideConfigFor(card, side);
    if (!config) return null;
    if (!config.annotations && !create) return null;
    const normalized = model.normalizeAnnotations(config.annotations);
    config.annotations = normalized;
    return normalized;
  }

  function saveSoon() {
    if (typeof scheduleSave === 'function') scheduleSave();
  }

  function projectStepFrames() {
    const raw = state?.activeProject?.exportSettings?.annotationStepFrames;
    return model.normalizeStepFrames(raw, 1);
  }

  function newTrackId() {
    if (globalThis.crypto?.randomUUID) return `track-${globalThis.crypto.randomUUID()}`;
    return `track-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function createTrack(annotations) {
    const index = annotations.tracks.length;
    const track = {
      id: newTrackId(),
      name: `標註 ${index + 1}`,
      color: PALETTE[index % PALETTE.length],
      visible: true,
      startFrame: null,
      endFrame: null,
      points: [],
    };
    annotations.tracks.push(track);
    return track;
  }

  function activeTrack(card, side, { create = false } = {}) {
    const annotations = annotationsFor(card, side, { create });
    if (!annotations) return null;
    const uiState = stateFor(card, side);
    let track = annotations.tracks.find((entry) => entry.id === uiState.activeTrackId) || null;
    if (!track && annotations.tracks.length > 0) track = annotations.tracks[0];
    if (!track && create) track = createTrack(annotations);
    if (track) uiState.activeTrackId = track.id;
    return track;
  }

  function currentFrame(card, side) {
    try {
      if (typeof sideFrameIndexFromVideo === 'function') return Math.max(0, sideFrameIndexFromVideo(card, side));
    } catch {}
    const sideElement = card.querySelector(`[data-inline-side="${side}"]`);
    const video = sideElement?.querySelector('[data-inline-video]');
    const fps = Number(framePlayerRuntimeForCard?.(card)?.caches?.[side]?.fps) || 30;
    return Math.max(0, Math.round((Number(video?.currentTime) || 0) * fps));
  }

  function stopSide(card, side) {
    try {
      if (typeof stopFramePlayerSide === 'function') stopFramePlayerSide(card, side);
      else card.querySelector(`[data-inline-side="${side}"] video`)?.pause();
    } catch {}
  }

  function setStatus(card, side, message) {
    const uiState = stateFor(card, side);
    uiState.status = message;
    const panel = card.querySelector(`[data-annotation-panel][data-annotation-side="${side}"]`);
    const status = panel?.querySelector('[data-annotation-status]');
    if (status) status.textContent = message;
  }

  function ensureActiveEditing(card, side) {
    const key = editorKey(card, side);
    if (activeEditorKey && activeEditorKey !== key) {
      const previous = editorState.get(activeEditorKey);
      if (previous) previous.editing = false;
    }
    activeEditorKey = key;
    const uiState = stateFor(card, side);
    uiState.editing = true;
    stopSide(card, side);
    activeTrack(card, side, { create: true });
    refreshPanel(card, side);
  }

  function exitEditing(card, side) {
    const key = editorKey(card, side);
    const uiState = stateFor(card, side);
    uiState.editing = false;
    uiState.preview = null;
    if (activeEditorKey === key) activeEditorKey = null;
    refreshPanel(card, side);
  }

  function actualVideoRect(surface, video) {
    const surfaceRect = surface.getBoundingClientRect();
    const videoRect = video.getBoundingClientRect();
    const boxLeft = videoRect.left - surfaceRect.left;
    const boxTop = videoRect.top - surfaceRect.top;
    const boxWidth = videoRect.width;
    const boxHeight = videoRect.height;
    const sourceWidth = Number(video.videoWidth);
    const sourceHeight = Number(video.videoHeight);
    if (!(boxWidth > 0 && boxHeight > 0 && sourceWidth > 0 && sourceHeight > 0)) return null;
    const scale = Math.min(boxWidth / sourceWidth, boxHeight / sourceHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    return {
      surfaceRect,
      left: boxLeft + (boxWidth - width) / 2,
      top: boxTop + (boxHeight - height) / 2,
      width,
      height,
    };
  }

  function normalizedPointer(surface, video, event) {
    const rect = actualVideoRect(surface, video);
    if (!rect) return null;
    const x = (event.clientX - rect.surfaceRect.left - rect.left) / rect.width;
    const y = (event.clientY - rect.surfaceRect.top - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  }

  function pushUndo(card, side, operation) {
    const uiState = stateFor(card, side);
    uiState.undo.push(operation);
    if (uiState.undo.length > 100) uiState.undo.shift();
  }

  async function advanceAfterCommit(card, side, frame) {
    const step = projectStepFrames();
    const target = frame + step;
    try {
      const playhead = globalThis.pitchingAnnotationPlayhead;
      if (playhead && typeof playhead.seekFrame === 'function') {
        await playhead.seekFrame(card, side, target, { status: true });
      }
    } catch {}
  }

  async function commitPreview(card, side) {
    const uiState = stateFor(card, side);
    if (!uiState.editing) return false;
    const track = activeTrack(card, side, { create: true });
    if (!track) return false;
    if (!uiState.preview) {
      setStatus(card, side, '先把滑鼠移到影片實際畫面上的標註位置。');
      return false;
    }
    const frame = currentFrame(card, side);
    if (track.startFrame !== null && frame < track.startFrame) {
      setStatus(card, side, `目前第 ${frame + 1} 幀早於圖層開始幀。`);
      return false;
    }
    if (track.endFrame !== null && frame > track.endFrame) {
      setStatus(card, side, `目前第 ${frame + 1} 幀晚於圖層結束幀。`);
      return false;
    }
    const previous = track.points.find((point) => point.frame === frame) || null;
    pushUndo(card, side, {
      trackId: track.id,
      frame,
      previous: previous ? { ...previous } : null,
      previousStartFrame: track.startFrame,
    });
    const point = { frame, x: uiState.preview.x, y: uiState.preview.y };
    track.points = track.points.filter((entry) => entry.frame !== frame);
    track.points.push(point);
    track.points.sort((a, b) => a.frame - b.frame);
    if (track.startFrame === null) track.startFrame = frame;
    uiState.preview = null;
    saveSoon();
    setStatus(card, side, `已在第 ${frame + 1} 幀標記；自動前進 ${projectStepFrames()} 幀。`);
    refreshPanel(card, side);
    await advanceAfterCommit(card, side, frame);
    return true;
  }

  function selectedPointTarget(card, side) {
    const panel = card.querySelector(`[data-annotation-panel][data-annotation-side="${side}"]`);
    const trackId = panel?.dataset?.annotationSelectedTrackId || '';
    const frame = Number(panel?.dataset?.annotationSelectedFrame);
    if (!trackId || !Number.isInteger(frame) || frame < 0) return null;
    const annotations = annotationsFor(card, side);
    const track = annotations?.tracks?.find((entry) => entry.id === trackId) || null;
    const point = track?.points?.find((entry) => entry.frame === frame) || null;
    return track && point ? { track, point, frame } : null;
  }

  function clearSelectedPoint(card, side) {
    const panel = card.querySelector(`[data-annotation-panel][data-annotation-side="${side}"]`);
    if (!panel) return;
    delete panel.dataset.annotationSelectedTrackId;
    delete panel.dataset.annotationSelectedFrame;
  }

  function deleteCurrentPoint(card, side) {
    const selected = selectedPointTarget(card, side);
    const track = selected?.track || activeTrack(card, side);
    const frame = selected?.frame ?? currentFrame(card, side);
    if (!track) return;
    const previous = selected?.point || track.points.find((point) => point.frame === frame) || null;
    if (!previous) {
      setStatus(card, side, `第 ${frame + 1} 幀沒有目前圖層的標註點。`);
      return;
    }
    pushUndo(card, side, { trackId: track.id, frame, previous: { ...previous } });
    track.points = track.points.filter((point) => point.frame !== frame);
    clearSelectedPoint(card, side);
    saveSoon();
    setStatus(card, side, `已刪除第 ${frame + 1} 幀的標註點。`);
    refreshPanel(card, side);
  }

  function undoPoint(card, side) {
    const annotations = annotationsFor(card, side);
    const uiState = stateFor(card, side);
    const operation = uiState.undo.pop();
    if (!annotations || !operation) {
      setStatus(card, side, '目前沒有可復原的標註操作。');
      return;
    }
    const track = annotations.tracks.find((entry) => entry.id === operation.trackId);
    if (!track) return;
    track.points = track.points.filter((point) => point.frame !== operation.frame);
    if (operation.previous) track.points.push({ ...operation.previous });
    track.points.sort((a, b) => a.frame - b.frame);
    if (Object.prototype.hasOwnProperty.call(operation, 'previousStartFrame')) {
      track.startFrame = operation.previousStartFrame;
    }
    saveSoon();
    setStatus(card, side, '已復原上一個標註點操作。');
    refreshPanel(card, side);
  }

  function visiblePoints(track, frame) {
    const start = track.startFrame ?? 0;
    if (frame < start) return [];
    if (track.endFrame !== null && frame > track.endFrame) return [];
    return track.points.filter((point) => point.frame >= start && point.frame <= frame);
  }

  function drawSide(card, side) {
    const sideElement = card.querySelector(`[data-inline-side="${side}"]`);
    const surface = sideElement?.querySelector('[data-frame-surface]');
    const video = sideElement?.querySelector('[data-inline-video]');
    const overlay = surface?.querySelector('[data-annotation-overlay]');
    if (!surface || !video || !overlay) return;
    const rect = actualVideoRect(surface, video);
    if (!rect) {
      overlay.replaceChildren();
      return;
    }
    overlay.setAttribute('viewBox', `0 0 ${Math.max(1, rect.surfaceRect.width)} ${Math.max(1, rect.surfaceRect.height)}`);
    const annotations = annotationsFor(card, side, { create: false });
    const uiState = stateFor(card, side);
    const frame = currentFrame(card, side);
    if (uiState.editing && uiState.lastFrame !== frame) {
      uiState.lastFrame = frame;
      const currentTrack = activeTrack(card, side);
      const existing = currentTrack?.points?.find((point) => point.frame === frame);
      uiState.preview = existing ? { x: existing.x, y: existing.y } : null;
    } else if (!uiState.editing) {
      uiState.lastFrame = frame;
    }
    const nodes = [];
    if (annotations) {
      for (const track of annotations.tracks) {
        if (!track.visible) continue;
        const points = visiblePoints(track, frame);
        if (annotations.view.showLines && points.length >= 2) {
          const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
          polyline.setAttribute('points', points.map((point) => `${rect.left + point.x * rect.width},${rect.top + point.y * rect.height}`).join(' '));
          polyline.setAttribute('stroke', track.color);
          polyline.setAttribute('class', 'annotation-line');
          nodes.push(polyline);
        }
        if (annotations.view.showPoints) {
          points.forEach((point) => {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', String(rect.left + point.x * rect.width));
            circle.setAttribute('cy', String(rect.top + point.y * rect.height));
            circle.setAttribute('r', '5');
            circle.setAttribute('fill', track.color);
            circle.setAttribute('class', 'annotation-point');
            nodes.push(circle);
          });
        }
      }
    }
    const active = activeTrack(card, side);
    if (uiState.editing && active && uiState.preview) {
      const preview = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      preview.setAttribute('cx', String(rect.left + uiState.preview.x * rect.width));
      preview.setAttribute('cy', String(rect.top + uiState.preview.y * rect.height));
      preview.setAttribute('r', '7');
      preview.setAttribute('fill', 'none');
      preview.setAttribute('stroke', active.color);
      preview.setAttribute('class', 'annotation-preview-point');
      nodes.push(preview);
    }
    overlay.replaceChildren(...nodes);
  }

  function trackRows(annotations) {
    return annotations.tracks.map((track) => `
      <label class="annotation-track-toggle">
        <input type="checkbox" data-annotation-track-visible="${track.id}"${track.visible ? ' checked' : ''}>
        <span>${escapeAnnotationHtml(track.name)}</span>
      </label>`).join('');
  }

  function escapeAnnotationHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function renderPanel(card, side) {
    const annotations = annotationsFor(card, side);
    const uiState = stateFor(card, side);
    const track = activeTrack(card, side);
    const options = annotations.tracks.map((entry) => `<option value="${escapeAnnotationHtml(entry.id)}"${entry.id === uiState.activeTrackId ? ' selected' : ''}>${escapeAnnotationHtml(entry.name)}</option>`).join('');
    const trackSettings = track ? `
      <div class="annotation-track-settings">
        <label>名稱 <input type="text" maxlength="80" data-annotation-track-name value="${escapeAnnotationHtml(track.name)}"></label>
        <label>顏色 <input type="color" data-annotation-track-color value="${escapeAnnotationHtml(track.color)}"></label>
        <label>開始幀 <input type="number" min="0" step="1" data-annotation-track-start value="${track.startFrame ?? ''}" placeholder="第一個點"></label>
        <label>結束幀 <input type="number" min="0" step="1" data-annotation-track-end value="${track.endFrame ?? ''}" placeholder="不限"></label>
        <button type="button" class="button button-quiet" data-annotation-action="delete-track">刪除圖層</button>
      </div>` : '<p class="annotation-empty">尚無標註圖層。</p>';
    return `
      <div class="annotation-editor-panel" data-annotation-panel data-annotation-side="${side}">
        <div class="annotation-toolbar-row">
          <button type="button" class="button ${uiState.editing ? 'button-primary' : 'button-quiet'}" data-annotation-action="toggle-edit">${uiState.editing ? '結束標註' : '開始標註'}</button>
          <label>目前圖層 <select data-annotation-active-track>${options}</select></label>
          <button type="button" class="button button-quiet" data-annotation-action="add-track">+ 圖層</button>
          <label><input type="checkbox" data-annotation-show-points${annotations.view.showPoints ? ' checked' : ''}>點</label>
          <label><input type="checkbox" data-annotation-show-lines${annotations.view.showLines ? ' checked' : ''}>線</label>
        </div>
        <div class="annotation-track-visibility" aria-label="標註圖層顯示">${trackRows(annotations)}</div>
        ${trackSettings}
        <p class="annotation-help">標註模式：移動滑鼠定位；左鍵或空白鍵確定。←／→ 逐幀，Delete 刪除目前幀的點，Ctrl+Z 復原，Esc 結束。</p>
        <p class="annotation-status" data-annotation-status role="status">${escapeAnnotationHtml(uiState.status || (uiState.editing ? '移動滑鼠到影片畫面開始標註。' : '標註未啟用。'))}</p>
      </div>`;
  }

  function ensureSideUi(card, side) {
    const sideElement = card.querySelector(`[data-inline-side="${side}"]`);
    const surface = sideElement?.querySelector('[data-frame-surface]');
    if (!sideElement || !surface) return;
    if (!surface.querySelector('[data-annotation-overlay]')) {
      const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      overlay.setAttribute('class', 'annotation-overlay');
      overlay.setAttribute('data-annotation-overlay', '');
      overlay.setAttribute('aria-hidden', 'true');
      surface.append(overlay);
    }
    if (!sideElement.querySelector(`[data-annotation-panel][data-annotation-side="${side}"]`)) {
      const host = document.createElement('div');
      host.innerHTML = renderPanel(card, side).trim();
      const panel = host.firstElementChild;
      const status = sideElement.querySelector('[data-inline-status]');
      if (status) status.after(panel);
      else sideElement.append(panel);
    }
  }

  function refreshPanel(card, side) {
    const sideElement = card.querySelector(`[data-inline-side="${side}"]`);
    const oldPanel = sideElement?.querySelector(`[data-annotation-panel][data-annotation-side="${side}"]`);
    if (!sideElement || !oldPanel) return;
    const host = document.createElement('div');
    host.innerHTML = renderPanel(card, side).trim();
    oldPanel.replaceWith(host.firstElementChild);
  }

  function sidesForCard(card) {
    return card.dataset.framePlayerKind === 'comparison' ? ['left', 'right'] : ['single'];
  }

  function ensureAllUi() {
    const canvas = document.querySelector('#block-canvas');
    if (!canvas) return;
    canvas.querySelectorAll('[data-inline-video-block][data-frame-player]').forEach((card) => {
      sidesForCard(card).forEach((side) => ensureSideUi(card, side));
    });
  }

  function cardAndSideFromTarget(target) {
    const sideElement = target?.closest?.('[data-inline-side]');
    const card = sideElement?.closest?.('[data-inline-video-block][data-frame-player]');
    if (!card || !sideElement) return null;
    return { card, side: sideElement.dataset.inlineSide };
  }

  function handlePanelClick(event) {
    const action = event.target.closest?.('[data-annotation-action]');
    if (!action) return;
    const context = cardAndSideFromTarget(action);
    if (!context) return;
    const { card, side } = context;
    const annotations = annotationsFor(card, side);
    const uiState = stateFor(card, side);
    if (action.dataset.annotationAction === 'toggle-edit') {
      if (uiState.editing) exitEditing(card, side);
      else ensureActiveEditing(card, side);
      return;
    }
    if (action.dataset.annotationAction === 'add-track') {
      const track = createTrack(annotations);
      uiState.activeTrackId = track.id;
      saveSoon();
      refreshPanel(card, side);
      return;
    }
    if (action.dataset.annotationAction === 'delete-track') {
      const track = annotations.tracks.find((entry) => entry.id === uiState.activeTrackId)
        || annotations.tracks[0]
        || null;
      if (!track) return;
      if (!window.confirm(`刪除「${track.name}」圖層與其中 ${track.points.length} 個標註點？`)) return;
      annotations.tracks = annotations.tracks.filter((entry) => entry.id !== track.id);
      uiState.activeTrackId = annotations.tracks[0]?.id || null;
      saveSoon();
      refreshPanel(card, side);
    }
  }

  function handlePanelChange(event) {
    const context = cardAndSideFromTarget(event.target);
    if (!context) return;
    const { card, side } = context;
    const annotations = annotationsFor(card, side);
    const uiState = stateFor(card, side);
    const target = event.target;
    if (target.matches('[data-annotation-active-track]')) {
      uiState.activeTrackId = target.value || null;
      uiState.preview = null;
      refreshPanel(card, side);
      return;
    }
    if (target.matches('[data-annotation-show-points]')) annotations.view.showPoints = target.checked;
    else if (target.matches('[data-annotation-show-lines]')) annotations.view.showLines = target.checked;
    else if (target.matches('[data-annotation-track-visible]')) {
      const track = annotations.tracks.find((entry) => entry.id === target.dataset.annotationTrackVisible);
      if (track) track.visible = target.checked;
    } else {
      const track = activeTrack(card, side);
      if (!track) return;
      if (target.matches('[data-annotation-track-name]')) track.name = (target.value.trim() || track.name).slice(0, 80);
      else if (target.matches('[data-annotation-track-color]')) track.color = /^#[0-9a-f]{6}$/iu.test(target.value) ? target.value.toLowerCase() : track.color;
      else if (target.matches('[data-annotation-track-start]')) {
        track.startFrame = model.normalizeOptionalFrame(target.value);
        if (track.startFrame !== null && track.endFrame !== null && track.endFrame < track.startFrame) track.endFrame = track.startFrame;
      } else if (target.matches('[data-annotation-track-end]')) {
        track.endFrame = model.normalizeOptionalFrame(target.value);
        if (track.startFrame !== null && track.endFrame !== null && track.endFrame < track.startFrame) track.endFrame = track.startFrame;
      } else return;
    }
    saveSoon();
    refreshPanel(card, side);
  }

  function handleSurfacePointerMove(event) {
    const context = cardAndSideFromTarget(event.target);
    if (!context) return;
    const { card, side } = context;
    const uiState = stateFor(card, side);
    if (!uiState.editing) return;
    const surface = event.target.closest('[data-frame-surface]');
    const video = surface?.querySelector('[data-inline-video]');
    if (!surface || !video) return;
    uiState.preview = normalizedPointer(surface, video, event);
    if (!uiState.preview) setStatus(card, side, '黑邊不能放置標註點；請移到實際影片畫面。');
  }

  function handleSurfaceClick(event) {
    const surface = event.target.closest?.('[data-frame-surface]');
    if (!surface) return;
    const context = cardAndSideFromTarget(surface);
    if (!context) return;
    const uiState = stateFor(context.card, context.side);
    if (!uiState.editing) return;
    event.preventDefault();
    void commitPreview(context.card, context.side);
  }

  function activeContext() {
    if (!activeEditorKey) return null;
    const splitAt = activeEditorKey.lastIndexOf(':');
    if (splitAt < 0) return null;
    const blockId = activeEditorKey.slice(0, splitAt);
    const side = activeEditorKey.slice(splitAt + 1);
    const card = document.querySelector(`[data-inline-video-block][data-block-id="${CSS.escape(blockId)}"]`);
    if (!card || !stateFor(card, side).editing) return null;
    return { card, side };
  }

  function editableTarget(target) {
    return Boolean(target?.matches?.('input, textarea, select, [contenteditable="true"]') || target?.closest?.('input, textarea, select, [contenteditable="true"]'));
  }

  function pointShortcutEditingTarget(target) {
    const element = target?.closest?.('textarea, input, [contenteditable="true"]');
    if (!element) return false;
    if (element.matches?.('textarea, [contenteditable="true"]') || element.isContentEditable) return true;
    if (!element.matches?.('input')) return false;
    const type = String(element.type || 'text').toLowerCase();
    return ['text', 'search', 'email', 'url', 'tel', 'password', 'number'].includes(type);
  }

  function handleAnnotationKeydown(event) {
    const editingContext = activeContext();
    if (event.key === 'Escape') {
      if (!editingContext) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      exitEditing(editingContext.card, editingContext.side);
      return;
    }
    if (event.code === 'Space') {
      if (!editingContext || editableTarget(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void commitPreview(editingContext.card, editingContext.side);
      return;
    }
    const context = cardAndSideFromTarget(event.target) || editingContext;
    if (!context) return;
    if (event.key === 'Delete') {
      if (pointShortcutEditingTarget(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      deleteCurrentPoint(context.card, context.side);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      if (pointShortcutEditingTarget(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      undoPoint(context.card, context.side);
    }
  }

  document.addEventListener('click', handlePanelClick);
  document.addEventListener('change', handlePanelChange);
  document.addEventListener('pointermove', handleSurfacePointerMove);
  document.addEventListener('click', handleSurfaceClick);
  document.addEventListener('keydown', handleAnnotationKeydown, true);

  const canvas = document.querySelector('#block-canvas');
  if (canvas) new MutationObserver(ensureAllUi).observe(canvas, { childList: true, subtree: true });

  function animationLoop() {
    ensureAllUi();
    document.querySelectorAll('[data-inline-video-block][data-frame-player]').forEach((card) => {
      sidesForCard(card).forEach((side) => drawSide(card, side));
    });
    requestAnimationFrame(animationLoop);
  }

  ensureAllUi();
  requestAnimationFrame(animationLoop);
})();
