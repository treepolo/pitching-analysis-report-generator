'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const {
  diagnosticScript,
  injectReportPlayerDiagnostics,
} = require('../../src/export/report-player-diagnostics');

const repositoryRoot = path.resolve(__dirname, '..', '..');

test('temporary player diagnostic runtime parses and remains observation-only', () => {
  const source = diagnosticScript();
  const body = source.replace(/^<script[^>]*>/u, '').replace(/<\/script>$/u, '');
  assert.doesNotThrow(() => new vm.Script(body));
  assert.match(source, /pointerdown/u);
  assert.match(source, /pointerup/u);
  assert.match(source, /click/u);
  assert.match(source, /requestVideoFrameCallback/u);
  assert.match(source, /mediaTime/u);
  assert.match(source, /frameFromCurrentTime/u);
  assert.match(source, /data-tree-polo-inline-video-ready/u);
  assert.doesNotMatch(source, /preventDefault\(/u);
  assert.doesNotMatch(source, /stopPropagation\(/u);
  assert.doesNotMatch(source, /stopImmediatePropagation\(/u);
  assert.doesNotMatch(source, /\.play\(\)/u);
  assert.doesNotMatch(source, /\.pause\(\)/u);
  assert.doesNotMatch(source, /currentTime\s*=/u);
});

test('temporary player diagnostics inject exactly once', () => {
  const source = '<html><head></head><body><main></main></body></html>';
  const once = injectReportPlayerDiagnostics(source);
  const twice = injectReportPlayerDiagnostics(once);
  assert.equal((twice.match(/data-report-player-diagnostics-style/g) || []).length, 1);
  assert.equal((twice.match(/data-report-player-diagnostics-runtime/g) || []).length, 1);
  assert.equal((twice.match(/data-report-player-diagnostics-toggle/g) || []).length, 2);
});

test('renderer places the temporary observer before the entry intro runtime', () => {
  const renderer = fs.readFileSync(path.join(repositoryRoot, 'src', 'export', 'report-renderer.js'), 'utf8');
  assert.match(renderer, /require\('\.\/report-player-diagnostics'\)/u);
  const diagnosticIndex = renderer.indexOf('html = injectReportPlayerDiagnostics(html);');
  const introIndex = renderer.indexOf('html = injectReportEntryIntro(html);');
  assert.ok(diagnosticIndex >= 0);
  assert.ok(introIndex > diagnosticIndex);
});