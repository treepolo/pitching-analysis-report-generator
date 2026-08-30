'use strict';

(() => {
  const model = globalThis.pitchingAnnotationModel;
  const playhead = globalThis.pitchingAnnotationPlayhead;
  if (!model || !playhead) return;

  let activeEditor = null;
  const deleteUndo = new Map();

  function contextKey(blockId, side) {
    return `${blockId || ''}:${side || ''}`;
  }

  function contextFromToggle(toggle) {
    const sideElement = toggle?.closest?.('[data-inline-side]');
    const card = sideElement?.closest?.('[data-inline-video-block][data-frame-player]');
    const blockId = card?.dataset?.blockId || '';
    const side = sideElement?.dataset?.inlineSide || '';
    if (!card || !blockId || !side) return null;
    return { card, blockId, side };
  }

  function resolveActiveContext() {
    if (!activeEditor) return null;
    const cards = [...document.querySelectorAll('[data-inline-video-block][data-frame-player]')];
    const card = cards.find((entry) => entry.dataset.blockId === activeEditor.blockId) || null;
    const sideElement = card?.querySelector?.(`[data-inline-side="${activeEditor.side}"]`);
    const panel = sideElement?.querySelector?.(`[data-annotation-panel][data-annotation-side="${activeEditor.side}"]`);
    if (!card || !sideElement || !panel) {
      activeEditor = null;
      return null;
    }
    return { card, side: activeEditor.side, panel };
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
    const selectedId = context.panel.querySelector('[data-annotation-active-track]')?.value || '';
    return tracks.find((track) => track?.id === selectedId) || tracks[0] || null;
  }

  function projectStepFrames() {
    const raw = state?.activeProject?.exportSettings?.annotationStepFrames;
    return model.normalizeStepFrames(raw, 1);
  }

  function fieldConsumesEditingKeys(target) {
    const element = target?.closest?.('textarea, input, [contenteditable="true"]');
    if (!element) return false;
    if (element.matches?.('textarea, [contenteditable="true"]') || element.isContentEditable) return true;
    if (!element.matches?.('input')) return false;
    const type = String(element.type || 'text').toLowerCase();
    return ['text', 'search', 'email', 'url', 'tel', 'password', 'number'].includes(type);
  }

  function setStatus(context, message) {
    const freshPanel = context.card.querySelector(
      `[data-annotation-panel][data-annotation-side="${context.side}"]`,
    );
    const status = freshPanel?.querySelector?.('[data-annotation-status]');
    if (status) status.textContent = message;
  }

  function clearSelectedPoint(context) {
    const freshPanel = context.card.querySelector(
      `[data-annotation-panel][data-annotation-side="${context.side}"]`,
    );
    if (!freshPanel) return;
    delete freshPanel.dataset.annotationSelectedTrackId;
    delete freshPanel.dataset.annotationSelectedFrame;
  }

  function selectedPointTarget(context) {
    const freshPanel = context.card.querySelector(
      `[data-annotation-panel][data-annotation-side="${context.side}"]`,
    );
    const trackId = freshPanel?.dataset?.annotationSelectedTrackId || '';
    const frameText = freshPanel?.dataset?.annotationSelectedFrame;
    if (!trackId || frameText === undefined) return null;
    const frame = Number(frameText);
    if (!Number.isInteger(frame) || frame < 0) return null;
    const track = tracksFor(context).find((entry) => entry?.id === trackId) || null;
    const point = track?.points?.find((entry) => entry?.frame === frame) || null;
    return track && point ? { track, point, frame } : null;
  }

  function currentPointTarget(context) {
    const track = activeTrack(context);
    const frame = playhead.currentFrame(context.card, context.side);
    const point = track?.points?.find((entry) => entry?.frame === frame) || null;
    return { track, point, frame };
  }

  function deletePoint(context) {
    const target = selectedPointTarget(context) || currentPointTarget(context);
    if (!target.track || !target.point) {
      setStatus(context, `第 ${target.frame + 1} 幀沒有目前圖層可刪除的標註點。`);
      return false;
    }
    const key = contextKey(context.card.dataset.blockId, context.side);
    deleteUndo.set(key, { trackId: target.track.id, point: { ...target.point } });
    target.track.points = target.track.points.filter((point) => point.frame !== target.frame);
    clearSelectedPoint(context);
    if (typeof scheduleSave === 'function') scheduleSave();
    setStatus(context, `已刪除第 ${target.frame + 1} 幀的標註點。Ctrl+Z 可復原。`);
    return true;
  }

  function undoDelete(context) {
    const key = contextKey(context.card.dataset.blockId, context.side);
    const operation = deleteUndo.get(key);
    if (!operation) return false;
    const track = tracksFor(context).find((entry) => entry?.id === operation.trackId) || null;
    if (!track) {
      deleteUndo.delete(key);
      return false;
    }
    track.points = track.points.filter((point) => point.frame !== operation.point.frame);
    track.points.push({ ...operation.point });
    track.points.sort((left, right) => left.frame - right.frame);
    deleteUndo.delete(key);
    if (typeof scheduleSave === 'function') scheduleSave();
    setStatus(context, `已復原第 ${operation.point.frame + 1} 幀的標註點。`);
    return true;
  }

  async function stepByN(context, direction) {
    const step = projectStepFrames();
    const from = playhead.currentFrame(context.card, context.side);
    const requested = Math.max(0, from + (direction * step));
    const ok = await playhead.seekFrame(context.card, context.side, requested, { status: true });
    const actual = playhead.currentFrame(context.card, context.side);
    setStatus(
      context,
      ok
        ? `${direction < 0 ? '往回' : '往前'}步進 ${step} 幀；目前第 ${actual + 1} 幀。`
        : 'N 幀步進定位未完成，請重試。',
    );
    return ok;
  }

  function toggleCurrentlyEditing(toggle) {
    return Boolean(
      toggle?.classList?.contains('button-primary')
      || toggle?.textContent?.trim() === '結束標註',
    );
  }

  function synchronizeToggleDom() {
    const activeKey = activeEditor ? contextKey(activeEditor.blockId, activeEditor.side) : '';
    document.querySelectorAll('[data-annotation-action="toggle-edit"]').forEach((toggle) => {
      const context = contextFromToggle(toggle);
      const active = Boolean(context && contextKey(context.blockId, context.side) === activeKey);
      toggle.classList.toggle('button-primary', active);
      toggle.classList.toggle('button-quiet', !active);
      const label = active ? '結束標註' : '開始標註';
      if (toggle.textContent !== label) toggle.textContent = label;
    });
  }

  function queueToggleDomSync() {
    queueMicrotask(synchronizeToggleDom);
  }

  function handleToggleCapture(event) {
    const toggle = event.target.closest?.('[data-annotation-action="toggle-edit"]');
    if (!toggle) return;
    const context = contextFromToggle(toggle);
    if (!context) return;
    const key = contextKey(context.blockId, context.side);
    if (toggleCurrentlyEditing(toggle)) {
      if (activeEditor && contextKey(activeEditor.blockId, activeEditor.side) === key) activeEditor = null;
      queueToggleDomSync();
      return;
    }
    activeEditor = { blockId: context.blockId, side: context.side };
    deleteUndo.delete(key);
    queueToggleDomSync();
  }

  function handleShortcut(event) {
    const context = resolveActiveContext();
    if (!context) return;

    if (event.key === 'Escape') {
      activeEditor = null;
      queueToggleDomSync();
      return;
    }
    if (fieldConsumesEditingKeys(event.target)) return;

    const plain = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
    if (plain && (event.code === 'KeyA' || event.code === 'KeyD')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void stepByN(context, event.code === 'KeyA' ? -1 : 1);
      return;
    }

    const isDelete = event.key === 'Delete' || event.code === 'Delete' || event.key === 'Del';
    if (plain && isDelete) {
      event.preventDefault();
      event.stopImmediatePropagation();
      deletePoint(context);
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && undoDelete(context)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  window.addEventListener('click', handleToggleCapture, true);
  window.addEventListener('keydown', handleShortcut, true);
})();
