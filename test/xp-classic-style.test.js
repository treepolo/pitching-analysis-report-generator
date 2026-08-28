'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..');
const editorStyles = fs.readFileSync(path.join(repositoryRoot, 'src', 'styles.css'), 'utf8');
const { renderReportHtml } = require(path.join(repositoryRoot, 'src', 'export', 'report-renderer.js'));

test('editor keeps the XP/Windows 7 desktop application visual contract', () => {
  assert.match(editorStyles, /Windows XP\/Windows 7 desktop application theme/u);
  assert.match(editorStyles, /font-family:\s*Tahoma,\s*"MS Sans Serif"/u);
  assert.match(editorStyles, /--wash:\s*#ece9d8/u);
  assert.match(editorStyles, /body\.document-app \.document-topbar[^{}]*\{[^}]*linear-gradient\(180deg, #5c9bd5/u);
  assert.match(editorStyles, /body\.document-app \.document-command-bar, body\.document-app #document-command-bar[^{}]*\{[^}]*background:\s*linear-gradient/u);
  assert.match(editorStyles, /body\.document-app \.video-block-card, body\.document-app \.inline-video-block[^{}]*\{[^}]*border:\s*2px groove/u);
  assert.match(editorStyles, /body\.document-app \.project-control > summary/u);
  assert.match(editorStyles, /body\.document-app \.inline-video-block\[data-frame-selected="true"\][^{}]*\{[^}]*outline:\s*2px solid #316ac5/u);
});

test('exported HTML embeds the XP/Windows 7 desktop application visual contract', () => {
  const html = renderReportHtml({
    schemaVersion: 1,
    title: 'Desktop style check',
    sections: [{ id: 'section-1', title: 'Section', blocks: [{ type: 'text', text: 'Content' }] }],
  });
  assert.match(html, /Windows XP\/Windows 7 desktop application theme: authentic menu/u);
  assert.match(html, /font-family:\s*Tahoma,\s*"MS Sans Serif"/u);
  assert.match(html, /body\s*\{[^}]*background:\s*#ece9d8/u);
  assert.match(html, /\.report-header\s*\{[^}]*linear-gradient\(180deg, #5c9bd5/u);
  assert.match(html, /\.report-section\s*\{[^}]*border-radius:\s*2px[^}]*box-shadow:\s*none/u);
  assert.match(html, /\.portable-player\[data-frame-selected="true"\]\s*\{[^}]*outline:\s*2px solid #316ac5/u);
  assert.doesNotMatch(html, /backdrop-filter\s*:/u);
});
