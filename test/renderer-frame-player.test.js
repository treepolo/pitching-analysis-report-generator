'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..');
const renderer = fs.readFileSync(path.join(repositoryRoot, 'src', 'renderer.js'), 'utf8');

function functionSlice(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing source anchor: ${start}`);
  assert.notEqual(endIndex, -1, `missing source anchor: ${end}`);
  return source.slice(startIndex, endIndex);
}

test('single and dual cards use the shared outer-player contract', () => {
  const side = functionSlice(renderer, 'function renderInlineVideoSide(', 'function renderInlineVideoBlock(');
  const block = functionSlice(renderer, 'function renderInlineVideoBlock(', 'function setInlineVideoStatus(');
  const controls = functionSlice(renderer, 'function renderFramePlayerControls(', 'function renderInlineVideoSide(');
  assert.match(side, /<video data-inline-video preload="auto" playsinline/u);
  assert.match(side, /data-frame-surface/u);
  assert.match(side, /data-frame-placeholder/u);
  assert.doesNotMatch(side, /data-frame-player-side|data-frame-selected/u);
  assert.match(block, /data-frame-player data-frame-player-kind/u);
  assert.match(block, /renderInlineVideoSide\(block, 'left', \{ sideControls: true \}\)/u);
  assert.match(block, /renderInlineVideoSide\(block, 'right', \{ sideControls: true \}\)/u);
  assert.match(side, /data-frame-side-controls/u);
  assert.match(side, /data-frame-control-side/u);
  assert.match(block, /renderInlineVideoSide\(block, 'single', \{ playerCard: true \}\)/u);
  assert.match(block, /renderFramePlayerControls\(block\.label \|\| '雙影片', \{ shared: true, block \}\)/u);
  assert.match(controls, /data-frame-shared-controls/u);
  assert.match(controls, /data-frame-action="sync"/u);
  assert.match(controls, /data-frame-rate/u);
  assert.match(controls, /data-frame-rate-input/u);
  assert.match(controls, /min="\$\{PLAYBACK_RATE_MIN\}" max="\$\{PLAYBACK_RATE_MAX\}"/u);
  assert.match(controls, /data-frame-action="reset-rate"/u);
  assert.match(renderer, /else if \(action === 'sync'\) void syncDualFramePlayer\(card\)/u);
  assert.match(controls, /data-frame-player-status/u);
  assert.match(controls, /data-frame-current/u);
  assert.match(controls, /data-frame-total/u);
  assert.match(controls, />←</u);
  assert.match(controls, />→</u);
  assert.match(renderer, /function framePlayerControlMap\(block, runtime, card\)/u);
  assert.match(renderer, /function syncDualFramePlayer\(card\)/u);
  assert.match(renderer, /function constrainDualSegmentToSync\(block, pathValue, value\)/u);
  assert.match(renderer, /syncFrame \+ \(kind === 'out' \? 1 : 0\)/u);
  assert.match(renderer, /function bindFramePlayerActionButtons\(card\)/u);
  assert.match(renderer, /function framePlayerSideRuntime\(card, side\)/u);
  assert.match(renderer, /function seekFramePlayerSideIndex\(card, side/u);
  assert.match(renderer, /function toggleFramePlayerSide\(card, side\)/u);
  assert.match(renderer, /function handleFramePlayerSideEvent\(event, card, side\)/u);
  assert.match(renderer, /target\.closest\('\[data-frame-side-controls\]'\)/u);
  assert.match(renderer, /target\?\.matches\?\.\('input, textarea, select/u);
  assert.match(renderer, /sync: \{ leftFrame: 0, rightFrame: 0 \}/u);
  assert.match(renderer, /data-frame-common-range/u);
  assert.match(renderer, /data-frame-common-loop/u);
});

test('loading uses the native browser video pipeline without frame-cache preparation', () => {
  const prepare = functionSlice(renderer, 'async function prepareFramePlayerCard(', 'function stopFramePlayer(');
  assert.match(prepare, /resolveMediaSource\(state\.activeProject\.id, assetId\)/u);
  assert.match(prepare, /loadedmetadata/u);
  assert.match(prepare, /video\.preload = 'auto'/u);
  assert.match(prepare, /seekFramePlayerIndex\(card, framePlayerSegmentStartIndex\(block, runtime, card\), \{ exact: true/u);
  assert.match(prepare, /runtime\.lifecycle = ready \? 'ready' : 'error'/u);
  assert.doesNotMatch(prepare, /frameCache|prepareFrameCache|readFrameCache|base64|dataUrl/u);
  assert.doesNotMatch(renderer, /nativePlayer|native-frame-player|native-player-surface|Media Foundation/u);
});

test('drag is latest-target-wins approximate seek, release is exact seek', () => {
  const scrub = functionSlice(renderer, 'function requestFramePlayerScrub(', 'async function prepareFramePlayerCard(');
  assert.match(scrub, /runtime\.dragTarget = target/u);
  assert.match(scrub, /requestAnimationFrame/u);
  assert.match(scrub, /seekFramePlayerIndex\(card, latest, \{ exact: false/u);
  assert.match(scrub, /if \(exact\) \{/u);
  assert.match(scrub, /exactScrubTarget/u);
  assert.match(scrub, /exactScrubPromise/u);

  const seek = functionSlice(renderer, 'async function seekFramePlayerIndex(', 'function requestFramePlayerScrub(');
  assert.match(seek, /video\.fastSeek|video\.currentTime/u);
  assert.match(seek, /video\.seeking/u);
  assert.match(seek, /seekVideoExact\(video, targetTime/u);
  assert.match(seek, /runtime\.seekSerial/u);
  assert.match(seek, /if \(runtime\.exactSeek === serial\) runtime\.exactSeek = null/u);
  assert.match(seek, /cancelPendingVideoSeek/u);
  assert.match(seek, /scrubActive/u);
  assert.match(renderer, /readyAtTarget/u);
  assert.match(renderer, /presented \|\| readyAtTarget\(\)/u);

  const events = functionSlice(renderer, 'function handleFramePlayerEvent(', 'function handleFramePlayerKeydown(');
  assert.match(events, /event\.type === 'pointerdown'/u);
  assert.match(events, /event\.type === 'pointermove'/u);
  assert.match(events, /event\.type === 'input'/u);
  assert.match(events, /if \(runtime\.exactSeek !== null\) return true/u);
  assert.match(events, /if \(!runtime\.scrubActive\) return true/u);
  assert.match(events, /event\.type === 'pointercancel'/u);
  assert.match(events, /event\.type === 'pointerup'/u);
  assert.match(events, /event\.type === 'change'/u);
  assert.match(events, /setPointerCapture/u);
  assert.match(events, /exact: true/u);
  assert.match(events, /exact: false/u);
  assert.match(events, /event\.type !== 'click'/u);
  assert.match(renderer, /currentPosition\.textContent = count > 0/u);
  assert.match(renderer, /totalPosition\.textContent = count > 0/u);
  assert.match(renderer, /settledAtTarget/u);
  assert.match(renderer, /video.readyState >= 1/u);
  assert.match(renderer, /addEventListener\('pointercancel', handleBlockEditorEvent\)/u);
});

test('keyboard stepping is one exact frame and playback uses video clock/rate', () => {
  const keyHandler = functionSlice(renderer, 'function handleFramePlayerKeydown(', 'function inlinePlaybackBounds(');
  assert.match(keyHandler, /const isArrow = event\.key === 'ArrowLeft'/u);
  assert.match(keyHandler, /stepFramePlayer\(card, event\.key === 'ArrowRight' \? 1 : -1\)/u);
  assert.match(keyHandler, /event\.preventDefault\(\)/u);
  assert.match(keyHandler, /selectedFramePlayerCard\(\)/u);
  assert.match(keyHandler, /isSpace/u);
  assert.match(renderer, /document\.addEventListener\("keydown", handleFramePlayerKeydown\)/u);
  assert.doesNotMatch(renderer, /function handleInlineVideoKeydown\(/u);

  const controls = functionSlice(renderer, 'async function toggleFramePlayer(', 'function handleFramePlayerEvent(');
  const playback = functionSlice(renderer, 'async function playFramePlayer(', 'async function toggleFramePlayer(');
  assert.match(playback, /video\.play\(\)/u);
  assert.match(playback, /playbackRate/u);
  assert.match(controls, /stopFramePlayer/u);
  assert.match(renderer, /function startManualFramePlayer\(card\)/u);
  assert.match(renderer, /setSafePlaybackRate\(card, video, rate\)/u);
  assert.match(renderer, /manualPlaybackTime/u);
  assert.match(renderer, /manualPlaybackSerial/u);
  assert.match(renderer, /manualPlaybackSerial !== runtime\.manualPlaybackSerial/u);
  assert.match(renderer, /rateTransition/u);
  assert.match(renderer, /wasPlaying && nativeRate/u);
  assert.match(renderer, /fromRateTransition = false/u);
  assert.match(renderer, /framePlayerSides\(block, card\)\.forEach\(\(sideName\)/u);
  assert.match(renderer, /nextTime = Math\.max\(nextTime, displayedTime\)/u);
  assert.match(renderer, /if \(currentVideo\.seeking\)/u);
  assert.match(renderer, /!frameRuntime\.manualPlayback/u);
  assert.match(renderer, /unsupportedPlaybackRateError/u);
  const unsupported = functionSlice(renderer, 'function unsupportedPlaybackRateError(', 'function formatPlaybackRate(');
  assert.doesNotMatch(unsupported, /error\?\.name === 'NotSupportedError'/u);
  assert.match(unsupported, /supported playback range/u);
  assert.match(renderer, /正在切換播放速度/u);
  assert.match(renderer, /function waitForPresentedVideoFrame\(video/u);
  assert.match(renderer, /requestVideoFrameCallback/u);
  assert.match(renderer, /function syncFramePlayerProgress\(card, block, side, video\)/u);
  assert.match(renderer, /\['loadeddata', 'canplay', 'playing'\]/u);
  assert.match(renderer, /hideFramePlayerPlaceholder\(video\)/u);
  assert.match(renderer, /function resetFramePlayerRate\(card\)/u);
  assert.match(renderer, /播放速度已重置為 1\.00 倍/u);
  const step = functionSlice(renderer, 'async function stepFramePlayer(', 'function handleFramePlayerEvent(');
  assert.match(step, /影片尚未準備，無法定位影格/u);
});

test('dual players share a mapped control timeline and sync point', () => {
  assert.match(renderer, /function framePlayerReady\(block, runtime, card\)/u);
  assert.match(renderer, /function videoBlockSides\(block\)/u);
  assert.match(renderer, /results\.every\(Boolean\)/u);
  assert.doesNotMatch(renderer, /function syncFramePlayerSides\(/u);
  assert.doesNotMatch(renderer, /follower\.currentTime/u);
  assert.match(renderer, /frameEngineGuard/u);
});

test('launcher leaves GPU enabled by default for browser video composition', () => {
  const launcher = fs.readFileSync(path.join(repositoryRoot, 'start-pitching-report.bat'), 'utf8');
  assert.doesNotMatch(launcher, /set "PITCHING_DISABLE_GPU=1"/u);
  assert.doesNotMatch(launcher, /--disable-gpu/u);
  assert.match(renderer, /pendingSeeks: new Map\(\)/u);
  assert.match(renderer, /function syncFramePlayerProgress\(card, block, side, video\)/u);
});
