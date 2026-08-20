'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'src', 'preload.js'), 'utf8');
const native = fs.readFileSync(path.join(root, 'native', 'media-foundation-player.cpp'), 'utf8');

test('native player bridge exposes a bounded single-video contract', () => {
  for (const channel of [
    'native-player:open',
    'native-player:set-bounds',
    'native-player:scrub',
    'native-player:step',
    'native-player:play',
    'native-player:pause',
    'native-player:close',
  ]) {
    assert.match(main, new RegExp(`ipcMain\\.handle\\('${channel}'`, 'u'));
    assert.match(preload, new RegExp(`ipcRenderer\\.invoke\\('${channel}'`, 'u'));
  }
  assert.match(main, /assertTrustedSender\(event\)/u);
  assert.match(main, /resolveNativePlayerAsset/u);
  assert.match(main, /NATIVE_PLAYER_HELPER_PATH/u);
  assert.match(preload, /nativePlayer: nativePlayerApi/u);
  assert.match(preload, /assertNativeBounds/u);
  assert.doesNotMatch(preload, /sourcePath|sourceUrl/u);
});

test('native helper uses Media Foundation completion rather than image/cache transport', () => {
  assert.match(native, /IMFMediaSession/u);
  assert.match(native, /MFCreateVideoRendererActivate/u);
  assert.match(native, /SetObject\(rendererActivate\.Get\(\)\)/u);
  assert.match(native, /SetRate\(FALSE, 0\.0f\)/u);
  assert.match(native, /MESessionScrubSampleComplete/u);
  assert.match(native, /queuedScrubRequest_/u);
  assert.match(native, /stopForScrub_/u);
  assert.match(native, /MFVP_MESSAGE_STEP|IVideoFrameStep/u);
  assert.match(native, /set-bounds/u);
  assert.doesNotMatch(native, /currentTime|base64|frame-cache/u);
});
