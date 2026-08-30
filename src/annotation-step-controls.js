'use strict';

(() => {
  const model = globalThis.pitchingAnnotationModel;
  if (!model) return;

  function projectStepFrames() {
    const raw = state?.activeProject?.exportSettings?.annotationStepFrames;
    return model.normalizeStepFrames(raw, 1);
  }

  function cardAndSideFromPanel(panel) {
    const sideElement = panel?.closest?.('[data-inline-side]');
    const card = sideElement?.closest?.('[data-inline-video-block][data-frame-player]');
    if (!card || !sideElement) return null;
    return { card, side: sideElement.dataset.inlineSide };
  }

  function currentFrame(card, side) {
    try {
      if (typeof sideFrameIndexFromVideo === 'function') {
        return Math.max(0, sideFrameIndexFromVideo(card, side));
      }
    } catch {}
    return 0;
  }

  function setStepStatus(card, side, message) {
    const panel = card?.querySelector?.(`[data-annotation-panel][data-annotation-side="${side}"]`);
    const status = panel?.querySelector?.('[data-annotation-status]');
    if (status) status.textContent = message;
  }

  async function stepByConfiguredFrames(card, side, direction) {
    if (!card || !side || ![-1, 1].includes(direction)) return false;
    const step = projectStepFrames();
    const from = currentFrame(card, side);
    const requested = Math.max(0, from + (direction * step));
    if (typeof seekFramePlayerSideIndex !== 'function') return false;
    let ok = false;
    try {
      ok = await seekFramePlayerSideIndex(card, side, requested, { exact: true, status: true });
    } catch {
      ok = false;
    }
    const actual = currentFrame(card, side);
    if (ok) {
      setStepStatus(card, side, `${direction < 0 ? '往回' : '往前'}步進 ${step} 幀；目前第 ${actual + 1} 幀。`);
    } else {
      setStepStatus(card, side, `N 幀步進定位未完成，請重試。`);
    }
    return ok;
  }

  function ensurePanelControls(panel) {
    if (!panel || panel.querySelector('[data-annotation-step-navigation]')) return;
    const row = document.createElement('div');
    row.className = 'annotation-step-navigation';
    row.dataset.annotationStepNavigation = '';
    row.innerHTML = `
      <span class="annotation-step-navigation-label" data-annotation-step-label></span>
      <button type="button" class="button button-quiet" data-annotation-step-action="backward"></button>
      <button type="button" class="button button-quiet" data-annotation-step-action="forward"></button>`;
    const toolbar = panel.querySelector('.annotation-toolbar-row');
    if (toolbar) toolbar.after(row);
    else panel.prepend(row);
    updatePanelControls(panel);
  }

  function updatePanelControls(panel) {
    if (!panel) return;
    const step = projectStepFrames();
    const label = panel.querySelector('[data-annotation-step-label]');
    const backward = panel.querySelector('[data-annotation-step-action="backward"]');
    const forward = panel.querySelector('[data-annotation-step-action="forward"]');
    if (label) label.textContent = `N 幀步進：${step} 幀`;
    if (backward) {
      backward.textContent = `← ${step} 幀（A）`;
      backward.setAttribute('aria-label', `往回步進 ${step} 幀`);
      backward.title = `往回 ${step} 幀（A）`;
    }
    if (forward) {
      forward.textContent = `${step} 幀 →（D）`;
      forward.setAttribute('aria-label', `往前步進 ${step} 幀`);
      forward.title = `往前 ${step} 幀（D）`;
    }
  }

  function ensureAllPanelControls() {
    document.querySelectorAll('[data-annotation-panel]').forEach((panel) => {
      ensurePanelControls(panel);
      updatePanelControls(panel);
    });
  }

  function handleStepClick(event) {
    const button = event.target.closest?.('[data-annotation-step-action]');
    if (!button) return;
    const panel = button.closest('[data-annotation-panel]');
    const context = cardAndSideFromPanel(panel);
    if (!context) return;
    event.preventDefault();
    const direction = button.dataset.annotationStepAction === 'backward' ? -1 : 1;
    void stepByConfiguredFrames(context.card, context.side, direction);
  }

  function activeAnnotationContext() {
    const toggle = document.querySelector(
      '[data-annotation-panel] [data-annotation-action="toggle-edit"].button-primary',
    );
    const panel = toggle?.closest?.('[data-annotation-panel]');
    return panel ? cardAndSideFromPanel(panel) : null;
  }

  function editableTarget(target) {
    return Boolean(
      target?.matches?.('input, textarea, select, [contenteditable="true"]')
      || target?.closest?.('input, textarea, select, [contenteditable="true"]'),
    );
  }

  function handleStepKeydown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (editableTarget(event.target)) return;
    const direction = event.code === 'KeyA' ? -1 : event.code === 'KeyD' ? 1 : 0;
    if (!direction) return;
    const context = activeAnnotationContext();
    if (!context) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void stepByConfiguredFrames(context.card, context.side, direction);
  }

  document.addEventListener('click', handleStepClick);
  document.addEventListener('keydown', handleStepKeydown, true);

  const canvas = document.querySelector('#block-canvas');
  if (canvas) {
    new MutationObserver(ensureAllPanelControls).observe(canvas, { childList: true, subtree: true });
  }

  function refreshLoop() {
    ensureAllPanelControls();
    requestAnimationFrame(refreshLoop);
  }

  ensureAllPanelControls();
  requestAnimationFrame(refreshLoop);
})();
