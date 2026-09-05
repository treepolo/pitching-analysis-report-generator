'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const {
  fixedHeaderScript,
  fixedHeaderStyle,
  injectReportFixedHeaderRuntime,
} = require('../../src/export/report-fixed-header-runtime');

const repositoryRoot = path.resolve(__dirname, '..', '..');

test('fixed header state uses true viewport-fixed positioning', () => {
  const css = fixedHeaderStyle();
  assert.match(css, /data-report-header-fixed="true"[\s\S]*?position: fixed !important/u);
  assert.match(css, /top: 0 !important/u);
  assert.match(css, /margin: 0 !important/u);
  assert.match(css, /z-index: 850 !important/u);
});

test('desktop fixed header preserves layout with a spacer and locks horizontal geometry', () => {
  const script = fixedHeaderScript();
  assert.match(script, /report-fixed-header-spacer/u);
  assert.match(script, /rect\.height \+ Math\.max\(0, numeric\(style\.marginBottom\)\)/u);
  assert.match(script, /header\.style\.setProperty\('left', rect\.left \+ 'px', 'important'\)/u);
  assert.match(script, /header\.style\.setProperty\('width', rect\.width \+ 'px', 'important'\)/u);
  assert.match(script, /scrollY > anchorY \+ 0\.5/u);
  assert.match(script, /header\.dataset\.reportHeaderFixed = 'true'/u);
});

test('phone header is fixed from first paint and uses exact viewport width without a spacer', () => {
  const script = fixedHeaderScript();
  const css = fixedHeaderStyle();
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?body>main header\.tree-polo-report-header,[\s\S]*?position: fixed !important/u);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?top: 0 !important[\s\S]*?left: 0 !important/u);
  assert.match(css, /\.report-fixed-header-spacer\[data-active="true"\][\s\S]*?display: none !important/u);
  assert.match(script, /const mobileQuery = window\.matchMedia\('\(max-width: 700px\)'\)/u);
  assert.match(script, /if \(mobileQuery\.matches\) setFixed\(true\)/u);
  assert.match(script, /spacer\.dataset\.active = mobileQuery\.matches \? 'false' : 'true'/u);
  assert.match(script, /document\.documentElement\.clientWidth/u);
  assert.match(script, /header\.style\.setProperty\('left', '0px', 'important'\)/u);
  assert.match(script, /header\.style\.setProperty\('width', viewportWidth\(\) \+ 'px', 'important'\)/u);
});

test('fixed header runtime handles viewport-mode changes and releases itself for printing', () => {
  const script = fixedHeaderScript();
  assert.match(script, /let wasMobile = mobileQuery\.matches/u);
  assert.match(script, /if \(isMobile !== wasMobile\)/u);
  assert.match(script, /addEventListener\('scroll', scheduleUpdate/u);
  assert.match(script, /addEventListener\('resize', scheduleUpdate/u);
  assert.match(script, /visualViewport\?\.addEventListener\('resize', scheduleUpdate/u);
  assert.match(script, /addEventListener\('orientationchange', scheduleUpdate/u);
  assert.match(script, /mobileQuery\.addEventListener\?\.\('change', scheduleUpdate\)/u);
  assert.match(script, /addEventListener\('beforeprint', beforePrint\)/u);
  assert.match(script, /setFixed\(false\)/u);
});

test('fixed header runtime script is valid JavaScript', () => {
  const markup = fixedHeaderScript();
  const body = markup.replace(/^<script[^>]*>/u, '').replace(/<\/script>$/u, '');
  assert.doesNotThrow(() => new vm.Script(body));
});

test('fixed header runtime injects once', () => {
  const source = '<html><head></head><body><main></main></body></html>';
  const once = injectReportFixedHeaderRuntime(source);
  const twice = injectReportFixedHeaderRuntime(once);
  assert.equal((twice.match(/data-report-fixed-header-style/g) || []).length, 1);
  assert.equal((twice.match(/data-report-fixed-header-runtime/g) || []).length, 1);
});

test('renderer installs hard-fixed header runtime after title alignment and spotlight without a visible-title patch', async () => {
  const source = await fs.readFile(path.join(repositoryRoot, 'src', 'export', 'report-renderer.js'), 'utf8');
  assert.match(source, /require\('\.\/report-fixed-header-runtime'\)/u);
  assert.doesNotMatch(source, /report-visible-title-runtime|injectReportVisibleTitleRuntime/u);
  const titleAlignmentIndex = source.indexOf('html = injectReportTitleAlignmentRefinement(html);');
  const spotlightIndex = source.indexOf('html = injectReportEntrySpotlight(html);');
  const fixedIndex = source.indexOf('html = injectReportFixedHeaderRuntime(html);');
  assert.ok(titleAlignmentIndex >= 0);
  assert.ok(spotlightIndex > titleAlignmentIndex);
  assert.ok(fixedIndex > spotlightIndex);
  assert.doesNotMatch(source, /injectReportPlayerSelectionRefinement/u);
});
