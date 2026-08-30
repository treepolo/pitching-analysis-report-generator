'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer-rate-stability.js'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function fakeVideo({ paused = false, playDeferred = null } = {}) {
  const listeners = new Map();
  const video = {
    dataset: {},
    paused,
    ended: false,
    playbackRate: 1,
    playCalls: 0,
    pauseCalls: 0,
    addEventListener(type, listener, options) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push({ listener, capture: options === true || options?.capture === true });
    },
    dispatch(type) {
      const entries = listeners.get(type) || [];
      let stopped = false;
      const event = {
        target: video,
        stopImmediatePropagation() { stopped = true; },
      };
      for (const capture of [true, false]) {
        for (const entry of entries) {
          if (entry.capture !== capture || stopped) continue;
          entry.listener(event);
        }
      }
    },
    pause() {
      video.pauseCalls += 1;
      video.paused = true;
    },
    play() {
      video.playCalls += 1;
      video.paused = false;
      return playDeferred ? playDeferred.promise : Promise.resolve();
    },
  };
  return video;
}

function createRuntime({ manual = false, playing = true, rate = 1, video = fakeVideo({ paused: !playing }) } = {}) {
  const block = { type: 'singleVideo' };
  const card = {};
  const runtime = {
    playing,
    manualPlayback: manual,
    playbackRate: rate,
    lifecycle: playing ? 'playing' : 'paused',
    rateSerial: 0,
    rateTransition: false,
    rateInteractionGuard: false,
  };
  const sideState = { active: false, playing: false };
  const calls = {
    clearIndependent: 0,
    cancelManual: 0,
    startManual: 0,
    updates: 0,
    statuses: [],
  };

  const context = {
    Promise,
    applyFramePlayerRate() {},
    bindInlineVideoRuntime(_card, _block, _side, targetVideo) {
      targetVideo.addEventListener('ratechange', () => {
        runtime.playbackRate = targetVideo.playbackRate;
      });
    },
    blockForEditorCard: () => ({ block }),
    framePlayerRuntimeForCard: () => runtime,
    framePlayerSides: () => ['single'],
    framePlayerVideoForSide: () => video,
    framePlayerSideRuntime: () => sideState,
    clearIndependentSideControls() {
      calls.clearIndependent += 1;
      video.pause();
      sideState.active = false;
      sideState.playing = false;
    },
    clampPlaybackRate(value, fallback = 1) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
      return Math.min(64, Math.max(1 / 64, parsed));
    },
    setSafePlaybackRate(_card, targetVideo, requested) {
      const supported = requested >= 0.25 && requested <= 4;
      targetVideo.playbackRate = supported ? requested : 1;
      return supported;
    },
    cancelManualFramePlayer() {
      calls.cancelManual += 1;
      runtime.manualPlayback = false;
    },
    startManualFramePlayer() {
      calls.startManual += 1;
      runtime.manualPlayback = true;
      runtime.playing = true;
      runtime.lifecycle = 'playing';
      video.pause();
      return true;
    },
    updateFramePlayerControls() { calls.updates += 1; },
    setFramePlayerStatus(_card, message, stateName) { calls.statuses.push([message, stateName]); },
    unsupportedPlaybackRateError: () => false,
  };

  vm.createContext(context);
  new vm.Script(source).runInContext(context);
  return { context, runtime, video, block, card, sideState, calls };
}

test('stable rate controller compiles and loads immediately after renderer', () => {
  assert.doesNotThrow(() => new vm.Script(source));
  assert.ok(index.indexOf('./renderer-rate-stability.js') > index.indexOf('./renderer.js'));
});

test('native-to-native slider input changes rate without pausing or replaying', () => {
  const harness = createRuntime({ manual: false, playing: true, rate: 1, video: fakeVideo({ paused: false }) });
  harness.context.applyFramePlayerRate(harness.card, 2);
  assert.equal(harness.video.pauseCalls, 0);
  assert.equal(harness.video.playCalls, 0);
  assert.equal(harness.calls.clearIndependent, 0);
  assert.equal(harness.runtime.playbackRate, 2);
  assert.equal(harness.runtime.playing, true);
  assert.equal(harness.runtime.lifecycle, 'playing');
});

