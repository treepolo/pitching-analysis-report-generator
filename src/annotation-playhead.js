'use strict';

(() => {
  function blockFor(card) {
    try {
      return typeof blockForEditorCard === 'function' ? blockForEditorCard(card).block : null;
    } catch {
      return null;
    }
  }

  function runtimeFor(card) {
    try {
      return typeof framePlayerRuntimeForCard === 'function' ? framePlayerRuntimeForCard(card) : null;
    } catch {
      return null;
    }
  }

  function fallbackFrame(card, side) {
    try {
      if (typeof sideFrameIndexFromVideo === 'function') return Math.max(0, sideFrameIndexFromVideo(card, side));
    } catch {}
    return 0;
  }

  function configuredSideFrame(card, side, frame) {
    const block = blockFor(card);
    const runtime = runtimeFor(card);
    const requested = Math.max(0, Math.round(Number(frame) || 0));
    try {
      if (block && runtime && typeof framePlayerSideConfiguredRange === 'function') {
        const range = framePlayerSideConfiguredRange(block, runtime, side);
        if (range) return Math.max(range.start, Math.min(range.end, requested));
      }
    } catch {}
    return requested;
  }

  function currentFrame(card, side) {
    const block = blockFor(card);
    const runtime = runtimeFor(card);
    if (!block || !runtime) return fallbackFrame(card, side);
    try {
      if (block.type === 'comparisonVideo' && typeof framePlayerIndexForSide === 'function') {
        return configuredSideFrame(
          card,
          side,
          framePlayerIndexForSide(block, runtime, side, runtime.currentFrameIndex),
        );
      }
      return configuredSideFrame(card, side, runtime.currentFrameIndex);
    } catch {
      return fallbackFrame(card, side);
    }
  }

  function controlIndexForSideFrame(card, side, frame) {
    const block = blockFor(card);
    const runtime = runtimeFor(card);
    const requested = configuredSideFrame(card, side, frame);
    if (!block || !runtime) return requested;
    try {
      if (block.type === 'comparisonVideo' && typeof framePlayerControlForSideFrame === 'function') {
        return framePlayerControlForSideFrame(block, runtime, card, side, requested);
      }
    } catch {}
    return requested;
  }

  async function seekFrame(card, side, frame, { status = true } = {}) {
    if (!card || !side || typeof seekFramePlayerIndex !== 'function') return false;
    const requested = configuredSideFrame(card, side, frame);
    const controlIndex = controlIndexForSideFrame(card, side, requested);
    let ok = false;
    try {
      ok = await seekFramePlayerIndex(card, controlIndex, { exact: true, status });
    } catch {
      ok = false;
    }
    if (!ok) return false;
    return currentFrame(card, side) === requested;
  }

  function navigationBusy(card, side = null) {
    const runtime = runtimeFor(card);
    if (!runtime) return false;
    if (runtime.exactSeek !== null && runtime.exactSeek !== undefined) return true;
    if (runtime.exactScrubPromise) return true;
    if (runtime.rateTransition) return true;
    if (side) {
      try {
        if (typeof framePlayerSideRuntime === 'function') {
          const sideState = framePlayerSideRuntime(card, side);
          if (sideState?.exactPromise) return true;
          if (sideState?.exactTarget !== null && sideState?.exactTarget !== undefined) return true;
        }
      } catch {}
      try {
        const video = typeof framePlayerVideoForSide === 'function' ? framePlayerVideoForSide(card, side) : null;
        if (video?.seeking) return true;
      } catch {}
    }
    return false;
  }

  globalThis.pitchingAnnotationPlayhead = Object.freeze({
    controlIndexForSideFrame,
    currentFrame,
    navigationBusy,
    seekFrame,
  });
})();
