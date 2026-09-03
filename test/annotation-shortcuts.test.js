'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'annotation-shortcuts.js'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');

test('annotation A D shortcut runtime compiles and loads after the base editor', () => {
  assert.doesNotThrow(() => new vm.Script(source));
  const annotationsIndex = index.indexOf('./annotations.js');
  const shortcutsIndex = index.indexOf('./annotation-shortcuts.js');
  assert.ok(annotationsIndex >= 0);
  assert.ok(shortcutsIndex > annotationsIndex);
});

test('shortcut target follows the last interacted annotation side', () => {
  assert.match(source, /let shortcutTarget = null/u);
  assert.match(source, /handleInteractionCapture/u);
  assert.match(source, /rememberShortcutTarget\(context\)/u);
  assert.match(source, /window\.addEventListener\('pointerdown', handleInteractionCapture, true\)/u);
  assert.match(source, /window\.addEventListener\('contextmenu', handleInteractionCapture, true\)/u);
  assert.doesNotMatch(source, /querySelectorAll\([^\n]*button-primary/u);
});

test('editing target remains only a toggle DOM mirror', () => {
  assert.match(source, /let editingTarget = null/u);
  assert.match(source, /synchronizeToggleDom/u);
  assert.match(source, /toggle\.classList\.toggle\('button-primary', active\)/u);
  assert.match(source, /active \? '結束標註' : '開始標註'/u);
});

test('A and D step the last interacted side through the canonical playhead', () => {
  assert.match(source, /event\.code === 'KeyA'/u);
  assert.match(source, /event\.code === 'KeyD'/u);
  assert.match(source, /projectStepFrames\(\)/u);
  assert.match(source, /playhead\.seekFrame\(context\.card, context\.side, requested/u);
  assert.match(source, /stopImmediatePropagation\(\)/u);
});

test('shortcut runtime does not own point deletion or undo history', () => {
  assert.doesNotMatch(source, /deleteUndo/u);
  assert.doesNotMatch(source, /selectedPointTarget/u);
  assert.doesNotMatch(source, /currentPointTarget/u);
  assert.doesNotMatch(source, /undoDelete/u);
  assert.doesNotMatch(source, /event\.key === 'Delete'/u);
  assert.doesNotMatch(source, /key\.toLowerCase\(\) === 'z'/u);
});
