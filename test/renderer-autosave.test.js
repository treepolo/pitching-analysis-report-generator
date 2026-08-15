'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer.js'), 'utf8');

function functionSlice(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing source anchor: ${start}`);
  assert.notEqual(endIndex, -1, `missing source anchor: ${end}`);
  return source.slice(startIndex, endIndex);
}

test('autosave does not rebuild the active block editor DOM', () => {
  const persistence = functionSlice(renderer, 'async function persistActiveProject()', 'async function requestSave()');
  assert.doesNotMatch(persistence, /renderPlayer\s*\(/u);
  assert.match(persistence, /renderProjects\(\);[\s\S]*renderPreview\(\);/u);
  assert.match(renderer, /function scheduleSave\(\)[\s\S]*clearTimeout\(state\.saveTimer\)/u);
});

test('editor redraws preserve the active control focus and text selection', () => {
  assert.match(renderer, /function captureBlockEditorFocus\(\)/u);
  assert.match(renderer, /selectionStart:[\s\S]*selectionEnd:[\s\S]*selectionDirection:/u);
  assert.match(renderer, /function restoreBlockEditorFocus\(snapshot\)/u);
  assert.match(renderer, /target\.focus\(\{ preventScroll: true \}\)/u);
  assert.match(renderer, /target\.setSelectionRange\(/u);
  assert.match(renderer, /renderBlockCanvas\(\{ preserveFocus: true \}\)/u);
});

test('text input and video settings keep persistence without input-time redraw', () => {
  const textHandler = functionSlice(
    renderer,
    "if (target.matches('[data-block-field=\"content\"]'))",
    "if (target.matches('[data-block-path]'))",
  );
  assert.match(textHandler, /block\.content = target\.value;/u);
  assert.match(textHandler, /scheduleSave\(\)/u);
  assert.doesNotMatch(textHandler, /renderBlockCanvas\s*\(/u);

  const pathHandler = functionSlice(
    renderer,
    "if (target.matches('[data-block-path]'))",
    "if (event.type !== 'click') return;",
  );
  assert.match(pathHandler, /setEditorPath\(block, target\.dataset\.blockPath, editorControlValue\(target\)\)/u);
  assert.match(pathHandler, /if \(event\.type !== 'input'\) renderBlockCanvas\(\{ preserveFocus: true \}\)/u);
  assert.match(pathHandler, /scheduleSave\(\)/u);
});
