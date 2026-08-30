'use strict';

const { renderNativeFramePlayerScript } = require('./native-frame-player');

function replaceExactlyOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`Native frame-player patch anchor missing: ${label}`);
  if (source.indexOf(search, first + search.length) >= 0) {
    throw new Error(`Native frame-player patch anchor is ambiguous: ${label}`);
  }
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

function patchNativeFramePlayerScript(source) {
  let output = String(source);

  output = replaceExactlyOnce(
    output,
    `          runtime.manualTime = nextTime;
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
          scheduleManual(tick);`,
    `          runtime.manualTime = nextTime;
          const targetFrame = frameIndexForTime(nextTime);
          const displayedFrame = frameIndexForTime(Number.isFinite(displayed) ? displayed : 0);
          if (!video.seeking && displayedFrame !== targetFrame) {
            try { video.currentTime = frameTime(targetFrame); } catch {
              runtime.manual = false;
              runtime.playing = false;
              runtime.lifecycle = 'error';
              setStatus('影片定位未完成，請重試。', 'error');
              updateControls();
              return;
            }
          }
          syncProgress(nextTime);
          scheduleManual(tick);`,
    'single-manual-discrete-presentation',
  );

  output = replaceExactlyOnce(
    output,
    `      const applyRate = (requested, { resume = true } = {}) => {
        const rate = clampRate(requested, runtime.rate); const wasPlaying = runtime.playing || (!video.paused && runtime.lifecycle === 'playing'); const wasManual = runtime.manual;
        runtime.rate = rate; runtime.rateSerial += 1; const rateSerial = runtime.rateSerial; const supported = nativeRate(rate);
        if (wasManual) { cancelManual(); runtime.playing = false; video.pause(); }
        if (!supported) holdNativeRate();
        if (resume && wasPlaying) { runtime.rateTransition = true; setStatus('正在切換播放速度…', 'pending'); updateControls(); void play({ fromRateTransition: true }).finally(() => { if (rateSerial !== runtime.rateSerial) return; runtime.rateTransition = false; if (runtime.lifecycle === 'loading') runtime.lifecycle = 'ready'; updateControls(); }); } else updateControls();
      };`,
    `      const applyRate = (requested, { resume = true } = {}) => {
        const rate = clampRate(requested, runtime.rate);
        const wasPlaying = runtime.playing || (!video.paused && runtime.lifecycle === 'playing');
        const wasManual = runtime.manual;
        runtime.rate = rate;
        const rateSerial = ++runtime.rateSerial;
        const supported = nativeRate(rate);
        if (!supported) holdNativeRate();

        if (!resume || !wasPlaying) {
          if (wasManual && supported) cancelManual();
          runtime.rateTransition = false;
          updateControls();
          return;
        }

        if (!supported) {
          runtime.rateTransition = false;
          if (!wasManual) startManual();
          else {
            runtime.playing = true;
            runtime.lifecycle = 'playing';
            setStatus('播放中（使用擴充速度時鐘）。', 'loaded');
            updateControls();
          }
          return;
        }

        if (!wasManual) {
          runtime.rateTransition = false;
          runtime.playing = true;
          runtime.lifecycle = 'playing';
          setStatus('播放中。', 'loaded');
          updateControls();
          return;
        }

        cancelManual();
        runtime.rateTransition = true;
        runtime.playing = true;
        setStatus('正在切換播放速度…', 'pending');
        updateControls();
        void video.play().then(() => {
          if (rateSerial !== runtime.rateSerial || !side.isConnected) return;
          runtime.playing = true;
          runtime.lifecycle = 'playing';
          setStatus('播放中。', 'loaded');
        }).catch((error) => {
          if (rateSerial !== runtime.rateSerial || !side.isConnected) return;
          runtime.playing = false;
          runtime.lifecycle = 'error';
          setStatus('播放失敗：' + (error?.message || '請重試。'), 'error');
        }).finally(() => {
          if (rateSerial !== runtime.rateSerial) return;
          runtime.rateTransition = false;
          updateControls();
        });
      };`,
    'single-rate-mode-transition',
  );

  output = replaceExactlyOnce(
    output,
    `          state.manualTime = nextFrame; state.index = clamp(Math.floor(nextFrame), 0, map.count - 1);
          actions.forEach((action, i) => action.setFrame?.(map.starts[i] + state.index)); update(); scheduleSharedManual(tick);`,
    `          state.manualTime = nextFrame;
          const nextIndex = clamp(Math.floor(nextFrame), 0, map.count - 1);
          if (nextIndex !== state.index) {
            state.index = nextIndex;
            actions.forEach((action, i) => action.setFrame?.(map.starts[i] + state.index));
          }
          update();
          scheduleSharedManual(tick);`,
    'shared-manual-discrete-presentation',
  );

  output = replaceExactlyOnce(
    output,
    `      const setRate = (value) => {
        const nextRate = clampRate(value, state.rate); const wasPlaying = state.playing; const wasManual = state.manual;
        const rateSerial = ++state.rateSerial; state.operationSerial += 1; state.rate = nextRate;
        if (wasManual) { cancelSharedManual(); state.playing = false; actions.forEach((action) => action.stop()); }
        const nativeSupported = actions.every((action) => action.supportsNativeRate?.(nextRate) !== false);
        actions.forEach((action) => action.applyRate(nextRate, { resume: false }));
        if (!wasPlaying) { state.rateTransition = false; update(); return; }
        if (!nativeSupported) { state.rateTransition = false; startSharedManual(); update(); return; }
        state.rateTransition = true; state.playing = true; setStatus('正在切換播放速度…', 'pending'); update();
        void Promise.all(actions.map((action) => action.play())).then(() => { if (rateSerial !== state.rateSerial) return; state.rateTransition = false; update(); }).catch((error) => {
          if (rateSerial !== state.rateSerial) return; state.rateTransition = false; state.playing = false; setStatus('播放失敗：' + (error?.message || '請重試。'), 'error'); actions.forEach((action) => action.stop()); update();
        });
      };`,
    `      const setRate = (value) => {
        const nextRate = clampRate(value, state.rate);
        const wasPlaying = state.playing;
        const wasManual = state.manual;
        const rateSerial = ++state.rateSerial;
        state.rate = nextRate;
        const nativeSupported = actions.every((action) => action.supportsNativeRate?.(nextRate) !== false);
        actions.forEach((action) => action.applyRate(nextRate, { resume: false }));

        if (!wasPlaying) {
          state.rateTransition = false;
          update();
          return;
        }

        if (!nativeSupported) {
          state.rateTransition = false;
          if (!wasManual) startSharedManual();
          else {
            state.playing = true;
            setStatus('播放中（使用擴充速度時鐘）。', 'loaded');
            update();
          }
          return;
        }

        if (!wasManual) {
          state.rateTransition = false;
          state.playing = true;
          setStatus('播放中。', 'loaded');
          update();
          return;
        }

        cancelSharedManual();
        state.rateTransition = true;
        state.playing = true;
        setStatus('正在切換播放速度…', 'pending');
        update();
        void Promise.all(actions.map((action) => action.play())).then(() => {
          if (rateSerial !== state.rateSerial) return;
          state.rateTransition = false;
          state.playing = true;
          setStatus('播放中。', 'loaded');
          update();
        }).catch((error) => {
          if (rateSerial !== state.rateSerial) return;
          state.rateTransition = false;
          state.playing = false;
          setStatus('播放失敗：' + (error?.message || '請重試。'), 'error');
          actions.forEach((action) => action.stop());
          update();
        });
      };`,
    'shared-rate-mode-transition',
  );

  return output;
}

function patchNativeFramePlayerHtml(html) {
  const source = renderNativeFramePlayerScript();
  const document = String(html);
  if (!document.includes(source)) {
    if (document.includes('data-native-frame-player-block')) {
      throw new Error('Rendered report contains a native player but not the expected native frame-player runtime');
    }
    return document;
  }
  return document.replace(source, patchNativeFramePlayerScript(source));
}

module.exports = {
  patchNativeFramePlayerHtml,
  patchNativeFramePlayerScript,
};
