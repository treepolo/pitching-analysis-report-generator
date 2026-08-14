'use strict';

/**
 * Pure playback/synchronisation domain primitives.
 *
 * This module deliberately knows nothing about HTMLMediaElement, Electron,
 * FFmpeg, or persistence.  A caller supplies the observed timing metadata
 * and runtime capability, and receives a value describing the next domain
 * state or correction plan.  No function here claims that a seek or a frame
 * step was actually performed.
 */

const PRECISION = Object.freeze({
  FRAME_AWARE: 'frame-aware',
  TIME_BASED: 'time-based',
  UNKNOWN: 'unknown',
});

const TIMING_KIND = Object.freeze({
  CFR: 'cfr',
  VFR: 'vfr',
  UNKNOWN: 'unknown',
});

const PLAYER_STATUS = Object.freeze({
  PAUSED: 'paused',
  PLAYING: 'playing',
  STALLED: 'stalled',
  ENDED: 'ended',
  ERROR: 'error',
});

const DRIFT_ACTION = Object.freeze({
  NONE: 'none',
  RATE_NUDGE: 'rate-nudge',
  SEEK: 'seek',
  HOLD: 'hold',
  ERROR: 'error',
});

const DEFAULT_DRIFT_CORRECTION_POLICY = Object.freeze({
  nudgeThresholdSeconds: 0.04,
  seekThresholdSeconds: 0.25,
  maxRateAdjustment: 0.05,
  rateGain: 0.5,
});

const DEFAULT_FALLBACK_STEP_SECONDS = 1 / 30;
const EPSILON = 1e-9;

class SyncDomainError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = 'SyncDomainError';
    this.issues = Array.isArray(issues) ? [...issues] : [];
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneValue(child)]));
}

function requireRecord(value, name) {
  if (!isRecord(value)) throw new SyncDomainError(`${name} must be an object`);
  return value;
}

function requireId(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new SyncDomainError(`${name} must be a non-empty string`);
  }
  return value;
}

function requireFinite(value, name, minimum = -Infinity) {
  if (!Number.isFinite(value) || value < minimum) {
    const suffix = minimum !== -Infinity ? ` >= ${minimum}` : '';
    throw new SyncDomainError(`${name} must be a finite number${suffix}`);
  }
  return value;
}

function optionalFinite(value, name, minimum = -Infinity) {
  if (value === undefined || value === null) return undefined;
  return requireFinite(value, name, minimum);
}

function clamp(value, minimum, maximum) {
  if (maximum === undefined || maximum === null) return Math.max(minimum, value);
  return Math.min(maximum, Math.max(minimum, value));
}

function clampMediaTime(time, duration) {
  const lowerBounded = Math.max(0, time);
  return duration === undefined || duration === null
    ? lowerBounded
    : clamp(lowerBounded, 0, duration);
}

function assertValid(validation, context) {
  if (!validation.valid) {
    const detail = validation.issues.length > 0 ? `: ${validation.issues.join('; ')}` : '';
    throw new SyncDomainError(`${context} is invalid${detail}`, validation.issues);
  }
}

