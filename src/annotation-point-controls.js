'use strict';

(() => {
  const playhead = globalThis.pitchingAnnotationPlayhead;
  if (!playhead) return;

  const selectedByContext = new Map();
  const lastPrimaryClickByContext = new Map();
  let refreshQueued = false;

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

  function tracksFor(context) {
    const config = configFor(context.card, context.side);
    return Array.isArray(config?.annotations?.tracks) ? config.annotations.tracks : [];
  }

  function activeTrack(context) {
    const tracks = tracksFor(context);
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

  function currentFrame(card, side) {
    return playhead.currentFrame(card, side);
  }

  function annotationModeActive(context) {
    return Boolean(context?.panel?.querySelector('[data-annotation-action="toggle-edit"].button-primary'));
  }

  function layerVisibleAtFrame(track, frame) {
    if (!track) return false;
    const start = Number.isInteger(track.startFrame) ? track.startFrame : 0;
    if (frame < start) return false;
    if (Number.isInteger(track.endFrame) && frame > track.endFrame) return false;
    return true;
  }

  function actualVideoRect(surface, video) {
    const surfaceRect = surface?.getBoundingClientRect?.();
    const videoRect = video?.getBoundingClientRect?.();
    if (!surfaceRect || !videoRect) return null;
    const sourceWidth = Number(video.videoWidth);
    const sourceHeight = Number(video.videoHeight);
    if (!(videoRect.width > 0 && videoRect.height > 0 && sourceWidth > 0 && sourceHeight > 0)) return null;
    const scale = Math.min(videoRect.width / sourceWidth, videoRect.height / sourceHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    return {
      surfaceRect,
      left: (videoRect.left - surfaceRect.left) + ((videoRect.width - width) / 2),
      top: (videoRect.top - surfaceRect.top) + ((videoRect.height - height) / 2),
      width,
      height,
    };
  }

  function pointScreenPosition(rect, point) {
    return {
      x: rect.left + (Number(point.x) * rect.width),
      y: rect.top + (Number(point.y) * rect.height),
    };
  }

  function nearestVisiblePoint(context, event) {
    const sideElement = context.card.querySelector(`[data-inline-side="${context.side}"]`);
    const surface = sideElement?.querySelector('[data-frame-surface]');
    const video = sideElement?.querySelector('[data-inline-video]');
    const rect = actualVideoRect(surface, video);
    const track = activeTrack(context);
    const frame = currentFrame(context.card, context.side);
    if (!surface || !video || !rect || !track || !layerVisibleAtFrame(track, frame)) return null;

    const localX = event.clientX - rect.surfaceRect.left;
    const localY = event.clientY - rect.surfaceRect.top;
    if (localX < rect.left || localX > rect.left + rect.width || localY < rect.top || localY > rect.top + rect.height) return null;

    const candidates = Array.isArray(track.points)
      ? track.points.filter((point) => Number.isInteger(point?.frame) && point.frame <= frame)
      : [];
    const hitRadius = 18;
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const point of candidates) {
      const position = pointScreenPosition(rect, point);
      const distance = Math.hypot(localX - position.x, localY - position.y);
      if (distance <= hitRadius && distance < bestDistance) {
        best = point;
        bestDistance = distance;
      }
    }
    return best ? { track, point: best } : null;
  }

  function clearSelectedDataset(panel) {
    if (!panel) return;
    delete panel.dataset.annotationSelectedTrackId;
    delete panel.dataset.annotationSelectedFrame;
  }

  function writeSelectedDataset(panel, trackId, frame) {
    if (!panel || !trackId || !Number.isInteger(frame) || frame < 0) {
      clearSelectedDataset(panel);
      return;
    }
    panel.dataset.annotationSelectedTrackId = trackId;
    panel.dataset.annotationSelectedFrame = String(frame);
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
        <span class="annotation-point-count" data-annotation-point-count></span>
        <span class="annotation-point-hint">右鍵點選影片上的既有點</span>`;
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
    const validSelected = selected
      && selected.trackId === track?.id
      && frames.includes(selected.frame)
      ? selected.frame
      : null;
    if (selected && validSelected === null) selectedByContext.delete(key);
    if (validSelected === null) clearSelectedDataset(panel);
    else writeSelectedDataset(panel, track.id, validSelected);

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
    const panel = context.card.querySelector(`[data-annotation-panel][data-annotation-side="${context.side}"]`);
    const status = panel?.querySelector('[data-annotation-status]');
    if (status && status.textContent !== message) status.textContent = message;
  }

  function focusSurface(context) {
    const surface = context.card.querySelector(`[data-inline-side="${context.side}"] [data-frame-surface]`);
    if (surface && typeof surface.focus === 'function') {
      if (!surface.hasAttribute('tabindex')) surface.tabIndex = -1;
      try { surface.focus({ preventScroll: true }); } catch { surface.focus(); }
    }
  }

  async function selectPoint(context, track, frame) {
    const key = contextKey(context.card, context.side);
    if (!track || !pointFrames(track).includes(frame)) {
      selectedByContext.delete(key);
      clearSelectedDataset(context.panel);
      queueRefresh();
      return false;
    }
    selectedByContext.set(key, { trackId: track.id, frame });
    writeSelectedDataset(context.panel, track.id, frame);
    setStatus(context, `正在跳到第 ${frame + 1} 幀的標註點…`);
    const ok = await playhead.seekFrame(context.card, context.side, frame, { status: true });
    focusSurface(context);
    setStatus(
      context,
      ok
        ? `已選取第 ${frame + 1} 幀的標註點；按 Delete 可刪除。`
        : `第 ${frame + 1} 幀不在目前正式播放區間，請調整播放區間後重試。`,
    );
    queueRefresh();
    return ok;
  }

  function handleChange(event) {
    const pointSelect = event.target.closest?.('[data-annotation-point-select]');
    if (pointSelect) {
      const panel = pointSelect.closest('[data-annotation-panel]');
      const context = contextFromPanel(panel);
      if (!context) return;
      const frame = Number(pointSelect.value);
      const track = activeTrack(context);
      if (!Number.isInteger(frame) || frame < 0 || !track) {
        selectedByContext.delete(contextKey(context.card, context.side));
        clearSelectedDataset(panel);
        queueRefresh();
        return;
      }
      void selectPoint(context, track, frame);
      return;
    }

    const trackSelect = event.target.closest?.('[data-annotation-active-track]');
    if (trackSelect) {
      const panel = trackSelect.closest('[data-annotation-panel]');
      const context = contextFromPanel(panel);
      if (context) selectedByContext.delete(contextKey(context.card, context.side));
      clearSelectedDataset(panel);
      queueRefresh();
    }
  }

  function handleContextMenu(event) {
    const surface = event.target.closest?.('[data-frame-surface]');
    if (!surface) return;
    const context = contextFromTarget(surface);
    if (!context) return;
    const hit = nearestVisiblePoint(context, event);
    if (!hit) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void selectPoint(context, hit.track, hit.point.frame);
  }

  function navigationBusy(context) {
    return playhead.navigationBusy(context.card, context.side);
  }

  function blockPrimaryRegistration(event) {
    const surface = event.target.closest?.('[data-frame-surface]');
    if (!surface || event.button !== 0) return false;
    const context = contextFromTarget(surface);
    if (!context || !annotationModeActive(context)) return false;
    const key = contextKey(context.card, context.side);
    const now = typeof performance?.now === 'function' ? performance.now() : Date.now();
    const previous = lastPrimaryClickByContext.get(key) || -Infinity;
    const duplicate = event.detail > 1 || (now - previous) < 180 || navigationBusy(context);
    if (!duplicate) {
      lastPrimaryClickByContext.set(key, now);
      return false;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  }

  function handleKeydownCapture(event) {
    if (event.code !== 'Space') return;
    const activePanel = document.querySelector('[data-annotation-panel] [data-annotation-action="toggle-edit"].button-primary')
      ?.closest?.('[data-annotation-panel]');
    const context = contextFromPanel(activePanel);
    if (!context) return;
    if (!event.repeat && !navigationBusy(context)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function ensureSelectionOverlay(surface) {
    let overlay = surface?.querySelector?.('[data-annotation-selection-overlay]');
    if (overlay || !surface) return overlay;
    overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.setAttribute('class', 'annotation-selection-overlay');
    overlay.setAttribute('data-annotation-selection-overlay', '');
    overlay.setAttribute('aria-hidden', 'true');
    const selected = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    selected.setAttribute('class', 'annotation-selection-ring annotation-selection-explicit');
    selected.setAttribute('data-annotation-selection-explicit', '');
    selected.setAttribute('visibility', 'hidden');
    const current = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    current.setAttribute('class', 'annotation-selection-ring annotation-selection-current');
    current.setAttribute('data-annotation-selection-current', '');
    current.setAttribute('visibility', 'hidden');
    overlay.append(selected, current);
    surface.append(overlay);
    return overlay;
  }

  function setSvgAttribute(node, name, value) {
    const text = String(value);
    if (node?.getAttribute(name) !== text) node?.setAttribute(name, text);
  }

  function showEffect(circle, rect, point, track, radius) {
    if (!circle || !point || !track || !rect) {
      setSvgAttribute(circle, 'visibility', 'hidden');
      return;
    }
    const position = pointScreenPosition(rect, point);
    setSvgAttribute(circle, 'cx', position.x);
    setSvgAttribute(circle, 'cy', position.y);
    setSvgAttribute(circle, 'r', radius);
    setSvgAttribute(circle, 'stroke', track.color || '#e53935');
    setSvgAttribute(circle, 'visibility', 'visible');
  }

  function refreshSelectionEffect(panel) {
    const context = contextFromPanel(panel);
    if (!context) return;
    const sideElement = context.card.querySelector(`[data-inline-side="${context.side}"]`);
    const surface = sideElement?.querySelector('[data-frame-surface]');
    const video = sideElement?.querySelector('[data-inline-video]');
    if (!surface || !video) return;
    const overlay = ensureSelectionOverlay(surface);
    const selectedCircle = overlay?.querySelector('[data-annotation-selection-explicit]');
    const currentCircle = overlay?.querySelector('[data-annotation-selection-current]');
    const rect = actualVideoRect(surface, video);
    if (!overlay || !rect) {
      setSvgAttribute(selectedCircle, 'visibility', 'hidden');
      setSvgAttribute(currentCircle, 'visibility', 'hidden');
      return;
    }
    setSvgAttribute(overlay, 'viewBox', `0 0 ${Math.max(1, rect.surfaceRect.width)} ${Math.max(1, rect.surfaceRect.height)}`);

    const frame = currentFrame(context.card, context.side);
    const key = contextKey(context.card, context.side);
    const selected = selectedByContext.get(key);
    const tracks = tracksFor(context);
    const selectedTrack = selected ? tracks.find((track) => track?.id === selected.trackId) : null;
    const selectedPoint = selectedTrack?.points?.find((point) => point.frame === selected.frame) || null;
    const selectedVisible = selectedPoint
      && selectedPoint.frame <= frame
      && layerVisibleAtFrame(selectedTrack, frame);
    if (selected && !selectedPoint) {
      selectedByContext.delete(key);
      clearSelectedDataset(panel);
    }
    showEffect(selectedCircle, rect, selectedVisible ? selectedPoint : null, selectedTrack, 11);

    const track = activeTrack(context);
    const currentPoint = annotationModeActive(context) && layerVisibleAtFrame(track, frame)
      ? track?.points?.find((point) => point.frame === frame) || null
      : null;
    const sameAsSelected = Boolean(
      currentPoint
      && selectedVisible
      && selectedTrack?.id === track?.id
      && selectedPoint?.frame === currentPoint.frame,
    );
    showEffect(currentCircle, rect, sameAsSelected ? null : currentPoint, track, 9);
  }

  function refreshVisualLoop() {
    document.querySelectorAll('[data-annotation-panel]').forEach(refreshSelectionEffect);
    requestAnimationFrame(refreshVisualLoop);
  }

  document.addEventListener('change', handleChange);
  document.addEventListener('contextmenu', handleContextMenu);
  window.addEventListener('click', blockPrimaryRegistration, true);
  window.addEventListener('keydown', handleKeydownCapture, true);

  const canvas = document.querySelector('#block-canvas');
  if (canvas) new MutationObserver(queueRefresh).observe(canvas, { childList: true, subtree: true });

  ensureAllPointControls();
  requestAnimationFrame(refreshVisualLoop);
})();
