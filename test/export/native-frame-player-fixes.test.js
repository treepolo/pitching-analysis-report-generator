'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');

const { renderNativeFramePlayerScript } = require('../../src/export/native-frame-player');
const {
  patchNativeFramePlayerHtml,
  patchNativeFramePlayerScript,
} = require('../../src/export/native-frame-player-fixes');

const original = renderNativeFramePlayerScript();
const patched = patchNativeFramePlayerScript(original);

test('patched native frame-player runtime still compiles as standalone browser JavaScript', () => {
  assert.doesNotThrow(() => new vm.Script(patched));
});

test('single-player extended clock waits for a presented frame instead of seeking every animation tick', () => {
  assert.doesNotMatch(patched, /Math\.abs\(displayed - nextTime\) > 0\.0005/u);
  assert.match(patched, /const targetFrame = frameIndexForTime\(nextTime\)/u);
  assert.match(patched, /if \(!video\.seeking && displayedFrame !== targetFrame\)/u);
  assert.match(patched, /video\.currentTime = frameTime\(targetFrame\)/u);
});

test('single-player rate changes keep the current mode alive and switch modes only when required', () => {
  assert.match(patched, /if \(!supported\) \{\s*runtime\.rateTransition = false;\s*if \(!wasManual\) startManual\(\)/u);
  assert.match(patched, /if \(!wasManual\) \{\s*runtime\.rateTransition = false;\s*runtime\.playing = true/u);
  assert.doesNotMatch(patched, /if \(wasManual\) \{ cancelManual\(\); runtime\.playing = false; video\.pause\(\); \}/u);
});

test('shared extended clock updates video frames only when the target frame changes', () => {
  assert.match(patched, /const nextIndex = clamp\(Math\.floor\(nextFrame\)/u);
  assert.match(patched, /if \(nextIndex !== state\.index\)/u);
  assert.doesNotMatch(patched, /state\.manualTime = nextFrame; state\.index = clamp\(Math\.floor\(nextFrame\)/u);
});

test('shared rate changes do not tear down and rebuild the same playback mode on every slider input', () => {
  assert.match(patched, /if \(!nativeSupported\) \{\s*state\.rateTransition = false;\s*if \(!wasManual\) startSharedManual\(\)/u);
  assert.match(patched, /if \(!wasManual\) \{\s*state\.rateTransition = false;\s*state\.playing = true/u);
  assert.doesNotMatch(patched, /state\.operationSerial \+= 1; state\.rate = nextRate/u);
});

test('HTML patching is a no-op for reports without a native player', () => {
  assert.equal(patchNativeFramePlayerHtml('<html><body>text only</body></html>'), '<html><body>text only</body></html>');
});

test('HTML patching replaces the exact native runtime used by exported reports', () => {
  const html = `<html><body><div data-native-frame-player-block></div><script>${original}</script></body></html>`;
  const output = patchNativeFramePlayerHtml(html);
  assert.ok(output.includes(patched));
  assert.ok(!output.includes(original));
});
