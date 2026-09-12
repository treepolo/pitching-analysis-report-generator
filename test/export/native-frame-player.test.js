'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const { renderNativeFramePlayerScript } = require('../../src/export/native-frame-player');

const runtime = renderNativeFramePlayerScript();
const reportRendererSource = fs.readFileSync(path.join(__dirname, '../../src/export/report-renderer.js'), 'utf8');

test('canonical native frame-player runtime compiles as standalone browser JavaScript', () => {
  assert.doesNotThrow(() => new vm.Script(runtime));
});

test('single-player extended clock presents discrete target frames instead of seeking every animation tick', () => {
  assert.doesNotMatch(runtime, /Math\.abs\(displayed - nextTime\) > 0\.0005/u);
  assert.match(runtime, /const targetFrame = frameIndexForTime\(nextTime\)/u);
  assert.match(runtime, /const displayedFrame = frameIndexForTime\(Number\.isFinite\(displayed\) \? displayed : 0\)/u);
  assert.match(runtime, /if \(!video\.seeking && displayedFrame !== targetFrame\)/u);
  assert.match(runtime, /video\.currentTime = frameTime\(targetFrame\)/u);
});

test('single-player replay completes its rewind before claiming the playback operation', () => {
  const playStart = runtime.indexOf('const play = async ({ fromRateTransition = false } = {}) => {');
  const toggleStart = runtime.indexOf('const togglePlayback = () => {', playStart);
  assert.ok(playStart >= 0 && toggleStart > playStart);
  const playSource = runtime.slice(playStart, toggleStart);
  const rewindIndex = playSource.indexOf('if (runtime.index >= count - 1)');
  const operationIndex = playSource.indexOf('const operation = runtime.operationSerial;');
  assert.ok(rewindIndex >= 0);
  assert.ok(operationIndex > rewindIndex);
  assert.match(playSource, /const ready = await seekExact\(segmentStartIndex\(\), false\); if \(!ready \|\| runtime\.index >= count - 1\) return;/u);
  assert.doesNotMatch(playSource, /operation !== runtime\.operationSerial \|\| !ready/u);
  assert.match(playSource, /const operation = runtime\.operationSerial;\s*stopOtherNativeFramePlayers\(sharedBlockForSide\)/u);
});

test('single-player owns one native play request while pending and keeps pause immediately cancellable', () => {
  const playStart = runtime.indexOf('const play = async ({ fromRateTransition = false } = {}) => {');
  const toggleStart = runtime.indexOf('const togglePlayback = () => {', playStart);
  const applyRateStart = runtime.indexOf('const applyRate = (requested, { resume = true } = {}) => {', toggleStart);
  const updateStart = runtime.indexOf('const updateControls = () => {');
  const syncStart = runtime.indexOf('const syncProgress =', updateStart);
  assert.ok(playStart >= 0 && toggleStart > playStart && applyRateStart > toggleStart);
  assert.ok(updateStart >= 0 && syncStart > updateStart);
  const playSource = runtime.slice(playStart, toggleStart);
  const toggleSource = runtime.slice(toggleStart, applyRateStart);
  const updateSource = runtime.slice(updateStart, syncStart);
  assert.match(runtime, /playOperation: null/u);
  assert.match(runtime, /runtime\.playOperation !== null/u);
  assert.match(playSource, /\|\| runtime\.playOperation !== null/u);
  assert.match(playSource, /const operation = runtime\.operationSerial;[\s\S]*runtime\.playOperation = operation;\s*updateControls\(\);[\s\S]*await video\.play\(\)/u);
  assert.match(playSource, /finally \{\s*if \(runtime\.playOperation === operation\) \{\s*runtime\.playOperation = null;\s*updateControls\(\);\s*\}\s*\}/u);
  assert.match(runtime, /runtime\.operationSerial \+= 1;\s*runtime\.playOperation = null;/u);
  assert.match(runtime, /const operation = \+\+runtime\.operationSerial;\s*runtime\.playOperation = null;/u);
  assert.match(updateSource, /const pending = unavailable \|\| runtime\.playOperation !== null/u);
  assert.match(updateSource, /const togglePending = unavailable \|\| runtime\.rateTransition \|\| runtime\.rateGestureActive/u);
  assert.match(updateSource, /const playbackIntentActive = runtime\.playing \|\| runtime\.playOperation !== null/u);
  assert.match(updateSource, /updateToggleControl\(toggle, count <= 0 \|\| togglePending, playbackIntentActive\)/u);
  assert.doesNotMatch(updateSource, /toggle\.disabled = count <= 0 \|\| playbackPending/u);
  assert.match(toggleSource, /if \(runtime\.playOperation !== null\) \{ stop\('已暫停。'\); return; \}/u);
});