function normalizeTimingMetadata(timing = { kind: TIMING_KIND.UNKNOWN }, duration) {
  requireRecord(timing, 'timing metadata');
  const normalized = cloneValue(timing);
  const inferredKind = normalized.kind
    || (Array.isArray(normalized.frameTimes) ? TIMING_KIND.VFR : undefined)
    || (normalized.fps !== undefined || normalized.nominalFps !== undefined
      ? TIMING_KIND.CFR
      : TIMING_KIND.UNKNOWN);
  const kind = inferredKind;
  if (![TIMING_KIND.CFR, TIMING_KIND.VFR, TIMING_KIND.UNKNOWN].includes(kind)) {
    throw new SyncDomainError(`timing metadata kind must be cfr, vfr, or unknown`);
  }

  const resolvedDuration = duration !== undefined
    ? requireFinite(duration, 'duration', 0)
    : optionalFinite(normalized.duration, 'timing.duration', 0);
  if (resolvedDuration !== undefined) normalized.duration = resolvedDuration;
  normalized.kind = kind;

  if (kind === TIMING_KIND.CFR) {
    const fps = normalized.fps ?? normalized.nominalFps;
    requireFinite(fps, 'timing.fps', Number.MIN_VALUE);
    normalized.fps = fps;
    if (normalized.frameCount !== undefined && normalized.frameCount !== null) {
      if (!Number.isInteger(normalized.frameCount) || normalized.frameCount < 1) {
        throw new SyncDomainError('timing.frameCount must be a positive integer');
      }
    }
  }

  if (kind === TIMING_KIND.VFR) {
    if (normalized.frameTimes !== undefined && normalized.frameTimes !== null) {
      if (!Array.isArray(normalized.frameTimes)) {
        throw new SyncDomainError('timing.frameTimes must be an array');
      }
      let previous = -Infinity;
      normalized.frameTimes = normalized.frameTimes.map((time, index) => {
        requireFinite(time, `timing.frameTimes[${index}]`, 0);
        if (time <= previous) {
          throw new SyncDomainError('timing.frameTimes must be strictly increasing');
        }
        previous = time;
        return time;
      });
    }
    if (normalized.fps !== undefined && normalized.fps !== null) {
      requireFinite(normalized.fps, 'timing.fps', Number.MIN_VALUE);
    }
    if (normalized.nominalFps !== undefined && normalized.nominalFps !== null) {
      requireFinite(normalized.nominalFps, 'timing.nominalFps', Number.MIN_VALUE);
    }
    if (normalized.frameCount !== undefined && normalized.frameCount !== null) {
      if (!Number.isInteger(normalized.frameCount) || normalized.frameCount < 1) {
        throw new SyncDomainError('timing.frameCount must be a positive integer');
      }
    }
  }

  return normalized;
}

function timingHasFrameMapping(timing) {
  return (timing.kind === TIMING_KIND.CFR && Number.isFinite(timing.fps))
    || (timing.kind === TIMING_KIND.VFR
      && Array.isArray(timing.frameTimes)
      && timing.frameTimes.length > 0);
}

function frameCountForTiming(timing, duration) {
  if (Number.isInteger(timing.frameCount) && timing.frameCount > 0) {
    return timing.frameCount;
  }
  if (timing.kind === TIMING_KIND.VFR && Array.isArray(timing.frameTimes)) {
    return timing.frameTimes.length || undefined;
  }
  if (timing.kind === TIMING_KIND.CFR && Number.isFinite(duration)) {
    return Math.max(1, Math.ceil(duration * timing.fps));
  }
  return undefined;
}

function frameTimeForIndex(timing, frameIndex, duration) {
  if (!timingHasFrameMapping(timing)) {
    throw new SyncDomainError('frame time is unavailable for this timing metadata');
  }
  const count = frameCountForTiming(timing, duration);
  if (!Number.isInteger(frameIndex) || frameIndex < 0 || (count && frameIndex >= count)) {
    throw new SyncDomainError('frameIndex is outside the available frame range');
  }
  const time = timing.kind === TIMING_KIND.VFR
    ? timing.frameTimes[frameIndex]
    : frameIndex / timing.fps;
  return clampMediaTime(time, duration);
}

function nearestVfrFrameIndex(frameTimes, targetTime, rounding) {
  if (targetTime <= frameTimes[0]) return 0;
  const lastIndex = frameTimes.length - 1;
  if (targetTime >= frameTimes[lastIndex]) return lastIndex;

  let low = 0;
  let high = lastIndex;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (frameTimes[middle] <= targetTime) low = middle;
    else high = middle;
  }
  if (rounding === 'floor') return low;
  if (rounding === 'ceil') return high;
  return targetTime - frameTimes[low] <= frameTimes[high] - targetTime ? low : high;
}

