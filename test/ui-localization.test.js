'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(repositoryRoot, 'src', 'index.html'), 'utf8');
const renderer = fs.readFileSync(path.join(repositoryRoot, 'src', 'renderer.js'), 'utf8');

function indexUserInterfaceText(html) {
  const attributes = [...html.matchAll(/\b(?:aria-label|placeholder|title|alt)="([^"]*)"/gu)]
    .map((match) => match[1]);
  const bodyText = html
    .replace(/<script\b[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ');
  return [...attributes, bodyText]
    .join(' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/\bZIP\b/gu, '')
    .replace(/\.txt|\.md/gu, '');
}

test('live index UI text and accessible labels are Traditional Chinese', () => {
  const interfaceText = indexUserInterfaceText(indexHtml);
  assert.doesNotMatch(interfaceText, /\b[A-Za-z]{2,}\b/u);
});

test('renderer has no stale English user-facing phrases', () => {
  // Keep this list to phrases rendered into UI. Internal identifiers and technical
  // names such as ZIP, HTML, MP4, FPS, and VFR are intentionally not scanned.
  for (const phrase of [
    'Player block created',
    'Text block created',
    'No video asset is loaded',
    'Comparison requires two real project-local video assets',
    'Left video',
    'Right video',
    'Folder picker unavailable',
    'Folder selection cancelled',
    'Folder selection failed',
    'Output ready',
    'Export completed without an output path',
    'Open a project to choose an output folder',
    'Export is unavailable until a project is open',
    'Export running',
    'Cancelling export',
    'Export failed',
    'Export cancelled',
    'No asset selected',
    'Missing asset',
    'Left source',
    'Right source',
    'Video source',
    'Single video',
    'Comparison video',
    'Side by side',
    'Sync mode',
    'Explicit frame mode',
    'Not loaded',
    'This asset is unavailable or unsupported',
    'Metadata is pending normalization',
    'Loading project-local media',
    'Ready; real media source loaded',
    'Media could not be played by this runtime',
    'Media source could not be resolved safely',
    'Open controls',
    'Block settings',
    'Playback unavailable',
    'Unsupported block type',
    'Move block up',
    'Move block down',
    'Open a project to edit blocks',
    'Untitled section',
    'Renderer-only media seam',
    'metadata inspect',
    'Renderer bridge unavailable',
  ]) {
    assert.doesNotMatch(renderer, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'iu'));
  }
});
