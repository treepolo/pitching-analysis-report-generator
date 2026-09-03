'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const playhead = fs.readFileSync(path.join(__dirname, '..', 'src', 'annotation-playhead.js'), 'utf8');
const annotations = fs.readFileSync(path.join(__dirname, '..', 'src', 'annotations.js'), 'utf8');
const coordinator = fs.readFileSync(path.join(__dirname, '..', 'src', 'annotation-editor-coordinator.js'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');

test('annotation playhead, base editor, and boundary adapter compile in load order', () => {
  assert.doesNotThrow(() => new vm.Script(playhead));
  assert.doesNotThrow(() => new vm.Script(annotations));
  assert.doesNotThrow(() => new vm.Script(coordinator));
  const rendererIndex = index.indexOf('./renderer.js');
  const playheadIndex = index.indexOf('./annotation-playhead.js');
  const annotationIndex = index.indexOf('./annotations.js');
  const coordinatorIndex = index.indexOf('./annotation-editor-coordinator.js');
  assert.ok(rendererIndex >= 0);
  assert.ok(playheadIndex > rendererIndex);
  assert.ok(annotationIndex > playheadIndex);
  assert.ok(coordinatorIndex > annotationIndex);
});

test('annotation navigation uses the main player timeline rather than an independent side seek', () => {
  assert.match(playhead, /seekFramePlayerIndex\(card, controlIndex/u);
  assert.match(playhead, /framePlayerControlForSideFrame/u);
  assert.match(playhead, /runtime\.currentFrameIndex/u);
  assert.doesNotMatch(playhead, /seekFramePlayerSideIndex/u);
});

test('base editor owns the one registration auto-step onto the canonical playhead', () => {
  assert.match(annotations, /async function advanceAfterCommit/u);
  assert.match(annotations, /playhead\.seekFrame\(card, side, target, \{ status: true \}\)/u);
  assert.doesNotMatch(annotations, /seekFramePlayerSideIndex\(card, side, target/u);
  assert.doesNotMatch(coordinator, /scheduleRegistrationSync/u);
  assert.doesNotMatch(coordinator, /waitForLegacyNavigation/u);
  assert.doesNotMatch(coordinator, /已在第 \$\{originFrame/u);
});

test('coordinator no longer owns keyboard, point deletion, undo, or registration events', () => {
  assert.doesNotMatch(coordinator, /deleteUndo/u);
  assert.doesNotMatch(coordinator, /undoCoordinatorDelete/u);
  assert.doesNotMatch(coordinator, /selectedPointTarget/u);
  assert.doesNotMatch(coordinator, /KeyA|KeyD/u);
  assert.doesNotMatch(coordinator, /addEventListener\('keydown'/u);
  assert.doesNotMatch(coordinator, /addEventListener\('click'/u);
});

test('annotation start and end inputs are one-based in UI while staying zero-based in stored data', () => {
  assert.match(coordinator, /String\(value \+ 1\)/u);
  assert.match(coordinator, /input\.min !== '1'/u);
  assert.match(coordinator, /String\(oneBased - 1\)/u);
  assert.match(coordinator, /data-annotation-track-start/u);
  assert.match(coordinator, /data-annotation-track-end/u);
  assert.match(coordinator, /window\.addEventListener\('change', handleBoundaryChangeCapture, true\)/u);
});
