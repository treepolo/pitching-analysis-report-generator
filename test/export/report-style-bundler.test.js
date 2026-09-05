'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  STYLE_SOURCE_ROLES,
  bundleReportStyles,
  styleSourceRole,
} = require('../../src/export/report-style-bundler');

test('bundles canonical and functional inline report styles without reordering CSS', () => {
  const source = `<!doctype html><html><head>
<style data-report-canonical-theme>.theme{background:white}</style>
<meta charset="utf-8">
<style data-report-mobile-shell-refinement>.mobile{width:100%}</style>
<style data-report-entry-spotlight-style>.spotlight{opacity:.5}</style>
</head><body></body></html>`;

  const output = bundleReportStyles(source);
  assert.equal((output.match(/<style\b/gu) || []).length, 1);
  assert.match(output, /data-report-style-bundle/u);
  assert.match(output, /data-report-style-source-count="3"/u);
  assert.match(output, /report-style-source:data-report-canonical-theme; role:canonical-visual/u);
  assert.match(output, /report-style-source:data-report-mobile-shell-refinement; role:functional-layout/u);
  assert.match(output, /report-style-source:data-report-entry-spotlight-style; role:component-style/u);
  assert.ok(output.indexOf('.theme{background:white}') < output.indexOf('.mobile{width:100%}'));
  assert.ok(output.indexOf('.mobile{width:100%}') < output.indexOf('.spotlight{opacity:.5}'));
});

test('does not rebundle an already bundled document', () => {
  const source = '<html><head><style data-report-style-bundle>.a{display:block}</style></head><body></body></html>';
  assert.equal(bundleReportStyles(source), source);
});

test('leaves documents with linked stylesheets untouched to avoid changing cascade precedence', () => {
  const source = '<html><head><style>.a{}</style><link rel="stylesheet" href="theme.css"><style>.b{}</style></head><body></body></html>';
  assert.equal(bundleReportStyles(source), source);
});

test('leaves style tags with semantic attributes untouched', () => {
  const source = '<html><head><style media="print">.a{}</style><style>.b{}</style></head><body></body></html>';
  assert.equal(bundleReportStyles(source), source);
});

test('classifies only current canonical, functional and component style owners', () => {
  assert.equal(styleSourceRole('data-report-canonical-theme'), 'canonical-visual');
  assert.equal(styleSourceRole('data-report-layout-refinement'), 'functional-layout');
  assert.equal(styleSourceRole('data-report-help-style'), 'functional-layout');
  assert.equal(styleSourceRole('data-annotation-reader-style'), 'component-style');
  assert.equal(styleSourceRole('data-report-entry-spotlight-style'), 'component-style');
  assert.equal(styleSourceRole('data-report-floating-ui-refinement'), 'unclassified');
  assert.equal(styleSourceRole('inline-style-1'), 'unclassified');
  assert.equal(styleSourceRole('data-unknown-style'), 'unclassified');
  assert.deepEqual(new Set(Object.values(STYLE_SOURCE_ROLES)), new Set([
    'canonical-visual',
    'functional-layout',
    'component-style',
  ]));
});
