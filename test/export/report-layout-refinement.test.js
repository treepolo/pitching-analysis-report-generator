'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const {
  injectReportLayoutRefinement,
  reportLayoutRefinementCss,
} = require('../../src/export/report-layout-refinement');

const repositoryRoot = path.resolve(__dirname, '..', '..');

test('annotation controls lose their outer sub-panel frame and stay compact', () => {
  const css = reportLayoutRefinementCss();
  assert.match(css, /body>main \.report-annotation-controls/u);
  assert.match(css, /\.report-help-live-preview \.report-annotation-controls/u);
  assert.match(css, /width: max-content !important/u);
  assert.match(css, /margin: \.18rem 0 \.12rem !important/u);
  assert.match(css, /padding: 0 !important/u);
  assert.match(css, /border: 0 !important/u);
  assert.match(css, /background: transparent !important/u);
  assert.match(css, /box-shadow: none !important/u);
  assert.match(css, /font-size: 10px !important/u);
  assert.match(css, /gap: \.18rem \.42rem !important/u);
});

test('annotation navigation buttons and toggles use a lightweight player-scale size', () => {
  const css = reportLayoutRefinementCss();
  assert.match(css, /\.report-annotation-jump/u);
  assert.match(css, /min-height: 20px !important/u);
  assert.match(css, /height: 20px !important/u);
  assert.match(css, /padding: 1px 6px !important/u);
  assert.match(css, /\.report-annotation-controls input\[type="checkbox"\]/u);
  assert.match(css, /width: 12px !important/u);
  assert.match(css, /height: 12px !important/u);
  assert.match(css, /\.report-annotation-swatch/u);
  assert.match(css, /width: 9px !important/u);
  assert.match(css, /height: 9px !important/u);
});

test('frame timeline consumes remaining width while frame labels shrink to content', () => {
  const css = reportLayoutRefinementCss();
  assert.match(
    css,
    /grid-template-columns: 25px 25px max-content minmax\(0, 1fr\) max-content 25px !important/u,
  );
  assert.match(css, /\[data-frame-current\]/u);
  assert.match(css, /\[data-frame-total\]/u);
  assert.match(css, /width: max-content !important/u);
  assert.match(css, /min-width: 0 !important/u);
  assert.match(css, /portable-frame-navigation input\[type="range"\]/u);
  assert.match(css, /width: 100% !important/u);
});

test('layout refinement explicitly covers the help clone as well as report body', () => {
  const css = reportLayoutRefinementCss();
  const helpSelectors = css.match(/\.report-help-live-preview/g) || [];
  assert.ok(helpSelectors.length >= 10);
});

test('layout refinement injects once before the closing head', () => {
  const source = '<html><head><title>測試</title></head><body></body></html>';
  const once = injectReportLayoutRefinement(source);
  const twice = injectReportLayoutRefinement(once);
  assert.match(once, /data-report-layout-refinement/u);
  assert.equal((twice.match(/data-report-layout-refinement/g) || []).length, 1);
  assert.ok(once.indexOf('data-report-layout-refinement') < once.indexOf('</head>'));
});

test('report renderer loads and applies the layout refinement after help injection', async () => {
  const source = await fs.readFile(path.join(repositoryRoot, 'src', 'export', 'report-renderer.js'), 'utf8');
  assert.match(source, /require\('\.\/report-layout-refinement'\)/u);
  const helpIndex = source.indexOf('html = injectReportHelpHtml(html);');
  const layoutIndex = source.indexOf('html = injectReportLayoutRefinement(html);');
  assert.ok(helpIndex >= 0);
  assert.ok(layoutIndex > helpIndex);
});
