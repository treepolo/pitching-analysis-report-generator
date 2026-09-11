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
  assert.match(updateSource, /const togglePending = unavailable \|\| runtime\.rateTransition/u);
  assert.match(updateSource, /const playbackIntentActive = runtime\.playing \|\| runtime\.playOperation !== null/u);
  assert.match(updateSource, /toggle\.disabled = count <= 0 \|\| togglePending/u);
  assert.doesNotMatch(updateSource, /toggle\.disabled = count <= 0 \|\| playbackPending/u);
  assert.match(toggleSource, /if \(runtime\.playOperation !== null\) \{ stop\('已暫停。'\); return; \}/u);
});

test('single-player rate changes keep the current playback mode and switch only when required', () => {
  assert.match(runtime, /if \(!supported\) \{\s*runtime\.rateTransition = false;\s*if \(!wasManual\) startManual\(\)/u);
  assert.match(runtime, /if \(!wasManual\) \{\s*runtime\.rateTransition = false;\s*runtime\.playing = true/u);
  assert.doesNotMatch(runtime, /if \(wasManual\) \{ cancelManual\(\); runtime\.playing = false; video\.pause\(\); \}/u);
});

test('iOS WebKit previews single-player rate changes and commits one paused media transition', () => {
  assert.match(runtime, /const isIOSWebKit = \(\(\) => \{[\s\S]*\/(?:\(\?:iPad\|iPhone\|iPod\)|[^\n]+)\/iu\.test\(userAgent\)[\s\S]*navigator\.maxTouchPoints/u);
  const commitStart = runtime.indexOf('const commitRate = async (requested) => {');
  const stepStart = runtime.indexOf('const step = (direction) => {', commitStart);
  assert.ok(commitStart >= 0 && stepStart > commitStart);
  const commitSource = runtime.slice(commitStart, stepStart);
  assert.match(commitSource, /const shouldProtectTransition = isIOSWebKit/u);
  assert.match(commitSource, /await pauseMediaForRateChange\(video\)/u);
  assert.match(commitSource, /waitForMediaEvent\(video, 'ratechange', 300\)/u);
  assert.match(commitSource, /applyRate\(rate, \{ resume: false \}\)/u);
  assert.match(commitSource, /await play\(\{ fromRateTransition: true \}\)/u);
  assert.match(runtime, /rateSlider\?\.addEventListener\('input',[\s\S]*if \(isIOSWebKit\) previewRate\(rate\);\s*else applyRate\(rate\);/u);
  assert.match(runtime, /rateSlider\?\.addEventListener\('change', \(\) => \{ if \(isIOSWebKit\) commitRatePreview\(\); \}\)/u);
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

test('iOS WebKit previews shared rate changes and resumes only after both media elements settle', () => {
  const commitStart = runtime.indexOf('const commitSharedRate = async (requested) => {');
  const toggleStart = runtime.indexOf('const togglePlayback = async () => {', commitStart);
  assert.ok(commitStart >= 0 && toggleStart > commitStart);
  const commitSource = runtime.slice(commitStart, toggleStart);
  assert.match(commitSource, /const shouldProtectTransition = isIOSWebKit && !state\.manual && state\.playing/u);
  assert.match(commitSource, /await Promise\.all\(videos\.map\(\(video\) => pauseMediaForRateChange\(video\)\)\)/u);
  assert.match(commitSource, /const rateSettled = videos\.map\(\(video\) => waitForMediaEvent\(video, 'ratechange', 300\)\)/u);
  assert.match(commitSource, /actions\.forEach\(\(action\) => action\.applyRate\(nextRate, \{ resume: false \}\)\)/u);
  assert.match(commitSource, /await Promise\.all\(actions\.map\(\(action\) => action\.play\(\)\)\)/u);
  assert.match(runtime, /if \(isIOSWebKit\) previewSharedRate\(rate\);\s*else setRate\(rate\);/u);
  assert.match(runtime, /rateSlider\?\.addEventListener\('change', \(\) => \{ if \(isIOSWebKit\) commitSharedRatePreview\(\); \}\)/u);
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
