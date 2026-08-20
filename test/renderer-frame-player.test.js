'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..');
const renderer = fs.readFileSync(path.join(repositoryRoot, 'src', 'renderer.js'), 'utf8');

function functionSlice(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing source anchor: ${start}`);
  assert.notEqual(endIndex, -1, `missing source anchor: ${end}`);
  return source.slice(startIndex, endIndex);
}

test('single and comparison cards share one frame timeline and one toggle', () => {
  const side = functionSlice(renderer, 'function renderInlineVideoSide(', 'function renderInlineVideoBlock(');
  const block = functionSlice(renderer, 'function renderInlineVideoBlock(', 'function setInlineVideoStatus(');

  assert.match(side, /data-inline-frame/u);
  assert.match(side, /data-frame-surface/u);
  assert.match(side, /data-frame-placeholder/u);
  assert.match(block, /data-frame-player/u);
  assert.equal((block.match(/data-frame-timeline/g) || []).length, 1);
  assert.equal((block.match(/data-frame-action="toggle"/g) || []).length, 1);
  assert.match(block, /data-frame-action="previous"/u);
  assert.match(block, /data-frame-action="next"/u);
  assert.match(block, /data-frame-player-status/u);
  assert.match(block, /const sides = comparison \? `\$\{renderInlineVideoSide\(block, 'left'\)\}\$\{renderInlineVideoSide\(block, 'right'\)\}` : renderInlineVideoSide\(block, 'single'\)/u);
  assert.doesNotMatch(side, /data-inline-action="(?:play|pause)"/u);
});

test('frame player uses the v1 frame-cache response adapter and never maps currentTime', () => {
  const adapter = functionSlice(renderer, 'function frameCacheAdapter(', 'function normalizeFrameIndexResult(');
  assert.match(adapter, /bridge\.readFrameCache/u);
  assert.match(adapter, /bridge\.getFrameSource/u);
  assert.match(adapter, /bridge\.prepareFrameCache/u);
  assert.match(adapter, /bridge\.cancelFrameCache/u);

  const prepare = functionSlice(renderer, 'async function prepareFramePlayerSide(', 'async function prepareFramePlayerCard(');
  assert.match(prepare, /adapter\.readFrameCache\(request\)/u);
  assert.match(prepare, /response\.status === 'cache-miss'/u);
  assert.match(prepare, /adapter\.prepareFrameCache\(request\)/u);
  assert.match(prepare, /normalizeFrameIndexResult\(response\)/u);
  assert.match(prepare, /projectId: state\.activeProject\.id/u);
  assert.match(prepare, /requestId: frameCacheRequestId\(\)/u);
  assert.doesNotMatch(prepare, /resolveMediaSource|currentTime/u);

  const source = functionSlice(renderer, 'async function getCachedFrameSource(', 'async function renderFramePlayerIndex(');
  assert.match(source, /adapter\.getFrameSource\(\{/u);
  assert.match(source, /cacheKey: cache\.cacheKey/u);
  assert.match(source, /frameNumber: frameIndex/u);
  assert.doesNotMatch(source, /currentTime/u);
});

test('drag, exact stepping, and keyboard controls share the frame render path', () => {
  const eventHandler = functionSlice(renderer, 'function handleFramePlayerEvent(', 'function handleFramePlayerKeydown(');
  assert.match(eventHandler, /target\.matches\('\[data-frame-timeline\]'\)/u);
  assert.match(eventHandler, /renderFramePlayerIndex\(card, Number\(target\.value\)\)/u);
  assert.match(eventHandler, /action === 'previous'/u);
  assert.match(eventHandler, /action === 'next'/u);
  assert.match(eventHandler, /toggleFramePlayer\(card\)/u);

  const keyHandler = functionSlice(renderer, 'function handleFramePlayerKeydown(', 'function scheduleInlineRuntimeTask(');
  assert.match(keyHandler, /\['ArrowLeft', 'ArrowRight'\]\.includes\(event\.key\)/u);
  assert.match(keyHandler, /stepFramePlayer\(card, event\.key === 'ArrowRight' \? 1 : -1\)/u);
  assert.match(keyHandler, /event\.preventDefault\(\)/u);

  const hydrate = functionSlice(renderer, 'function hydrateInlineVideoCards()', 'async function playInlineCard(');
  assert.match(hydrate, /prepareFramePlayerCard\(card, entry\.block, generation\)/u);
  assert.doesNotMatch(hydrate, /loadInlineVideoSide/u);
});

test('missing bridge and cache failures remain explicit player states', () => {
  const prepareCard = functionSlice(renderer, 'async function prepareFramePlayerCard(', 'function stopFramePlayer(');
  assert.match(prepareCard, /影格快取橋接尚未提供；等待 Lane A/u);
  assert.match(prepareCard, /setFramePlayerStatus\(card,[\s\S]*'error'\)/u);
  assert.match(renderer, /影格快取錯誤/u);
  assert.match(renderer, /影格快取尚未完成/u);
});

test('comparison playback requires both sides ready and all frames rendered', () => {
  assert.match(renderer, /function framePlayerReady\(block, runtime\)/u);
  assert.match(renderer, /framePlayerSides\(block\)\.every\(\(side\)/u);
  assert.match(renderer, /results\.every\(Boolean\)/u);
  assert.match(renderer, /比較播放器需要左右兩側都成功載入影格/u);
});

test('single-player editor uses the native surface contract and does not open frame-cache PNGs', () => {
  const adapter = functionSlice(renderer, 'function nativePlayerAdapter(', 'function normalizeFrameIndexResult(');
  for (const method of ['open', 'setBounds', 'scrub', 'step', 'play', 'pause', 'close']) {
    assert.match(adapter, new RegExp(`method\\('${method}'\\)`, 'u'));
  }
  const side = functionSlice(renderer, 'function renderInlineVideoSide(', 'function renderInlineVideoBlock(');
  assert.match(side, /native-player-surface/u);
  assert.match(side, /nativeSingle/u);
  const nativePrepare = functionSlice(renderer, 'async function prepareNativeFramePlayerCard(', 'function closeNativeFramePlayers(');
  assert.match(nativePrepare, /adapter\.open\(request\)/u);
  assert.match(nativePrepare, /scheduleNativePlayerBounds/u);
  assert.match(nativePrepare, /requestNativeScrub/u);
  assert.match(nativePrepare, /closeNativePlayerResponse\(adapter, opened\)/u);
  assert.match(nativePrepare, /closeNativePlayerSession\(runtime, adapter\)/u);
  assert.doesNotMatch(nativePrepare, /frameCacheAdapter|prepareFrameCache|getFrameSource|dataUrl|base64|currentTime/u);
});

test('native scrubbing coalesces stale targets and keyboard steps use the native bridge', () => {
  const scrub = functionSlice(renderer, 'function requestNativeScrub(', 'function requestNativeStep(');
  assert.match(scrub, /nativeScrubTarget/u);
  assert.match(scrub, /ensureNativeScrubLoop/u);
  assert.match(scrub, /nativeScrubSerial/u);
  assert.match(scrub, /previous\.cancelled = true/u);
  assert.match(scrub, /requestId/u);
  const loop = functionSlice(renderer, 'function ensureNativeScrubLoop(', 'function requestNativeScrub(');
  assert.match(loop, /await adapter\.scrub/u);
  assert.match(loop, /runtime\.nativeScrubTarget !== null/u);
  assert.match(renderer, /function nativePlayerOperationCompleted\(response\)/u);
  const step = functionSlice(renderer, 'function requestNativeStep(', 'async function prepareNativeFramePlayerCard(');
  assert.match(step, /adapter\.step\(/u);
  assert.match(step, /enqueueNativeOperation/u);
  assert.match(renderer, /nativeOperationQueued/u);
  assert.match(renderer, /nativeOperationBusy/u);
  assert.match(step, /direction/u);
  const controls = functionSlice(renderer, 'function toggleFramePlayer(', 'function handleFramePlayerEvent(');
  assert.match(controls, /adapter\?\.pause|adapter\?\.play/u);
  assert.match(controls, /nativePlayerEnded/u);
  assert.match(controls, /currentFrameIndex >= session\.frameCount - 1/u);
  assert.match(controls, /requestNativeScrub\(card, 0\)/u);
  const nativeClock = functionSlice(renderer, 'function scheduleNativePlayerUiTick(', 'async function closeNativePlayerSession(');
  assert.match(nativeClock, /nativePlaybackRate/u);
  assert.match(nativeClock, /nextFrameIndex >= runtime\.nativeSession\.frameCount - 1/u);
  assert.match(nativeClock, /await adapter\.pause\(\{ sessionId \}\)/u);
  const events = functionSlice(renderer, 'function handleFramePlayerEvent(', 'function handleFramePlayerKeydown(');
  assert.match(events, /event\.type !== 'pointermove'/u);
  assert.match(events, /requestNativeScrub\(card, Number\(target\.value\)\)/u);
  assert.match(events, /event\.type !== 'click'/u);
});
