'use strict';

(() => {
  const model = globalThis.pitchingAnnotationModel;
  if (!model) return;

  function projectStepFrames() {
    const raw = state?.activeProject?.exportSettings?.annotationStepFrames;
    return model.normalizeStepFrames(raw, 1);
  }

  function persistStepFrames(value) {
    if (!state?.activeProject) return projectStepFrames();
    const step = model.normalizeStepFrames(value, 1);
    if (!state.activeProject.exportSettings || typeof state.activeProject.exportSettings !== 'object') {
      state.activeProject.exportSettings = {};
    }
    state.activeProject.exportSettings.annotationStepFrames = step;
    if (typeof scheduleSave === 'function') scheduleSave();
    return step;
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
    if (status && status.textContent !== message) status.textContent = message;
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
      setStepStatus(card, side, 'N 幀步進定位未完成，請重試。');
    }
    return ok;
  }

  function setTextIfChanged(element, value) {
    if (element && element.textContent !== value) element.textContent = value;
  }

  function ensurePanelControls(panel) {
    if (!panel || panel.querySelector('[data-annotation-step-navigation]')) return;
    const row = document.createElement('div');
    row.className = 'annotation-step-navigation';
    row.dataset.annotationStepNavigation = '';
    row.innerHTML = `
      <label class="annotation-step-navigation-setting">N 幀步進
        <input type="number" min="1" max="10000" step="1" data-annotation-step-input aria-label="N 幀步進幀數">
        <span>幀</span>
      </label>
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
    const input = panel.querySelector('[data-annotation-step-input]');
    const backward = panel.querySelector('[data-annotation-step-action="backward"]');
    const forward = panel.querySelector('[data-annotation-step-action="forward"]');
    const stepText = String(step);
    if (input && document.activeElement !== input && input.value !== stepText) input.value = stepText;
    if (backward) {
      setTextIfChanged(backward, `← ${step} 幀（A）`);
      const label = `往回步進 ${step} 幀`;
      if (backward.getAttribute('aria-label') !== label) backward.setAttribute('aria-label', label);
      const title = `往回 ${step} 幀（A）`;
      if (backward.title !== title) backward.title = title;
    }
    if (forward) {
      setTextIfChanged(forward, `${step} 幀 →（D）`);
      const label = `往前步進 ${step} 幀`;
      if (forward.getAttribute('aria-label') !== label) forward.setAttribute('aria-label', label);
      const title = `往前 ${step} 幀（D）`;
      if (forward.title !== title) forward.title = title;
    }
    const help = panel.querySelector('.annotation-help');
    setTextIfChanged(
      help,
      '標註模式：移動滑鼠定位；左鍵或空白鍵確定。←／→ 永遠逐 1 幀；A／D 依 N 幀步進，Delete 刪除目前幀的點，Ctrl+Z 復原，Esc 結束。',
    );
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

  function handleStepChange(event) {
    const input = event.target.closest?.('[data-annotation-step-input]');
    if (!input) return;
    const step = persistStepFrames(input.value);
    input.value = String(step);
    ensureAllPanelControls();
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
  document.addEventListener('change', handleStepChange);
  document.addEventListener('keydown', handleStepKeydown, true);

  const canvas = document.querySelector('#block-canvas');
  if (canvas) {
    new MutationObserver(() => {
      ensureAllPanelControls();
    }).observe(canvas, { childList: true, subtree: true });
  }

  ensureAllPanelControls();
})();
