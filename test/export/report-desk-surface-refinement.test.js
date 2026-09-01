'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const {
  deskSurfaceCss,
  injectReportDeskSurfaceRefinement,
} = require('../../src/export/report-desk-surface-refinement');

const repositoryRoot = path.resolve(__dirname, '..', '..');

test('outer page uses a dark layered wood desk background', () => {
  const css = deskSurfaceCss();
  assert.match(css, /background-color: #21140e !important/u);
  assert.match(css, /repeating-linear-gradient/u);
  assert.match(css, /linear-gradient\(90deg, #160c08/u);
  assert.match(css, /background-attachment: fixed !important/u);
});

test('report body keeps its existing surface and only gains a cast shadow', () => {
  const css = deskSurfaceCss();
  assert.match(css, /body>main \{[\s\S]*?box-shadow:/u);
  assert.match(css, /0 28px 54px rgba\(0, 0, 0, \.42\)/u);
  assert.match(css, /0 9px 18px rgba\(0, 0, 0, \.34\)/u);
  assert.doesNotMatch(css, /body>main::before/u);
  assert.doesNotMatch(css, /body>main::after/u);
  assert.doesNotMatch(css, /body>main \{[\s\S]*?border-width:/u);
});

test('mobile reveals a narrow desk edge and uses a tighter shadow', () => {
  const css = deskSurfaceCss();
  assert.match(css, /@media \(max-width: 700px\)/u);
  assert.match(css, /width: calc\(100% - 10px\) !important/u);
  assert.match(css, /margin: 5px auto 18px !important/u);
  assert.match(css, /0 16px 30px rgba\(0, 0, 0, \.38\)/u);
});

test('printing removes desk and shadow', () => {
  const css = deskSurfaceCss();
  assert.match(css, /@media print[\s\S]*?background: #fff !important/u);
  assert.match(css, /@media print[\s\S]*?box-shadow: none !important/u);
});

test('desk surface refinement injects once', () => {
  const source = '<html><head></head><body><main></main></body></html>';
  const once = injectReportDeskSurfaceRefinement(source);
  const twice = injectReportDeskSurfaceRefinement(once);
  assert.equal((twice.match(/data-report-desk-surface-refinement/g) || []).length, 1);
});

test('renderer applies desk surface after floating layout and before title alignment', async () => {
  const source = await fs.readFile(path.join(repositoryRoot, 'src', 'export', 'report-renderer.js'), 'utf8');
  assert.match(source, /require\('\.\/report-desk-surface-refinement'\)/u);
  const floatingIndex = source.indexOf('html = injectReportFloatingUiRefinement(html);');
  const deskIndex = source.indexOf('html = injectReportDeskSurfaceRefinement(html);');
  const titleIndex = source.indexOf('html = injectReportTitleAlignmentRefinement(html);');
  assert.ok(floatingIndex >= 0);
  assert.ok(deskIndex > floatingIndex);
  assert.ok(titleIndex > deskIndex);
});
