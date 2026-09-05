'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const {
  injectReportEntrySpotlight,
  spotlightCss,
  spotlightMarkup,
  spotlightScript,
} = require('../../src/export/report-entry-spotlight');

const repositoryRoot = path.resolve(__dirname, '..', '..');

test('entry spotlight dims the report more strongly while keeping help above it', () => {
  const css = spotlightCss();
  assert.match(css, /\.report-entry-spotlight\{/u);
  assert.match(css, /z-index:875/u);
  assert.match(css, /background:rgba\(3,10,7,\.72\)/u);
  assert.match(css, /@media\(max-width:720px\)[\s\S]*?background:rgba\(3,10,7,\.76\)/u);
  assert.match(css, /report-entry-spotlight-active \.report-help-trigger/u);
  assert.match(css, /z-index:910!important/u);
});

test('entry spotlight renders a center-to-help animated guide', () => {
  const css = spotlightCss();
  const markup = spotlightMarkup();
  const script = spotlightScript();
  assert.match(markup, /data-report-entry-guide/u);
  assert.match(markup, /report-entry-guide-origin/u);
  assert.match(markup, /report-entry-guide-track/u);
  assert.match(markup, /report-entry-guide-comet/u);
  assert.match(css, /--guide-distance/u);
  assert.match(css, /--guide-angle/u);
  assert.match(css, /@keyframes report-entry-guide-travel/u);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/u);
  assert.match(script, /helpTrigger\.getBoundingClientRect\(\)/u);
  assert.match(script, /Math\.hypot\(dx, dy\)/u);
  assert.match(script, /Math\.atan2\(dy, dx\)/u);
  assert.match(script, /guide\.style\.setProperty\('--guide-distance'/u);
  assert.match(script, /guide\.style\.setProperty\('--guide-angle'/u);
  assert.match(script, /window\.addEventListener\('resize', updateGuideGeometry\)/u);
});

test('entry spotlight blocks one outside click and then dismisses', () => {
  const script = spotlightScript();
  const source = script.match(/<script data-report-entry-spotlight-runtime>\s*([\s\S]*?)\s*<\/script>/u)?.[1];
  assert.ok(source);
  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(source, /overlay\.addEventListener\('click'/u);
  assert.match(source, /event\.preventDefault\(\)/u);
  assert.match(source, /event\.stopImmediatePropagation\(\)/u);
  assert.match(source, /overlay\.hidden = true/u);
});

test('clicking help dismisses spotlight without swallowing the help click', () => {
  const script = spotlightScript();
  const listener = script.match(/helpTrigger\.addEventListener\('click', \(\) => \{([\s\S]*?)\}, true\);/u)?.[1];
  assert.ok(listener);
  assert.match(listener, /dismiss\(\)/u);
  assert.doesNotMatch(listener, /preventDefault|stopPropagation|stopImmediatePropagation/u);
});

test('playback shortcuts are blocked until the spotlight is dismissed', () => {
  const script = spotlightScript();
  assert.match(script, /event\.key === 'ArrowLeft'/u);
  assert.match(script, /event\.key === 'ArrowRight'/u);
  assert.match(script, /event\.code === 'KeyA'/u);
  assert.match(script, /event\.code === 'KeyD'/u);
  assert.match(script, /event\.key === ' '/u);
  assert.match(script, /if \(!active\) return/u);
});

test('spotlight markup and runtime are injected exactly once', () => {
  const base = '<html><head></head><body><main>report</main></body></html>';
  const once = injectReportEntrySpotlight(base);
  const twice = injectReportEntrySpotlight(once);
  assert.match(spotlightMarkup(), /data-report-entry-spotlight/u);
  assert.match(spotlightMarkup(), /data-report-entry-guide/u);
  assert.equal((twice.match(/data-report-entry-spotlight-runtime/g) || []).length, 1);
  assert.equal((twice.match(/data-report-entry-spotlight-style/g) || []).length, 1);
  assert.ok(once.indexOf('data-report-entry-spotlight') < once.indexOf('<main>report</main>'));
});

test('renderer injects spotlight after help and title alignment without a floating-header layer', async () => {
  const source = await fs.readFile(path.join(repositoryRoot, 'src', 'export', 'report-renderer.js'), 'utf8');
  assert.match(source, /require\('\.\/report-entry-spotlight'\)/u);
  assert.doesNotMatch(source, /report-floating-ui-refinement|injectReportFloatingUiRefinement/u);
  const helpIndex = source.indexOf('html = injectReportHelpHtml(html);');
  const titleIndex = source.indexOf('html = injectReportTitleAlignmentRefinement(html);');
  const spotlightIndex = source.indexOf('html = injectReportEntrySpotlight(html);');
  assert.ok(helpIndex >= 0);
  assert.ok(titleIndex > helpIndex);
  assert.ok(spotlightIndex > titleIndex);
});
