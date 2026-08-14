'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  CAPABILITY_STATUS,
  DRIFT_ACTION,
  FRAME_STEP_RESOLUTION,
  PLAYER_STATUS,
  PRECISION,
  SYNC_MODE,
  TIMING_KIND,
  advancePlaybackRelationship,
  advancePlayer,
  alignComparisonAtRelativeTime,
  captureSyncAnchor,
  createComparisonSyncState,
  createLoop,
  createPlaybackRelationship,
  createPlayerBlock,
  createSyncAnchor,
  mapAnchorToRelativeTime,
  mapComparisonSyncState,
  planDriftCorrection,
  planFrameStep,
  seekPlayerToRelativeTime,
  setPlaybackRelationship,
  setPlayerLoop,
  setSyncStartAnchor,
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

test('loop boundaries wrap deterministically in both directions without zero-step movement', () => {
  const reverseBoundary = createPlayerBlock({
    blockId: 'comparison-loop-left',
    mediaAssetId: 'asset-left',
    duration: 3,
    currentTime: 1.5,
    status: PLAYER_STATUS.PLAYING,
    loop: { enabled: true, start: 1, end: 2 },
  });
  const reverseWrapped = advancePlayer(reverseBoundary, -0.5);
  assert.equal(reverseWrapped.currentTime, 2);

  const multiWrap = advancePlayer(reverseBoundary, 2.75);
  assert.equal(multiWrap.currentTime, 1.25);

  const atEnd = createPlayerBlock({
    blockId: 'comparison-loop-right',
    mediaAssetId: 'asset-right',
    duration: 3,
    currentTime: 2,
    loop: { enabled: true, start: 1, end: 2 },
  });
  assert.equal(advancePlayer(atEnd, 0).currentTime, 2);
});

test('anchor capture derives time-only or exact-frame evidence without synthesizing frames', () => {
  const player = createPlayerBlock({
    blockId: 'comparison-1-left',
    comparisonBlockId: 'comparison-1',
    side: 'left',
    mediaAssetId: 'asset-left',
    duration: 3,
    timing: cfr(30, 90, 3),
    currentTime: 1.25,
  });

  const timeOnly = captureSyncAnchor({
    player,
    capability: { supportsFrameStep: false },
    capturedAt: '2026-08-14T00:00:00.000Z',
  });
  assert.equal(timeOnly.comparisonBlockId, 'comparison-1');
  assert.equal(timeOnly.side, 'left');
  assert.equal(timeOnly.observedTime, 1.25);
  assert.equal(timeOnly.observedFrameIndex, null);
  assert.equal(timeOnly.precision, PRECISION.TIME_BASED);
  assert.equal(timeOnly.captureResolution, FRAME_STEP_RESOLUTION.TIME_ONLY);
  assert.equal(timeOnly.capabilityStatus, CAPABILITY_STATUS.UNSUPPORTED);
  assert.equal(Object.prototype.hasOwnProperty.call(timeOnly, 'player'), false);

  const exactFrame = captureSyncAnchor({
    player,
    observedFrameIndex: 37,
    capability: { supportsFrameStep: true },
    capturedAt: '2026-08-14T00:00:01.000Z',
  });
  assert.equal(exactFrame.observedFrameIndex, 37);
  assert.equal(exactFrame.precision, PRECISION.FRAME_AWARE);
  assert.equal(exactFrame.captureResolution, FRAME_STEP_RESOLUTION.EXACT_FRAME);

  const unknownPlayer = createPlayerBlock({
    blockId: 'comparison-2-left',
    comparisonBlockId: 'comparison-2',
    side: 'left',
    mediaAssetId: 'asset-unknown',
    duration: 3,
    timing: { kind: TIMING_KIND.UNKNOWN },
    currentTime: 1,
  });
  const unknown = captureSyncAnchor({
    player: unknownPlayer,
    capturedAt: '2026-08-14T00:00:02.000Z',
  });
  assert.equal(unknown.precision, PRECISION.UNKNOWN);
  assert.equal(unknown.captureResolution, FRAME_STEP_RESOLUTION.UNKNOWN);
  assert.equal(unknown.capabilityStatus, CAPABILITY_STATUS.UNKNOWN);
});

