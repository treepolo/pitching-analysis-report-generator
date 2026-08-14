'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(repositoryRoot, 'src', 'index.html'), 'utf8');
const renderer = fs.readFileSync(path.join(repositoryRoot, 'src', 'renderer.js'), 'utf8');
const styles = fs.readFileSync(path.join(repositoryRoot, 'src', 'styles.css'), 'utf8');

test('document shell exposes the frozen block-editor DOM contract', () => {
  for (const id of [
    'document-command-bar',
    'project-list',
    'project-empty',
    'editor-empty',
    'editor',
    'project-title',
    'project-meta',
    'block-canvas',
    'block-section-target',
    'add-text-block',
    'add-editor-single-video',
    'add-editor-comparison-video',
    'import-text',
    'import-media',
    'save-project',
    'save-state',
    'root-path',
    'app-error',
    'choose-export-directory',
    'export-directory-status',
    'export-kind',
    'export-report',
    'export-cancel',
    'export-retry',
    'export-status',
    'new-project',
    'empty-new-project',
    'new-project-dialog',
    'new-project-form',
    'new-project-name',
    'import-text-dialog',
    'import-text-name',
    'import-text-preview',
    'import-text-error',
    'cancel-import-text',
    'confirm-import-text',
  ]) {
    assert.match(indexHtml, new RegExp(`id="${id}"`, 'u'));
  }

  for (const legacyId of ['media-library', 'player-panel', 'preview', 'section-list', 'project-picker']) {
    assert.doesNotMatch(indexHtml, new RegExp(`id="${legacyId}"`, 'u'));
  }
  for (const legacyClass of [
    'editor-grid',
    'sidebar',
    'topbar',
    'media-panel',
    'player-panel',
    'preview-panel',
  ]) {
    assert.doesNotMatch(indexHtml, new RegExp(`class="(?:[^"]*\\s)?${legacyClass}(?:\\s|")`, 'u'));
  }

  assert.match(indexHtml, /id="document-command-bar"[\s\S]*id="project-list"[\s\S]*id="save-project"[\s\S]*id="export-report"/u);
  assert.match(indexHtml, /<div id="block-canvas"[^>]*aria-label="Long-form document blocks"/u);
  assert.doesNotMatch(indexHtml, /<video\b/u);
  assert.match(renderer, /resolveMediaSource\(state\.activeProject\.id, assetId\)/u);
  assert.match(renderer, /data-block-path="sync\.mode"/u);
  assert.match(renderer, /Explicit frame mode/u);
  assert.match(renderer, /requestFullscreen/u);
  assert.match(renderer, /startExport\(request\)/u);
  assert.match(renderer, /pickExportDirectory/u);
  assert.match(renderer, /normalizeExportDirectoryPick/u);
  assert.match(renderer, /Folder selection cancelled; no export started/u);
  assert.match(renderer, /getExportStatus\(jobId\)/u);
  assert.match(renderer, /cancelExport\(jobId\)/u);
  assert.match(renderer, /retryExport\(jobId\)/u);
  assert.match(renderer, /await flushPendingChanges\(\)/u);
  assert.match(renderer, /outputKind: elements\.exportKind\?\.value \|\| 'folder'/u);
  assert.match(renderer, /state\.export\.outputDirectory \|\| defaultExportDirectory\(\)/u);
  assert.match(renderer, /data-inline-video-block/u);
  assert.match(renderer, /elements\.blockCanvas\?\.addEventListener\('click'/u);
  assert.match(renderer, /Renderer bridge unavailable/u);
  assert.match(renderer, /elements\.appError\) return/u);
  assert.doesNotMatch(renderer, /elements\.(mediaLibrary|playerPanel|preview|sectionList)\s*=|document\.querySelector\('#(?:media-library|player-panel|preview|section-list)'\)/u);
  assert.match(styles, /\.export-directory-status/u);
});

test('renderer source never constructs a media URL from a filesystem path', () => {
  assert.doesNotMatch(renderer, /path\.(join|resolve|normalize)\(/u);
  assert.doesNotMatch(renderer, /file:\/\//u);
  assert.match(renderer, /video\.src = source\.sourceUrl/u);
});
