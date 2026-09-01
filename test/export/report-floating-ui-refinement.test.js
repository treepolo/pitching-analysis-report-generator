'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const {
  floatingUiCss,
  injectReportFloatingUiRefinement,
} = require('../../src/export/report-floating-ui-refinement');

const repositoryRoot = path.resolve(__dirname, '..', '..');

test('report title bar is sticky at the top of the viewport', () => {
  const css = floatingUiCss();
  assert.match(css, /body>main header\.tree-polo-report-header \{[\s\S]*?position: sticky !important/u);
  assert.match(css, /top: 0 !important/u);
  assert.match(css, /z-index: 850 !important/u);
});

test('help trigger is fixed to the lower-right corner on desktop and mobile', () => {
  const css = floatingUiCss();
  assert.match(css, /\.report-help-trigger \{[\s\S]*?top: auto !important/u);
  assert.match(css, /right: 16px !important/u);
  assert.match(css, /bottom: 16px !important/u);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?right: 8px !important[\s\S]*?bottom: 8px !important/u);
});

test('sticky report header falls back to normal positioning when printing', () => {
  const css = floatingUiCss();
  assert.match(css, /@media print[\s\S]*?position: relative !important[\s\S]*?top: auto !important/u);
});

test('floating UI refinement injects once before the closing head', () => {
  const source = '<html><head><title>測試</title></head><body></body></html>';
  const once = injectReportFloatingUiRefinement(source);
  const twice = injectReportFloatingUiRefinement(once);
  assert.match(once, /data-report-floating-ui-refinement/u);
  assert.equal((twice.match(/data-report-floating-ui-refinement/g) || []).length, 1);
});

test('report renderer applies floating UI refinement after help and layout refinement', async () => {
  const source = await fs.readFile(path.join(repositoryRoot, 'src', 'export', 'report-renderer.js'), 'utf8');
  assert.match(source, /require\('\.\/report-floating-ui-refinement'\)/u);
  const helpIndex = source.indexOf('html = injectReportHelpHtml(html);');
  const layoutIndex = source.indexOf('html = injectReportLayoutRefinement(html);');
  const floatingIndex = source.indexOf('html = injectReportFloatingUiRefinement(html);');
  assert.ok(helpIndex >= 0);
  assert.ok(layoutIndex > helpIndex);
  assert.ok(floatingIndex > layoutIndex);
});
