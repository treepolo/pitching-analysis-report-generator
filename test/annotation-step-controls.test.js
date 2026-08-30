'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'annotation-step-controls.js'), 'utf8');
const shortcuts = fs.readFileSync(path.join(__dirname, '..', 'src', 'annotation-shortcuts.js'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');

test('annotation N-frame control runtime compiles as browser JavaScript', () => {
  assert.doesNotThrow(() => new vm.Script(source));
});

test('loads annotation N-frame controls after the base annotation editor', () => {
  const annotationIndex = index.indexOf('./annotations.js');
  const stepIndex = index.indexOf('./annotation-step-controls.js');
  assert.ok(annotationIndex >= 0);
  assert.ok(stepIndex > annotationIndex);
});

test('N-frame stepping has independent backward and forward buttons on the canonical playhead', () => {
  assert.match(source, /data-annotation-step-action="backward"/u);
  assert.match(source, /data-annotation-step-action="forward"/u);
  assert.match(source, /from \+ \(direction \* step\)/u);
  assert.match(source, /playhead\.seekFrame\(card, side, requested/u);
  assert.doesNotMatch(source, /seekFramePlayerSideIndex/u);
});

test('A and D keyboard ownership follows the last interacted annotation side', () => {
  assert.doesNotMatch(source, /KeyA|KeyD|addEventListener\('keydown'/u);
  assert.match(shortcuts, /event\.code === 'KeyA'/u);
  assert.match(shortcuts, /event\.code === 'KeyD'/u);
  assert.match(shortcuts, /shortcutTarget = \{ blockId: context\.blockId, side: context\.side \}/u);
  assert.match(shortcuts, /window\.addEventListener\('keydown', handleShortcut, true\)/u);
});

test('panel N setting persists through the existing project export settings seam', () => {
  assert.match(source, /exportSettings\.annotationStepFrames/u);
  assert.match(source, /data-annotation-step-input/u);
  assert.match(source, /scheduleSave\(\)/u);
});

test('annotation step controls do not run a perpetual DOM refresh loop', () => {
  assert.doesNotMatch(source, /requestAnimationFrame\s*\(\s*refreshLoop/u);
  assert.doesNotMatch(source, /function\s+refreshLoop\s*\(/u);
  assert.match(source, /MutationObserver/u);
  assert.match(source, /textContent !== value/u);
});
