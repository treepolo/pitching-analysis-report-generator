'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'annotations.js'), 'utf8');

test('editor annotation mode owns Space and uses frame-only point records', () => {
  assert.match(source, /event\.code === 'Space'/u);
  assert.match(source, /stopImmediatePropagation\(\)/u);
  assert.match(source, /const point = \{ frame, x: uiState\.preview\.x, y: uiState\.preview\.y \}/u);
  assert.doesNotMatch(source, /point\s*=\s*\{[^}]*time:/u);
});

test('annotation step is one arbitrary persisted project setting', () => {
  assert.match(source, /exportSettings\.annotationStepFrames/u);
  assert.match(source, /type = 'number'/u);
});

test('editor supports layers, point and line toggles, delete and undo', () => {
  assert.match(source, /data-annotation-show-points/u);
  assert.match(source, /data-annotation-show-lines/u);
  assert.match(source, /data-annotation-track-visible/u);
  assert.match(source, /event\.key === 'Delete'/u);
  assert.match(source, /event\.key\.toLowerCase\(\) === 'z'/u);
});
