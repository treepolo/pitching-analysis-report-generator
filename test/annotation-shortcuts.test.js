'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'annotation-shortcuts.js'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');

test('authoritative annotation shortcut runtime compiles and loads before guessing coordinators', () => {
  assert.doesNotThrow(() => new vm.Script(source));
  const annotationsIndex = index.indexOf('./annotations.js');
  const shortcutsIndex = index.indexOf('./annotation-shortcuts.js');
  const pointsIndex = index.indexOf('./annotation-point-controls.js');
  const coordinatorIndex = index.indexOf('./annotation-editor-coordinator.js');
  assert.ok(annotationsIndex >= 0);
  assert.ok(shortcutsIndex > annotationsIndex);
  assert.ok(pointsIndex > shortcutsIndex);
  assert.ok(coordinatorIndex > shortcutsIndex);
});

test('shortcut target follows the last interacted annotation side instead of scanning stale active DOM', () => {
  assert.match(source, /let shortcutTarget = null/u);
  assert.match(source, /handleInteractionCapture/u);
  assert.match(source, /rememberShortcutTarget\(context\)/u);
  assert.match(source, /window\.addEventListener\('pointerdown', handleInteractionCapture, true\)/u);
  assert.match(source, /window\.addEventListener\('contextmenu', handleInteractionCapture, true\)/u);
  assert.doesNotMatch(source, /querySelectorAll\([^\n]*button-primary/u);
});

test('editing target is separate and stale toggle DOM is normalized to one active registration editor', () => {
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

test('Delete works from range and select focus and prefers an explicitly selected point', () => {
  assert.match(source, /selectedPointTarget\(context\) \|\| currentPointTarget\(context\)/u);
  assert.match(source, /target\.track\.points = target\.track\.points\.filter/u);
  assert.match(source, /type = String\(element\.type/u);
  assert.doesNotMatch(source, /\['[^\]]*range/u);
  assert.doesNotMatch(source, /closest\?\.\('select/u);
  assert.match(source, /event\.key === 'Delete'/u);
});

test('shortcut Delete has a local one-step undo and clears selected point state', () => {
  assert.match(source, /const deleteUndo = new Map/u);
  assert.match(source, /undoDelete\(context\)/u);
  assert.match(source, /delete freshPanel\.dataset\.annotationSelectedTrackId/u);
  assert.match(source, /track\.points\.push\(\{ \.\.\.operation\.point \}\)/u);
});
