'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const main = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'main.js'), 'utf8');
const launcher = fs.readFileSync(path.join(__dirname, '..', '..', 'start-pitching-report.bat'), 'utf8');

test('Electron smoke targets the canonical block-editor DOM contract', () => {
  assert.match(main, /#block-canvas \[data-section-title\]/u);
  assert.match(main, /#block-canvas \[data-block-field="content"\]/u);
  assert.match(main, /#editor:not\(\[hidden\]\)/u);
  assert.match(main, /#add-editor-single-video/u);
  assert.match(main, /#add-editor-comparison-video/u);
  assert.match(main, /editorControlsVerified: true/u);
  assert.doesNotMatch(main, /#section-title|#section-content|#player-panel|#player-empty|#add-single-video|#add-comparison-video/u);
  assert.doesNotMatch(main, /playerEmptyStateVerified/u);
});

test('Windows launcher keeps Electron user-data argument Unicode-safe', () => {
  assert.match(launcher, /set "PITCHING_USER_DATA=\.runtime\\electron-user-data"/u);
  assert.doesNotMatch(launcher, /PITCHING_USER_DATA=%PROJECT_ROOT%/u);
});
