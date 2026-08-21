'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  CAPABILITY_STATUS,
  FRAME_STEP_RESOLUTION,
  PRECISION,
  SYNC_MODE,
  TIMING_KIND,
  alignComparisonAtRelativeTime,
  captureSyncAnchor,
  createPlayerBlock,
  mapAnchorToRelativeTime,
  planFrameStep,
} = require('../../src/sync');

// Synthetic metadata validates the public app/domain contract only; it is not
// evidence that Electron or HTMLMediaElement can decode or seek real media.
function cfr(fps, frameCount, duration) {
  return { kind: TIMING_KIND.CFR, fps, frameCount, duration };
}

function vfr(frameTimes, duration) {
  return { kind: TIMING_KIND.VFR, frameTimes, duration };
}

function publicSyncContract() {
  return Object.freeze({
    createPlayerBlock,
    captureSyncAnchor,
    alignComparisonAtRelativeTime,
    mapAnchorToRelativeTime,
    planFrameStep,
  });
}

test('public sync contract validates a synthetic single-video player and frame step', () => {
  const sync = publicSyncContract();
  const timing = cfr(30, 120, 4);
  const player = sync.createPlayerBlock({
    blockId: 'single-runtime-block',
    mediaAssetId: 'synthetic-single',
    duration: 4,
    timing,
    currentTime: 1.2,
    playbackRate: 0.75,
    segment: { in: 0.5, out: 2.5 },
    loop: { enabled: true },
  });
  assert.equal(player.mediaAssetId, 'synthetic-single');
  assert.equal(player.playbackRate, 0.75);
  assert.deepEqual(player.loop, { enabled: true });

  const previous = sync.planFrameStep({
    timing,
    duration: 4,
    currentTime: player.currentTime,
    direction: -1,
    capability: true,
  });
  assert.equal(previous.exact, true);
  assert.equal(previous.frameIndex, 35);
  assert.equal(previous.targetTime, 35 / 30);
});

test('public sync contract keeps side-by-side time mode separate from frame fallback', () => {
  const sync = publicSyncContract();
  const leftTiming = cfr(30, 75, 2.5);
  const rightTiming = vfr([0, 0.18, 0.41, 0.73, 1.06, 1.44, 1.87], 2);
  const leftAnchor = sync.captureSyncAnchor({
    comparisonBlockId: 'comparison-runtime-block',
    side: 'left',
    mediaAssetId: 'synthetic-left',
    observedTime: 1,
    observedFrameIndex: 30,
    timingSnapshot: leftTiming,
    capability: true,
    capturedAt: '2026-08-15T16:00:01.000Z',
  });
  const rightAnchor = sync.captureSyncAnchor({
    comparisonBlockId: 'comparison-runtime-block',
    side: 'right',
    mediaAssetId: 'synthetic-right',
    observedTime: 0.4,
    timingSnapshot: rightTiming,
    capturedAt: '2026-08-15T16:00:02.000Z',
  });

  const timeAlignment = sync.alignComparisonAtRelativeTime({
    left: { anchor: leftAnchor, duration: 2.5, timing: leftTiming, capability: true },
    right: { anchor: rightAnchor, duration: 2, timing: rightTiming },
  }, 0.5);
  assert.equal(timeAlignment.requestedMode, SYNC_MODE.TIME);
  assert.equal(timeAlignment.effectiveMode, SYNC_MODE.TIME);
  assert.equal(timeAlignment.sides.left.targetTime, 1.5);
  assert.equal(timeAlignment.sides.right.targetTime, 0.9);
  assert.equal(timeAlignment.sides.left.frameIndex, null);
  assert.equal(timeAlignment.sides.right.frameIndex, null);

  const frameAlignment = sync.alignComparisonAtRelativeTime({
    left: { anchor: leftAnchor, duration: 2.5, timing: leftTiming, capability: true },
    right: { anchor: rightAnchor, duration: 2, timing: rightTiming, capability: true },
  }, 3, { mode: SYNC_MODE.FRAME });
  assert.equal(frameAlignment.requestedMode, SYNC_MODE.FRAME);
  assert.equal(frameAlignment.effectiveMode, SYNC_MODE.TIME);
  assert.equal(frameAlignment.resolution, FRAME_STEP_RESOLUTION.TIME_ONLY);
  assert.equal(frameAlignment.fallback, true);
  assert.equal(frameAlignment.sides.left.targetTime, 2.5);
  assert.equal(frameAlignment.sides.right.targetTime, 2);
  assert.equal(frameAlignment.sides.left.frameIndex, 74);
  assert.equal(frameAlignment.sides.right.frameIndex, null);
  assert.equal(frameAlignment.sides.right.capabilityStatus, CAPABILITY_STATUS.AVAILABLE);
  assert.equal(frameAlignment.sides.right.precision, PRECISION.TIME_BASED);
});
