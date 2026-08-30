'use strict';

(() => {
  const playhead = globalThis.pitchingAnnotationPlayhead;
  const model = globalThis.pitchingAnnotationModel;
  if (!playhead || !model) return;

  const deleteUndoByContext = new Map();
  const registrationSyncSerial = new Map();
  let boundaryRefreshQueued = false;

  function contextKey(card, side) {
    return `${card?.dataset?.blockId || ''}:${side || ''}`;
  }

  function contextFromPanel(panel) {
    const sideElement = panel?.closest?.('[data-inline-side]');
    const card = sideElement?.closest?.('[data-inline-video-block][data-frame-player]');
    if (!card || !sideElement || !panel) return null;
    return { card, side: sideElement.dataset.inlineSide, panel };
  }

  function contextFromTarget(target) {
    const sideElement = target?.closest?.('[data-inline-side]');
    const card = sideElement?.closest?.('[data-inline-video-block][data-frame-player]');
    const panel = sideElement?.querySelector?.('[data-annotation-panel]');
    if (!card || !sideElement || !panel) return null;
    return { card, side: sideElement.dataset.inlineSide, panel };
  }

  function activeContext() {
    const toggles = [...document.querySelectorAll('[data-annotation-panel] [data-annotation-action="toggle-edit"]')];
    const toggle = toggles.find((entry) => entry.classList?.contains('button-primary'))
      || toggles.find((entry) => entry.textContent?.trim() === '結束標註');
    return contextFromPanel(toggle?.closest?.('[data-annotation-panel]'));
  }

  function configFor(context) {
    try {
      const block = typeof blockForEditorCard === 'function' ? blockForEditorCard(context.card).block : null;
      if (!block) return null;
      if (context.side === 'single') return block;
      return block[context.side] && typeof block[context.side] === 'object' ? block[context.side] : null;
    } catch {
      return null;
    }
  }

  function tracksFor(context) {
    const config = configFor(context);
    return Array.isArray(config?.annotations?.tracks) ? config.annotations.tracks : [];
  }

  function activeTrack(context) {
    const tracks = tracksFor(context);
    const trackId = context.panel.querySelector('[data-annotation-active-track]')?.value || '';
    return tracks.find((track) => track?.id === trackId) || tracks[0] || null;
  }

  function projectStepFrames() {
    const raw = state?.activeProject?.exportSettings?.annotationStepFrames;
    return model.normalizeStepFrames(raw, 1);
  }

  function typingTarget(target) {
    const element = target?.closest?.('textarea, input, [contenteditable="true"]');
    if (!element) return false;
    if (element.matches?.('textarea, [contenteditable="true"]') || element.isContentEditable) return true;
    if (!element.matches?.('input')) return false;
    const type = String(element.type || 'text').toLowerCase();
    return ['text', 'search', 'email', 'url', 'tel', 'password'].includes(type);
  }

  function setStatus(context, message) {
    const panel = context.card.querySelector(`[data-annotation-panel][data-annotation-side="${context.side}"]`);
    const status = panel?.querySelector('[data-annotation-status]');
    if (status && status.textContent !== message) status.textContent = message;
  }

  function freshContext(context) {
    const panel = context.card.querySelector(`[data-annotation-panel][data-annotation-side="${context.side}"]`);
    return panel ? { card: context.card, side: context.side, panel } : context;
  }

  function selectedPointTarget(context) {
    const panel = freshContext(context).panel;
    const trackId = panel?.dataset?.annotationSelectedTrackId || '';
    const frame = Number(panel?.dataset?.annotationSelectedFrame);
    if (!trackId || !Number.isInteger(frame) || frame < 0) return null;
    const track = tracksFor(context).find((entry) => entry?.id === trackId);
    const point = track?.points?.find((entry) => entry?.frame === frame) || null;
    return track && point ? { track, point, frame } : null;
  }

  function currentPointTarget(context) {
    const fresh = freshContext(context);
    const track = activeTrack(fresh);
    const frame = playhead.currentFrame(fresh.card, fresh.side);
    const point = track?.points?.find((entry) => entry?.frame === frame) || null;
    return track && point ? { track, point, frame } : { track, point: null, frame };
  }

  function clearSelectedDataset(context) {
    const panel = freshContext(context).panel;
    if (!panel) return;
    delete panel.dataset.annotationSelectedTrackId;
    delete panel.dataset.annotationSelectedFrame;
  }

  function deletePoint(context) {
    const fresh = freshContext(context);
    const selected = selectedPointTarget(fresh);
    const target = selected || currentPointTarget(fresh);
    if (!target?.track || !target.point) {
      const frame = target?.frame ?? playhead.currentFrame(fresh.card, fresh.side);
      setStatus(fresh, `第 ${frame + 1} 幀沒有目前圖層可刪除的標註點。`);
      return false;
    }
    const key = contextKey(fresh.card, fresh.side);
    deleteUndoByContext.set(key, {
      trackId: target.track.id,
      point: { ...target.point },
    });
    target.track.points = target.track.points.filter((point) => point.frame !== target.frame);
    clearSelectedDataset(fresh);
    if (typeof scheduleSave === 'function') scheduleSave();
    setStatus(fresh, `已刪除第 ${target.frame + 1} 幀的標註點。Ctrl+Z 可復原。`);
    return true;
  }

  function undoCoordinatorDelete(context) {
    const fresh = freshContext(context);
    const key = contextKey(fresh.card, fresh.side);
    const operation = deleteUndoByContext.get(key);
    if (!operation) return false;
    const track = tracksFor(fresh).find((entry) => entry?.id === operation.trackId);
    if (!track) {
      deleteUndoByContext.delete(key);
      return false;
    }
    track.points = track.points.filter((point) => point.frame !== operation.point.frame);
    track.points.push({ ...operation.point });
    track.points.sort((left, right) => left.frame - right.frame);
    deleteUndoByContext.delete(key);
    if (typeof scheduleSave === 'function') scheduleSave();
    setStatus(fresh, `已復原第 ${operation.point.frame + 1} 幀的標註點。`);
    return true;
  }

  async function stepByConfiguredFrames(context, direction) {
    const fresh = freshContext(context);
    const step = projectStepFrames();
    const from = playhead.currentFrame(fresh.card, fresh.side);
    const requested = Math.max(0, from + (direction * step));
    const ok = await playhead.seekFrame(fresh.card, fresh.side, requested, { status: true });
    const actual = playhead.currentFrame(fresh.card, fresh.side);
    setStatus(
      fresh,
      ok
        ? `${direction < 0 ? '往回' : '往前'}步進 ${step} 幀；目前第 ${actual + 1} 幀。`
        : 'N 幀步進定位未完成，請重試。',
    );
    return ok;
  }

  function handleAnnotationShortcut(event) {
    const context = activeContext();
    if (!context || typingTarget(event.target)) return;

    const plainKey = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
    if (plainKey && (event.code === 'KeyA' || event.code === 'KeyD')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void stepByConfiguredFrames(context, event.code === 'KeyA' ? -1 : 1);
      return;
    }

    const isDelete = event.key === 'Delete' || event.code === 'Delete' || event.key === 'Del';
    if (plainKey && isDelete) {
      event.preventDefault();
      event.stopImmediatePropagation();
      deletePoint(context);
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      if (!undoCoordinatorDelete(context)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  function displayBoundaryValue(value) {
    return Number.isInteger(value) && value >= 0 ? String(value + 1) : '';
  }

  function syncBoundaryInputs(panel) {
    const context = contextFromPanel(panel);
    if (!context) return;
    const track = activeTrack(context);
    if (!track) return;
    const entries = [
      ['[data-annotation-track-start]', track.startFrame],
      ['[data-annotation-track-end]', track.endFrame],
    ];
    for (const [selector, internalValue] of entries) {
      const input = panel.querySelector(selector);
      if (!input) continue;
      if (input.min !== '1') input.min = '1';
      input.dataset.annotationUiFrameBase = '1';
      const display = displayBoundaryValue(internalValue);
      if (document.activeElement !== input && input.value !== display) input.value = display;
    }
  }

  function syncAllBoundaryInputs() {
    document.querySelectorAll('[data-annotation-panel]').forEach(syncBoundaryInputs);
  }

  function queueBoundaryRefresh() {
    if (boundaryRefreshQueued) return;
    boundaryRefreshQueued = true;
    queueMicrotask(() => {
      boundaryRefreshQueued = false;
      syncAllBoundaryInputs();
    });
  }

  function handleBoundaryChangeCapture(event) {
    const input = event.target.closest?.('[data-annotation-track-start], [data-annotation-track-end]');
    if (!input) return;
    const raw = String(input.value ?? '').trim();
    if (raw === '') {
      input.value = '';
      queueBoundaryRefresh();
      return;
    }
    const parsed = Number(raw);
    const oneBased = Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : null;
    input.value = oneBased === null ? '' : String(oneBased - 1);
    queueBoundaryRefresh();
  }

  function annotationRegistrationContext(event) {
    if (event.type === 'click') {
      if (event.button !== 0) return null;
      const surface = event.target.closest?.('[data-frame-surface]');
      if (!surface) return null;
      const context = contextFromTarget(surface);
      if (!context || !context.panel.querySelector('[data-annotation-action="toggle-edit"].button-primary')) return null;
      return context;
    }
    if (event.type === 'keydown' && event.code === 'Space') {
      if (event.repeat || typingTarget(event.target)) return null;
      return activeContext();
    }
    return null;
  }

  function legacyNavigationBusy(context) {
    try {
      if (typeof framePlayerSideRuntime === 'function') {
        const sideState = framePlayerSideRuntime(context.card, context.side);
        if (sideState?.exactPromise) return true;
        if (sideState?.exactTarget !== null && sideState?.exactTarget !== undefined) return true;
      }
    } catch {}
    try {
      if (typeof framePlayerVideoForSide === 'function' && framePlayerVideoForSide(context.card, context.side)?.seeking) return true;
    } catch {}
    return false;
  }

  async function waitForLegacyNavigation(context, serial) {
    const key = contextKey(context.card, context.side);
    const deadline = Date.now() + 3500;
    while (registrationSyncSerial.get(key) === serial && legacyNavigationBusy(context) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 12));
    }
    return registrationSyncSerial.get(key) === serial;
  }

  function scheduleRegistrationSync(context, originFrame) {
    const key = contextKey(context.card, context.side);
    deleteUndoByContext.delete(key);
    const serial = (registrationSyncSerial.get(key) || 0) + 1;
    registrationSyncSerial.set(key, serial);
    queueMicrotask(async () => {
      const fresh = freshContext(context);
      const statusText = fresh.panel?.querySelector('[data-annotation-status]')?.textContent || '';
      if (!statusText.includes(`已在第 ${originFrame + 1} 幀標記`)) return;
      if (!(await waitForLegacyNavigation(fresh, serial))) return;
      const target = originFrame + projectStepFrames();
      await playhead.seekFrame(fresh.card, fresh.side, target, { status: true });
    });
  }

  function handleRegistrationCapture(event) {
    const context = annotationRegistrationContext(event);
    if (!context) return;
    const originFrame = playhead.currentFrame(context.card, context.side);
    scheduleRegistrationSync(context, originFrame);
  }

  window.addEventListener('change', handleBoundaryChangeCapture, true);
  window.addEventListener('keydown', handleAnnotationShortcut, true);
  window.addEventListener('click', handleRegistrationCapture, true);
  window.addEventListener('keydown', handleRegistrationCapture, true);

  const canvas = document.querySelector('#block-canvas');
  if (canvas) new MutationObserver(queueBoundaryRefresh).observe(canvas, { childList: true, subtree: true });
  syncAllBoundaryInputs();
})();
