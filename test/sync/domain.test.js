'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DRIFT_ACTION,
  PLAYER_STATUS,
  PRECISION,
  TIMING_KIND,
  advancePlayer,
  alignComparisonAtRelativeTime,
  createLoop,
  createPlayerBlock,
  createSyncAnchor,
  mapAnchorToRelativeTime,
  planDriftCorrection,
  planFrameStep,
  seekPlayerToRelativeTime,
  setPlayerLoop,
  timeToFrame,
  validateLoopRange,
  validateSyncAnchor,
} = require('../../src/sync');

function cfr(fps, frameCount, duration) {
  return { kind: TIMING_KIND.CFR, fps, frameCount, duration };
}

function vfr(frameTimes, duration) {
  return { kind: TIMING_KIND.VFR, frameTimes, duration };
}

function anchor(overrides = {}) {
  return createSyncAnchor({
    comparisonBlockId: 'comparison-1',
    side: 'left',
    mediaAssetId: 'asset-left',
    observedTime: 1,
    observedFrameIndex: 30,
    precision: PRECISION.FRAME_AWARE,
    timingSnapshot: cfr(30, 90, 3),
    capturedAt: '2026-08-14T00:00:00.000Z',
    ...overrides,
  });
}

test('player state, loop and anchor are block-local and transitions do not mutate input', () => {
  const player = createPlayerBlock({
    blockId: 'comparison-1-left',
    mediaAssetId: 'asset-left',
    duration: 3,
    timing: cfr(30, 90, 3),
    currentTime: 1.8,
    loop: { enabled: true, start: 1, end: 2 },
    anchor: anchor(),
  });

  const advanced = advancePlayer(player, 0.5);
  assert.ok(Math.abs(advanced.currentTime - 1.3) < 1e-12);
  assert.equal(advanced.anchor.comparisonBlockId, 'comparison-1');
  assert.equal(advanced.loop.start, 1);
  assert.equal(player.currentTime, 1.8);
  assert.equal(player.anchor.observedTime, 1);

  const disabled = setPlayerLoop(advanced, null);
  assert.deepEqual(disabled.loop, { enabled: false, start: 0, end: 0 });
  assert.deepEqual(player.loop, { enabled: true, start: 1, end: 2 });
});

test('relative t=0 maps each side from its own anchor time, not a shared frame number', () => {
  const leftAnchor = anchor({
    side: 'left',
    mediaAssetId: 'asset-left',
    observedTime: 10,
    observedFrameIndex: 300,
    timingSnapshot: cfr(30, 900, 30),
  });
  const rightAnchor = anchor({
    side: 'right',
    mediaAssetId: 'asset-right',
    observedTime: 20,
    observedFrameIndex: 1200,
    timingSnapshot: cfr(60, 1800, 30),
  });

  const aligned = alignComparisonAtRelativeTime({
    left: {
      anchor: leftAnchor,
      duration: 30,
      timing: cfr(30, 900, 30),
      capability: { supportsFrameStep: true },
    },
    right: {
      anchor: rightAnchor,
      duration: 30,
      timing: cfr(60, 1800, 30),
      capability: { supportsFrameStep: true },
    },
  }, 0.5);

  assert.equal(aligned.precision, PRECISION.FRAME_AWARE);
  assert.equal(aligned.sides.left.targetTime, 10.5);
  assert.equal(aligned.sides.right.targetTime, 20.5);
  assert.equal(aligned.sides.left.frameIndex, 315);
  assert.equal(aligned.sides.right.frameIndex, 1230);
  assert.notEqual(aligned.sides.left.frameIndex, aligned.sides.right.frameIndex);
});

test('VFR alignment uses presentation timestamps when frame-aware timing is available', () => {
  const vfrAnchor = anchor({
    side: 'left',
    observedTime: 0.1,
    observedFrameIndex: 2,
    timingSnapshot: vfr([0, 0.04, 0.095, 0.17, 0.24], 0.3),
  });

  const mapping = mapAnchorToRelativeTime(vfrAnchor, 0.05, {
    duration: 0.3,
    timing: vfr([0, 0.04, 0.095, 0.17, 0.24], 0.3),
    capability: { frameStep: true },
  });

  assert.ok(Math.abs(mapping.targetTime - 0.15) < 1e-12);
  assert.equal(mapping.precision, PRECISION.FRAME_AWARE);
  assert.equal(mapping.frameIndex, 3);
  assert.equal(mapping.frameTime, 0.17);
  assert.equal(mapping.playbackTime, 0.17);
});

test('frame stepping reports exact frame mode only when capability and timing support it', () => {
  const exact = planFrameStep({
    timing: cfr(30, 90, 3),
    duration: 3,
    currentTime: 1,
    direction: 1,
    capability: { supportsFrameStep: true },
  });
  assert.equal(exact.action, 'seek');
  assert.equal(exact.precision, PRECISION.FRAME_AWARE);
  assert.equal(exact.exact, true);
  assert.equal(exact.targetTime, 1.0333333333333334);

  const timeFallback = planFrameStep({
    timing: cfr(30, 90, 3),
    duration: 3,
    currentTime: 1,
    direction: -1,
    capability: { supportsFrameStep: false },
  });
  assert.equal(timeFallback.precision, PRECISION.TIME_BASED);
  assert.equal(timeFallback.exact, false);
  assert.equal(timeFallback.fallback, true);
  assert.equal(timeFallback.stepSource, 'timing-metadata');
  assert.equal(timeFallback.targetTime, 1 - (1 / 30));

  const vfrFallback = planFrameStep({
    timing: { kind: TIMING_KIND.VFR, nominalFps: 24 },
    duration: 2,
    currentTime: 1,
    direction: 1,
    capability: { supportsFrameStep: true },
  });
  assert.equal(vfrFallback.precision, PRECISION.TIME_BASED);
  assert.equal(vfrFallback.exact, false);
  assert.equal(vfrFallback.reason, 'frame-timing-unavailable');
  assert.equal(vfrFallback.stepSource, 'timing-metadata');
});

