'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const indexHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'index.html'), 'utf8');
const reportRendererSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'export', 'report-renderer.js'), 'utf8');
const mediumReaderSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'export', 'medium-reader-detail-refinement.js'), 'utf8');

test('generator no longer loads legacy XP7 visual stylesheets', () => {
  assert.doesNotMatch(indexHtml, /generator-xp7\.css/u);
  assert.doesNotMatch(indexHtml, /range-xp7\.css/u);
});

test('export renderer no longer injects the legacy XP7 range theme', () => {
  assert.doesNotMatch(reportRendererSource, /xp7-range-theme/u);
  assert.doesNotMatch(reportRendererSource, /injectXp7RangeTheme/u);
});

test('current Medium styling owns both report and help-player range affordances', () => {
  assert.match(mediumReaderSource, /input\[data-frame-timeline\]\[type="range"\]/u);
  assert.match(mediumReaderSource, /input\[data-frame-rate\]\[type="range"\]/u);
  assert.match(mediumReaderSource, /width:12px!important;height:12px/u);
  assert.match(mediumReaderSource, /width:8px!important;height:16px/u);
  assert.match(mediumReaderSource, /report-help-live-preview input\[data-frame-timeline\]/u);
  assert.match(mediumReaderSource, /report-help-live-preview input\[data-frame-rate\]/u);
});
