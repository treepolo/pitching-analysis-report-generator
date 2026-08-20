'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'src', 'preload.js'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src', 'renderer.js'), 'utf8');

test('desktop playback has one renderer-owned media pipeline and no native child surface', () => {
  assert.doesNotMatch(main, /native-player|NATIVE_PLAYER|Media Foundation|media-foundation-player/u);
  assert.doesNotMatch(preload, /nativePlayer|native-player|NATIVE_PLAYER/u);
  assert.doesNotMatch(renderer, /nativePlayer|native-frame-player|native-player-surface|Media Foundation|HWND|EVR/u);
  assert.match(preload, /frameCache: frameCacheApi/u);
  assert.match(renderer, /video\.src = safeInlineMediaSourceUrl\(source\)/u);
});

test('the frame engine owns latest-target scrubbing, exact release seeking, and native video playback', () => {
  assert.match(renderer, /runtime\.dragTarget/u);
  assert.match(renderer, /requestAnimationFrame/u);
  assert.match(renderer, /video\.fastSeek/u);
  assert.match(renderer, /video\.currentTime = targetTime/u);
  assert.match(renderer, /video\.play\(\)/u);
  assert.match(renderer, /video\.pause\(\)/u);
  assert.match(renderer, /data-frame-rate/u);
});
