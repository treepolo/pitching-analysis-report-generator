'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const playhead = fs.readFileSync(path.join(__dirname, '..', 'src', 'annotation-playhead.js'), 'utf8');
const coordinator = fs.readFileSync(path.join(__dirname, '..', 'src', 'annotation-editor-coordinator.js'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');

test('unified annotation runtimes compile and load around the base editor in the intended order', () => {
  assert.doesNotThrow(() => new vm.Script(playhead));
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

test('Delete prefers an explicitly selected point and otherwise uses the canonical current frame', () => {
  assert.match(coordinator, /annotationSelectedTrackId/u);
  assert.match(coordinator, /annotationSelectedFrame/u);
  assert.match(coordinator, /const selected = selectedPointTarget\(context\)/u);
  assert.match(coordinator, /selected \|\| currentPointTarget\(context\)/u);
  assert.match(coordinator, /playhead\.currentFrame\(context\.card, context\.side\)/u);
  assert.match(coordinator, /target\.track\.points = target\.track\.points\.filter/u);
});

test('coordinator Delete has its own one-step undo without stealing unrelated Ctrl+Z operations', () => {
  assert.match(coordinator, /deleteUndoByContext/u);
  assert.match(coordinator, /undoCoordinatorDelete\(context\)/u);
  assert.match(coordinator, /track\.points\.push\(\{ \.\.\.operation\.point \}\)/u);
  assert.match(coordinator, /if \(!undoCoordinatorDelete\(context\)\) return/u);
});

test('annotation start and end inputs are one-based in UI while staying zero-based in stored data', () => {
  assert.match(coordinator, /String\(value \+ 1\)/u);
  assert.match(coordinator, /input\.min !== '1'/u);
  assert.match(coordinator, /String\(oneBased - 1\)/u);
  assert.match(coordinator, /data-annotation-track-start/u);
  assert.match(coordinator, /data-annotation-track-end/u);
});

test('legacy registration auto-advance is reconciled back onto the canonical playhead', () => {
  assert.match(coordinator, /waitForLegacyNavigation/u);
  assert.match(coordinator, /已在第 \$\{originFrame \+ 1\} 幀標記/u);
  assert.match(coordinator, /originFrame \+ projectStepFrames\(\)/u);
  assert.match(coordinator, /playhead\.seekFrame\(fresh\.card, fresh\.side, target/u);
});