function timeToFrame(timingInput, time, options = {}) {
  const timing = normalizeTimingMetadata(timingInput, options.duration);
  requireFinite(time, 'time');
  if (!timingHasFrameMapping(timing)) {
    throw new SyncDomainError('frame index is unavailable for this timing metadata');
  }
  const duration = options.duration ?? timing.duration;
  const requestedTime = time;
  const targetTime = clampMediaTime(time, duration);
  const rounding = options.rounding ?? 'nearest';
  if (!['nearest', 'floor', 'ceil'].includes(rounding)) {
    throw new SyncDomainError('rounding must be nearest, floor, or ceil');
  }

  let frameIndex;
  if (timing.kind === TIMING_KIND.VFR) {
    frameIndex = nearestVfrFrameIndex(timing.frameTimes, targetTime, rounding);
  } else {
    const rawIndex = rounding === 'floor'
      ? Math.floor(targetTime * timing.fps + EPSILON)
      : rounding === 'ceil'
        ? Math.ceil(targetTime * timing.fps - EPSILON)
        : Math.round(targetTime * timing.fps);
    const count = frameCountForTiming(timing, duration);
    frameIndex = count ? clamp(rawIndex, 0, count - 1) : Math.max(0, rawIndex);
  }

  return {
    frameIndex,
    frameTime: frameTimeForIndex(timing, frameIndex, duration),
    requestedTime,
    targetTime,
    clamped: Math.abs(requestedTime - targetTime) > EPSILON,
  };
}

function frameDurationForTiming(timingInput, options = {}) {
  const timing = normalizeTimingMetadata(timingInput, options.duration);
  if (timing.kind === TIMING_KIND.CFR && Number.isFinite(timing.fps)) return 1 / timing.fps;
  if (timing.kind === TIMING_KIND.VFR && Array.isArray(timing.frameTimes)
      && timing.frameTimes.length > 1) {
    const differences = [];
    for (let index = 1; index < timing.frameTimes.length; index += 1) {
      differences.push(timing.frameTimes[index] - timing.frameTimes[index - 1]);
    }
    differences.sort((left, right) => left - right);
    return differences[Math.floor(differences.length / 2)];
  }
  const nominalFps = timing.nominalFps ?? timing.fps;
  return Number.isFinite(nominalFps) && nominalFps > 0 ? 1 / nominalFps : undefined;
}

function estimateFallbackStep(timingInput, currentTime, direction, duration, fallbackStepSeconds) {
  const timing = normalizeTimingMetadata(timingInput, duration);
  if (timing.kind === TIMING_KIND.VFR && Array.isArray(timing.frameTimes)
      && timing.frameTimes.length > 1) {
    const currentFrame = timeToFrame(timing, currentTime, { duration }).frameIndex;
    const neighbour = currentFrame + (direction > 0 ? 1 : -1);
    if (neighbour >= 0 && neighbour < timing.frameTimes.length) {
      return {
        seconds: Math.abs(timing.frameTimes[neighbour] - timing.frameTimes[currentFrame]),
        source: 'vfr-neighbour-timestamps',
      };
    }
  }
  const derived = frameDurationForTiming(timing, { duration });
  if (derived !== undefined) return { seconds: derived, source: 'timing-metadata' };
  return {
    seconds: fallbackStepSeconds ?? DEFAULT_FALLBACK_STEP_SECONDS,
    source: 'default-time-based-fallback',
  };
}

function supportsFrameStep(capability) {
  if (capability === true || capability === 'frame-aware') return true;
  if (!isRecord(capability)) return false;
  return capability.frameStep === true
    || capability.supportsFrameStep === true
    || capability.mode === PRECISION.FRAME_AWARE;
}

function validateLoopRange(loop, duration) {
  if (loop === null || loop === undefined) return { valid: true, issues: [], normalized: null };
  if (!isRecord(loop)) return { valid: false, issues: ['loop must be an object or null'] };

  const issues = [];
  const enabled = loop.enabled !== false;
  const start = loop.start ?? 0;
  const end = loop.end ?? 0;
  if (!Number.isFinite(start) || start < 0) issues.push('loop.start must be a finite number >= 0');
  if (!Number.isFinite(end) || end < 0) issues.push('loop.end must be a finite number >= 0');
  if (enabled && Number.isFinite(start) && Number.isFinite(end) && end <= start) {
    issues.push('loop.end must be greater than loop.start when enabled');
  }
  if (duration !== undefined && duration !== null && Number.isFinite(end) && end > duration) {
    issues.push('loop.end must not exceed media duration');
  }
  return {
    valid: issues.length === 0,
    issues,
    normalized: issues.length === 0 ? { enabled, start, end } : undefined,
  };
}

function createLoop(input = { enabled: false }) {
  if (input === null) return null;
  const validation = validateLoopRange(input);
  assertValid(validation, 'loop');
  return validation.normalized;
}

