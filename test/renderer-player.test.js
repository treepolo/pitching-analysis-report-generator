'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(repositoryRoot, 'src', 'index.html'), 'utf8');
const renderer = fs.readFileSync(path.join(repositoryRoot, 'src', 'renderer.js'), 'utf8');
const styles = fs.readFileSync(path.join(repositoryRoot, 'src', 'styles.css'), 'utf8');

test('renderer player UI exposes block-local controls and honest capability seams', () => {
  for (const id of [
    'single-video',
    'single-fullscreen',
    'comparison-left-video',
    'comparison-right-video',
    'comparison-left-fullscreen',
    'comparison-right-fullscreen',
  ]) {
    assert.match(indexHtml, new RegExp(`id="${id}"`, 'u'));
  }
  assert.match(renderer, /data-block-action="open-player"/u);
  assert.match(renderer, /resolveMediaSource\(state\.activeProject\.id, sideState\.assetId\)/u);
  assert.match(renderer, /playerSegmentFor\(block, side, duration = null\)/u);
  assert.match(renderer, /syncMode === 'time'/u);
  assert.match(renderer, /Explicit frame mode/u);
  assert.match(renderer, /requestFullscreen/u);
  assert.match(styles, /#comparison-player\[data-layout="stacked"\]/u);
});

test('renderer source never constructs a media URL from a filesystem path', () => {
  assert.doesNotMatch(renderer, /path\.(join|resolve|normalize)\(/u);
  assert.doesNotMatch(renderer, /file:\/\//u);
  assert.match(renderer, /sideState\.video\.src = source\.sourceUrl/u);
});
