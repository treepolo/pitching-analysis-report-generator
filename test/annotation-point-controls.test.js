'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'annotation-point-controls.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'annotations.css'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');

test('annotation point control runtime compiles as browser JavaScript', () => {
  assert.doesNotThrow(() => new vm.Script(source));
});

test('loads point navigation after annotation editor', () => {
  const annotationIndex = index.indexOf('./annotations.js');
  const pointIndex = index.indexOf('./annotation-point-controls.js');
  assert.ok(annotationIndex >= 0);
  assert.ok(pointIndex > annotationIndex);
});

test('point selector seeks through the canonical playhead', () => {
  assert.match(source, /data-annotation-point-select/u);
  assert.match(source, /第 \$\{frame \+ 1\} 幀/u);
  assert.match(source, /playhead\.seekFrame\(context\.card, context\.side, frame, \{ status: true \}\)/u);
  assert.doesNotMatch(source, /seekFramePlayerSideIndex/u);
});

test('visual point hit testing and highlights use the presented side frame', () => {
  const currentStart = source.indexOf('function currentFrame(');
  const modeStart = source.indexOf('function annotationModeActive(', currentStart);
  assert.ok(currentStart >= 0 && modeStart > currentStart);
  const current = source.slice(currentStart, modeStart);
  assert.match(current, /sideFrameIndexFromVideo\(card, side\)/u);
  assert.match(current, /video\?\.currentTime/u);
  assert.doesNotMatch(current, /playhead\.currentFrame/u);
  assert.match(source, /const frame = currentFrame\(context\.card, context\.side\)/u);
});

test('visible annotation points are selected by right-click instead of primary click', () => {
  assert.match(source, /addEventListener\('contextmenu', handleContextMenu\)/u);
  assert.match(source, /nearestVisiblePoint\(context, event\)/u);
  assert.match(source, /hitRadius = 18/u);
  assert.match(source, /event\.preventDefault\(\)/u);
  assert.match(source, /void selectPoint\(context, hit\.track, hit\.point\.frame\)/u);
});

test('point selection exposes selected track and frame to the base editor without mutating points itself', () => {
  assert.match(source, /annotationSelectedTrackId/u);
  assert.match(source, /annotationSelectedFrame/u);
  assert.match(source, /surface\.focus/u);
  assert.match(source, /按 Delete 可刪除/u);
  assert.doesNotMatch(source, /track\.points\s*=\s*track\.points\.filter/u);
});

test('point controls no longer suppress registration input owned by the base editor', () => {
  assert.doesNotMatch(source, /lastPrimaryClickByContext/u);
  assert.doesNotMatch(source, /blockPrimaryRegistration/u);
  assert.doesNotMatch(source, /handleKeydownCapture/u);
  assert.doesNotMatch(source, /playhead\.navigationBusy/u);
  assert.doesNotMatch(source, /window\.addEventListener\('click'/u);
  assert.doesNotMatch(source, /window\.addEventListener\('keydown'/u);
});

test('selected and current-frame points have a separate non-interactive highlight overlay', () => {
  assert.match(source, /data-annotation-selection-overlay/u);
  assert.match(source, /annotation-selection-explicit/u);
  assert.match(source, /annotation-selection-current/u);
  assert.match(source, /currentPoint = annotationModeActive\(context\)/u);
  assert.match(css, /\.annotation-selection-overlay/u);
  assert.match(css, /@keyframes annotation-selected-pulse/u);
  assert.match(css, /@keyframes annotation-current-pulse/u);
});

test('point navigation never rewrites shared annotation help text', () => {
  assert.doesNotMatch(source, /annotation-help/u);
});
