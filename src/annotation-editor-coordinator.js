'use strict';

(() => {
  let boundaryRefreshQueued = false;

  function contextFromPanel(panel) {
    const sideElement = panel?.closest?.('[data-inline-side]');
    const card = sideElement?.closest?.('[data-inline-video-block][data-frame-player]');
    if (!card || !sideElement || !panel) return null;
    return { card, side: sideElement.dataset.inlineSide, panel };
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

  window.addEventListener('change', handleBoundaryChangeCapture, true);

  const canvas = document.querySelector('#block-canvas');
  if (canvas) new MutationObserver(queueBoundaryRefresh).observe(canvas, { childList: true, subtree: true });
  syncAllBoundaryInputs();
})();