function wrapLoopTime(time, loop, direction) {
  const span = loop.end - loop.start;
  if (span <= 0) return loop.start;
  let offset = (time - loop.start) % span;
  if (offset < 0) offset += span;
  if (Math.abs(offset) <= EPSILON) {
    if (direction > 0 && time > loop.start) return loop.start;
    if (direction < 0 && time < loop.end) return loop.end;
  }
  return loop.start + offset;
}

function validateSyncAnchor(anchor, options = {}) {
  const issues = [];
  if (!isRecord(anchor)) return { valid: false, issues: ['anchor must be an object'] };
  if (typeof anchor.comparisonBlockId !== 'string' || anchor.comparisonBlockId.trim() === '') {
    issues.push('anchor.comparisonBlockId must be a non-empty string');
  }
  if (!['left', 'right'].includes(anchor.side)) issues.push('anchor.side must be left or right');
  if (typeof anchor.mediaAssetId !== 'string' || anchor.mediaAssetId.trim() === '') {
    issues.push('anchor.mediaAssetId must be a non-empty string');
  }
  if (!Number.isFinite(anchor.observedTime) || anchor.observedTime < 0) {
    issues.push('anchor.observedTime must be a finite number >= 0');
  }
  if (anchor.observedFrameIndex !== null && anchor.observedFrameIndex !== undefined
      && (!Number.isInteger(anchor.observedFrameIndex) || anchor.observedFrameIndex < 0)) {
    issues.push('anchor.observedFrameIndex must be a non-negative integer or null');
  }
  if (!Object.values(PRECISION).includes(anchor.precision)) {
    issues.push('anchor.precision must be frame-aware, time-based, or unknown');
  }
  if (typeof anchor.capturedAt !== 'string' || anchor.capturedAt.trim() === '') {
    issues.push('anchor.capturedAt must be a non-empty string');
  }
  let snapshot;
  if (!isRecord(anchor.timingSnapshot)) {
    issues.push('anchor.timingSnapshot must be an object');
  } else {
    try {
      snapshot = normalizeTimingMetadata(anchor.timingSnapshot);
    } catch (error) {
      issues.push(`anchor.timingSnapshot is invalid: ${error.message}`);
    }
  }
  if (anchor.precision === PRECISION.FRAME_AWARE) {
    if (!Number.isInteger(anchor.observedFrameIndex) || anchor.observedFrameIndex < 0) {
      issues.push('frame-aware anchors require observedFrameIndex');
    }
    if (snapshot && !timingHasFrameMapping(snapshot)) {
      issues.push('frame-aware anchors require frame-mappable timing metadata');
    }
  }
  if (options.mediaAssetId !== undefined && anchor.mediaAssetId !== options.mediaAssetId) {
    issues.push('anchor.mediaAssetId does not match the player media asset');
  }
  if (options.duration !== undefined && Number.isFinite(anchor.observedTime)
      && anchor.observedTime > options.duration) {
    issues.push('anchor.observedTime must not exceed media duration');
  }
  return { valid: issues.length === 0, issues };
}

function createSyncAnchor(input) {
  requireRecord(input, 'anchor');
  const anchor = {
    ...cloneValue(input),
    comparisonBlockId: input.comparisonBlockId,
    side: input.side,
    mediaAssetId: input.mediaAssetId,
    observedTime: input.observedTime,
    observedFrameIndex: input.observedFrameIndex ?? null,
    precision: input.precision ?? PRECISION.TIME_BASED,
    timingSnapshot: input.timingSnapshot ? normalizeTimingMetadata(input.timingSnapshot) : undefined,
    capturedAt: input.capturedAt,
  };
  assertValid(validateSyncAnchor(anchor), 'sync anchor');
  return anchor;
}