test('player block instance validation prevents an anchor from crossing block-local boundaries', () => {
  assert.throws(
    () => createPlayerBlock({
      blockId: 'comparison-2-left',
      comparisonBlockId: 'comparison-2',
      side: 'left',
      mediaAssetId: 'asset-left',
      duration: 3,
      timing: cfr(30, 90, 3),
      anchor: anchor(),
    }),
    /comparisonBlockId does not match the player block instance/,
  );
  assert.throws(
    () => createPlayerBlock({
      blockId: 'comparison-1-right',
      comparisonBlockId: 'comparison-1',
      side: 'right',
      mediaAssetId: 'asset-left',
      duration: 3,
      timing: cfr(30, 90, 3),
      anchor: anchor(),
    }),
    /anchor.side does not match the player block side/,
  );

  const first = createPlayerBlock({
    blockId: 'comparison-1-left',
    comparisonBlockId: 'comparison-1',
    side: 'left',
    mediaAssetId: 'asset-shared',
    duration: 3,
    timing: cfr(30, 90, 3),
    loop: { enabled: true, start: 0.5, end: 1.5 },
    playbackRate: 0.5,
    anchor: anchor({ mediaAssetId: 'asset-shared' }),
  });
  const second = createPlayerBlock({
    blockId: 'comparison-2-left',
    comparisonBlockId: 'comparison-2',
    side: 'left',
    mediaAssetId: 'asset-shared',
    duration: 3,
    timing: cfr(30, 90, 3),
    loop: { enabled: true, start: 1.5, end: 2.5 },
    playbackRate: 2,
    anchor: anchor({ comparisonBlockId: 'comparison-2', mediaAssetId: 'asset-shared' }),
  });
  const advanced = advancePlayer(first, 1);
  assert.equal(first.playbackRate, 0.5);
  assert.equal(second.playbackRate, 2);
  assert.equal(first.loop.start, 0.5);
  assert.equal(second.loop.start, 1.5);
  assert.equal(advanced.anchor.comparisonBlockId, 'comparison-1');
  assert.equal(second.anchor.comparisonBlockId, 'comparison-2');
});

