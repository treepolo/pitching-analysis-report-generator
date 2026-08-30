'use strict';

(() => {
  if (typeof applyFramePlayerRate !== 'function'
    || typeof bindInlineVideoRuntime !== 'function') return;

  function videosFor(card, block) {
    return framePlayerSides(block, card)
      .map((side) => framePlayerVideoForSide(card, side))
      .filter(Boolean);
  }

  function independentSideIsActive(card, block) {
    return framePlayerSides(block, card).some((side) => {
      const sideState = framePlayerSideRuntime(card, side);
      return Boolean(sideState?.active || sideState?.playing);
    });
  }

  function mainPlaybackIsActive(card, block, runtime, videos) {
    if (runtime.playing) return true;
    if (runtime.manualPlayback) return true;
    if (runtime.lifecycle !== 'playing') return false;
    return videos.some((video) => video && !video.paused);
  }

  function applyRequestedRate(card, runtime, videos, requestedRate) {
    runtime.playbackRate = requestedRate;
    const support = videos.map((video) => setSafePlaybackRate(card, video, requestedRate));
    return videos.length === 0 || support.every(Boolean);
  }

  function pauseStaleNativeResume(runtime, videos) {
    if (!runtime.manualPlayback) return;
    runtime.rateInteractionGuard = true;
    try {
      videos.forEach((video) => {
        try { video.pause(); } catch {}
      });
    } finally {
      runtime.rateInteractionGuard = false;
    }
  }

  function resumeNativePlayback(card, runtime, videos, rateSerial) {
    runtime.rateTransition = true;
    runtime.rateInteractionGuard = true;
    runtime.playing = true;
    runtime.lifecycle = 'playing';
    setFramePlayerStatus(card, '正在切換播放速度…', 'pending');
    updateFramePlayerControls(card);

    const playRequests = videos.map((video) => {
      try {
        return video.paused ? video.play() : Promise.resolve();
      } catch (error) {
        return Promise.reject(error);
      }
    });

    void Promise.all(playRequests).then(() => {
      if (runtime.rateSerial !== rateSerial || runtime.manualPlayback) {
        pauseStaleNativeResume(runtime, videos);
        return;
      }
      runtime.rateTransition = false;
      runtime.rateInteractionGuard = false;
      runtime.playing = true;
      runtime.lifecycle = 'playing';
      setFramePlayerStatus(card, '播放中。', 'loaded');
      updateFramePlayerControls(card);
    }).catch((error) => {
      if (runtime.rateSerial !== rateSerial) return;
      runtime.rateTransition = false;
      runtime.rateInteractionGuard = false;
      if (unsupportedPlaybackRateError(error) && startManualFramePlayer(card)) {
        runtime.playing = true;
        runtime.lifecycle = 'playing';
        setFramePlayerStatus(card, '播放中（使用擴充速度時鐘）。', 'loaded');
        updateFramePlayerControls(card);
        return;
      }
      runtime.playing = false;
      runtime.lifecycle = 'error';
      setFramePlayerStatus(card, '播放失敗：' + (error?.message || '請重試。'), 'error');
      updateFramePlayerControls(card);
    });
  }

  applyFramePlayerRate = function applyFramePlayerRateStable(card, rate) {
    const entry = blockForEditorCard(card);
    const block = entry.block;
    if (!block) return false;

    const runtime = framePlayerRuntimeForCard(card);
    const videos = videosFor(card, block);
    const wasPlaying = mainPlaybackIsActive(card, block, runtime, videos);
    const wasManual = runtime.manualPlayback === true;
    const hadIndependentSide = independentSideIsActive(card, block);
    const normalizedRate = clampPlaybackRate(rate, runtime.playbackRate);
    const rateSerial = (runtime.rateSerial || 0) + 1;
    runtime.rateSerial = rateSerial;

    // The shared speed control should only tear down an actually active
    // independent-side player. The old implementation paused every video on
    // every slider input, which made playback continuity depend on event order.
    if (hadIndependentSide) {
      runtime.rateInteractionGuard = true;
      try { clearIndependentSideControls(card); }
      finally { runtime.rateInteractionGuard = false; }
    }

    const nativeSupported = applyRequestedRate(card, runtime, videos, normalizedRate);

    if (!wasPlaying) {
      if (wasManual) cancelManualFramePlayer(card);
      runtime.rateTransition = false;
      runtime.rateInteractionGuard = false;
      updateFramePlayerControls(card);
      return true;
    }

    if (wasManual && !nativeSupported) {
      // Extended clock -> extended clock: change only the requested rate.
      // Do not cancel/restart the clock and do not touch play/pause.
      runtime.rateTransition = false;
      runtime.rateInteractionGuard = false;
      runtime.playing = true;
      runtime.lifecycle = 'playing';
      setFramePlayerStatus(card, '播放中（使用擴充速度時鐘）。', 'loaded');
      updateFramePlayerControls(card);
      return true;
    }

    if (!wasManual && nativeSupported) {
      const nativeAlreadyRunning = videos.length > 0 && videos.every((video) => !video.paused);
      if (nativeAlreadyRunning && !runtime.rateTransition) {
        // Native -> native: playbackRate has already been applied above.
        // Replaying the element here is unnecessary and created races while
        // the range input emitted many consecutive input events.
        runtime.playing = true;
        runtime.lifecycle = 'playing';
        setFramePlayerStatus(card, '播放中。', 'loaded');
        updateFramePlayerControls(card);
        return true;
      }

      // A previous manual -> native transition may still be waiting for play()
      // while the user continues dragging. Each input owns a serial; only the
      // newest request is allowed to finish the transition.
      resumeNativePlayback(card, runtime, videos, rateSerial);
      return true;
    }

    if (!nativeSupported) {
      // Native -> extended clock. startManualFramePlayer() marks manual mode
      // before pausing the native video, so the pause event cannot be mistaken
      // for an explicit user pause.
      runtime.rateTransition = true;
      runtime.rateInteractionGuard = true;
      const started = startManualFramePlayer(card);
      runtime.rateTransition = false;
      runtime.rateInteractionGuard = false;
      if (!started) {
        runtime.playing = false;
        runtime.lifecycle = 'error';
        setFramePlayerStatus(card, '播放失敗：影片尚未準備。', 'error');
      } else {
        runtime.playing = true;
        runtime.lifecycle = 'playing';
        setFramePlayerStatus(card, '播放中（使用擴充速度時鐘）。', 'loaded');
      }
      updateFramePlayerControls(card);
      return started;
    }

    // Extended clock -> native. Stop only the manual scheduler; the media
    // elements are already paused in manual mode and are resumed exactly once
    // for the latest rate request.
    runtime.rateTransition = true;
    runtime.rateInteractionGuard = true;
    cancelManualFramePlayer(card);
    runtime.playing = true;
    runtime.lifecycle = 'playing';
    resumeNativePlayback(card, runtime, videos, rateSerial);
    return true;
  };

  const baseBindInlineVideoRuntime = bindInlineVideoRuntime;
  bindInlineVideoRuntime = function bindInlineVideoRuntimeWithStableRate(card, block, side, video) {
    if (video && video.dataset.rateStabilityBound !== 'true') {
      video.dataset.rateStabilityBound = 'true';

      // runtime.playbackRate is the requested user rate and therefore the
      // source of truth. Chromium may emit a delayed ratechange for the 1x
      // fallback used by extended-clock playback; never let that stale event
      // overwrite the requested value.
      video.addEventListener('ratechange', (event) => {
        const current = blockForEditorCard(card).block;
        if (!current || !['singleVideo', 'comparisonVideo'].includes(current.type)) return;
        event.stopImmediatePropagation();
        updateFramePlayerControls(card);
      }, true);

      // Ignore pause events that are implementation details of a rate-mode
      // transition. A real user pause still reaches the original listener.
      video.addEventListener('pause', (event) => {
        const current = blockForEditorCard(card).block;
        if (!current || !['singleVideo', 'comparisonVideo'].includes(current.type)) return;
        const runtime = framePlayerRuntimeForCard(card);
        if (!runtime.rateTransition && !runtime.rateInteractionGuard && !runtime.manualPlayback) return;
        event.stopImmediatePropagation();
        updateFramePlayerControls(card);
      }, true);
    }
    return baseBindInlineVideoRuntime(card, block, side, video);
  };
})();