test('extended-clock-to-extended-clock slider input keeps the existing manual clock alive', () => {
  const harness = createRuntime({ manual: true, playing: true, rate: 8, video: fakeVideo({ paused: true }) });
  harness.context.applyFramePlayerRate(harness.card, 16);
  assert.equal(harness.calls.cancelManual, 0);
  assert.equal(harness.calls.startManual, 0);
  assert.equal(harness.video.playCalls, 0);
  assert.equal(harness.runtime.manualPlayback, true);
  assert.equal(harness.runtime.playbackRate, 16);
  assert.equal(harness.runtime.playing, true);
});

test('native-to-extended crossing starts the manual clock once and preserves playing intent', () => {
  const harness = createRuntime({ manual: false, playing: true, rate: 2, video: fakeVideo({ paused: false }) });
  const result = harness.context.applyFramePlayerRate(harness.card, 8);
  assert.equal(result, true);
  assert.equal(harness.calls.startManual, 1);
  assert.equal(harness.video.pauseCalls, 1);
  assert.equal(harness.runtime.manualPlayback, true);
  assert.equal(harness.runtime.playing, true);
  assert.equal(harness.runtime.playbackRate, 8);
});

test('extended-to-native crossing resumes native playback without converting the transition pause into a user pause', async () => {
  const harness = createRuntime({ manual: true, playing: true, rate: 8, video: fakeVideo({ paused: true }) });
  harness.context.applyFramePlayerRate(harness.card, 2);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(harness.calls.cancelManual, 1);
  assert.equal(harness.video.playCalls, 1);
  assert.equal(harness.runtime.manualPlayback, false);
  assert.equal(harness.runtime.playing, true);
  assert.equal(harness.runtime.lifecycle, 'playing');
  assert.equal(harness.runtime.rateTransition, false);
});

test('continued native slider input waits for the newest pending native resume', async () => {
  const pendingPlay = deferred();
  const video = fakeVideo({ paused: true, playDeferred: pendingPlay });
  const harness = createRuntime({ manual: true, playing: true, rate: 8, video });

  harness.context.applyFramePlayerRate(harness.card, 2);
  assert.equal(harness.runtime.rateTransition, true);
  assert.equal(harness.video.playCalls, 1);

  harness.context.applyFramePlayerRate(harness.card, 3);
  assert.equal(harness.runtime.rateTransition, true);
  assert.equal(harness.video.playCalls, 2);
  assert.equal(harness.runtime.playbackRate, 3);

  pendingPlay.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(harness.runtime.rateTransition, false);
  assert.equal(harness.runtime.manualPlayback, false);
  assert.equal(harness.runtime.playing, true);
  assert.equal(harness.runtime.playbackRate, 3);
});

test('rapidly crossing back to extended mode wins over a stale native play promise', async () => {
  const pendingPlay = deferred();
  const video = fakeVideo({ paused: true, playDeferred: pendingPlay });
  const harness = createRuntime({ manual: true, playing: true, rate: 8, video });

  harness.context.applyFramePlayerRate(harness.card, 2);
  assert.equal(harness.video.playCalls, 1);
  assert.equal(harness.runtime.manualPlayback, false);

  harness.context.applyFramePlayerRate(harness.card, 8);
  assert.equal(harness.calls.startManual, 1);
  assert.equal(harness.runtime.manualPlayback, true);
  assert.equal(harness.runtime.playbackRate, 8);

  pendingPlay.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(harness.runtime.manualPlayback, true);
  assert.equal(harness.runtime.playing, true);
  assert.equal(harness.video.paused, true);
  assert.ok(harness.video.pauseCalls >= 2);
});

test('delayed native ratechange cannot overwrite the requested extended-clock rate', () => {
  const harness = createRuntime({ manual: true, playing: true, rate: 16, video: fakeVideo({ paused: true }) });
  harness.context.bindInlineVideoRuntime(harness.card, harness.block, 'single', harness.video);
  harness.runtime.playbackRate = 16;
  harness.video.playbackRate = 1;
  harness.video.dispatch('ratechange');
  assert.equal(harness.runtime.playbackRate, 16);
});