function createPlayerBlock(input) {
  requireRecord(input, 'player block');
  const blockId = requireId(input.blockId, 'player block.blockId');
  const mediaAssetId = requireId(input.mediaAssetId, 'player block.mediaAssetId');
  const duration = requireFinite(input.duration, 'player block.duration', 0);
  const timing = normalizeTimingMetadata(
    input.timing ?? { kind: TIMING_KIND.UNKNOWN },
    duration,
  );
  const loop = input.loop === undefined || input.loop === null
    ? createLoop({ enabled: false })
    : createLoop(input.loop);
  assertValid(validateLoopRange(loop, duration), 'player block loop');

  const currentTime = clampMediaTime(
    input.currentTime === undefined ? 0 : requireFinite(input.currentTime, 'player block.currentTime'),
    duration,
  );
  const playbackRate = input.playbackRate === undefined
    ? 1
    : requireFinite(input.playbackRate, 'player block.playbackRate', Number.MIN_VALUE);
  const status = input.status ?? PLAYER_STATUS.PAUSED;
  if (!Object.values(PLAYER_STATUS).includes(status)) {
    throw new SyncDomainError('player block.status is invalid');
  }

  let anchor = null;
  if (input.anchor !== undefined && input.anchor !== null) {
    const anchorInput = {
      ...cloneValue(input.anchor),
      mediaAssetId: input.anchor.mediaAssetId ?? mediaAssetId,
      timingSnapshot: input.anchor.timingSnapshot ?? timing,
    };
    anchor = createSyncAnchor(anchorInput);
    assertValid(validateSyncAnchor(anchor, { mediaAssetId, duration }), 'player block anchor');
  }

  return {
    ...cloneValue(input),
    blockId,
    mediaAssetId,
    label: input.label === undefined ? '' : String(input.label),
    duration,
    timing,
    currentTime,
    playbackRate,
    status,
    loop,
    anchor,
  };
}

function updatePlayerBlock(player, patch) {
  const current = createPlayerBlock(player);
  requireRecord(patch, 'player block patch');
  return createPlayerBlock({ ...current, ...cloneValue(patch) });
}

function seekPlayer(player, time) {
  const current = createPlayerBlock(player);
  requireFinite(time, 'seek time');
  return updatePlayerBlock(current, { currentTime: clampMediaTime(time, current.duration) });
}

function setPlayerStatus(player, status) {
  if (!Object.values(PLAYER_STATUS).includes(status)) {
    throw new SyncDomainError('player status is invalid');
  }
  return updatePlayerBlock(player, { status });
}

function setPlaybackRate(player, playbackRate) {
  requireFinite(playbackRate, 'playbackRate', Number.MIN_VALUE);
  return updatePlayerBlock(player, { playbackRate });
}

function setPlayerLoop(player, loop) {
  const current = createPlayerBlock(player);
  const nextLoop = loop === null ? createLoop({ enabled: false }) : createLoop(loop);
  assertValid(validateLoopRange(nextLoop, current.duration), 'player loop');
  return updatePlayerBlock(current, { loop: nextLoop });
}

function setPlayerAnchor(player, anchor) {
  const current = createPlayerBlock(player);
  if (anchor === null) return updatePlayerBlock(current, { anchor: null });
  requireRecord(anchor, 'anchor');
  const nextAnchor = createSyncAnchor({
    ...cloneValue(anchor),
    mediaAssetId: anchor.mediaAssetId ?? current.mediaAssetId,
    timingSnapshot: anchor.timingSnapshot ?? current.timing,
  });
  assertValid(
    validateSyncAnchor(nextAnchor, {
      mediaAssetId: current.mediaAssetId,
      duration: current.duration,
    }),
    'player anchor',
  );
  return updatePlayerBlock(current, { anchor: nextAnchor });
}

function advancePlayer(player, deltaSeconds) {
  const current = createPlayerBlock(player);
  requireFinite(deltaSeconds, 'deltaSeconds');
  const signedDelta = deltaSeconds * current.playbackRate;
  const proposed = current.currentTime + signedDelta;
  let nextTime = proposed;
  let nextStatus = current.status;

  if (current.loop && current.loop.enabled) {
    if (proposed < current.loop.start || proposed >= current.loop.end) {
      nextTime = wrapLoopTime(proposed, current.loop, signedDelta >= 0 ? 1 : -1);
    }
  } else {
    nextTime = clampMediaTime(proposed, current.duration);
    if (signedDelta > 0 && proposed >= current.duration) nextStatus = PLAYER_STATUS.ENDED;
    if (signedDelta < 0 && proposed <= 0) nextStatus = PLAYER_STATUS.ENDED;
  }

  return updatePlayerBlock(current, { currentTime: nextTime, status: nextStatus });
}

