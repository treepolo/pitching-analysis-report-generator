'use strict';

(() => {
  const model = globalThis.pitchingAnnotationModel;
  const playhead = globalThis.pitchingAnnotationPlayhead;
  if (!model || !playhead) return;

  let shortcutTarget = null;
  let editingTarget = null;

  function contextKey(blockId, side) {
    return `${blockId || ''}:${side || ''}`;
  }

  function contextFromSideElement(sideElement) {
    const card = sideElement?.closest?.('[data-inline-video-block][data-frame-player]');
    const blockId = card?.dataset?.blockId || '';
    const side = sideElement?.dataset?.inlineSide || '';
    if (!card || !blockId || !side) return null;
    return { card, blockId, side };
  }

  function contextFromTarget(target) {
    return contextFromSideElement(target?.closest?.('[data-inline-side]'));
  }

  function resolveShortcutContext() {
    if (!shortcutTarget) return null;
    const targetKey = contextKey(shortcutTarget.blockId, shortcutTarget.side);
    const cards = [...document.querySelectorAll('[data-inline-video-block][data-frame-player]')];
    const card = cards.find((entry) => entry.dataset.blockId === shortcutTarget.blockId) || null;
    const sideElement = card?.querySelector?.(`[data-inline-side="${shortcutTarget.side}"]`);
    const panel = sideElement?.querySelector?.(`[data-annotation-panel][data-annotation-side="${shortcutTarget.side}"]`);
    if (!card || !sideElement || !panel) {
      shortcutTarget = null;
      if (editingTarget && contextKey(editingTarget.blockId, editingTarget.side) === targetKey) editingTarget = null;
      return null;
    }
    return { card, side: shortcutTarget.side, panel };
  }

  function projectStepFrames() {
    const raw = state?.activeProject?.exportSettings?.annotationStepFrames;
    return model.normalizeStepFrames(raw, 1);
  }

  function textEntryTarget(target) {
    const element = target?.closest?.('textarea, input, [contenteditable="true"]');
    if (!element) return false;
    if (element.matches?.('textarea, [contenteditable="true"]') || element.isContentEditable) return true;
    if (!element.matches?.('input')) return false;
    const type = String(element.type || 'text').toLowerCase();
    return ['text', 'search', 'email', 'url', 'tel', 'password'].includes(type);
  }

  function setStatus(context, message) {
    const freshPanel = context.card.querySelector(
      `[data-annotation-panel][data-annotation-side="${context.side}"]`,
    );
    const status = freshPanel?.querySelector?.('[data-annotation-status]');
    if (status) status.textContent = message;
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

  function synchronizeToggleDom() {
    const editingKey = editingTarget ? contextKey(editingTarget.blockId, editingTarget.side) : '';
    document.querySelectorAll('[data-annotation-action="toggle-edit"]').forEach((toggle) => {
      const context = contextFromTarget(toggle);
      const active = Boolean(context && contextKey(context.blockId, context.side) === editingKey);
      toggle.classList.toggle('button-primary', active);
      toggle.classList.toggle('button-quiet', !active);
      const label = active ? '結束標註' : '開始標註';
      if (toggle.textContent !== label) toggle.textContent = label;
    });
  }

  function queueToggleDomSync() {
    queueMicrotask(synchronizeToggleDom);
  }

  function rememberShortcutTarget(context) {
    if (!context) return;
    shortcutTarget = { blockId: context.blockId, side: context.side };
  }

  function handleInteractionCapture(event) {
    const context = contextFromTarget(event.target);
    if (context) rememberShortcutTarget(context);
  }

  function handleToggleCapture(event) {
    const toggle = event.target.closest?.('[data-annotation-action="toggle-edit"]');
    if (!toggle) return;
    const context = contextFromTarget(toggle);
    if (!context) return;
    rememberShortcutTarget(context);
    const key = contextKey(context.blockId, context.side);
    const editingKey = editingTarget ? contextKey(editingTarget.blockId, editingTarget.side) : '';
    if (editingKey === key) {
      editingTarget = null;
      queueToggleDomSync();
      return;
    }
    editingTarget = { blockId: context.blockId, side: context.side };
    queueToggleDomSync();
  }

  function handleShortcut(event) {
    const context = resolveShortcutContext();
    if (!context) return;

    if (event.key === 'Escape') {
      editingTarget = null;
      queueToggleDomSync();
      return;
    }

    const plain = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
    if (plain && (event.code === 'KeyA' || event.code === 'KeyD')) {
      if (textEntryTarget(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void stepByN(context, event.code === 'KeyA' ? -1 : 1);
    }
  }

  window.addEventListener('pointerdown', handleInteractionCapture, true);
  window.addEventListener('contextmenu', handleInteractionCapture, true);
  window.addEventListener('click', handleToggleCapture, true);
  window.addEventListener('keydown', handleShortcut, true);
})();