test('unknown timing stays explicitly unknown instead of claiming frame precision', () => {
  const fallback = planFrameStep({
    timing: { kind: TIMING_KIND.UNKNOWN },
    duration: 2,
    currentTime: 0,
    direction: 1,
  });
  assert.equal(fallback.precision, PRECISION.UNKNOWN);
  assert.equal(fallback.exact, false);
  assert.equal(fallback.fallback, true);
  assert.equal(fallback.stepSource, 'default-time-based-fallback');
  assert.equal(fallback.targetTime, 1 / 30);
});

test('drift policy nudges small drift, seeks large drift, and holds unsafe states', () => {
  const withinTolerance = planDriftCorrection({
    currentTime: 10,
    targetTime: 10.03,
    baseRate: 1,
    state: PLAYER_STATUS.PLAYING,
  });
  assert.equal(withinTolerance.action, DRIFT_ACTION.NONE);

  const nudge = planDriftCorrection({
    currentTime: 10,
    targetTime: 10.1,
    baseRate: 1,
    state: PLAYER_STATUS.PLAYING,
  });
  assert.equal(nudge.action, DRIFT_ACTION.RATE_NUDGE);
  assert.ok(Math.abs(nudge.rateAdjustment - 0.05) < 1e-12);
  assert.ok(Math.abs(nudge.playbackRate - 1.05) < 1e-12);

  const seek = planDriftCorrection({
    currentTime: 10,
    targetTime: 10.5,
    baseRate: 1,
    state: PLAYER_STATUS.PLAYING,
  });
  assert.equal(seek.action, DRIFT_ACTION.SEEK);
  assert.equal(seek.resetRate, true);
  assert.equal(seek.targetTime, 10.5);

  const paused = planDriftCorrection({
    currentTime: 10,
    targetTime: 12,
    state: PLAYER_STATUS.PAUSED,
  });
  assert.equal(paused.action, DRIFT_ACTION.HOLD);

  const stalled = planDriftCorrection({
    currentTime: 10,
    targetTime: 12,
    state: PLAYER_STATUS.STALLED,
  });
  assert.equal(stalled.action, DRIFT_ACTION.ERROR);
  assert.equal(stalled.recoverable, true);
});

test('comparison drift uses frame-resolved playback targets independently per side', () => {
  const leftAnchor = anchor({
    side: 'left',
    observedTime: 1,
    observedFrameIndex: 30,
    timingSnapshot: cfr(30, 90, 3),
  });
  const rightAnchor = anchor({
    side: 'right',
    mediaAssetId: 'asset-right',
    observedTime: 2,
    observedFrameIndex: 120,
    timingSnapshot: cfr(60, 180, 3),
  });
  const aligned = alignComparisonAtRelativeTime({
    left: { anchor: leftAnchor, duration: 3, timing: cfr(30, 90, 3), capability: true },
    right: { anchor: rightAnchor, duration: 3, timing: cfr(60, 180, 3), capability: true },
  }, 0.5);

  const leftPlayer = createPlayerBlock({
    blockId: 'comparison-1-left',
    mediaAssetId: 'asset-left',
    duration: 3,
    timing: cfr(30, 90, 3),
    anchor: leftAnchor,
  });
  const result = seekPlayerToRelativeTime(leftPlayer, 0.5, { frameAware: true });
  assert.equal(result.player.currentTime, 1.5);
  assert.equal(result.alignment.frameIndex, 45);
  assert.equal(aligned.sides.right.playbackTime, 2.5);
});

test('validation rejects malformed loop and frame-aware anchor evidence', () => {
  assert.equal(validateLoopRange({ enabled: true, start: 2, end: 1 }, 3).valid, false);
  assert.throws(
    () => createLoop({ enabled: true, start: 2, end: 1 }),
    /loop.end must be greater than loop.start/,
  );

  const invalidAnchor = {
    comparisonBlockId: 'comparison-1',
    side: 'left',
    mediaAssetId: 'asset-left',
    observedTime: 1,
    observedFrameIndex: null,
    precision: PRECISION.FRAME_AWARE,
    timingSnapshot: { kind: TIMING_KIND.UNKNOWN },
    capturedAt: '2026-08-14T00:00:00.000Z',
  };
  const validation = validateSyncAnchor(invalidAnchor);
  assert.equal(validation.valid, false);
  assert.match(validation.issues.join('; '), /observedFrameIndex/);
  assert.match(validation.issues.join('; '), /frame-mappable timing/);
});

test('timeToFrame projects distinct CFR frame rates from the same media time', () => {
  assert.equal(timeToFrame(cfr(30, 90, 3), 1.5, { duration: 3 }).frameIndex, 45);
  assert.equal(timeToFrame(cfr(60, 180, 3), 1.5, { duration: 3 }).frameIndex, 90);
});
