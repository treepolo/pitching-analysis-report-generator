'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..');
const editorStyles = fs.readFileSync(path.join(repositoryRoot, 'src', 'styles.css'), 'utf8');
const { renderReportHtml } = require(path.join(repositoryRoot, 'src', 'export', 'report-renderer.js'));

test('editor keeps the XP and Windows 7 fusion visual contract', () => {
  assert.match(editorStyles, /Windows XP \+ Windows 7 fusion theme/u);
  assert.match(editorStyles, /font-family:\s*Tahoma,\s*"MS Sans Serif"/u);
  assert.match(editorStyles, /linear-gradient\(180deg, #72b5eb 0%/u);
  assert.match(editorStyles, /body\.document-app \.document-topbar[^{}]*\{[^}]*border-radius:\s*7px/u);
  assert.match(editorStyles, /body\.document-app \.video-block-card, body\.document-app \.inline-video-block[^{}]*\{[^}]*border-radius:\s*6px/u);
  assert.match(editorStyles, /body\.document-app \.rich-text-toolbar[^{}]*\{[^}]*background:\s*linear-gradient\(180deg, #565656/u);
  assert.match(editorStyles, /body\.document-app \.inline-video-block\[data-frame-selected="true"\][^{}]*\{[^}]*outline:\s*2px solid #2b78c5/u);
});

test('exported HTML embeds the same XP and Windows 7 fusion visual contract', () => {
  const html = renderReportHtml({
    schemaVersion: 1,
    title: 'Fusion style check',
    sections: [{ id: 'section-1', title: 'Section', blocks: [{ type: 'text', text: 'Content' }] }],
  });
  assert.match(html, /Windows XP \+ Windows 7 fusion theme: blue glass chrome/u);
  assert.match(html, /font-family:\s*Tahoma,\s*"MS Sans Serif"/u);
  assert.match(html, /body\s*\{[^}]*background:\s*linear-gradient\(180deg, #79b7e7/u);
  assert.match(html, /\.report-section\s*\{[^}]*border-radius:\s*5px[^}]*box-shadow:/u);
  assert.match(html, /\.portable-player\[data-frame-selected="true"\]\s*\{[^}]*outline:\s*2px solid #2b78c5/u);
  assert.doesNotMatch(html, /backdrop-filter\s*:/u);
});