test('playback progress preserves stable toggle DOM while the pointer is held', () => {
  const helperStart = runtime.indexOf('const updateToggleControl = (toggle, disabled, playing) => {');
  const playerStart = runtime.indexOf("document.querySelectorAll('[data-native-frame-player]').forEach", helperStart);
  assert.ok(helperStart >= 0 && playerStart > helperStart);
  const helperSource = runtime.slice(helperStart, playerStart);
  assert.match(helperSource, /if \(toggle\.disabled !== disabled\) toggle\.disabled = disabled/u);
  assert.match(helperSource, /if \(toggle\.textContent !== icon\) toggle\.textContent = icon/u);
  assert.match(helperSource, /if \(toggle\.getAttribute\('aria-pressed'\) !== pressed\) toggle\.setAttribute\('aria-pressed', pressed\)/u);
  assert.match(helperSource, /if \(toggle\.getAttribute\('aria-label'\) !== label\) toggle\.setAttribute\('aria-label', label\)/u);
  assert.match(helperSource, /if \(toggle\.title !== label\) toggle\.title = label/u);

  const singleUpdateStart = runtime.indexOf('const updateControls = () => {');
  const singleSyncStart = runtime.indexOf('const syncProgress =', singleUpdateStart);
  const singleUpdateSource = runtime.slice(singleUpdateStart, singleSyncStart);
  assert.match(singleUpdateSource, /updateToggleControl\(toggle, count <= 0 \|\| togglePending, playbackIntentActive\)/u);
  assert.doesNotMatch(singleUpdateSource, /toggle\.textContent\s*=/u);

  const sharedBlockStart = runtime.indexOf("document.querySelectorAll('[data-native-frame-player-block]').forEach");
  const sharedUpdateStart = runtime.indexOf('const update = () => {', sharedBlockStart);
  const sharedUpdateEnd = runtime.indexOf('const cancelSharedManual = () => {', sharedUpdateStart);
  assert.ok(sharedBlockStart >= 0 && sharedUpdateStart > sharedBlockStart && sharedUpdateEnd > sharedUpdateStart);
  const sharedUpdateSource = runtime.slice(sharedUpdateStart, sharedUpdateEnd);
  assert.match(sharedUpdateSource, /updateToggleControl\(toggle, pending \|\| state\.rateTransition \|\| state\.rateGestureActive, state\.playing\)/u);
  assert.doesNotMatch(sharedUpdateSource, /toggle\.textContent\s*=/u);
});

