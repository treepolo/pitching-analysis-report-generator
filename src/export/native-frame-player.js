'use strict';

/**
 * Standalone native-video frame-player runtime.
 *
 * The editor and the portable report intentionally use the same browser
 * primitives: a real HTMLMediaElement, currentTime-based frame addressing,
 * seeked/requestVideoFrameCallback confirmation, and a requestAnimationFrame
 * clock only when Chromium rejects the requested playbackRate.  The portable
 * report supplies relative video URLs; it does not need Electron or IPC.
 */
function renderNativeFramePlayerScript() {
  return `
  (() => {
    const RATE_MIN = 1 / 64;
    const RATE_MAX = 64;
    const RATE_DEFAULT = 1;
    const SLIDER_MIN = -6;
    const SLIDER_MAX = 6;
    const numberValue = (value, fallback = null) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
    const clampRate = (value, fallback = RATE_DEFAULT) => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
      return clamp(parsed, RATE_MIN, RATE_MAX);
    };
    const rateToSlider = (value) => Math.log2(clampRate(value));
    const sliderToRate = (value) => 2 ** clamp(numberValue(value, 0), SLIDER_MIN, SLIDER_MAX);
    const formatRate = (value) => {
      const normalized = clampRate(value);
      if (normalized < 0.1) return normalized.toFixed(4);
      if (normalized < 1) return normalized.toFixed(3);
      return normalized.toFixed(2);
    };
    const clockNow = () => (typeof performance !== 'undefined' && Number.isFinite(performance.now())
      ? performance.now()
      : Date.now());
    const frameTimesFor = (side) => {
      try {
        const parsed = JSON.parse(side.dataset.frameTimes || '[]');
        return Array.isArray(parsed) ? parsed.map((value) => (Number.isFinite(Number(value)) ? Number(value) : null)) : [];
      } catch {
        return [];
      }
    };

    const nativePlayerBlockFor = (item) => item?.matches?.('[data-native-frame-player-block]')
      ? item
      : item?.closest?.('[data-native-frame-player-block]');
    const selectNativeFramePlayer = (item) => {
      const selectedBlock = nativePlayerBlockFor(item);
      document.querySelectorAll('[data-native-frame-player-block]').forEach((block) => {
        const selected = block === selectedBlock;
        block.dataset.frameSelected = selected ? 'true' : 'false';
        block.setAttribute('aria-selected', selected ? 'true' : 'false');
      });
      document.querySelectorAll('[data-native-frame-player]').forEach((side) => {
        side.dataset.frameSelected = 'false';
        side.setAttribute('aria-selected', 'false');
      });
    };
    const selectedNativeFramePlayer = () => document.querySelector('[data-native-frame-player-block][data-frame-selected="true"]');
    const nativeKeyboardTargetIsEditable = (target) => Boolean(
      target?.matches?.('input:not([type="range"]), textarea, select, [contenteditable="true"]')
      || target?.isContentEditable
      || target?.closest?.('button')
    );

    document.querySelectorAll('[data-native-frame-player]').forEach((side) => {
      const video = side.querySelector('[data-player-video]');
      if (!video) return;
      const timeline = side.querySelector('[data-frame-timeline]');
      const currentPosition = side.querySelector('[data-frame-current], [data-frame-position]');
      const totalPosition = side.querySelector('[data-frame-total]');
      const previous = side.querySelector('[data-frame-action="previous"]');
      const next = side.querySelector('[data-frame-action="next"]');
      const toggle = side.querySelector('[data-frame-action="toggle"]');
      const rateInput = side.querySelector('[data-frame-rate-input]');
      const rateSlider = side.querySelector('[data-frame-rate]');
      const resetRate = side.querySelector('[data-frame-action="reset-rate"]');
      const loopInput = side.querySelector('[data-frame-loop]');
      const status = side.querySelector('[data-frame-player-status]');
      const sideStatus = side.querySelector('[data-frame-side-status]');
      const placeholder = side.querySelector('[data-frame-placeholder]');
      const frameTimes = frameTimesFor(side);
      const declaredFrameCount = Math.max(0, Math.floor(numberValue(side.dataset.frameCount, 0)));
      const fps = Math.max(0.001, numberValue(side.dataset.frameFps, 30));
      const configuredStart = Math.max(0, numberValue(side.dataset.segmentIn, 0));
      const configuredEnd = numberValue(side.dataset.segmentOut, null);
      const runtime = {
        count: declaredFrameCount || frameTimes.length,
        index: 0,
        rate: clampRate(side.dataset.playbackRate, RATE_DEFAULT),
        playing: false,
        manual: false,
        manualTime: null,
        manualTimestamp: null,
        manualFrame: null,
        seekSerial: 0,
        exactSeek: null,
        pendingSeek: null,
        dragActive: false,
        dragTarget: null,
        dragFrame: null,
        rateTransition: false,
        loaded: false,
        lifecycle: 'idle',
      };

      const setStatus = (message, stateName = '') => {
        if (!status) return;
        status.textContent = message;
        status.dataset.state = stateName;
      };
      const setSideStatus = (message, stateName = '') => {
        if (!sideStatus) return;
        sideStatus.textContent = message;
        sideStatus.dataset.state = stateName;
      };
      const duration = () => (Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0);
      const frameCount = () => {
        if (runtime.count > 0) return runtime.count;
        const total = duration();
        return total > 0 ? Math.max(1, Math.ceil(total * fps)) : 0;
      };
      const frameTime = (index) => {
        const count = frameCount();
        if (count <= 0) return configuredStart;
        const bounded = clamp(Math.round(index), 0, count - 1);
        const indexed = Number(frameTimes[bounded]);
        const candidate = Number.isFinite(indexed) ? indexed : (bounded / fps);
        return clamp(candidate, 0, Math.max(0, duration() - 0.0001));
      };
      const segmentBounds = () => {
        const start = configuredStart;
        const mediaDuration = duration();
        const end = Number.isFinite(configuredEnd) && configuredEnd > start
          ? (mediaDuration > 0 ? Math.min(configuredEnd, mediaDuration) : configuredEnd)
          : (mediaDuration > 0 ? mediaDuration : null);
        return { start, end };
      };
      const segmentStartIndex = () => {
        const count = frameCount();
        if (count <= 0) return 0;
        return clamp(Math.round(configuredStart * fps), 0, count - 1);
      };
      const frameIndexForTime = (time) => {
        const count = frameCount();
        if (count <= 0) return 0;
        return clamp(Math.round(Math.max(0, numberValue(time, 0)) * fps), 0, count - 1);
      };
      const nativeRate = (rate) => {
        try {
          video.playbackRate = rate;
          const actual = Number(video.playbackRate);
          return Number.isFinite(actual) && Math.abs(actual - rate) < 0.001;
        } catch {
          return false;
        }
      };
      const holdNativeRate = () => {
        try { video.playbackRate = RATE_DEFAULT; } catch {}
      };
      const updateRateControls = () => {
        if (rateInput) rateInput.value = formatRate(runtime.rate);
        if (rateSlider) rateSlider.value = String(rateToSlider(runtime.rate));
      };
      const updateControls = () => {
        const count = frameCount();
        const maximum = Math.max(0, count - 1);
        const pending = runtime.lifecycle === 'loading'
          || runtime.exactSeek !== null
          || runtime.rateTransition;
        runtime.index = clamp(runtime.index, 0, maximum);
        if (timeline) {
          timeline.max = String(maximum);
          timeline.value = String(runtime.index);
          timeline.disabled = count <= 0 || pending;
        }
        if (currentPosition) currentPosition.textContent = count > 0
          ? ('第 ' + (runtime.index + 1) + ' 幀')
          : '尚未準備';
        if (totalPosition) totalPosition.textContent = count > 0
          ? ('共 ' + count + ' 幀')
          : '共 -- 幀';
        if (previous) previous.disabled = count <= 0 || pending || runtime.index <= 0;
        if (next) next.disabled = count <= 0 || pending || runtime.index >= maximum;
        if (toggle) {
          toggle.disabled = count <= 0 || pending;
          toggle.textContent = runtime.playing ? '⏸' : '▶';
          toggle.setAttribute('aria-pressed', runtime.playing ? 'true' : 'false');
          toggle.setAttribute('aria-label', runtime.playing ? '暫停' : '播放');
          toggle.title = runtime.playing ? '暫停' : '播放';
        }
        if (rateInput) rateInput.disabled = count <= 0 || pending;
        if (rateSlider) rateSlider.disabled = count <= 0 || pending;
        if (resetRate) resetRate.disabled = count <= 0 || pending;
        if (loopInput) loopInput.disabled = count <= 0 || pending;
        updateRateControls();
      };
      const syncProgress = (time = video.currentTime) => {
        if (!runtime.manual && (runtime.dragActive && video.paused)) return;
        const sourceTime = runtime.manual && Number.isFinite(runtime.manualTime)
          ? runtime.manualTime
          : numberValue(time, 0);
        runtime.index = frameIndexForTime(sourceTime);
        updateControls();
      };
      const hidePlaceholder = () => {
        if (placeholder && (video.readyState >= 2 || !video.paused)) placeholder.hidden = true;
      };
      const cancelManual = () => {
        if (runtime.manualFrame !== null) {
          if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(runtime.manualFrame);
          else clearTimeout(runtime.manualFrame);
        }
        runtime.manualFrame = null;
        runtime.manualTimestamp = null;
        runtime.manualTime = null;
        runtime.manual = false;
      };
      const scheduleManual = (callback) => {
        if (typeof window.requestAnimationFrame === 'function') {
          runtime.manualFrame = window.requestAnimationFrame(callback);
        } else {
          runtime.manualFrame = setTimeout(() => callback(clockNow()), 16);
        }
      };
      const cancelPendingSeek = () => {
        if (runtime.pendingSeek?.cancel) runtime.pendingSeek.cancel();
        runtime.pendingSeek = null;
      };
      const waitPresentedFrame = (targetTime, tolerance, timeout = 500) => {
        if (typeof video.requestVideoFrameCallback !== 'function') return Promise.resolve(true);
        return new Promise((resolve) => {
          let finished = false;
          let callbackId = null;
          const finish = (value) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            if (!value && callbackId !== null && typeof video.cancelVideoFrameCallback === 'function') {
              video.cancelVideoFrameCallback(callbackId);
            }
            resolve(value);
          };
          const timer = setTimeout(() => finish(false), timeout);
          const onFrame = (_now, metadata) => {
            if (finished) return;
            const mediaTime = Number(metadata?.mediaTime);
            const currentTime = Number(video.currentTime);
            if ((Number.isFinite(mediaTime) && Math.abs(mediaTime - targetTime) <= tolerance)
              || (!video.seeking && Number.isFinite(currentTime) && Math.abs(currentTime - targetTime) <= tolerance)) {
              finish(true);
              return;
            }
            callbackId = video.requestVideoFrameCallback(onFrame);
          };
          callbackId = video.requestVideoFrameCallback(onFrame);
        });
      };
      const seekVideoExact = (targetTime, serial, tolerance) => {
        cancelPendingSeek();
        return new Promise((resolve) => {
          let finished = false;
          let frameWait = null;
          let waitingForFrame = false;
          const operation = { cancel: () => finish(false) };
          const readyAtTarget = () => !video.seeking
            && video.readyState >= 2
            && Math.abs((Number(video.currentTime) || 0) - targetTime) <= tolerance;
          const settledAtTarget = () => !video.seeking
            && video.readyState >= 2
            && Number.isFinite(Number(video.currentTime))
            && Math.abs((Number(video.currentTime) || 0) - targetTime) <= Math.max(tolerance * 4, 0.25);
          const finish = async (success) => {
            if (finished) return;
            finished = true;
            video.removeEventListener('seeked', onSeeked);
            clearTimeout(timer);
            if (runtime.pendingSeek === operation) runtime.pendingSeek = null;
            if (frameWait) await frameWait;
            resolve(Boolean(success) && serial === runtime.seekSerial);
          };
          const waitForFrame = () => {
            if (serial !== runtime.seekSerial) {
              void finish(false);
              return;
            }
            if (typeof video.requestVideoFrameCallback !== 'function') {
              void finish(readyAtTarget() || settledAtTarget());
              return;
            }
            if (waitingForFrame) return;
            waitingForFrame = true;
            frameWait = waitPresentedFrame(targetTime, tolerance);
            void frameWait.then((presented) => finish(presented || readyAtTarget() || settledAtTarget()));
          };
          const onSeeked = () => {
            if (serial !== runtime.seekSerial) {
              void finish(false);
              return;
            }
            if (readyAtTarget() || settledAtTarget()) {
              waitForFrame();
              return;
            }
            try { video.currentTime = targetTime; } catch { void finish(false); }
          };
          const timer = setTimeout(() => finish(readyAtTarget() || settledAtTarget()), 1500);
          runtime.pendingSeek = operation;
          video.addEventListener('seeked', onSeeked);
          if (Math.abs((Number(video.currentTime) || 0) - targetTime) < 0.0001 && video.readyState >= 2) {
            waitForFrame();
            return;
          }
          try { video.currentTime = targetTime; } catch { void finish(false); }
        });
      };
      const seekExact = async (targetIndex, announce = true) => {
        const count = frameCount();
        if (count <= 0) return false;
        const target = clamp(Math.round(targetIndex), 0, count - 1);
        const previousIndex = runtime.index;
        const serial = ++runtime.seekSerial;
        runtime.index = target;
        runtime.playing = false;
        runtime.exactSeek = serial;
        runtime.rateTransition = false;
        cancelManual();
        video.pause();
        updateControls();
        if (announce) setStatus('正在定位第 ' + (target + 1) + ' 幀…', 'pending');
        const bounds = segmentBounds();
        const targetTime = clamp(frameTime(target), bounds.start, bounds.end ?? Math.max(bounds.start, duration()));
        const tolerance = Math.max(0.02, (0.5 / fps) + 0.01);
        const result = await seekVideoExact(targetTime, serial, tolerance);
        if (runtime.exactSeek === serial) runtime.exactSeek = null;
        if (serial !== runtime.seekSerial || !side.isConnected) return false;
        if (result) {
          runtime.index = target;
          hidePlaceholder();
          updateControls();
          if (announce) setStatus('已顯示第 ' + (target + 1) + ' 幀。', 'loaded');
          return true;
        }
        runtime.index = previousIndex;
        updateControls();
        if (announce) setStatus('影片定位未完成，請重試。', 'error');
        return false;
      };
      const seekApproximate = (targetIndex) => {
        const count = frameCount();
        if (count <= 0) return;
        const target = clamp(Math.round(targetIndex), 0, count - 1);
        runtime.index = target;
        runtime.playing = false;
        cancelManual();
        video.pause();
        const bounds = segmentBounds();
        const targetTime = clamp(frameTime(target), bounds.start, bounds.end ?? Math.max(bounds.start, duration()));
        try {
          if (video.seeking || typeof video.fastSeek !== 'function') video.currentTime = targetTime;
          else video.fastSeek(targetTime);
        } catch { video.currentTime = targetTime; }
        updateControls();
      };
      const requestApproximate = (targetIndex) => {
        runtime.dragTarget = targetIndex;
        if (runtime.dragFrame !== null) return;
        const callback = () => {
          runtime.dragFrame = null;
          const latest = runtime.dragTarget;
          runtime.dragTarget = null;
          if (latest !== null && side.isConnected) seekApproximate(latest);
        };
        runtime.dragFrame = typeof window.requestAnimationFrame === 'function'
          ? window.requestAnimationFrame(callback)
          : setTimeout(callback, 0);
      };
      const stop = (message = null) => {
        runtime.playing = false;
        runtime.rateTransition = false;
        cancelManual();
        ++runtime.seekSerial;
        runtime.exactSeek = null;
        runtime.dragActive = false;
        runtime.dragTarget = null;
        cancelPendingSeek();
        video.pause();
        updateControls();
        if (message) setStatus(message, 'loaded');
      };
      const startManual = () => {
        cancelManual();
        ++runtime.seekSerial;
        runtime.exactSeek = null;
        runtime.manual = true;
        runtime.playing = true;
        runtime.lifecycle = 'playing';
        const bounds = segmentBounds();
        const indexedTime = frameTime(runtime.index);
        const displayedTime = Number(video.currentTime);
        runtime.manualTime = Number.isFinite(displayedTime) && !video.seeking
          && Math.abs(displayedTime - indexedTime) <= 0.25
          ? Math.max(bounds.start, displayedTime)
          : Math.max(bounds.start, indexedTime);
        runtime.manualTimestamp = null;
        video.pause();
        holdNativeRate();
        const serial = runtime.seekSerial;
        const tick = (timestamp) => {
          if (serial !== runtime.seekSerial || !runtime.manual || !runtime.playing || !side.isConnected) {
            cancelManual();
            return;
          }
          const now = Number(timestamp);
          const currentTimestamp = Number.isFinite(now) ? now : clockNow();
          const previousTimestamp = runtime.manualTimestamp;
          runtime.manualTimestamp = currentTimestamp;
          const elapsed = Number.isFinite(previousTimestamp)
            ? Math.min(0.1, Math.max(0, (currentTimestamp - previousTimestamp) / 1000))
            : 0;
          const currentBounds = segmentBounds();
          let nextTime = (Number.isFinite(runtime.manualTime) ? runtime.manualTime : currentBounds.start)
            + elapsed * clampRate(runtime.rate);
          const displayed = Number(video.currentTime);
          if (!video.seeking && Number.isFinite(displayed)) nextTime = Math.max(nextTime, displayed);
          if (currentBounds.end !== null && currentBounds.end > currentBounds.start && nextTime >= currentBounds.end) {
            if (loopInput?.checked) {
              const span = currentBounds.end - currentBounds.start;
              nextTime = currentBounds.start + ((nextTime - currentBounds.start) % span);
            } else {
              runtime.manual = false;
              runtime.playing = false;
              runtime.lifecycle = 'paused';
              video.currentTime = currentBounds.end;
              video.pause();
              updateControls();
              setStatus('已到達區段終點。', 'loaded');
              return;
            }
          }
          runtime.manualTime = nextTime;
          if (!video.seeking && (!Number.isFinite(displayed) || Math.abs(displayed - nextTime) > 0.0005)) {
            try { video.currentTime = nextTime; } catch {
              runtime.manual = false;
              runtime.playing = false;
              runtime.lifecycle = 'error';
              setStatus('影片定位未完成，請重試。', 'error');
              updateControls();
              return;
            }
          }
          syncProgress(nextTime);
          scheduleManual(tick);
        };
        setStatus('播放中（使用擴充速度時鐘）。', 'loaded');
        updateControls();
        scheduleManual(tick);
        return true;
      };
      const play = async ({ fromRateTransition = false } = {}) => {
        const count = frameCount();
        if (count <= 0 || (!fromRateTransition && runtime.lifecycle === 'loading') || runtime.exactSeek !== null || (runtime.rateTransition && !fromRateTransition)) {
          setStatus('影片正在準備，請稍候。', 'pending');
          return;
        }
        if (runtime.index >= count - 1) {
          await seekExact(segmentStartIndex(), false);
          if (runtime.index >= count - 1) return;
        }
        const rate = clampRate(runtime.rate);
        if (!nativeRate(rate)) {
          startManual();
          return;
        }
        cancelManual();
        try {
          await video.play();
          runtime.playing = true;
          runtime.lifecycle = 'playing';
          setStatus('播放中。', 'loaded');
          updateControls();
        } catch (error) {
          const message = String(error?.message || error || '').toLowerCase();
          if (message.includes('playbackrate') || message.includes('playback rate') || message.includes('supported playback range')) {
            startManual();
            return;
          }
          runtime.playing = false;
          runtime.lifecycle = 'error';
          setStatus('播放失敗：' + (error?.message || '請重試。'), 'error');
          updateControls();
        }
      };
      const togglePlayback = () => {
        if (runtime.playing) stop('已暫停。');
        else void play();
      };
      const applyRate = (requested) => {
        const rate = clampRate(requested, runtime.rate);
        const wasPlaying = runtime.playing;
        runtime.rate = rate;
        const supported = nativeRate(rate);
        if (runtime.manual) {
          cancelManual();
          runtime.playing = false;
          video.pause();
        }
        if (!supported) holdNativeRate();
        if (wasPlaying) {
          runtime.rateTransition = true;
          runtime.lifecycle = 'loading';
          setStatus('正在切換播放速度…', 'pending');
          updateControls();
          void play({ fromRateTransition: true }).finally(() => {
            runtime.rateTransition = false;
            if (runtime.lifecycle === 'loading') runtime.lifecycle = 'ready';
            updateControls();
          });
        } else {
          updateControls();
        }
      };
      const step = (direction) => {
        stop();
        void seekExact(runtime.index + direction);
      };
      const onTimeline = (event) => {
        const target = Number(event.target.value);
        if (event.type === 'pointerdown') {
          runtime.dragActive = true;
          try { event.target.setPointerCapture?.(event.pointerId); } catch {}
          requestApproximate(target);
        } else if (event.type === 'pointermove') {
          if (runtime.dragActive) requestApproximate(target);
        } else if (event.type === 'input') {
          if (runtime.exactSeek === null) requestApproximate(target);
        } else if (event.type === 'pointerup' || event.type === 'change') {
          runtime.dragActive = false;
          try { event.target.releasePointerCapture?.(event.pointerId); } catch {}
          void seekExact(target);
        } else if (event.type === 'pointercancel') {
          runtime.dragActive = false;
          runtime.dragTarget = null;
          if (runtime.dragFrame !== null) {
            if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(runtime.dragFrame);
            else clearTimeout(runtime.dragFrame);
            runtime.dragFrame = null;
          }
          try { event.target.releasePointerCapture?.(event.pointerId); } catch {}
        }
      };

      previous?.addEventListener('click', () => { if (!previous.disabled) step(-1); });
      next?.addEventListener('click', () => { if (!next.disabled) step(1); });
      toggle?.addEventListener('click', () => { if (!toggle.disabled) togglePlayback(); });
      resetRate?.addEventListener('click', () => { if (!resetRate.disabled) { applyRate(RATE_DEFAULT); setStatus('播放速度已重置為 1.00 倍。', 'loaded'); } });
      timeline?.addEventListener('pointerdown', onTimeline);
      timeline?.addEventListener('pointermove', onTimeline);
      timeline?.addEventListener('pointerup', onTimeline);
      timeline?.addEventListener('pointercancel', onTimeline);
      timeline?.addEventListener('input', onTimeline);
      timeline?.addEventListener('change', onTimeline);
      rateSlider?.addEventListener('input', (event) => applyRate(sliderToRate(event.target.value)));
      rateInput?.addEventListener('input', (event) => {
        if (event.target.value.trim() !== '') applyRate(event.target.value);
      });
      rateInput?.addEventListener('change', (event) => applyRate(event.target.value));
      video.addEventListener('loadedmetadata', () => {
        runtime.count = runtime.count || frameTimes.length || Math.max(1, Math.ceil(duration() * fps));
        runtime.loaded = true;
        runtime.lifecycle = 'loading';
        updateControls();
        void seekExact(segmentStartIndex(), false).then((ready) => {
          runtime.lifecycle = ready ? 'ready' : 'error';
          if (placeholder) placeholder.hidden = !ready;
          setSideStatus(ready ? '影片已就緒 · ' + frameCount() + ' 幀。' : '影片載入失敗。', ready ? 'loaded' : 'error');
          setStatus(ready ? '已顯示第 ' + (runtime.index + 1) + ' 幀。' : '第一幀尚未呈現，請重試。', ready ? 'loaded' : 'error');
          updateControls();
        });
      });
      video.addEventListener('loadeddata', hidePlaceholder);
      video.addEventListener('canplay', hidePlaceholder);
      video.addEventListener('playing', () => {
        hidePlaceholder();
        if (!runtime.manual) {
          runtime.playing = true;
          runtime.lifecycle = 'playing';
          updateControls();
        }
      });
      video.addEventListener('timeupdate', () => {
        hidePlaceholder();
        const bounds = segmentBounds();
        if (Number.isFinite(video.currentTime) && video.currentTime < bounds.start - 0.01) {
          video.currentTime = bounds.start;
        } else if (bounds.end !== null && video.currentTime >= bounds.end - 0.005) {
          if (loopInput?.checked) {
            video.currentTime = bounds.start;
            if (!video.paused && !runtime.manual) void video.play().catch(() => {});
          } else if (!runtime.manual) {
            video.currentTime = bounds.end;
            video.pause();
            runtime.playing = false;
            runtime.lifecycle = 'paused';
            setStatus('已到達區段終點。', 'loaded');
          }
        }
        syncProgress();
      });
      video.addEventListener('seeked', () => { hidePlaceholder(); syncProgress(); });
      video.addEventListener('pause', () => {
        if (!runtime.manual && runtime.exactSeek === null && runtime.lifecycle !== 'ended') {
          runtime.playing = false;
          if (runtime.lifecycle === 'playing') runtime.lifecycle = 'paused';
          updateControls();
        }
      });
      video.addEventListener('ended', () => {
        const bounds = segmentBounds();
        if (loopInput?.checked) {
          video.currentTime = bounds.start;
          void video.play().catch(() => {});
          return;
        }
        runtime.playing = false;
        runtime.lifecycle = 'ended';
        runtime.index = Math.max(0, frameCount() - 1);
        setStatus('已到達最後一幀。', 'loaded');
        updateControls();
      });
      video.addEventListener('error', () => {
        runtime.playing = false;
        runtime.lifecycle = 'error';
        setSideStatus('影片載入失敗。', 'error');
        setStatus('影片載入失敗；請確認輸出資料夾內的影片檔案。', 'error');
        updateControls();
      });
      side.__nativeFramePlayerActions = {
        step: (direction) => step(direction),
        toggle: () => togglePlayback(),
        seek: (index) => seekExact(index, false),
        play: () => play(),
        stop: (message) => stop(message),
        applyRate: (value) => applyRate(value),
        supportsNativeRate: (value) => nativeRate(value),
        setSharedManual: (enabled) => { runtime.manual = Boolean(enabled); },
        setFrame: (index) => {
          const bounded = clamp(Math.round(index), 0, Math.max(0, frameCount() - 1));
          runtime.index = bounded;
          try { video.currentTime = frameTime(bounded); } catch {}
          updateControls();
        },
        runtime,
      };
      side.addEventListener('pointerdown', () => selectNativeFramePlayer(side));
      updateRateControls();
      updateControls();
      setStatus('正在載入影片…', 'pending');
      if (video.readyState >= 1) video.dispatchEvent(new Event('loadedmetadata'));
    });
    document.querySelectorAll('[data-native-frame-player-block]').forEach((block) => {
      const sides = ['left', 'right'].map((sideName) => block.querySelector('[data-native-frame-player][data-player-side="' + sideName + '"]')).filter(Boolean);
      if (sides.length !== 2 || !sides.every((side) => side.__nativeFramePlayerActions)) {
        const single = sides[0] || block.querySelector('[data-native-frame-player]');
        if (single?.__nativeFramePlayerActions) block.__nativeFramePlayerActions = single.__nativeFramePlayerActions;
        block.addEventListener('pointerdown', () => selectNativeFramePlayer(block));
        return;
      }
      const actions = sides.map((side) => side.__nativeFramePlayerActions);
      const videos = sides.map((side) => side.querySelector('[data-player-video]'));
      const controls = block.querySelector('[data-frame-shared-controls]') || block.querySelector('[data-frame-controls]');
      const timeline = controls?.querySelector('[data-frame-timeline]');
      const position = controls?.querySelector('[data-frame-current], [data-frame-position]');
      const total = controls?.querySelector('[data-frame-total]');
      const previous = controls?.querySelector('[data-frame-action="previous"]');
      const next = controls?.querySelector('[data-frame-action="next"]');
      const toggle = controls?.querySelector('[data-frame-action="toggle"]');
      const rateInput = controls?.querySelector('[data-frame-rate-input]');
      const rateSlider = controls?.querySelector('[data-frame-rate]');
      const resetRate = controls?.querySelector('[data-frame-action="reset-rate"]');
      const syncButton = controls?.querySelector('[data-frame-action="sync"]');
      const syncInfo = controls?.querySelector('[data-frame-sync-info]');
      const status = controls?.querySelector('[data-frame-player-status]');
      const state = { index: 0, count: 0, playing: false, rate: clampRate(sides[0].dataset.playbackRate, RATE_DEFAULT), sync: null, initialized: false, loopTransition: false, manual: false, manualTime: null, manualTimestamp: null, manualSerial: 0, manualCancel: null };
      const setStatus = (message, stateName = '') => { if (status) { status.textContent = message; status.dataset.state = stateName; } };
      const configuredRange = (side, action) => {
        const count = Math.max(0, Math.floor(numberValue(action.runtime.count, numberValue(side.dataset.frameCount, 0))));
        if (count <= 0) return null;
        const fps = Math.max(0.001, numberValue(side.dataset.frameFps, 30));
        const startValue = numberValue(side.dataset.segmentIn, 0);
        const endValue = numberValue(side.dataset.segmentOut, null);
        const start = clamp(Math.round(Math.max(0, startValue) * fps), 0, count - 1);
        const end = Number.isFinite(endValue) && endValue > startValue ? Math.max(start, Math.min(count - 1, Math.ceil(endValue * fps) - 1)) : count - 1;
        return { start, end, count, fps };
      };
      const currentSync = () => {
        const left = numberValue(block.dataset.syncLeftFrame, null);
        const right = numberValue(block.dataset.syncRightFrame, null);
        return Number.isInteger(left) && Number.isInteger(right) ? { leftFrame: left, rightFrame: right } : null;
      };
      const mapping = () => {
        const ranges = sides.map((side, i) => configuredRange(side, actions[i]));
        if (ranges.some((range) => !range)) return { ranges, starts: [0, 0], count: 0, validSync: false, sync: null };
        const sync = currentSync();
        const validSync = Boolean(sync && sync.leftFrame >= ranges[0].start && sync.leftFrame <= ranges[0].end && sync.rightFrame >= ranges[1].start && sync.rightFrame <= ranges[1].end);
        const starts = validSync ? [sync.leftFrame, sync.rightFrame] : [ranges[0].start, ranges[1].start];
        return { ranges, starts, count: Math.max(0, Math.min(ranges[0].end - starts[0] + 1, ranges[1].end - starts[1] + 1)), validSync, sync };
      };
      const update = () => {
        const map = mapping(); state.count = map.count; state.sync = map.validSync ? map.sync : null; state.index = clamp(state.index, 0, Math.max(0, state.count - 1));
        const ready = state.count > 0 && actions.every((action) => action.runtime.loaded && action.runtime.lifecycle !== 'loading');
        const pending = !ready;
        if (timeline) { timeline.max = String(Math.max(0, state.count - 1)); timeline.value = String(state.index); timeline.disabled = pending; }
        if (position) position.textContent = state.count > 0 ? ('第 ' + (state.index + 1) + ' 幀') : '尚未準備';
        if (total) total.textContent = state.count > 0 ? ('共 ' + state.count + ' 幀') : '共 -- 幀';
        if (previous) previous.disabled = pending || state.index <= 0;
        if (next) next.disabled = pending || state.index >= state.count - 1;
        if (toggle) { toggle.disabled = pending; toggle.textContent = state.playing ? '⏸' : '▶'; toggle.setAttribute('aria-pressed', state.playing ? 'true' : 'false'); toggle.setAttribute('aria-label', state.playing ? '暫停' : '播放'); toggle.title = state.playing ? '暫停' : '播放'; }
        if (rateInput) { rateInput.value = formatRate(state.rate); rateInput.disabled = pending; }
        if (rateSlider) { rateSlider.value = String(rateToSlider(state.rate)); rateSlider.disabled = pending; }
        if (resetRate) resetRate.disabled = pending;
        if (syncButton) syncButton.disabled = pending;
        if (syncInfo) syncInfo.textContent = state.sync ? ('左 Frame: ' + state.sync.leftFrame + ' · 右 Frame: ' + state.sync.rightFrame) : '尚未設定同步點';
      };
      const cancelSharedManual = () => {
        state.manualSerial += 1;
        state.manualCancel?.();
        state.manualCancel = null;
        state.manual = false;
        state.manualTime = null;
        state.manualTimestamp = null;
        actions.forEach((action) => action.setSharedManual?.(false));
      };
      const scheduleSharedManual = (callback) => {
        if (typeof window.requestAnimationFrame === 'function') {
          const frame = window.requestAnimationFrame(callback);
          state.manualCancel = () => window.cancelAnimationFrame?.(frame);
        } else {
          const timer = setTimeout(() => callback(clockNow()), 16);
          state.manualCancel = () => clearTimeout(timer);
        }
      };
      const startSharedManual = () => {
        const map = mapping();
        if (map.count <= 0) return false;
        cancelSharedManual();
        state.manual = true;
        state.playing = true;
        state.manualTime = state.index;
        state.manualTimestamp = null;
        actions.forEach((action, i) => {
          action.stop();
          action.setSharedManual?.(true);
          action.setFrame?.(map.starts[i] + state.index);
        });
        const serial = state.manualSerial;
        const tick = (timestamp) => {
          if (serial !== state.manualSerial || !state.manual || !state.playing) {
            cancelSharedManual();
            return;
          }
          const now = Number(timestamp);
          const current = Number.isFinite(now) ? now : clockNow();
          const previous = state.manualTimestamp;
          state.manualTimestamp = current;
          const elapsed = Number.isFinite(previous) ? Math.min(0.1, Math.max(0, (current - previous) / 1000)) : 0;
          let next = (Number.isFinite(state.manualTime) ? state.manualTime : state.index)
            + elapsed * clampRate(state.rate) * (map.ranges.left?.fps || 30);
          if (next >= map.count - 1) {
            const loopEnabled = sides.every((side) => side.dataset.loopEnabled === 'true');
            if (loopEnabled && map.count > 1) next %= map.count;
            else {
              state.index = Math.max(0, map.count - 1);
              actions.forEach((action, i) => action.setFrame?.(map.starts[i] + state.index));
              cancelSharedManual();
              state.playing = false;
              actions.forEach((action) => action.stop());
              setStatus('已到達最後一幀。', 'loaded');
              update();
              return;
            }
          }
          state.manualTime = next;
          state.index = Math.max(0, Math.min(map.count - 1, Math.floor(next)));
          actions.forEach((action, i) => action.setFrame?.(map.starts[i] + state.index));
          update();
          scheduleSharedManual(tick);
        };
        setStatus('播放中（使用擴充速度時鐘）。', 'loaded');
        update();
        scheduleSharedManual(tick);
        return true;
      };
      const stop = (message = null) => { cancelSharedManual(); state.playing = false; actions.forEach((action) => action.stop()); if (message) setStatus(message, 'loaded'); update(); };
      const seekControl = async (target, announce = true) => {
        const map = mapping(); if (map.count <= 0) return false; const bounded = clamp(Math.round(target), 0, map.count - 1); state.index = bounded; state.playing = false; cancelSharedManual(); actions.forEach((action) => action.stop()); update(); if (announce) setStatus('正在定位第 ' + (bounded + 1) + ' 幀…', 'pending');
        const results = await Promise.all(actions.map((action, i) => action.seek(map.starts[i] + bounded)));
        const ok = results.every(Boolean); update(); setStatus(ok ? ('已顯示第 ' + (bounded + 1) + ' 幀。') : '影片定位未完成，請重試。', ok ? 'loaded' : 'error'); return ok;
      };
      const setRate = (value) => { state.rate = clampRate(value, state.rate); const wasPlaying = state.playing; stop(); actions.forEach((action) => action.applyRate(state.rate)); update(); if (wasPlaying) void toggle(); };
      const togglePlayback = async () => {
        if (state.playing) { stop('已暫停。'); return; }
        const map = mapping(); if (map.count <= 0) return;
        if (state.index >= map.count - 1) await seekControl(0, false);
        if (!actions.every((action) => action.supportsNativeRate?.(state.rate) !== false)) { startSharedManual(); return; } state.playing = true; update(); setStatus('播放中。', 'loaded');
        await Promise.all(actions.map((action) => action.play()));
        if (!actions.every((action) => action.runtime.playing || action.runtime.manual)) { state.playing = false; update(); }
      };
      const syncPoint = async () => {
        const ranges = sides.map((side, i) => configuredRange(side, actions[i])); const frames = videos.map((video, i) => Math.max(0, Math.min(ranges[i]?.count - 1 || 0, Math.round((Number(video?.currentTime) || 0) * (ranges[i]?.fps || 30)))));
        if (ranges.some((range, i) => !range || frames[i] < range.start || frames[i] > range.end)) { setStatus('同步點必須位於左右影片各自的起終點範圍內。', 'error'); return; }
        block.dataset.syncLeftFrame = String(frames[0]); block.dataset.syncRightFrame = String(frames[1]); state.index = 0; update(); await seekControl(0, false); setStatus('同步點已設定。', 'loaded');
      };
      const syncProgress = () => {
        const map = mapping(); if (!map.count) { update(); return; }
        const controlFrames = videos.map((video, i) => { const frame = Math.round((Number(video?.currentTime) || 0) * map.ranges[i].fps); if (state.playing && (frame < map.starts[i] || frame > map.ranges[i].end)) { const loopEnabled = sides.every((side) => side.dataset.loopEnabled === 'true'); if (loopEnabled && !state.loopTransition) { state.loopTransition = true; void seekControl(0, false).then(() => togglePlayback()).finally(() => { state.loopTransition = false; }); } else if (!loopEnabled) stop('雙側影片已離開允許播放區間。'); return null; } return Math.max(0, Math.min(map.count - 1, frame - map.starts[i])); });
        if (controlFrames.every((value) => value !== null)) state.index = Math.min(...controlFrames); update();
      };
      previous?.addEventListener('click', () => { void seekControl(state.index - 1); });
      next?.addEventListener('click', () => { void seekControl(state.index + 1); });
      toggle?.addEventListener('click', () => { void togglePlayback(); });
      resetRate?.addEventListener('click', () => setRate(RATE_DEFAULT));
      syncButton?.addEventListener('click', () => { void syncPoint(); });
      timeline?.addEventListener('input', (event) => { void seekControl(numberValue(event.target.value, 0)); });
      rateSlider?.addEventListener('input', (event) => setRate(sliderToRate(event.target.value)));
      rateInput?.addEventListener('input', (event) => { if (event.target.value.trim() !== '') setRate(event.target.value); });
      rateInput?.addEventListener('change', (event) => setRate(event.target.value));
      videos.forEach((video) => { video?.addEventListener('timeupdate', syncProgress); video?.addEventListener('playing', () => { state.playing = true; update(); }); video?.addEventListener('pause', () => { if (!video.ended && !actions.some((action) => action.runtime.manual)) { state.playing = false; update(); } }); video?.addEventListener('loadedmetadata', () => { update(); if (!state.initialized && actions.every((action) => action.runtime.loaded)) { state.initialized = true; void seekControl(0, false); } }); });
      block.__nativeFramePlayerActions = { step: (direction) => { void seekControl(state.index + direction); }, toggle: () => { void togglePlayback(); } };
      block.addEventListener('pointerdown', () => selectNativeFramePlayer(block));
      update();
    });
    if (!document.__nativeFramePlayerKeyboardBound) {
      document.__nativeFramePlayerKeyboardBound = true;
      document.addEventListener('keydown', (event) => {
        const isArrow = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
        const isSpace = event.key === ' ' || event.key === 'Spacebar';
        if ((!isArrow && !isSpace) || (event.repeat && isSpace)
          || nativeKeyboardTargetIsEditable(event.target)) return;
        const selected = selectedNativeFramePlayer();
        const actions = selected?.__nativeFramePlayerActions;
        if (!actions) return;
        event.preventDefault();
        if (isSpace) actions.toggle();
        else actions.step(event.key === 'ArrowRight' ? 1 : -1);
      });
    }
  })();`;
}

module.exports = Object.freeze({ renderNativeFramePlayerScript });