test('default comparison sync uses shared elapsed time and never maps raw frame indexes one-to-one', () => {
  const leftAnchor = anchor({
    side: 'left',
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
  const state = createComparisonSyncState({
    comparisonBlockId: 'comparison-1',
    startAnchors: { left: leftAnchor, right: rightAnchor },
    playback: { relativeTime: 0.5 },
  });
  const mapped = mapComparisonSyncState(state, {
    left: { timing: cfr(30, 900, 30), duration: 30, capability: true },
    right: { timing: cfr(60, 1800, 30), duration: 30, capability: true },
  });

  assert.equal(mapped.valid, true);
  assert.equal(mapped.requestedMode, SYNC_MODE.TIME);
  assert.equal(mapped.effectiveMode, SYNC_MODE.TIME);
  assert.equal(mapped.resolution, FRAME_STEP_RESOLUTION.TIME_ONLY);
  assert.equal(mapped.sides.left.targetTime, 10.5);
  assert.equal(mapped.sides.right.targetTime, 20.5);
  assert.equal(mapped.sides.left.frameIndex, null);
  assert.equal(mapped.sides.right.frameIndex, null);
});

test('explicit frame mode is separate and uses each source timing when capability is available', () => {
  const state = createComparisonSyncState({
    comparisonBlockId: 'comparison-1',
    startAnchors: {
      left: anchor({
        observedTime: 10,
        observedFrameIndex: 300,
        timingSnapshot: cfr(30, 900, 30),
      }),
      right: anchor({
        side: 'right',
        mediaAssetId: 'asset-right',
        observedTime: 20,
        observedFrameIndex: 1200,
        timingSnapshot: cfr(60, 1800, 30),
      }),
    },
    playback: createPlaybackRelationship({ mode: SYNC_MODE.FRAME, relativeTime: 0.5 }),
  });
  const mapped = mapComparisonSyncState(state, {
    left: { timing: cfr(30, 900, 30), duration: 30, capability: true },
    right: { timing: cfr(60, 1800, 30), duration: 30, capability: true },
  });

  assert.equal(mapped.valid, true);
  assert.equal(mapped.requestedMode, SYNC_MODE.FRAME);
  assert.equal(mapped.effectiveMode, SYNC_MODE.FRAME);
  assert.equal(mapped.resolution, FRAME_STEP_RESOLUTION.EXACT_FRAME);
  assert.equal(mapped.sides.left.frameIndex, 315);
  assert.equal(mapped.sides.right.frameIndex, 1230);
});

test('frame capability cannot upgrade a time-only start anchor into exact-frame evidence', () => {
  const timeOnlyAnchor = createSyncAnchor({
    comparisonBlockId: 'comparison-time-only',
    side: 'left',
    mediaAssetId: 'asset-left',
    observedTime: 1,
    observedFrameIndex: null,
    precision: PRECISION.TIME_BASED,
    timingSnapshot: cfr(30, 90, 3),
    capturedAt: '2026-08-14T00:00:00.000Z',
  });
  const mapped = mapAnchorToRelativeTime(timeOnlyAnchor, 0.5, {
    duration: 3,
    timing: cfr(30, 90, 3),
    capability: true,
    mode: SYNC_MODE.FRAME,
  });
  assert.equal(mapped.precision, PRECISION.TIME_BASED);
  assert.equal(mapped.resolution, FRAME_STEP_RESOLUTION.TIME_ONLY);
  assert.equal(mapped.fallback, true);
  assert.equal(mapped.frameIndex, null);
  assert.equal(mapped.targetTime, 1.5);
});

test('start anchors and playback relationship update independently per comparison block', () => {
  const initial = createComparisonSyncState({
    comparisonBlockId: 'comparison-1',
    startAnchors: {
      left: anchor(),
      right: anchor({
        side: 'right',
        mediaAssetId: 'asset-right',
      }),
    },
  });
  const changedPlayback = setPlaybackRelationship(initial, {
    relativeTime: 1.25,
    playbackRate: 1.5,
    status: PLAYER_STATUS.PLAYING,
  });
  assert.equal(changedPlayback.playback.relativeTime, 1.25);
  assert.equal(changedPlayback.playback.playbackRate, 1.5);
  assert.equal(changedPlayback.playback.status, PLAYER_STATUS.PLAYING);
  assert.deepEqual(changedPlayback.startAnchors, initial.startAnchors);

  const changedAnchor = setSyncStartAnchor(initial, 'left', anchor({ observedTime: 1.5 }));
  assert.equal(changedAnchor.startAnchors.left.observedTime, 1.5);
  assert.equal(changedAnchor.playback.relativeTime, initial.playback.relativeTime);
  assert.equal(initial.startAnchors.left.observedTime, 1);
  assert.equal(initial.playback.relativeTime, 0);
});

test('time-mode playback advances one shared elapsed-time playhead at the relationship rate', () => {
  const paused = createComparisonSyncState({
    comparisonBlockId: 'comparison-paused',
    playback: { relativeTime: 1, playbackRate: 2, status: PLAYER_STATUS.PAUSED },
  });
  assert.equal(advancePlaybackRelationship(paused, 1).playback.relativeTime, 1);

  const playing = setPlaybackRelationship(paused, { status: PLAYER_STATUS.PLAYING });
  const advanced = advancePlaybackRelationship(playing, 0.5);
  assert.equal(advanced.playback.relativeTime, 2);
  assert.equal(advanced.startAnchors.left, null);
  assert.equal(advanced.startAnchors.right, null);
});

test('shared time playhead stays deterministic over long playback and keeps block-local anchors', () => {
  const leftAnchor = anchor({
    comparisonBlockId: 'comparison-long-play',
    observedTime: 10,
    observedFrameIndex: 300,
    timingSnapshot: cfr(30, 300000, 10000),
  });
  const rightAnchor = anchor({
    comparisonBlockId: 'comparison-long-play',
    side: 'right',
    mediaAssetId: 'asset-right',
    observedTime: 20,
    observedFrameIndex: 1200,
    timingSnapshot: cfr(60, 600000, 10000),
  });
  let state = createComparisonSyncState({
    comparisonBlockId: 'comparison-long-play',
    startAnchors: { left: leftAnchor, right: rightAnchor },
    playback: {
      relativeTime: 0,
      playbackRate: 1.25,
      status: PLAYER_STATUS.PLAYING,
    },
  });

  const tickCount = 36_000;
  for (let tick = 0; tick < tickCount; tick += 1) {
    state = advancePlaybackRelationship(state, 0.1);
  }

  assert.ok(Math.abs(state.playback.relativeTime - 4500) < 1e-9);
  const mapped = mapComparisonSyncState(state, {
    left: { timing: cfr(30, 300000, 10000), duration: 10000, capability: true },
    right: { timing: cfr(60, 600000, 10000), duration: 10000, capability: true },
  });
  assert.equal(mapped.effectiveMode, SYNC_MODE.TIME);
  assert.equal(mapped.resolution, FRAME_STEP_RESOLUTION.TIME_ONLY);
  assert.equal(mapped.sides.left.targetTime, 4510);
  assert.equal(mapped.sides.right.targetTime, 4520);
  assert.equal(mapped.sides.left.frameIndex, null);
  assert.equal(mapped.sides.right.frameIndex, null);

  const longPlayDrift = planDriftCorrection({
    currentTime: 43_200,
    targetTime: 43_200.1,
    baseRate: 1,
    state: PLAYER_STATUS.PLAYING,
  });
  assert.equal(longPlayDrift.action, DRIFT_ACTION.RATE_NUDGE);
  assert.ok(Math.abs(longPlayDrift.rateAdjustment - 0.05) < 1e-12);

  const otherBlock = createComparisonSyncState({
    comparisonBlockId: 'comparison-other',
    startAnchors: {
      left: anchor({
        comparisonBlockId: 'comparison-other',
        observedTime: 100,
        timingSnapshot: cfr(30, 9000, 300),
      }),
      right: anchor({
        comparisonBlockId: 'comparison-other',
        side: 'right',
        mediaAssetId: 'asset-right',
        observedTime: 200,
        timingSnapshot: cfr(60, 18000, 300),
      }),
    },
    playback: { relativeTime: 0.5 },
  });
  const otherMapped = mapComparisonSyncState(otherBlock, {
    left: { timing: cfr(30, 900, 3), duration: 3 },
    right: { timing: cfr(60, 1800, 3), duration: 3 },
  });
  assert.equal(otherMapped.sides.left.targetTime, 3);
  assert.equal(otherMapped.sides.right.targetTime, 3);
  assert.equal(state.comparisonBlockId, 'comparison-long-play');
  assert.equal(state.startAnchors.left.observedTime, 10);
});

test('explicit frame mode exposes per-source fallback instead of claiming frame precision', () => {
  const state = createComparisonSyncState({
    comparisonBlockId: 'comparison-1',
    startAnchors: {
      left: anchor({ observedTime: 1 }),
      right: anchor({ side: 'right', mediaAssetId: 'asset-right' }),
    },
    playback: { mode: SYNC_MODE.FRAME, relativeTime: 0.1 },
  });
  const mapped = mapComparisonSyncState(state, {
    left: {
      timing: { kind: TIMING_KIND.VFR, nominalFps: 30 },
      duration: 3,
      capability: false,
    },
    right: {
      timing: { kind: TIMING_KIND.UNKNOWN },
      duration: 3,
    },
  });

  assert.equal(mapped.valid, true);
  assert.equal(mapped.fallback, true);
  assert.equal(mapped.resolution, FRAME_STEP_RESOLUTION.UNKNOWN);
  assert.equal(mapped.effectiveMode, SYNC_MODE.UNKNOWN);
  assert.equal(mapped.sides.left.fallback, true);
  assert.equal(mapped.sides.left.resolution, FRAME_STEP_RESOLUTION.TIME_ONLY);
  assert.equal(mapped.sides.right.resolution, FRAME_STEP_RESOLUTION.UNKNOWN);
  assert.equal(mapped.sides.right.frameIndex, null);

  const missing = mapComparisonSyncState(
    createComparisonSyncState({ comparisonBlockId: 'empty-comparison' }),
    { left: {}, right: {} },
  );
  assert.equal(missing.valid, false);
  assert.equal(missing.repairAction, 'set-sync-start-anchors');
  assert.deepEqual(missing.missingSides, ['left', 'right']);
});

test('frame mapping reads capability from each source player and falls back independently', () => {
  const state = createComparisonSyncState({
    comparisonBlockId: 'comparison-player-capability',
    startAnchors: {
      left: anchor({
        comparisonBlockId: 'comparison-player-capability',
        observedTime: 1,
      }),
      right: anchor({
        comparisonBlockId: 'comparison-player-capability',
        side: 'right',
        mediaAssetId: 'asset-right',
        observedTime: 2,
        observedFrameIndex: 60,
        timingSnapshot: cfr(60, 180, 3),
      }),
    },
    playback: { mode: SYNC_MODE.FRAME, relativeTime: 0.5 },
  });
  const mapped = mapComparisonSyncState(state, {
    left: {
      player: {
        blockId: 'comparison-player-capability-left',
        comparisonBlockId: 'comparison-player-capability',
        side: 'left',
        mediaAssetId: 'asset-left',
        duration: 3,
        timing: cfr(30, 90, 3),
        capability: { supportsFrameStep: true },
      },
    },
    right: {
      timing: cfr(60, 180, 3),
      duration: 3,
      capability: false,
    },
  });

  assert.equal(mapped.sides.left.resolution, FRAME_STEP_RESOLUTION.EXACT_FRAME);
  assert.equal(mapped.sides.left.frameIndex, 45);
  assert.equal(mapped.sides.right.resolution, FRAME_STEP_RESOLUTION.TIME_ONLY);
  assert.equal(mapped.sides.right.frameIndex, null);
  assert.equal(mapped.resolution, FRAME_STEP_RESOLUTION.TIME_ONLY);
  assert.equal(mapped.effectiveMode, SYNC_MODE.TIME);
  assert.equal(mapped.fallback, true);
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
  }, 0.5, { mode: SYNC_MODE.FRAME });

  assert.equal(aligned.precision, PRECISION.FRAME_AWARE);
  assert.equal(aligned.resolution, FRAME_STEP_RESOLUTION.EXACT_FRAME);
  assert.equal(aligned.sides.left.targetTime, 10.5);
  assert.equal(aligned.sides.right.targetTime, 20.5);
  assert.equal(aligned.sides.left.frameIndex, 315);
  assert.equal(aligned.sides.right.frameIndex, 1230);
  assert.notEqual(aligned.sides.left.frameIndex, aligned.sides.right.frameIndex);

  const timeOnly = mapAnchorToRelativeTime(leftAnchor, 0.5, {
    duration: 30,
    timing: cfr(30, 900, 30),
    capability: false,
  });
  assert.equal(timeOnly.targetTime, 10.5);
  assert.equal(timeOnly.frameIndex, null);
  assert.equal(timeOnly.precision, PRECISION.TIME_BASED);
  assert.equal(timeOnly.resolution, FRAME_STEP_RESOLUTION.TIME_ONLY);
});

