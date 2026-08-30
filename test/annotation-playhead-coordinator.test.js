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
  assert.match(coordinator, /const selected = selectedPointTarget\(fresh\)/u);
  assert.match(coordinator, /selected \|\| currentPointTarget\(fresh\)/u);
  assert.match(coordinator, /playhead\.currentFrame\(fresh\.card, fresh\.side\)/u);
  assert.match(coordinator, /target\.track\.points = target\.track\.points\.filter/u);
  assert.match(coordinator, /event\.key === 'Delete' \|\| event\.code === 'Delete' \|\| event\.key === 'Del'/u);
});

test('coordinator Delete has its own one-step undo without stealing unrelated Ctrl+Z operations', () => {
  assert.match(coordinator, /deleteUndoByContext/u);
  assert.match(coordinator, /undoCoordinatorDelete\(context\)/u);
  assert.match(coordinator, /track\.points\.push\(\{ \.\.\.operation\.point \}\)/u);
  assert.match(coordinator, /if \(!undoCoordinatorDelete\(context\)\) return/u);
});

test('annotation keyboard shortcuts are window-capture authoritative and A D use the canonical playhead', () => {
  assert.match(coordinator, /window\.addEventListener\('keydown', handleAnnotationShortcut, true\)/u);
  assert.match(coordinator, /event\.code === 'KeyA'/u);
  assert.match(coordinator, /event\.code === 'KeyD'/u);
  assert.match(coordinator, /void stepByConfiguredFrames\(context, event\.code === 'KeyA' \? -1 : 1\)/u);
  assert.match(coordinator, /playhead\.seekFrame\(fresh\.card, fresh\.side, requested/u);
  assert.match(coordinator, /stopImmediatePropagation\(\)/u);
});

test('timeline ranges and point selectors do not disable Delete or A D shortcuts', () => {
  assert.match(coordinator, /function typingTarget\(target\)/u);
  assert.match(coordinator, /\['text', 'search', 'email', 'url', 'tel', 'password'\]\.includes\(type\)/u);
  assert.doesNotMatch(coordinator, /select, \[contenteditable/u);
  assert.doesNotMatch(coordinator, /\['range'/u);
});

test('active annotation context tolerates panel repaint without relying only on a CSS class', () => {
  assert.match(coordinator, /entry\.classList\?\.contains\('button-primary'\)/u);
  assert.match(coordinator, /entry\.textContent\?\.trim\(\) === '結束標註'/u);
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
