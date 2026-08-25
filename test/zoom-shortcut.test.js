'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  ZOOM_MAX_LEVEL,
  ZOOM_MIN_LEVEL,
  nextZoomLevel,
  zoomDirectionForInput,
} = require('../src/zoom');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');

test('recognizes Ctrl/Command plus and minus across main and numpad keys', () => {
  assert.equal(zoomDirectionForInput({ type: 'keyDown', key: '+', control: true }), 1);
  assert.equal(zoomDirectionForInput({ type: 'keyDown', key: '=', code: 'Equal', modifiers: ['control', 'shift'] }), 1);
  assert.equal(zoomDirectionForInput({ type: 'keyDown', key: 'Add', code: 'NumpadAdd', meta: true }), 1);
  assert.equal(zoomDirectionForInput({ type: 'keyDown', key: '-', control: true }), -1);
  assert.equal(zoomDirectionForInput({ type: 'keyDown', key: '_', code: 'Minus', modifiers: ['meta', 'shift'] }), -1);
  assert.equal(zoomDirectionForInput({ type: 'keyDown', key: 'Subtract', code: 'NumpadSubtract', control: true }), -1);
});

test('does not claim unrelated or modified shortcuts', () => {
  assert.equal(zoomDirectionForInput({ type: 'keyUp', key: '+', control: true }), 0);
  assert.equal(zoomDirectionForInput({ type: 'keyDown', key: '+', alt: true, control: true }), 0);
  assert.equal(zoomDirectionForInput({ type: 'keyDown', key: '0', control: true }), 0);
  assert.equal(zoomDirectionForInput({ type: 'keyDown', key: '+', shift: true }), 0);
});

test('clamps zoom levels to Chromium-compatible bounds', () => {
  assert.equal(nextZoomLevel(0, 1), 1);
  assert.equal(nextZoomLevel(0, -1), -1);
  assert.equal(nextZoomLevel(ZOOM_MAX_LEVEL, 1), ZOOM_MAX_LEVEL);
  assert.equal(nextZoomLevel(ZOOM_MIN_LEVEL, -1), ZOOM_MIN_LEVEL);
  assert.equal(nextZoomLevel('not-a-number', 1), 1);
  assert.equal(nextZoomLevel(0, 0), 0);
});


test('Electron wires native input zoom handling after hiding the menu bar', () => {
  assert.match(mainSource, /before-input-event/u);
  assert.match(mainSource, /zoomDirectionForInput\(input\)/u);
  assert.match(mainSource, /setZoomLevel\(nextZoomLevel\(/u);
});
