'use strict';

// Keep the desktop zoom shortcuts independent from the application menu. The
// menu is intentionally hidden, and Electron does not consistently expose a
// Ctrl+Shift+= (the physical "+" key) accelerator without an explicit handler.
const ZOOM_MIN_LEVEL = -5;
const ZOOM_MAX_LEVEL = 8;

function hasModifier(input, name) {
  return input?.[name] === true
    || (Array.isArray(input?.modifiers) && input.modifiers.includes(name));
}

function zoomDirectionForInput(input = {}) {
  if (input.type !== 'keyDown') return 0;
  if ((!hasModifier(input, 'control') && !hasModifier(input, 'meta')) || hasModifier(input, 'alt')) return 0;

  const key = typeof input.key === 'string' ? input.key : '';
  const code = typeof input.code === 'string' ? input.code : '';
  if (key === '+' || key === '=' || key === 'Add' || code === 'Equal' || code === 'NumpadAdd') return 1;
  if (key === '-' || key === '_' || key === 'Subtract' || code === 'Minus' || code === 'NumpadSubtract') return -1;
  return 0;
}

function nextZoomLevel(currentLevel, direction) {
  const current = Number.isFinite(Number(currentLevel)) ? Number(currentLevel) : 0;
  const step = direction > 0 ? 1 : direction < 0 ? -1 : 0;
  return Math.min(ZOOM_MAX_LEVEL, Math.max(ZOOM_MIN_LEVEL, current + step));
}

module.exports = Object.freeze({
  ZOOM_MIN_LEVEL,
  ZOOM_MAX_LEVEL,
  nextZoomLevel,
  zoomDirectionForInput,
});
