'use strict';

(() => {
  const selectedByContext = new Map();
  let refreshQueued = false;

  function contextKey(card, side) {
    return `${card?.dataset?.blockId || ''}:${side || ''}`;
  }

  function contextFromPanel(panel) {
    const sideElement = panel?.closest?.('[data-inline-side]');
    const card = sideElement?.closest?.('[data-inline-video-block][data-frame-player]');
    if (!card || !sideElement) return null;
    return { card, side: sideElement.dataset.inlineSide, panel };
  }

  function configFor(card, side) {
    try {
      const block = typeof blockForEditorCard === 'function' ? blockForEditorCard(card).block : null;
      if (!block) return null;
      if (side === 'single') return block;
      return block[side] && typeof block[side] === 'object' ? block[side] : null;
    } catch {
      return null;
    }
  }

  function activeTrack(context) {
    const config = configFor(context.card, context.side);
    const tracks = Array.isArray(config?.annotations?.tracks) ? config.annotations.tracks : [];
    const trackId = context.panel.querySelector('[data-annotation-active-track]')?.value || '';
    return tracks.find((track) => track?.id === trackId) || tracks[0] || null;
  }

  function pointFrames(track) {
    if (!track || !Array.isArray(track.points)) return [];
    return track.points
      .map((point) => Number(point?.frame))
      .filter((frame) => Number.isInteger(frame) && frame >= 0)
      .sort((a, b) => a - b);
  }

  function ensurePointControl(panel) {
    if (!panel) return;
    let row = panel.querySelector('[data-annotation-point-navigation]');
    if (!row) {
      row = document.createElement('div');
      row.className = 'annotation-point-navigation';
      row.dataset.annotationPointNavigation = '';
      row.innerHTML = `
        <label>標註點
          <select data-annotation-point-select aria-label="選取目前圖層的標註點"></select>
        </label>
        <span class="annotation-point-count" data-annotation-point-count></span>`;
      const settings = panel.querySelector('.annotation-track-settings');
      if (settings) settings.after(row);
      else panel.querySelector('.annotation-toolbar-row')?.after(row);
    }

    const context = contextFromPanel(panel);
    if (!context) return;
    const track = activeTrack(context);
    const frames = pointFrames(track);
    const key = contextKey(context.card, context.side);
    const selected = selectedByContext.get(key);
    const validSelected = frames.includes(selected) ? selected : null;
    if (validSelected === null) selectedByContext.delete(key);

    const select = row.querySelector('[data-annotation-point-select]');
    const count = row.querySelector('[data-annotation-point-count]');
    const signature = `${track?.id || ''}|${frames.join(',')}|${validSelected ?? ''}`;
    if (select && select.dataset.pointSignature !== signature) {
      select.dataset.pointSignature = signature;
      select.innerHTML = [
        `<option value="">${frames.length ? '選擇點…' : '目前圖層沒有點'}</option>`,
        ...frames.map((frame) => `<option value="${frame}"${frame === validSelected ? ' selected' : ''}>第 ${frame + 1} 幀</option>`),
      ].join('');
      select.disabled = frames.length === 0;
    }
    if (count) {
      const text = `共 ${frames.length} 點`;
      if (count.textContent !== text) count.textContent = text;
    }
  }

  function ensureAllPointControls() {
    document.querySelectorAll('[data-annotation-panel]').forEach(ensurePointControl);
  }

  function queueRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    queueMicrotask(() => {
      refreshQueued = false;
      ensureAllPointControls();
    });
  }

  function setStatus(context, message) {
    const status = context.panel.querySelector('[data-annotation-status]');
    if (status && status.textContent !== message) status.textContent = message;
  }

  async function jumpToSelectedPoint(context, frame) {
    const key = contextKey(context.card, context.side);
    const track = activeTrack(context);
    if (!track || !pointFrames(track).includes(frame)) {
      selectedByContext.delete(key);
      queueRefresh();
      return;
    }
    selectedByContext.set(key, frame);
    setStatus(context, `正在跳到第 ${frame + 1} 幀的標註點…`);
    let ok = false;
    try {
      if (typeof seekFramePlayerSideIndex === 'function') {
        ok = await seekFramePlayerSideIndex(context.card, context.side, frame, { exact: true, status: true });
      }
    } catch {
      ok = false;
    }
    const surface = context.card.querySelector(`[data-inline-side="${context.side}"] [data-frame-surface]`);
    if (surface && typeof surface.focus === 'function') {
      if (!surface.hasAttribute('tabindex')) surface.tabIndex = -1;
      try { surface.focus({ preventScroll: true }); } catch { surface.focus(); }
    }
    setStatus(
      context,
      ok
        ? `已選取第 ${frame + 1} 幀的標註點；按 Delete 可刪除。`
        : `第 ${frame + 1} 幀定位未完成，請重新選取此點。`,
    );
    queueRefresh();
  }

  function handleChange(event) {
    const pointSelect = event.target.closest?.('[data-annotation-point-select]');
    if (pointSelect) {
      const panel = pointSelect.closest('[data-annotation-panel]');
      const context = contextFromPanel(panel);
      if (!context) return;
      const frame = Number(pointSelect.value);
      if (!Number.isInteger(frame) || frame < 0) {
        selectedByContext.delete(contextKey(context.card, context.side));
        queueRefresh();
        return;
      }
      void jumpToSelectedPoint(context, frame);
      return;
    }

    const trackSelect = event.target.closest?.('[data-annotation-active-track]');
    if (trackSelect) {
      const panel = trackSelect.closest('[data-annotation-panel]');
      const context = contextFromPanel(panel);
      if (context) selectedByContext.delete(contextKey(context.card, context.side));
      queueRefresh();
    }
  }

  document.addEventListener('change', handleChange);

  const canvas = document.querySelector('#block-canvas');
  if (canvas) new MutationObserver(queueRefresh).observe(canvas, { childList: true, subtree: true });

  ensureAllPointControls();
})();
