'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const playhead = fs.readFileSync(path.join(__dirname, '..', 'src', 'annotation-playhead.js'), 'utf8');
const annotations = fs.readFileSync(path.join(__dirname, '..', 'src', 'annotations.js'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
const coordinatorPath = path.join(__dirname, '..', 'src', 'annotation-editor-coordinator.js');

test('annotation playhead and base editor compile in load order without a coordinator patch', () => {
  assert.doesNotThrow(() => new vm.Script(playhead));
  assert.doesNotThrow(() => new vm.Script(annotations));
  const rendererIndex = index.indexOf('./renderer.js');
  const playheadIndex = index.indexOf('./annotation-playhead.js');
  const annotationIndex = index.indexOf('./annotations.js');
  assert.ok(rendererIndex >= 0);
  assert.ok(playheadIndex > rendererIndex);
  assert.ok(annotationIndex > playheadIndex);
  assert.doesNotMatch(index, /annotation-editor-coordinator\.js/u);
  assert.equal(fs.existsSync(coordinatorPath), false);
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
});