function mapAnchorToRelativeTime(anchorInput, relativeTime, options = {}) {
  const anchor = createSyncAnchor(anchorInput);
  requireFinite(relativeTime, 'relativeTime');
  const duration = options.duration ?? anchor.timingSnapshot.duration;
  const timing = normalizeTimingMetadata(options.timing ?? anchor.timingSnapshot, duration);
  const requestedTime = anchor.observedTime + relativeTime;
  const targetTime = clampMediaTime(requestedTime, duration);
  const frameAwareRequested = options.precision === PRECISION.FRAME_AWARE
    || options.frameAware === true
    || supportsFrameStep(options.capability);
  let precision = timing.kind === TIMING_KIND.UNKNOWN ? PRECISION.UNKNOWN : PRECISION.TIME_BASED;
  let frameIndex = null;
  let frameTime = null;
  if (frameAwareRequested && timingHasFrameMapping(timing)) {
    const mapped = timeToFrame(timing, targetTime, { duration });
    precision = PRECISION.FRAME_AWARE;
    frameIndex = mapped.frameIndex;
    frameTime = mapped.frameTime;
  }
  return {
    side: anchor.side,
    comparisonBlockId: anchor.comparisonBlockId,
    relativeTime,
    anchorTime: anchor.observedTime,
    requestedTime,
    targetTime,
    playbackTime: frameTime ?? targetTime,
    frameIndex,
    frameTime,
    precision,
    clamped: Math.abs(requestedTime - targetTime) > EPSILON,
  };
}

function overallPrecision(results) {
  const precisions = results.map((result) => result.precision);
  if (precisions.some((value) => value === PRECISION.UNKNOWN)) return PRECISION.UNKNOWN;
  if (precisions.every((value) => value === PRECISION.FRAME_AWARE)) return PRECISION.FRAME_AWARE;
  return PRECISION.TIME_BASED;
}

function alignComparisonAtRelativeTime(sides, relativeTime, options = {}) {
  requireRecord(sides, 'comparison sides');
  requireFinite(relativeTime, 'relativeTime');
  const sideNames = ['left', 'right'];
  const alignedSides = {};
  for (const side of sideNames) {
    if (!isRecord(sides[side])) throw new SyncDomainError(`comparison side ${side} is required`);
    const entry = sides[side];
    const anchor = entry.anchor ?? entry;
    alignedSides[side] = mapAnchorToRelativeTime(anchor, relativeTime, {
      ...options,
      duration: entry.duration ?? options.duration,
      timing: entry.timing ?? options.timings?.[side],
      capability: entry.capability ?? options.capabilities?.[side],
    });
  }
  if (alignedSides.left.comparisonBlockId !== alignedSides.right.comparisonBlockId) {
    throw new SyncDomainError('comparison anchors must belong to the same comparison block');
  }
  return {
    comparisonBlockId: alignedSides.left.comparisonBlockId,
    relativeTime,
    precision: overallPrecision(Object.values(alignedSides)),
    sides: alignedSides,
  };
}

function seekPlayerToRelativeTime(player, relativeTime, options = {}) {
  const current = createPlayerBlock(player);
  if (!current.anchor) throw new SyncDomainError('player has no sync anchor');
  const alignment = mapAnchorToRelativeTime(current.anchor, relativeTime, {
    ...options,
    duration: current.duration,
    timing: current.timing,
  });
  return {
    player: seekPlayer(current, alignment.playbackTime),
    alignment,
  };
}

