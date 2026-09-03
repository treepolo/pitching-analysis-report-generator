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

test('base editor is the single point mutation and undo owner', () => {
  assert.match(source, /function pushUndo\(card, side, operation\)/u);
  assert.match(source, /async function commitPreview\([\s\S]*?pushUndo\(card, side/u);
  assert.match(source, /function deleteCurrentPoint\([\s\S]*?pushUndo\(card, side/u);
  assert.match(source, /const operation = uiState\.undo\.pop\(\)/u);
  assert.match(source, /selectedPointTarget\(card, side\)/u);
  assert.match(source, /annotationSelectedTrackId/u);
  assert.match(source, /annotationSelectedFrame/u);
});

test('undo restores automatic first-point start frame state', () => {
  assert.match(source, /previousStartFrame: track\.startFrame/u);
  assert.match(source, /hasOwnProperty\.call\(operation, 'previousStartFrame'\)/u);
  assert.match(source, /track\.startFrame = operation\.previousStartFrame/u);
});

test('registration auto-step uses the canonical shared playhead exactly once', () => {
  const advanceStart = source.indexOf('async function advanceAfterCommit(');
  const commitStart = source.indexOf('async function commitPreview(', advanceStart);
  assert.ok(advanceStart >= 0 && commitStart > advanceStart);
  const advance = source.slice(advanceStart, commitStart);
  assert.match(advance, /pitchingAnnotationPlayhead/u);
  assert.match(advance, /playhead\.seekFrame\(card, side, target, \{ status: true \}\)/u);
  assert.doesNotMatch(advance, /seekFramePlayerSideIndex/u);
});

test('Delete and Ctrl Z keep point shortcuts active outside text-editing inputs', () => {
  assert.match(source, /function pointShortcutEditingTarget\(target\)/u);
  assert.match(source, /'number'\]\.includes\(type\)/u);
  assert.match(source, /event\.key === 'Delete'/u);
  assert.match(source, /event\.key\.toLowerCase\(\) === 'z'/u);
  assert.doesNotMatch(source, /\['range'/u);
});

test('editor supports layers and point and line toggles', () => {
  assert.match(source, /data-annotation-show-points/u);
  assert.match(source, /data-annotation-show-lines/u);
  assert.match(source, /data-annotation-track-visible/u);
});
