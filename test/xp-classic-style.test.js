'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..');
const editorStyles = fs.readFileSync(path.join(repositoryRoot, 'src', 'styles.css'), 'utf8');
const { renderReportHtml } = require(path.join(repositoryRoot, 'src', 'export', 'report-renderer.js'));

test('editor keeps the Windows Classic visual contract', () => {
  assert.match(editorStyles, /Windows XP Classic theme/u);
  assert.match(editorStyles, /font-family:\s*Tahoma,\s*"MS Sans Serif"/u);
  assert.match(editorStyles, /--wash:\s*#d4d0c8/u);
  assert.match(editorStyles, /\.document-topbar[^{}]*\{[^}]*background:\s*#0a246a/u);
  assert.match(editorStyles, /\.video-block-card, body\.document-app \.inline-video-block[^{}]*\{[^}]*border-radius:\s*0/u);
  assert.match(editorStyles, /body\.document-app \.rich-text-toolbar[^{}]*\{[^}]*background:\s*#404040/u);
  assert.match(editorStyles, /body\.document-app \.inline-video-block\[data-frame-selected="true"\][^{}]*\{[^}]*outline:\s*2px solid #316ac5/u);
});

test('exported HTML embeds the same Windows Classic visual contract', () => {
  const html = renderReportHtml({
    schemaVersion: 1,
    title: 'Classic style check',
    sections: [{ id: 'section-1', title: 'Section', blocks: [{ type: 'text', text: 'Content' }] }],
  });
  assert.match(html, /Windows XP Classic theme: the portable report/u);
  assert.match(html, /font-family:\s*Tahoma,\s*"MS Sans Serif"/u);
  assert.match(html, /body\s*\{[^}]*background:\s*#d4d0c8/u);
  assert.match(html, /\.report-section\s*\{[^}]*border-radius:\s*0[^}]*box-shadow:\s*none/u);
  assert.match(html, /\.portable-player\[data-frame-selected="true"\]\s*\{[^}]*outline:\s*2px solid #316ac5/u);
  assert.doesNotMatch(html, /backdrop-filter\s*:/u);
});