test('single-player rate changes keep the current playback mode and switch only when required', () => {
  assert.match(runtime, /if \(!supported\) \{\s*runtime\.rateTransition = false;\s*if \(!wasManual\) startManual\(\)/u);
  assert.match(runtime, /if \(!wasManual\) \{\s*runtime\.rateTransition = false;\s*runtime\.playing = true/u);
  assert.doesNotMatch(runtime, /if \(wasManual\) \{ cancelManual\(\); runtime\.playing = false; video\.pause\(\); \}/u);
});

test('iOS WebKit pauses once, applies single-player slider rates live, then resumes on release', () => {
  assert.match(runtime, /const isIOSWebKit = \(\(\) => \{/u);
  assert.match(runtime, /iPad\|iPhone\|iPod/u);
  assert.match(runtime, /navigator\.maxTouchPoints/u);
  const beginStart = runtime.indexOf('const beginRateGesture = () => {');
  const stepStart = runtime.indexOf('const step = (direction) => {', beginStart);
  assert.ok(beginStart >= 0 && stepStart > beginStart);
  const gestureSource = runtime.slice(beginStart, stepStart);
  assert.match(gestureSource, /runtime\.rateGestureResume = runtime\.playing \|\| \(!video\.paused && runtime\.lifecycle === 'playing'\)/u);
  assert.match(gestureSource, /if \(runtime\.rateGestureResume\) video\.pause\(\)/u);
  assert.match(gestureSource, /runtime\.rateGestureSettled = waitForMediaEvent\(video, 'ratechange', 300\)/u);
  assert.match(gestureSource, /applyRate\(rate, \{ resume: false \}\)/u);
  assert.match(gestureSource, /if \(shouldResume\) await play\(\{ fromRateTransition: true \}\)/u);
  assert.match(runtime, /rateSlider\?\.addEventListener\('pointerdown', \(\) => \{ if \(isIOSWebKit\) beginRateGesture\(\); \}\)/u);
  assert.match(runtime, /rateSlider\?\.addEventListener\('input',[\s\S]*if \(isIOSWebKit\) applyRateGesture\(rate\);\s*else applyRate\(rate\);/u);
  assert.match(runtime, /rateSlider\?\.addEventListener\('pointerup', \(\) => \{ if \(isIOSWebKit\) void endRateGesture\(\); \}\)/u);
  assert.match(runtime, /rateSlider\?\.addEventListener\('change', \(\) => \{ if \(isIOSWebKit\) void endRateGesture\(\); \}\)/u);
});

test('shared extended clock advances only when the target frame changes and both seeks are settled', () => {
  assert.match(runtime, /const nextIndex = clamp\(Math\.floor\(nextFrame\)/u);
  assert.match(runtime, /const readyToPresent = videos\.every\(\(video\) => !video\?\.seeking\)/u);
  assert.match(runtime, /if \(nextIndex !== state\.index && readyToPresent\)/u);
  assert.doesNotMatch(runtime, /state\.manualTime = nextFrame; state\.index = clamp\(Math\.floor\(nextFrame\)/u);
});

test('shared rate changes keep the current playback mode instead of rebuilding it for every input', () => {
  assert.match(runtime, /if \(!nativeSupported\) \{\s*state\.rateTransition = false;\s*if \(!wasManual\) startSharedManual\(\)/u);
  assert.match(runtime, /if \(!wasManual\) \{\s*state\.rateTransition = false;\s*state\.playing = true/u);
  assert.doesNotMatch(runtime, /state\.operationSerial \+= 1; state\.rate = nextRate/u);
});

test('iOS WebKit pauses both shared videos, applies slider rates live, then resumes after settling', () => {
  const beginStart = runtime.indexOf('const beginSharedRateGesture = () => {');
  const toggleStart = runtime.indexOf('const togglePlayback = async () => {', beginStart);
  assert.ok(beginStart >= 0 && toggleStart > beginStart);
  const gestureSource = runtime.slice(beginStart, toggleStart);
  assert.match(gestureSource, /state\.rateGestureResume = state\.playing/u);
  assert.match(gestureSource, /videos\.forEach\(\(video\) => video\?\.pause\(\)\)/u);
  assert.match(gestureSource, /state\.rateGestureSettled = videos\.map\(\(video\) => waitForMediaEvent\(video, 'ratechange', 300\)\)/u);
  assert.match(gestureSource, /actions\.forEach\(\(action\) => action\.applyRate\(nextRate, \{ resume: false \}\)\)/u);
  assert.match(gestureSource, /if \(settled\) await Promise\.all\(settled\)/u);
  assert.match(gestureSource, /await Promise\.all\(actions\.map\(\(action\) => action\.play\(\)\)\)/u);
  assert.match(runtime, /rateSlider\?\.addEventListener\('pointerdown', \(\) => \{ if \(isIOSWebKit\) beginSharedRateGesture\(\); \}\)/u);
  assert.match(runtime, /if \(isIOSWebKit\) applySharedRateGesture\(rate\);\s*else setRate\(rate\);/u);
  assert.match(runtime, /rateSlider\?\.addEventListener\('change', \(\) => \{ if \(isIOSWebKit\) void endSharedRateGesture\(\); \}\)/u);
});

test('canonical native player owns cross-block playback arbitration', () => {
  assert.match(runtime, /const stopOtherNativeFramePlayers = \(activeBlock\)/u);
  assert.match(runtime, /const actions = block\.__nativeFramePlayerActions;\s*if \(typeof actions\?\.stop === 'function'\) actions\.stop\(\)/u);
  assert.match(runtime, /stopOtherNativeFramePlayers\(sharedBlockForSide\);\s*const rate = clampRate\(runtime\.rate\)/u);
  assert.match(runtime, /stopOtherNativeFramePlayers\(block\);\s*if \(actions\.some/u);
  assert.match(runtime, /block\.__nativeFramePlayerActions = \{[\s\S]*stop: \(message\) => stop\(message\)/u);
  assert.doesNotMatch(runtime, /toggle\.click\(\)/u);
  assert.doesNotMatch(runtime, /getAttribute\('aria-pressed'\).*claim/u);
});

test('report renderer consumes the canonical native player without a post-render player patch', () => {
  assert.doesNotMatch(reportRendererSource, /native-frame-player-fixes/u);
  assert.doesNotMatch(reportRendererSource, /patchNativeFramePlayerHtml/u);
});
