'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const {
  LOCKED_VIEWPORT,
  injectReportMobileShellRefinement,
  mobileShellCss,
  mobileZoomLockScript,
} = require('../../src/export/report-mobile-shell-refinement');

const repositoryRoot = path.resolve(__dirname, '..', '..');

test('mobile report shell is truly edge-to-edge and centered', () => {
  const css = mobileShellCss();
  assert.match(css, /@media \(max-width: 700px\)/u);
  assert.match(css, /body>main \{[\s\S]*?width: 100% !important/u);
  assert.match(css, /body>main \{[\s\S]*?margin: 0 !important/u);
  assert.match(css, /padding: 70px 5px 12px !important/u);
  assert.match(css, /border-left: 0 !important/u);
  assert.match(css, /border-right: 0 !important/u);
  assert.match(css, /header\.tree-polo-report-header \{[\s\S]*?margin: 0 -5px 8px !important/u);
});

test('mobile shell reserves fixed title space from first paint and releases it for print', () => {
  const css = mobileShellCss();
  assert.match(css, /padding: 70px 5px 12px !important/u);
  assert.match(css, /@media print[\s\S]*?padding-top: 0 !important/u);
});

test('mobile viewport locks page scaling while preserving range dragging', () => {
  const source = '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>';
  const html = injectReportMobileShellRefinement(source);
  assert.equal(LOCKED_VIEWPORT, 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
  assert.match(html, /maximum-scale=1, user-scalable=no/u);
  const css = mobileShellCss();
  assert.match(css, /touch-action: pan-y !important/u);
  assert.match(css, /input\[type="range"\][\s\S]*?touch-action: pan-x !important/u);
});

test('mobile zoom lock blocks pinch-style gestures only in phone layout', () => {
  const script = mobileZoomLockScript();
  assert.match(script, /matchMedia\?\.\('\(max-width: 700px\)'\)/u);
  assert.match(script, /gesturestart/u);
  assert.match(script, /gesturechange/u);
  assert.match(script, /event\.touches\.length > 1/u);
  assert.match(script, /passive: false/u);
  const body = script.replace(/^<script[^>]*>/u, '').replace(/<\/script>$/u, '');
  assert.doesNotThrow(() => new vm.Script(body));
});

test('mobile shell refinement injects once and renderer no longer installs desk styling', async () => {
  const source = '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>';
  const once = injectReportMobileShellRefinement(source);
  const twice = injectReportMobileShellRefinement(once);
  assert.equal((twice.match(/data-report-mobile-shell-refinement/g) || []).length, 1);
  assert.equal((twice.match(/data-report-mobile-zoom-lock/g) || []).length, 1);

  const renderer = await fs.readFile(path.join(repositoryRoot, 'src', 'export', 'report-renderer.js'), 'utf8');
  assert.match(renderer, /require\('\.\/report-mobile-shell-refinement'\)/u);
  assert.doesNotMatch(renderer, /report-desk-surface-refinement/u);
  assert.doesNotMatch(renderer, /injectReportDeskSurfaceRefinement/u);
  const floatingIndex = renderer.indexOf('html = injectReportFloatingUiRefinement(html);');
  const mobileIndex = renderer.indexOf('html = injectReportMobileShellRefinement(html);');
  const titleIndex = renderer.indexOf('html = injectReportTitleAlignmentRefinement(html);');
  assert.ok(floatingIndex >= 0);
  assert.ok(mobileIndex > floatingIndex);
  assert.ok(titleIndex > mobileIndex);
});