test('low-level comparison alignment defaults to time mode and requires explicit frame mode', () => {
  const leftAnchor = anchor({
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
  const sides = {
    left: { anchor: leftAnchor, duration: 30, timing: cfr(30, 900, 30), capability: true },
    right: { anchor: rightAnchor, duration: 30, timing: cfr(60, 1800, 30), capability: true },
  };

  const defaultAlignment = alignComparisonAtRelativeTime(sides, 0.5);
  assert.equal(defaultAlignment.requestedMode, SYNC_MODE.TIME);
  assert.equal(defaultAlignment.effectiveMode, SYNC_MODE.TIME);
  assert.equal(defaultAlignment.resolution, FRAME_STEP_RESOLUTION.TIME_ONLY);
  assert.equal(defaultAlignment.sides.left.frameIndex, null);
  assert.equal(defaultAlignment.sides.right.frameIndex, null);

  const frameAlignment = alignComparisonAtRelativeTime(sides, 0.5, {
    mode: SYNC_MODE.FRAME,
  });
  assert.equal(frameAlignment.requestedMode, SYNC_MODE.FRAME);
  assert.equal(frameAlignment.effectiveMode, SYNC_MODE.FRAME);
  assert.equal(frameAlignment.resolution, FRAME_STEP_RESOLUTION.EXACT_FRAME);
  assert.equal(frameAlignment.sides.left.frameIndex, 315);
  assert.equal(frameAlignment.sides.right.frameIndex, 1230);
});

test('comparison alignment rejects anchors assigned to the opposite block-local side', () => {
  const leftAnchor = anchor({
    side: 'left',
    observedTime: 1,
    timingSnapshot: cfr(30, 90, 3),
  });
  const rightAnchor = anchor({
    side: 'right',
    mediaAssetId: 'asset-right',
    observedTime: 2,
    timingSnapshot: cfr(60, 180, 3),
  });

  assert.throws(
    () => alignComparisonAtRelativeTime({
      left: { anchor: rightAnchor, duration: 3, timing: rightAnchor.timingSnapshot },
      right: { anchor: leftAnchor, duration: 3, timing: leftAnchor.timingSnapshot },
    }, 0.5),
    /comparison anchor for left must declare side left/,
  );
});

test('time-mode comparison mapping uses shared elapsed time across CFR and VFR sources', () => {
  const state = createComparisonSyncState({
    comparisonBlockId: 'comparison-mixed-timebases',
    startAnchors: {
      left: anchor({
        comparisonBlockId: 'comparison-mixed-timebases',
        side: 'left',
        observedTime: 1.25,
        observedFrameIndex: 38,
        timingSnapshot: cfr(30, 60, 2),
      }),
      right: anchor({
        comparisonBlockId: 'comparison-mixed-timebases',
        side: 'right',
        mediaAssetId: 'asset-right',
        observedTime: 0.8,
        observedFrameIndex: null,
        precision: PRECISION.TIME_BASED,
        timingSnapshot: vfr([0, 0.31, 0.8, 1.17, 1.49], 1.5),
      }),
    },
    playback: { relativeTime: 0.5 },
  });

  const mapped = mapComparisonSyncState(state, {
    left: { timing: cfr(30, 60, 2), duration: 2, capability: true },
    right: {
      timing: vfr([0, 0.31, 0.8, 1.17, 1.49], 1.5),
      duration: 1.5,
      capability: true,
    },
  });
  assert.equal(mapped.effectiveMode, SYNC_MODE.TIME);
  assert.equal(mapped.resolution, FRAME_STEP_RESOLUTION.TIME_ONLY);
  assert.equal(mapped.sides.left.targetTime, 1.75);
  assert.equal(mapped.sides.right.targetTime, 1.3);
  assert.equal(mapped.sides.left.frameIndex, null);
  assert.equal(mapped.sides.right.frameIndex, null);

  const clamped = mapComparisonSyncState(
    setPlaybackRelationship(state, { relativeTime: 2 }),
    {
      left: { timing: cfr(30, 60, 2), duration: 2 },
      right: {
        timing: vfr([0, 0.31, 0.8, 1.17, 1.49], 1.5),
        duration: 1.5,
      },
    },
  );
  assert.equal(clamped.sides.left.targetTime, 2);
  assert.equal(clamped.sides.right.targetTime, 1.5);
  assert.equal(clamped.sides.left.clamped, true);
  assert.equal(clamped.sides.right.clamped, true);
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
    mode: SYNC_MODE.FRAME,
  });

  assert.ok(Math.abs(mapping.targetTime - 0.15) < 1e-12);
  assert.equal(mapping.precision, PRECISION.FRAME_AWARE);
  assert.equal(mapping.resolution, FRAME_STEP_RESOLUTION.EXACT_FRAME);
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
  assert.equal(exact.resolution, FRAME_STEP_RESOLUTION.EXACT_FRAME);
  assert.equal(exact.capabilityStatus, CAPABILITY_STATUS.AVAILABLE);
  assert.equal(exact.exact, true);
  assert.equal(exact.targetTime, 1.0333333333333334);

  const durationFromTiming = planFrameStep({
    timing: cfr(30, 90, 3),
    currentTime: 2.99,
    direction: 1,
    capability: true,
  });
  assert.equal(durationFromTiming.action, 'boundary');
  assert.equal(durationFromTiming.frameIndex, 89);

  const timeFallback = planFrameStep({
    timing: cfr(30, 90, 3),
    duration: 3,
    currentTime: 1,
    direction: -1,
    capability: { supportsFrameStep: false },
  });
  assert.equal(timeFallback.precision, PRECISION.TIME_BASED);
  assert.equal(timeFallback.resolution, FRAME_STEP_RESOLUTION.TIME_ONLY);
  assert.equal(timeFallback.capabilityStatus, CAPABILITY_STATUS.UNSUPPORTED);
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
  assert.equal(fallback.resolution, FRAME_STEP_RESOLUTION.UNKNOWN);
  assert.equal(fallback.capabilityStatus, CAPABILITY_STATUS.UNKNOWN);
  assert.equal(fallback.exact, false);
  assert.equal(fallback.fallback, true);
  assert.equal(fallback.stepSource, 'default-time-based-fallback');
  assert.equal(fallback.targetTime, 1 / 30);

  const explicitlyUnsupported = planFrameStep({
    timing: { kind: TIMING_KIND.UNKNOWN },
    duration: 2,
    currentTime: 0,
    direction: 1,
    capability: false,
  });
  assert.equal(explicitlyUnsupported.resolution, FRAME_STEP_RESOLUTION.UNSUPPORTED);
  assert.equal(explicitlyUnsupported.capabilityStatus, CAPABILITY_STATUS.UNSUPPORTED);
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
  }, 0.5, { mode: SYNC_MODE.FRAME });

  const leftPlayer = createPlayerBlock({
    blockId: 'comparison-1-left',
    mediaAssetId: 'asset-left',
    duration: 3,
    timing: cfr(30, 90, 3),
    anchor: leftAnchor,
  });
  const result = seekPlayerToRelativeTime(leftPlayer, 0.5, {
    mode: SYNC_MODE.FRAME,
    capability: true,
  });
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
  assert.throws(
    () => timeToFrame({
      kind: TIMING_KIND.VFR,
      frameTimes: [0, 0.04, 0.09],
      frameCount: 2,
    }, 0.04),
    /frameCount must match timing.frameTimes length/,
  );
});

test('timeToFrame projects distinct CFR frame rates from the same media time', () => {
  assert.equal(timeToFrame(cfr(30, 90, 3), 1.5, { duration: 3 }).frameIndex, 45);
  assert.equal(timeToFrame(cfr(60, 180, 3), 1.5, { duration: 3 }).frameIndex, 90);
});
