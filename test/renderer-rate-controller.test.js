'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const rendererSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
const retiredPatchPath = path.join(__dirname, '..', 'src', 'renderer-rate-stability.js');

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing source boundary: ${endMarker}`);
  return source.slice(start, end);
}

const rateControllerSource = sourceBetween(
  rendererSource,
  'function videosFor(',
  'function handleFramePlayerEvent(',
);
const bindRuntimeSource = sourceBetween(
  rendererSource,
  'function bindInlineVideoRuntime(',
  'function hydrateInlineVideoCards(',
);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function fakeVideo({ paused = false, playDeferred = null, playError = null } = {}) {
  const listeners = new Map();
  const video = {
    dataset: {},
    paused,
    ended: false,
    playbackRate: 1,
    currentTime: 0,
    readyState: 4,
    seeking: false,
    playCalls: 0,
    pauseCalls: 0,
    addEventListener(type, listener, options) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push({
        listener,
        capture: options === true || options?.capture === true,
      });
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
      return { stopped };
    },
    pause() {
      video.pauseCalls += 1;
      video.paused = true;
    },
    play() {
      video.playCalls += 1;
      video.paused = false;
      if (playError) return Promise.reject(playError);
      return playDeferred ? playDeferred.promise : Promise.resolve();
    },
    closest() { return null; },
  };
  return video;
}

function createRuntime({
  manual = false,
  playing = true,
  lifecycle = playing ? 'playing' : 'paused',
  rate = 1,
  videos = [fakeVideo({ paused: !playing })],
  sideStates = null,
  startManualResult = true,
  unsupportedError = false,
} = {}) {
  const block = { type: videos.length === 2 ? 'comparisonVideo' : 'singleVideo' };
  const card = { isConnected: true };
  const sides = videos.length === 2 ? ['left', 'right'] : ['single'];
  const states = sideStates || Object.fromEntries(sides.map((side) => [side, { active: false, playing: false }]));
  const runtime = {
    playing,
    manualPlayback: manual,
    playbackRate: rate,
    lifecycle,
    rateSerial: 0,
    rateTransition: false,
    rateInteractionGuard: false,
    rateSyncGuard: false,
    frameEngineGuard: false,
    scrubActive: false,
  };
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
    blockForEditorCard: () => ({ block }),
    framePlayerRuntimeForCard: () => runtime,
    framePlayerSides: () => sides,
    framePlayerPrimarySide: () => sides[0],
    framePlayerVideoForSide: (_card, side) => videos[sides.indexOf(side)] || null,
    framePlayerSideRuntime: (_card, side) => states[side],
    playerSideConfig: () => ({ loop: { enabled: false } }),
    inlinePlaybackBounds: () => ({ start: 0, end: null }),
    commonLoopEnabled: () => false,
    framePlayerFrameCount: () => 100,
    framePlayerControlMap: () => null,
    framePlayerControlForSideFrame: () => 0,
    inlineSideElementForCard: () => null,
    hideFramePlayerPlaceholder() {},
    syncFramePlayerProgress() {},
    enforceInlinePlaybackBounds() {},
    seekFramePlayerIndex: async () => true,
    playFramePlayer: async () => true,
    stopFramePlayer() {},
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
    clearIndependentSideControls() {
      calls.clearIndependent += 1;
      sides.forEach((side, index) => {
        states[side].active = false;
        states[side].playing = false;
        videos[index]?.pause();
      });
    },
    cancelManualFramePlayer() {
      calls.cancelManual += 1;
      runtime.manualPlayback = false;
    },
    startManualFramePlayer() {
      calls.startManual += 1;
      if (!startManualResult) return false;
      runtime.manualPlayback = true;
      runtime.playing = true;
      runtime.lifecycle = 'playing';
      videos.forEach((video) => video.pause());
      return true;
    },
    updateFramePlayerControls() { calls.updates += 1; },
    setFramePlayerStatus(_card, message, stateName) { calls.statuses.push([message, stateName]); },
    unsupportedPlaybackRateError: () => unsupportedError,
  };

  vm.createContext(context);
  new vm.Script(rateControllerSource).runInContext(context);
  new vm.Script(bindRuntimeSource).runInContext(context);
  return { context, runtime, videos, block, card, states, calls };
}

async function settlePromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

test('canonical renderer owns rate stability without a post-load patch', () => {
  assert.doesNotThrow(() => new vm.Script(rateControllerSource));
  assert.doesNotThrow(() => new vm.Script(bindRuntimeSource));
  assert.equal(fs.existsSync(retiredPatchPath), false);
  assert.doesNotMatch(indexSource, /renderer-rate-stability\.js/u);
  assert.match(rendererSource, /rateInteractionGuard:\s*false/u);
  assert.doesNotMatch(rendererSource, /applyFramePlayerRateStable|bindInlineVideoRuntimeWithStableRate|rateStabilityBound/u);
});

test('native-to-native slider input changes rate without pausing or replaying', () => {
  const harness = createRuntime({ manual: false, playing: true, rate: 1, videos: [fakeVideo({ paused: false })] });
  harness.context.applyFramePlayerRate(harness.card, 2);
  assert.equal(harness.videos[0].pauseCalls, 0);
  assert.equal(harness.videos[0].playCalls, 0);
  assert.equal(harness.calls.clearIndependent, 0);
  assert.equal(harness.runtime.playbackRate, 2);
  assert.equal(harness.runtime.playing, true);
  assert.equal(harness.runtime.lifecycle, 'playing');
});

test('extended-clock-to-extended-clock input keeps the same manual clock alive', () => {
  const harness = createRuntime({ manual: true, playing: true, rate: 8, videos: [fakeVideo({ paused: true })] });
  harness.context.applyFramePlayerRate(harness.card, 16);
  assert.equal(harness.calls.cancelManual, 0);
  assert.equal(harness.calls.startManual, 0);
  assert.equal(harness.videos[0].playCalls, 0);
  assert.equal(harness.runtime.manualPlayback, true);
  assert.equal(harness.runtime.playbackRate, 16);
});

test('native-to-extended crossing starts the manual clock once and preserves playing intent', () => {
  const harness = createRuntime({ manual: false, playing: true, rate: 2, videos: [fakeVideo({ paused: false })] });
  const result = harness.context.applyFramePlayerRate(harness.card, 8);
  assert.equal(result, true);
  assert.equal(harness.calls.startManual, 1);
  assert.equal(harness.videos[0].pauseCalls, 1);
  assert.equal(harness.runtime.manualPlayback, true);
  assert.equal(harness.runtime.playing, true);
  assert.equal(harness.runtime.playbackRate, 8);
});

test('extended-to-native crossing resumes once without becoming a user pause', async () => {
  const harness = createRuntime({ manual: true, playing: true, rate: 8, videos: [fakeVideo({ paused: true })] });
  harness.context.applyFramePlayerRate(harness.card, 2);
  await settlePromises();
  assert.equal(harness.calls.cancelManual, 1);
  assert.equal(harness.videos[0].playCalls, 1);
  assert.equal(harness.runtime.manualPlayback, false);
  assert.equal(harness.runtime.playing, true);
  assert.equal(harness.runtime.lifecycle, 'playing');
  assert.equal(harness.runtime.rateTransition, false);
});

test('continued native input waits for the newest pending native resume', async () => {
  const pendingPlay = deferred();
  const video = fakeVideo({ paused: true, playDeferred: pendingPlay });
  const harness = createRuntime({ manual: true, playing: true, rate: 8, videos: [video] });
  harness.context.applyFramePlayerRate(harness.card, 2);
  harness.context.applyFramePlayerRate(harness.card, 3);
  assert.equal(video.playCalls, 2);
  assert.equal(harness.runtime.playbackRate, 3);
  pendingPlay.resolve();
  await settlePromises();
  assert.equal(harness.runtime.rateTransition, false);
  assert.equal(harness.runtime.manualPlayback, false);
  assert.equal(harness.runtime.playbackRate, 3);
});

test('rapidly crossing back to extended mode wins over a stale native play promise', async () => {
  const pendingPlay = deferred();
  const video = fakeVideo({ paused: true, playDeferred: pendingPlay });
  const harness = createRuntime({ manual: true, playing: true, rate: 8, videos: [video] });
  harness.context.applyFramePlayerRate(harness.card, 2);
  harness.context.applyFramePlayerRate(harness.card, 8);
  pendingPlay.resolve();
  await settlePromises();
  assert.equal(harness.calls.startManual, 1);
  assert.equal(harness.runtime.manualPlayback, true);
  assert.equal(harness.runtime.playing, true);
  assert.equal(harness.runtime.playbackRate, 8);
  assert.equal(video.paused, true);
  assert.ok(video.pauseCalls >= 2);
});

test('only an active independent-side player is torn down by shared rate input', () => {
  const video = fakeVideo({ paused: true });
  const harness = createRuntime({
    manual: false,
    playing: false,
    rate: 1,
    videos: [video],
    sideStates: { single: { active: true, playing: true } },
  });
  harness.context.applyFramePlayerRate(harness.card, 2);
  assert.equal(harness.calls.clearIndependent, 1);
  assert.equal(harness.states.single.active, false);
  assert.equal(harness.states.single.playing, false);
});

test('dual extended-to-native transition resumes both videos exactly once', async () => {
  const left = fakeVideo({ paused: true });
  const right = fakeVideo({ paused: true });
  const harness = createRuntime({ manual: true, playing: true, rate: 8, videos: [left, right] });
  harness.context.applyFramePlayerRate(harness.card, 2);
  await settlePromises();
  assert.equal(left.playCalls, 1);
  assert.equal(right.playCalls, 1);
  assert.equal(harness.runtime.manualPlayback, false);
  assert.equal(harness.runtime.playing, true);
});

test('delayed native ratechange cannot overwrite the requested extended-clock rate', () => {
  const video = fakeVideo({ paused: true });
  const harness = createRuntime({ manual: true, playing: true, rate: 16, videos: [video] });
  harness.context.bindInlineVideoRuntime(harness.card, harness.block, 'single', video);
  harness.runtime.playbackRate = 16;
  video.playbackRate = 1;
  const event = video.dispatch('ratechange');
  assert.equal(event.stopped, true);
  assert.equal(harness.runtime.playbackRate, 16);
});

test('rate-mode pause is internal while a real user pause still changes canonical state', () => {
  const transitionVideo = fakeVideo({ paused: false });
  const transition = createRuntime({ manual: false, playing: true, rate: 2, videos: [transitionVideo] });
  transition.context.bindInlineVideoRuntime(transition.card, transition.block, 'single', transitionVideo);
  transition.runtime.rateTransition = true;
  transitionVideo.pause();
  const internalEvent = transitionVideo.dispatch('pause');
  assert.equal(internalEvent.stopped, true);
  assert.equal(transition.runtime.playing, true);
  assert.equal(transition.runtime.lifecycle, 'playing');

  const userVideo = fakeVideo({ paused: false });
  const user = createRuntime({ manual: false, playing: true, rate: 2, videos: [userVideo] });
  user.context.bindInlineVideoRuntime(user.card, user.block, 'single', userVideo);
  userVideo.pause();
  const userEvent = userVideo.dispatch('pause');
  assert.equal(userEvent.stopped, false);
  assert.equal(user.runtime.playing, false);
  assert.equal(user.runtime.lifecycle, 'paused');
});
