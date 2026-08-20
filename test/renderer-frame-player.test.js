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