function planFrameStep(input) {
  requireRecord(input, 'frame step request');
  const direction = input.direction;
  if (direction !== 1 && direction !== -1) {
    throw new SyncDomainError('frame step direction must be 1 or -1');
  }
  const duration = input.duration === undefined
    ? undefined
    : requireFinite(input.duration, 'frame step duration', 0);
  const timing = normalizeTimingMetadata(input.timing ?? { kind: TIMING_KIND.UNKNOWN }, duration);
  const currentTime = clampMediaTime(requireFinite(input.currentTime, 'frame step currentTime'), duration);
  const canUseFrameApi = supportsFrameStep(input.capability);
  const hasFrameMapping = timingHasFrameMapping(timing);

  if (canUseFrameApi && hasFrameMapping) {
    const currentFrame = timeToFrame(timing, currentTime, { duration }).frameIndex;
    const count = frameCountForTiming(timing, duration);
    const targetFrame = currentFrame + direction;
    if (targetFrame < 0 || (count !== undefined && targetFrame >= count)) {
      return {
        action: 'boundary',
        direction,
        mode: PRECISION.FRAME_AWARE,
        precision: PRECISION.FRAME_AWARE,
        exact: true,
        fallback: false,
        fromTime: currentTime,
        targetTime: direction > 0 ? duration ?? currentTime : 0,
        frameIndex: currentFrame,
        reason: 'frame-boundary',
      };
    }
    const targetTime = frameTimeForIndex(timing, targetFrame, duration);
    return {
      action: 'seek',
      direction,
      mode: PRECISION.FRAME_AWARE,
      precision: PRECISION.FRAME_AWARE,
      exact: true,
      fallback: false,
      fromTime: currentTime,
      targetTime,
      frameIndex: targetFrame,
      reason: 'frame-step-capability-and-timing-available',
    };
  }

  const fallback = estimateFallbackStep(
    timing,
    currentTime,
    direction,
    duration,
    input.fallbackStepSeconds,
  );
  const targetTime = clampMediaTime(currentTime + direction * fallback.seconds, duration);
  const precision = timing.kind === TIMING_KIND.UNKNOWN ? PRECISION.UNKNOWN : PRECISION.TIME_BASED;
  let reason = 'frame-step-capability-unavailable';
  if (canUseFrameApi && !hasFrameMapping) reason = 'frame-timing-unavailable';
  return {
    action: Math.abs(targetTime - currentTime) <= EPSILON ? 'boundary' : 'seek',
    direction,
    mode: precision,
    precision,
    exact: false,
    fallback: true,
    fromTime: currentTime,
    targetTime,
    stepSeconds: fallback.seconds,
    stepSource: fallback.source,
    reason,
  };
}

function normalizeDriftPolicy(policy = {}) {
  requireRecord(policy, 'drift policy');
  const nudgeThresholdSeconds = policy.nudgeThresholdSeconds ?? policy.nudgeThreshold
    ?? DEFAULT_DRIFT_CORRECTION_POLICY.nudgeThresholdSeconds;
  const seekThresholdSeconds = policy.seekThresholdSeconds ?? policy.seekThreshold
    ?? DEFAULT_DRIFT_CORRECTION_POLICY.seekThresholdSeconds;
  const maxRateAdjustment = policy.maxRateAdjustment
    ?? DEFAULT_DRIFT_CORRECTION_POLICY.maxRateAdjustment;
  const rateGain = policy.rateGain ?? DEFAULT_DRIFT_CORRECTION_POLICY.rateGain;
  requireFinite(nudgeThresholdSeconds, 'drift policy nudgeThresholdSeconds', 0);
  requireFinite(seekThresholdSeconds, 'drift policy seekThresholdSeconds', 0);
  requireFinite(maxRateAdjustment, 'drift policy maxRateAdjustment', 0);
  requireFinite(rateGain, 'drift policy rateGain', 0);
  if (seekThresholdSeconds <= nudgeThresholdSeconds) {
    throw new SyncDomainError('drift policy seek threshold must exceed nudge threshold');
  }
  return {
    nudgeThresholdSeconds,
    seekThresholdSeconds,
    maxRateAdjustment,
    rateGain,
  };
}

