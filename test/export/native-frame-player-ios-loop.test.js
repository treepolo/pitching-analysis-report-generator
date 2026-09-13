'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { renderNativeFramePlayerScript } = require('../../src/export/native-frame-player');

const runtime = renderNativeFramePlayerScript();

test('iOS loop rewind pauses, waits for seek completion, then resumes without a presentation barrier', () => {
  const start = runtime.indexOf('const rewindIOSLoop = async (bounds) => {');
  const end = runtime.indexOf('const step = (direction) => {', start);
  assert.ok(start >= 0 && end > start);
  const source = runtime.slice(start, end);

  assert.match(source, /if \(runtime\.loopTransition\) return/u);
  assert.match(source, /runtime\.loopTransition = true/u);

  const pauseIndex = source.indexOf('video.pause();');
  const seekIndex = source.indexOf('video.currentTime = bounds.start;');
  const seekedIndex = source.indexOf("video.addEventListener('seeked'");
  const playIndex = source.indexOf('await video.play();');
  assert.ok(pauseIndex >= 0);
  assert.ok(seekIndex > pauseIndex);
  assert.ok(seekedIndex > seekIndex);
  assert.ok(playIndex > seekedIndex);

  assert.match(source, /if \(video\.seeking\) \{\s*await new Promise/u);
  assert.match(source, /operation !== runtime\.operationSerial \|\| !side\.isConnected/u);
  assert.match(source, /finally \{\s*runtime\.loopTransition = false;\s*updateControls\(\);\s*\}/u);
  assert.doesNotMatch(source, /requestVideoFrameCallback|waitPresentedFrame|setTimeout\(/u);

  assert.equal((runtime.match(/void rewindIOSLoop\(bounds\)/gu) || []).length, 2);
  assert.match(runtime, /if \(isIOSWebKit && !runtime\.manual\) void rewindIOSLoop\(bounds\);\s*else \{\s*video\.currentTime = bounds\.start/u);
  assert.match(runtime, /if \(!runtime\.loopTransition && !runtime\.rateGestureActive/u);
});
