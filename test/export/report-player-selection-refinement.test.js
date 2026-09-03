'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const {
  injectReportPlayerSelectionRefinement,
  playerPlaybackOwnershipScript,
  playerSelectionCss,
} = require('../../src/export/report-player-selection-refinement');

const repositoryRoot = path.resolve(__dirname, '..', '..');

test('selected player gets a stronger Tree Polo green halo without changing border width', () => {
  const css = playerSelectionCss();
  assert.match(css, /\.portable-player\[data-frame-selected="true"\]/u);
  assert.match(css, /border-color: #24a96c !important/u);
  assert.match(css, /0 0 0 1px rgba\(185,255,104,\.42\)/u);
  assert.match(css, /0 0 9px 2px rgba\(66,211,146,\.40\) !important/u);
  assert.doesNotMatch(css, /border-width/u);
});

test('selection glow also covers the cloned player shown in help', () => {
  const css = playerSelectionCss();
  assert.match(css, /\.report-help-live-preview \.portable-player\[data-frame-selected="true"\]/u);
});

test('portable player playback ownership covers click, keyboard, and native play entry points', () => {
  const script = playerPlaybackOwnershipScript();
  assert.match(script, /data-report-player-playback-ownership/u);
  assert.match(script, /const claimPlayback = \(activeBlock\)/u);
  assert.match(script, /block !== activeBlock && blockIsPlaying\(block\)/u);
  assert.match(script, /document\.addEventListener\('click',[\s\S]*\}, true\);/u);
  assert.match(script, /document\.addEventListener\('keydown',[\s\S]*\}, true\);/u);
  assert.match(script, /document\.addEventListener\('play',[\s\S]*\}, true\);/u);
  assert.match(script, /toggle\.getAttribute\('aria-pressed'\) !== 'true'/u);
  assert.match(script, /typeof actions\?\.stop === 'function'/u);
  assert.match(script, /toggle\.click\(\)/u);
  assert.match(script, /video\.pause\(\)/u);
});

test('selection refinement injects styling and playback ownership exactly once', () => {
  const base = '<html><head></head><body><main></main></body></html>';
  const once = injectReportPlayerSelectionRefinement(base);
  const twice = injectReportPlayerSelectionRefinement(once);
  assert.equal((twice.match(/data-report-player-selection-refinement/g) || []).length, 1);
  assert.equal((twice.match(/data-report-player-playback-ownership/g) || []).length, 1);
});

test('renderer applies selection refinement without replacing the native selection state machine', async () => {
  const renderer = await fs.readFile(path.join(repositoryRoot, 'src', 'export', 'report-renderer.js'), 'utf8');
  const player = await fs.readFile(path.join(repositoryRoot, 'src', 'export', 'native-frame-player.js'), 'utf8');
  assert.match(renderer, /require\('\.\/report-player-selection-refinement'\)/u);
  assert.match(renderer, /html = injectReportPlayerSelectionRefinement\(html\);/u);
  assert.match(player, /block\.dataset\.frameSelected = selected \? 'true' : 'false'/u);
});
