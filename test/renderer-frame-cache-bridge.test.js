'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(repositoryRoot, 'src', 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(repositoryRoot, 'src', 'preload.js'), 'utf8');
const renderer = fs.readFileSync(path.join(repositoryRoot, 'src', 'renderer.js'), 'utf8');

test('main registers the v1 frame-cache channels and resolves sources from project identity', () => {
  for (const channel of [
    'frame-cache:prepare',
    'frame-cache:read',
    'frame-cache:cleanup',
    'frame-cache:cancel',
    'frame-cache:frame',
  ]) {
    assert.match(main, new RegExp(`['"]${channel}['"]`, 'u'));
  }
  assert.match(main, /normalizeFrameCacheRequest/u);
  assert.match(main, /resolveFrameCacheAsset/u);
  assert.match(main, /sourceReference: resolved\.sourceReference/u);
  assert.match(main, /frameCacheOperations = new Map/u);
  assert.match(main, /new AbortController\(\)/u);
  assert.match(main, /operation\.controller\.abort\(\)/u);
  assert.match(main, /data:image\/png;base64/u);
  assert.match(main, /collectReferencedVideoAssetIds/u);
  assert.match(main, /readExportFrameCaches/u);
  assert.match(main, /frameCaches,/u);
  assert.match(main, /frameDirectoryRelativePath/u);
  assert.match(main, /isPathInside\(frameDirectory, framePath\)/u);
  assert.match(main, /sandbox: true/u);
  assert.doesNotMatch(main, /payload\?\.sourceReference/u);
});

test('preload exposes only validated frame-cache requests and contract responses', () => {
  assert.doesNotMatch(preload, /require\(['"]node:crypto['"]\)/u);
  assert.doesNotMatch(preload, /require\(['"]\.\//u);
  assert.match(preload, /globalThis\.crypto[\s\S]*randomUUID/u);
  assert.match(preload, /createRequestId\(\)/u);
  assert.match(preload, /frameCache: frameCacheApi/u);
  for (const method of [
    'prepareFrameCache',
    'readFrameCache',
    'cleanupFrameCache',
    'cancelFrameCache',
  ]) {
    assert.match(preload, new RegExp(`${method}: \\(request\\)`, 'u'));
  }
  assert.match(preload, /normalizeFrameCacheResponse/u);
  assert.match(preload, /createCleanupResponse/u);
  assert.match(preload, /createCancelResponse/u);
  assert.match(preload, /assertFrameSourceRequest/u);
  assert.doesNotMatch(preload, /ffmpegCommand|ffprobeCommand|sourcePath|absolutePath/u);
});

test('renderer sends identity-only v1 requests and renders frames through a safe source seam', () => {
  assert.match(renderer, /projectId: state\.activeProject\.id/u);
  assert.match(renderer, /assetId,/u);
  assert.match(renderer, /readFrameCache\(request\)/u);
  assert.match(renderer, /prepareFrameCache\(request\)/u);
  assert.match(renderer, /cancelFrameCache\(request\)/u);
  assert.match(renderer, /getFrameSource\(\{/u);
  assert.match(renderer, /cacheKey: cache\.cacheKey/u);
  assert.doesNotMatch(renderer, /framePlayer.*currentTime|currentTime.*framePlayer/iu);
});
