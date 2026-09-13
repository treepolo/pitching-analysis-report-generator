'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../../src/export/annotation-report-runtime.js'), 'utf8');

test('report annotations follow presented video time with currentTime fallback', () => {
  assert.match(source, /const presentedTimes = new WeakMap\(\)/u);
  assert.match(source, /function trackPresentedTime\(video\)/u);
  assert.match(source, /video\.requestVideoFrameCallback\(onFrame\)/u);
  assert.match(source, /presentedTimes\.set\(video, Math\.max\(0, mediaTime\)\)/u);
  assert.match(source, /function displayedMediaTime\(video\)/u);
  assert.match(source, /if \(Number\.isFinite\(presented\)\) return Math\.max\(0, presented\)/u);
  assert.match(source, /return Math\.max\(0, Number\(video\.currentTime\) \|\| 0\)/u);

  const frameStart = source.indexOf('function currentFrame(side) {');
  const frameEnd = source.indexOf('function actualVideoRect', frameStart);
  assert.ok(frameStart >= 0 && frameEnd > frameStart);
  const frameSource = source.slice(frameStart, frameEnd);
  assert.match(frameSource, /const currentTime = displayedMediaTime\(video\)/u);
  assert.doesNotMatch(frameSource, /Number\(video\.currentTime\)/u);
  assert.match(source, /trackPresentedTime\(video\);\s*mounted\.push/u);
});
