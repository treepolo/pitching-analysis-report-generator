'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'annotation-point-controls.js'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');

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

test('point selection makes the video surface focusable so existing Delete handling remains authoritative', () => {
  assert.match(source, /\[data-frame-surface\]/u);
  assert.match(source, /surface\.tabIndex = -1/u);
  assert.match(source, /surface\.focus/u);
  assert.match(source, /按 Delete 可刪除/u);
  assert.doesNotMatch(source, /track\.points\s*=\s*track\.points\.filter/u);
});

test('point navigation is mutation-driven without a perpetual animation refresh loop', () => {
  assert.match(source, /new MutationObserver\(queueRefresh\)/u);
  assert.doesNotMatch(source, /requestAnimationFrame/u);
});

test('point navigation never rewrites shared annotation help text', () => {
  assert.doesNotMatch(source, /annotation-help/u);
});
