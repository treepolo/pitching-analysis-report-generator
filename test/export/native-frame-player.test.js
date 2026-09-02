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

test('single-player rate changes keep the current playback mode and switch only when required', () => {
  assert.match(runtime, /if \(!supported\) \{\s*runtime\.rateTransition = false;\s*if \(!wasManual\) startManual\(\)/u);
  assert.match(runtime, /if \(!wasManual\) \{\s*runtime\.rateTransition = false;\s*runtime\.playing = true/u);
  assert.doesNotMatch(runtime, /if \(wasManual\) \{ cancelManual\(\); runtime\.playing = false; video\.pause\(\); \}/u);
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

test('report renderer consumes the canonical native player without a post-render player patch', () => {
  assert.doesNotMatch(reportRendererSource, /native-frame-player-fixes/u);
  assert.doesNotMatch(reportRendererSource, /patchNativeFramePlayerHtml/u);
});
