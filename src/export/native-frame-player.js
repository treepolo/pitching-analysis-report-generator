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

    document.querySelectorAll('[data-native-frame-player]').forEach((side) => {
      const video = side.querySelector('[data-player-video]');
      if (!video) return;
      const timeline = side.querySelector('[data-frame-timeline]');
      const position = side.querySelector('[data-frame-position]');
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
        if (position) position.textContent = count > 0
          ? ('第 ' + (runtime.index + 1) + ' / ' + count + ' 幀')
          : '尚未準備';
        if (previous) previous.disabled = count <= 0 || pending || runtime.index <= 0;
        if (next) next.disabled = count <= 0 || pending || runtime.index >= maximum;
        if (toggle) {
          toggle.disabled = count <= 0 || pending;
          toggle.textContent = runtime.playing ? '暫停' : '播放';
          toggle.setAttribute('aria-pressed', runtime.playing ? 'true' : 'false');
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
              void finish(readyAtTarget());
              return;
            }
            if (waitingForFrame) return;
            waitingForFrame = true;
            frameWait = waitPresentedFrame(targetTime, tolerance);
            void frameWait.then((presented) => finish(presented || readyAtTarget()));
          };
          const onSeeked = () => {
            if (serial !== runtime.seekSerial) {
              void finish(false);
              return;
            }
            if (readyAtTarget()) {
              waitForFrame();
              return;
            }
            try { video.currentTime = targetTime; } catch { void finish(false); }
          };
          const timer = setTimeout(() => finish(readyAtTarget()), 1500);
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
        if (count <= 0 || runtime.lifecycle === 'loading' || runtime.exactSeek !== null || (runtime.rateTransition && !fromRateTransition)) {
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
      side.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)
          || ['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return;
        event.preventDefault();
        step(event.key === 'ArrowLeft' ? -1 : 1);
      });
      updateRateControls();
      updateControls();
      setStatus('正在載入影片…', 'pending');
      if (video.readyState >= 1) video.dispatchEvent(new Event('loadedmetadata'));
    });
  })();`;
}

module.exports = Object.freeze({ renderNativeFramePlayerScript });
