'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(repositoryRoot, 'src', 'index.html'), 'utf8');
const theme = fs.readFileSync(path.join(repositoryRoot, 'src', 'generator-xp7.css'), 'utf8');
const exportRenderer = fs.readFileSync(path.join(repositoryRoot, 'src', 'export', 'report-renderer.js'), 'utf8');

test('generator loads its XP-to-Windows-7 theme after the structural stylesheet', () => {
  assert.match(indexHtml, /href="\.\/styles\.css"[\s\S]*href="\.\/generator-xp7\.css"/u);
  assert.match(indexHtml, /<body class="document-app">/u);
});

test('generator theme uses period desktop chrome and scoped application controls', () => {
  for (const signature of [
    'Windows XP -> Windows 7 transition theme',
    'Tahoma',
    '--xp7-face: #ece9d8',
    'body.document-app .document-topbar',
    'body.document-app #document-command-bar',
    'body.document-app .project-control[open] #project-list',
    'body.document-app .button-primary',
    'body.document-app .block-section-header',
    'body.document-app .inline-video-block[data-frame-selected="true"]',
    'body.document-app dialog::before',
    'border: 2px inset #fff',
  ]) {
    assert.ok(theme.includes(signature), `missing period-theme signature: ${signature}`);
  }

  assert.doesNotMatch(theme, /backdrop-filter:\s*blur/u);
  assert.doesNotMatch(theme, /border-radius:\s*(?:1[0-9]|[2-9][0-9])px/u);
});

test('generator theme preserves narrow-window reachability and visible states', () => {
  assert.match(theme, /@media\s*\(max-width:\s*760px\)/u);
  assert.match(theme, /@media\s*\(max-width:\s*520px\)/u);
  assert.match(theme, /:focus-visible/u);
  assert.match(theme, /button:disabled/u);
  assert.match(theme, /\[aria-disabled="true"\]/u);
  assert.match(theme, /\[data-state="error"\]/u);
  assert.match(theme, /@media\s*\(forced-colors:\s*active\)/u);
});

test('portable report renderer does not import the generator-only theme', () => {
  assert.doesNotMatch(exportRenderer, /generator-xp7\.css|--xp7-|Windows XP -> Windows 7 transition theme/u);
});
