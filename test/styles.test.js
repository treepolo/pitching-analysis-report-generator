'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..');
const styles = fs.readFileSync(path.join(repositoryRoot, 'src', 'styles.css'), 'utf8');

test('CSS exposes the frozen document-first editor contract', () => {
  for (const selector of [
    '#document-command-bar',
    '#document-workspace',
    '#block-canvas',
    '.document-block',
    '.text-block',
    '.video-block-card',
    '.block-insert-actions',
    '.inline-player-controls',
    '.project-menu',
    '#export-report',
    '#export-status',
    'dialog',
  ]) {
    assert.match(styles, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  }
});

test('CSS supersedes permanent dashboard panels and preserves accessible states', () => {
  for (const legacySelector of [
    '.app-grid', '.panel', '.sidebar', '.topbar', '.media-panel', '.player-panel', '.preview-panel', '.editor-grid',
    '#media-library', '#player-panel', '#preview', '#section-list',
  ]) {
    const escapedSelector = legacySelector.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    assert.doesNotMatch(styles, new RegExp(`(?:^|[,{]\\s*)${escapedSelector}(?:\\b|[,{])`, 'mu'));
  }
  assert.match(styles, /:focus-visible/u);
  assert.match(styles, /button:disabled/u);
  assert.match(styles, /\[aria-disabled="true"\]/u);
  assert.match(styles, /\[data-state="error"\]/u);
  assert.match(styles, /\[role="status"\]/u);
  assert.match(styles, /overflow-x:\s*hidden/u);
});

test('CSS keeps document and comparison layouts reachable at narrow widths', () => {
  assert.match(styles, /@media\s*\(max-width:\s*760px\)/u);
  assert.match(styles, /@media\s*\(max-width:\s*520px\)/u);
  assert.match(styles, /\.inline-video-grid, \.video-side-configs\s*\{\s*grid-template-columns:\s*1fr/u);
  assert.match(styles, /\.block-insert-actions:hover, \.block-insert-actions:focus-within/u);
  assert.match(styles, /prefers-reduced-motion/u);
});
