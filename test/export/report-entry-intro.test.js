'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const {
  IDENT_DURATION_MS,
  REVEAL_DURATION_MS,
  injectReportEntryIntro,
  introMarkup,
  introScript,
  introStyle,
} = require('../../src/export/report-entry-intro');

const repositoryRoot = path.resolve(__dirname, '..', '..');

test('entry intro owns a black cinematic TREEPOLO ident and hides help while active', () => {
  const css = introStyle();
  assert.match(css, /\.report-entry-intro\{[^}]*position:fixed[^}]*background:#000/u);
  assert.match(css, /\.tree-polo-ident-word/u);
  assert.match(css, /\.tree-polo-ident-mark/u);
  assert.match(css, /\.tree-polo-ident-spectrum/u);
  assert.match(css, /report-entry-intro-active \.report-help-trigger/u);
  assert.match(css, /visibility:hidden!important/u);
});

test('entry intro lights the packaged report background during reveal', () => {
  const css = introStyle();
  assert.match(css, /report-entry-intro-active\[data-tree-polo-background="true"\]::before/u);
  assert.match(css, /report-entry-report-reveal\[data-tree-polo-background="true"\]::before/u);
  assert.match(css, /@keyframes tree-polo-report-light-up/u);
});

test('entry intro markup contains TREEPOLO and the T ident layers', () => {
  const markup = introMarkup();
  assert.match(markup, />TREEPOLO</u);
  assert.match(markup, /tree-polo-ident-mark/u);
  assert.match(markup, /tree-polo-ident-spectrum/u);
});

test('entry runtime animates the existing report header from center back to its layout position', () => {
  const script = introScript();
  const source = script.match(/<script data-report-entry-intro-runtime>\s*([\s\S]*?)\s*<\/script>/u)?.[1];
  assert.ok(source);
  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(source, /header\.getBoundingClientRect\(\)/u);
  assert.match(source, /centerX/u);
  assert.match(source, /centerY/u);
  assert.match(source, /translate\(' \+ dx/u);
  assert.match(source, /header\.animate\(/u);
  assert.match(source, /sections\.forEach/u);
  assert.match(source, /clipPath: 'inset\(0 0 100% 0\)'/u);
  assert.match(source, /treepolo:entry-complete/u);
  assert.match(source, new RegExp(`setTimeout\\(beginReportReveal,${IDENT_DURATION_MS}\\)`,'u'));
  assert.ok(REVEAL_DURATION_MS > 0);
});

test('entry intro runtime schedules the ident sound', () => {
  const source = introScript();
  assert.match(source, /AudioContext/u);
  assert.match(source, /strike\(start \+ \.05,118/u);
  assert.match(source, /strike\(start \+ \.31,82/u);
});

test('entry intro injects style, markup, and runtime exactly once', () => {
  const base = '<html><head></head><body><main>report</main></body></html>';
  const once = injectReportEntryIntro(base);
  const twice = injectReportEntryIntro(once);
  assert.equal((twice.match(/data-report-entry-intro-style/g) || []).length, 1);
  assert.equal((twice.match(/data-report-entry-intro-runtime/g) || []).length, 1);
  assert.equal((twice.match(/data-report-entry-intro aria-hidden/g) || []).length, 1);
});

test('renderer injects fixed header before the entry intro runtime', async () => {
  const source = await fs.readFile(path.join(repositoryRoot, 'src', 'export', 'report-renderer.js'), 'utf8');
  assert.match(source, /require\('\.\/report-entry-intro'\)/u);
  assert.doesNotMatch(source, /report-entry-spotlight/u);
  const fixedIndex = source.indexOf('html = injectReportFixedHeaderRuntime(html);');
  const introIndex = source.indexOf('html = injectReportEntryIntro(html);');
  assert.ok(fixedIndex >= 0);
  assert.ok(introIndex > fixedIndex);
});
