'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'annotation-step-controls.js'), 'utf8');
const shortcutsPath = path.join(__dirname, '..', 'src', 'annotation-shortcuts.js');
const index = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');

test('annotation N-frame control runtime compiles as browser JavaScript', () => {
  assert.doesNotThrow(() => new vm.Script(source));
});

test('loads the consolidated annotation step runtime after the base editor', () => {
  const annotationIndex = index.indexOf('./annotations.js');
  const stepIndex = index.indexOf('./annotation-step-controls.js');
  assert.ok(annotationIndex >= 0);
  assert.ok(stepIndex > annotationIndex);
  assert.doesNotMatch(index, /annotation-shortcuts\.js/u);
  assert.equal(fs.existsSync(shortcutsPath), false);
});

test('N-frame stepping has independent backward and forward buttons on the canonical playhead', () => {
  assert.match(source, /data-annotation-step-action="backward"/u);
  assert.match(source, /data-annotation-step-action="forward"/u);
  assert.match(source, /from \+ \(direction \* step\)/u);
  assert.match(source, /playhead\.seekFrame\(card, side, requested/u);
  assert.doesNotMatch(source, /seekFramePlayerSideIndex/u);
});

test('A and D keyboard ownership follows the last interacted annotation side in the same runtime', () => {
  assert.match(source, /let shortcutTarget = null/u);
  assert.match(source, /handleInteractionCapture/u);
  assert.match(source, /shortcutTarget = \{ blockId: context\.blockId, side: context\.side \}/u);
  assert.match(source, /event\.code !== 'KeyA' && event\.code !== 'KeyD'/u);
  assert.match(source, /stepByConfiguredFrames\(context\.card, context\.side, event\.code === 'KeyA' \? -1 : 1\)/u);
  assert.match(source, /window\.addEventListener\('pointerdown', handleInteractionCapture, true\)/u);
  assert.match(source, /window\.addEventListener\('contextmenu', handleInteractionCapture, true\)/u);
  assert.match(source, /window\.addEventListener\('keydown', handleStepShortcut, true\)/u);
  assert.doesNotMatch(source, /editingTarget|synchronizeToggleDom/u);
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
