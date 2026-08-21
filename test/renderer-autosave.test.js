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
  assert.match(renderer, /renderBlockCanvas\(\{ preserveFocus: true, allowFocusedSelect: true \}\)/u);
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
  assert.match(pathHandler, /if \(!\['input', 'change'\]\.includes\(event\.type\)\) return;/u);
  assert.match(pathHandler, /setEditorPath\(block, target\.dataset\.blockPath, editorControlValue\(target\)\)/u);
  assert.match(pathHandler, /refreshInlineBindingAfterEditorChange\(card, block, target\.dataset\.blockPath\)/u);
  assert.match(pathHandler, /target\.dataset\.blockPath\.endsWith\('mediaAssetId'\)/u);
  assert.match(pathHandler, /hydrateInlineVideoCards\(\)/u);
  assert.doesNotMatch(pathHandler, /renderBlockCanvas\s*\(/u);
  assert.match(pathHandler, /scheduleSave\(\)/u);

  const refreshHandler = functionSlice(
    renderer,
    'function refreshInlineBindingAfterEditorChange(',
    'function handleBlockEditorEvent(',
  );
  assert.doesNotMatch(refreshHandler, /if \(block\.type !== 'comparisonVideo'\) return;/u);
  assert.match(refreshHandler, /applyInlineSideSettings\(card, block, 'single'\)/u);
  assert.match(refreshHandler, /bindingPatch\.sides = \{ \[side\]: inlineBindingForBlock\(block\)\.sides\[side\] \}/u);
  assert.match(refreshHandler, /pathValue\.endsWith\('playback\.rate'\)/u);
  assert.match(refreshHandler, /applyInlineSideSettings\(card, block, side\)/u);
  assert.match(refreshHandler, /queueInlineBindingSync\(card, block, binding\.masterSide, \{ force: true \}\)/u);
  assert.match(refreshHandler, /patchInlineVideoCard\(card, block\)/u);

  const sideSettings = functionSlice(renderer, 'function applyInlineSideSettings(', 'async function propagateInlinePlayback(');
  assert.match(sideSettings, /video\.loop = false;/u);
  assert.match(sideSettings, /enforceInlinePlaybackBounds\(block, side, video\)/u);
  assert.match(sideSettings, /video\.playbackRate =/u);

  const bindingSource = functionSlice(renderer, 'function inlineBindingSource(', 'function setInlineBindingStatus(');
  assert.match(bindingSource, /segment: binding\.sides\[side\]\.segment/u);

  const bindingPersistence = functionSlice(renderer, 'function persistInlineBinding(', 'function inlineBindingSummary(');
  assert.match(bindingPersistence, /const current = inlineBindingForBlock\(block\);/u);
  assert.match(bindingPersistence, /\.\.\.current,[\s\S]*\.\.\.patch,/u);
});

test('native select interaction never replaces the active block canvas', () => {
  const canvasRenderer = functionSlice(renderer, 'function renderBlockCanvas(', 'function setEditorPath(');
  assert.match(renderer, /function isFocusedBlockSelect\(\)/u);
  assert.match(canvasRenderer, /if \(isFocusedBlockSelect\(\) && !allowFocusedSelect\)/u);
  assert.match(canvasRenderer, /state\.blockCanvasRenderQueued = true;/u);
  assert.match(canvasRenderer, /state\.blockCanvasRenderQueued = false;/u);
  assert.match(canvasRenderer, /elements\.blockCanvas\.innerHTML\s*=/u);
  assert.match(renderer, /function flushQueuedBlockCanvasRender\(\)/u);
  assert.match(renderer, /elements\.blockCanvas\?\.addEventListener\('focusout', \(\) =>/u);

  const modeHandler = functionSlice(
    renderer,
    "if (target.matches('[data-block-mode]'))",
    "if (target.matches('[data-block-field=\"content\"]'))",
  );
  assert.match(modeHandler, /if \(event\.type !== 'change'\) return;/u);
  assert.match(modeHandler, /allowFocusedSelect: true/u);
});

test('text block markup has one clear editable content label', () => {
  const blockEditor = functionSlice(renderer, 'function renderBlockEditor(', 'function captureBlockEditorFocus()');
  assert.match(blockEditor, /const headerLabel = typeLabel \? `<strong>\$\{typeLabel\}<\/strong>` : '';/u);
  assert.match(blockEditor, /block\.type === 'singleVideo' \? '單一影片' : '';/u);
  assert.match(blockEditor, /文字內容 <textarea[^>]*data-block-field="content"/u);
  assert.match(blockEditor, /<header class="content-block-header">[\s\S]*\$\{headerLabel\}/u);
  assert.doesNotMatch(blockEditor, /const typeLabel = displayBlockType/u);
});
