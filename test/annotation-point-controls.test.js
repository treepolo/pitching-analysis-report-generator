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

test('point selector lists frame-only annotation points and seeks exactly to the chosen frame', () => {
  assert.match(source, /data-annotation-point-select/u);
  assert.match(source, /第 \$\{frame \+ 1\} 幀/u);
  assert.match(source, /seekFramePlayerSideIndex\(context\.card, context\.side, frame, \{ exact: true, status: true \}\)/u);
});

test('visible annotation points are selected by right-click instead of primary click', () => {
  assert.match(source, /addEventListener\('contextmenu', handleContextMenu\)/u);
  assert.match(source, /nearestVisiblePoint\(context, event\)/u);
  assert.match(source, /hitRadius = 18/u);
  assert.match(source, /event\.preventDefault\(\)/u);
  assert.match(source, /void selectPoint\(context, hit\.track, hit\.point\.frame\)/u);
});

test('point selection keeps existing Delete handling authoritative', () => {
  assert.match(source, /surface\.tabIndex = -1/u);
  assert.match(source, /surface\.focus/u);
  assert.match(source, /按 Delete 可刪除/u);
  assert.doesNotMatch(source, /track\.points\s*=\s*track\.points\.filter/u);
});

test('registration input rejects duplicate clicks and input while exact navigation is busy', () => {
  assert.match(source, /event\.detail > 1/u);
  assert.match(source, /navigationBusy\(context\)/u);
  assert.match(source, /sideState\?\.exactTarget/u);
  assert.match(source, /video\?\.seeking/u);
  assert.match(source, /window\.addEventListener\('click', blockPrimaryRegistration, true\)/u);
});

test('Space auto-repeat is blocked before the annotation editor key handler', () => {
  assert.match(source, /event\.code !== 'Space'/u);
  assert.match(source, /event\.repeat/u);
  assert.match(source, /window\.addEventListener\('keydown', handleKeydownCapture, true\)/u);
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
