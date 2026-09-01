'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  STYLE_SOURCE_ROLES,
  bundleReportStyles,
  styleSourceRole,
} = require('../../src/export/report-style-bundler');

test('bundles inline report styles into one stylesheet without reordering CSS', () => {
  const source = `<!doctype html><html><head>
<style>.base{display:block}</style>
<meta charset="utf-8">
<style data-report-mobile-shell-refinement>.mobile{width:100%}</style>
<style data-tree-polo-refined-theme>.final{background:white}</style>
</head><body></body></html>`;

  const output = bundleReportStyles(source);
  assert.equal((output.match(/<style\b/gu) || []).length, 1);
  assert.match(output, /data-report-style-bundle/u);
  assert.match(output, /data-report-style-source-count="3"/u);
  assert.match(output, /report-style-source:inline-style-1; role:legacy-base-mixed/u);
  assert.match(output, /report-style-source:data-report-mobile-shell-refinement; role:functional-layout/u);
  assert.match(output, /report-style-source:data-tree-polo-refined-theme; role:final-visual/u);
  assert.ok(output.indexOf('.base{display:block}') < output.indexOf('.mobile{width:100%}'));
  assert.ok(output.indexOf('.mobile{width:100%}') < output.indexOf('.final{background:white}'));
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

test('classifies known style layers for later dead-override pruning', () => {
  assert.equal(STYLE_SOURCE_ROLES['data-xp7-range-theme'], 'legacy-visual');
  assert.equal(styleSourceRole('data-report-layout-refinement'), 'functional-layout');
  assert.equal(styleSourceRole('data-report-player-selection-refinement'), 'visual-only');
  assert.equal(styleSourceRole('data-tree-polo-refined-theme'), 'final-visual');
  assert.equal(styleSourceRole('data-unknown-style'), 'unclassified');
});