function planDriftCorrection(input, policy = DEFAULT_DRIFT_CORRECTION_POLICY) {
  requireRecord(input, 'drift correction input');
  const normalizedPolicy = normalizeDriftPolicy(policy);
  const duration = input.duration === undefined
    ? undefined
    : requireFinite(input.duration, 'drift duration', 0);
  const currentTime = clampMediaTime(requireFinite(input.currentTime, 'currentTime'), duration);
  const targetTime = clampMediaTime(requireFinite(input.targetTime, 'targetTime'), duration);
  const driftSeconds = targetTime - currentTime;
  const absoluteDriftSeconds = Math.abs(driftSeconds);
  const baseRate = input.baseRate === undefined
    ? 1
    : requireFinite(input.baseRate, 'baseRate', Number.MIN_VALUE);
  const state = input.state ?? PLAYER_STATUS.PLAYING;
  const visible = input.visible !== false && input.visibility !== 'hidden';
  const common = {
    currentTime,
    targetTime,
    driftSeconds,
    absoluteDriftSeconds,
    playbackRate: baseRate,
  };

  if (input.userPaused === true || state === PLAYER_STATUS.PAUSED) {
    return { ...common, action: DRIFT_ACTION.HOLD, reason: 'playback-paused' };
  }
  if (!visible) return { ...common, action: DRIFT_ACTION.HOLD, reason: 'playback-not-visible' };
  if (state === PLAYER_STATUS.STALLED) {
    return {
      ...common,
      action: DRIFT_ACTION.ERROR,
      reason: 'playback-stalled',
      recoverable: true,
    };
  }
  if (state === PLAYER_STATUS.ERROR) {
    return {
      ...common,
      action: DRIFT_ACTION.ERROR,
      reason: 'playback-error',
      recoverable: false,
    };
  }
  if (state === PLAYER_STATUS.ENDED && absoluteDriftSeconds > normalizedPolicy.nudgeThresholdSeconds) {
    return {
      ...common,
      action: DRIFT_ACTION.SEEK,
      reason: 'ended-player-requires-rebase',
      resetRate: true,
    };
  }
  if (absoluteDriftSeconds <= normalizedPolicy.nudgeThresholdSeconds) {
    return { ...common, action: DRIFT_ACTION.NONE, reason: 'within-tolerance', resetRate: true };
  }
  if (absoluteDriftSeconds < normalizedPolicy.seekThresholdSeconds) {
    const rateAdjustment = clamp(
      driftSeconds * normalizedPolicy.rateGain,
      -normalizedPolicy.maxRateAdjustment,
      normalizedPolicy.maxRateAdjustment,
    );
    return {
      ...common,
      action: DRIFT_ACTION.RATE_NUDGE,
      reason: 'small-drift-rate-nudge',
      rateAdjustment,
      playbackRate: Math.max(Number.MIN_VALUE, baseRate + rateAdjustment),
      resetRate: false,
    };
  }
  return {
    ...common,
    action: DRIFT_ACTION.SEEK,
    reason: 'large-drift-seek-rebase',
    resetRate: true,
  };
}

function planComparisonDriftCorrection(input, policy = DEFAULT_DRIFT_CORRECTION_POLICY) {
  requireRecord(input, 'comparison drift correction input');
  requireRecord(input.aligned, 'aligned comparison');
  requireRecord(input.aligned.sides, 'aligned comparison sides');
  requireRecord(input.currentTimes, 'comparison current times');
  const corrections = {};
  for (const side of ['left', 'right']) {
    const aligned = input.aligned.sides[side];
    if (!isRecord(aligned)) throw new SyncDomainError(`aligned comparison side ${side} is required`);
    const state = input.sideStates?.[side] ?? {};
    corrections[side] = planDriftCorrection({
      currentTime: input.currentTimes[side],
      targetTime: aligned.playbackTime,
      duration: state.duration,
      baseRate: state.baseRate ?? input.baseRate,
      state: state.state ?? input.state,
      visible: state.visible ?? input.visible,
      userPaused: state.userPaused ?? input.userPaused,
    }, policy);
  }
  return {
    comparisonBlockId: input.aligned.comparisonBlockId,
    relativeTime: input.aligned.relativeTime,
    precision: input.aligned.precision,
    corrections,
  };
}

module.exports = Object.freeze({
  DEFAULT_DRIFT_CORRECTION_POLICY,
  DEFAULT_FALLBACK_STEP_SECONDS,
  DRIFT_ACTION,
  PLAYER_STATUS,
  PRECISION,
  SyncDomainError,
  TIMING_KIND,
  advancePlayer,
  alignComparisonAtRelativeTime,
  clampMediaTime,
  createLoop,
  createPlayerBlock,
  createSyncAnchor,
  estimateFallbackStep,
  frameDurationForTiming,
  frameTimeForIndex,
  mapAnchorToRelativeTime,
  normalizeDriftPolicy,
  normalizeTimingMetadata,
  planComparisonDriftCorrection,
  planDriftCorrection,
  planFrameStep,
  seekPlayer,
  seekPlayerToRelativeTime,
  setPlaybackRate,
  setPlayerAnchor,
  setPlayerLoop,
  setPlayerStatus,
  supportsFrameStep,
  timeToFrame,
  timingHasFrameMapping,
  updatePlayerBlock,
  validateLoopRange,
  validateSyncAnchor,
});
