'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const {
  COMPACT_HEADER_HEIGHT,
  DESKTOP_HERO_HEADER_HEIGHT,
  DESKTOP_HERO_TITLE_SIZE,
  DESKTOP_TOP_GAP,
  PHONE_HERO_HEADER_HEIGHT,
  PHONE_HERO_TITLE_SIZE,
  TITLE_ALIGN_STAGGER_SPAN,
  fixedHeaderScript,
  fixedHeaderStyle,
  injectReportFixedHeaderRuntime,
} = require('../../src/export/report-fixed-header-runtime');

const repositoryRoot = path.resolve(__dirname, '..', '..');

test('desktop top gap mirrors the existing 28px report bottom gap while phone remains flush', () => {
  const css = fixedHeaderStyle();
  assert.equal(DESKTOP_TOP_GAP, 28);
  assert.match(css, /@media \(min-width: 701px\)[\s\S]*?body>main[\s\S]*?margin-top: 28px !important/u);
  assert.doesNotMatch(css, /@media \(max-width: 700px\)[\s\S]*?margin-top: 28px/u);
});

test('headline collapse is bound directly to scroll distance equal to the header height delta', () => {
  const source = fixedHeaderScript();
  assert.ok(DESKTOP_HERO_HEADER_HEIGHT > COMPACT_HEADER_HEIGHT);
  assert.ok(PHONE_HERO_HEADER_HEIGHT > COMPACT_HEADER_HEIGHT);
  assert.ok(DESKTOP_HERO_TITLE_SIZE > 18);
  assert.ok(PHONE_HERO_TITLE_SIZE > 16);
  assert.match(source, /const heightDelta = Math\.max\(1, metrics\.heroHeight - metrics\.compactHeight\)/u);
  assert.match(source, /const fontProgress = clamp01\(scrollY \/ heightDelta\)/u);
  assert.match(source, /const alignProgress = clamp01\(\(scrollY - heightDelta\) \/ heightDelta\)/u);
  assert.match(source, /--tree-polo-header-height/u);
  assert.match(source, /--tree-polo-title-size/u);
  assert.match(source, /--tree-polo-title-letter-spacing/u);
});

test('character centering is staggered with overlap instead of sequential or simultaneous movement', () => {
  const source = fixedHeaderScript();
  assert.ok(TITLE_ALIGN_STAGGER_SPAN > 0 && TITLE_ALIGN_STAGGER_SPAN < 1);
  assert.match(source, /document\.createTreeWalker\(title, NodeFilter\.SHOW_TEXT\)/u);
  assert.match(source, /span\.className = 'tree-polo-title-char'/u);
  assert.match(source, /const movingWindow = 1 - 0\.45/u);
  assert.match(source, /\(index \/ \(count - 1\)\) \* 0\.45/u);
  assert.match(source, /const local = clamp01\(\(alignProgress - staggerStart\) \/ movingWindow\)/u);
  assert.match(source, /centerShift \* smoothstep\(local\)/u);
  assert.match(source, /--tree-polo-char-shift/u);
});

test('desktop header becomes fixed only after reaching the viewport top and keeps spacer geometry', () => {
  const source = fixedHeaderScript();
  const css = fixedHeaderStyle();
  assert.match(css, /data-report-header-fixed="true"[\s\S]*?position: fixed !important/u);
  assert.match(css, /top: 0 !important/u);
  assert.match(source, new RegExp(`const shouldFix = scrollY > ${DESKTOP_TOP_GAP} \\+ \\.5`,'u'));
  assert.match(source, /report-fixed-header-spacer/u);
  assert.match(source, /syncSpacer\(currentHeight\)/u);
  assert.match(source, /header\.dataset\.reportHeaderFixed = 'true'/u);
});

test('phone uses the same scroll morph but remains fixed from the top without a spacer', () => {
  const source = fixedHeaderScript();
  const css = fixedHeaderStyle();
  assert.match(source, /const mobileQuery = window\.matchMedia\('\(max-width: 700px\)'\)/u);
  assert.match(source, /if \(isMobile\) \{[\s\S]*?setFixed\(true\);[\s\S]*?applyFixedGeometry\(\);[\s\S]*?return;/u);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?left: 0 !important[\s\S]*?width: 100% !important/u);
  assert.match(css, /\.report-fixed-header-spacer\[data-active="true"\][\s\S]*?display: none !important/u);
  assert.match(source, /--tree-polo-mobile-header-space/u);
});

test('header runtime suspends during entry so the intro ends at the true hero geometry without a snap', () => {
  const source = fixedHeaderScript();
  assert.match(source, /let introSuspended = Boolean\(document\.querySelector\('\[data-report-entry-intro\]'\)\)/u);
  assert.match(source, /const suspendForIntro = \(\) => \{/u);
  assert.match(source, /introSuspended = true/u);
  assert.match(source, /applyTitleMorph\(0\)/u);
  assert.match(source, /const resumeAfterIntro = \(\) => \{/u);
  assert.match(source, /wrapTitleCharacters\(\)/u);
  assert.match(source, /window\.addEventListener\('treepolo:entry-start', suspendForIntro\)/u);
  assert.match(source, /window\.addEventListener\('treepolo:entry-complete', resumeAfterIntro\)/u);
});

test('header runtime handles viewport changes, reverse scrolling and printing from the same source of truth', () => {
  const source = fixedHeaderScript();
  assert.match(source, /let wasMobile = mobileQuery\.matches/u);
  assert.match(source, /if \(isMobile !== wasMobile\)/u);
  assert.match(source, /addEventListener\('scroll', scheduleUpdate/u);
  assert.match(source, /addEventListener\('resize', handleViewportChange/u);
  assert.match(source, /visualViewport\?\.addEventListener\('resize', handleViewportChange/u);
  assert.match(source, /addEventListener\('orientationchange', handleViewportChange/u);
  assert.match(source, /mobileQuery\.addEventListener\?\.\('change', handleViewportChange\)/u);
  assert.match(source, /addEventListener\('beforeprint', beforePrint\)/u);
  assert.match(source, /setFixed\(false\)/u);
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

test('renderer keeps header geometry before entry intro without a second title runtime', async () => {
  const source = await fs.readFile(path.join(repositoryRoot, 'src', 'export', 'report-renderer.js'), 'utf8');
  assert.match(source, /require\('\.\/report-fixed-header-runtime'\)/u);
  assert.match(source, /require\('\.\/report-entry-intro'\)/u);
  assert.doesNotMatch(source, /report-visible-title-runtime|injectReportVisibleTitleRuntime/u);
  const titleAlignmentIndex = source.indexOf('html = injectReportTitleAlignmentRefinement(html);');
  const fixedIndex = source.indexOf('html = injectReportFixedHeaderRuntime(html);');
  const introIndex = source.indexOf('html = injectReportEntryIntro(html);');
  assert.ok(titleAlignmentIndex >= 0);
  assert.ok(fixedIndex > titleAlignmentIndex);
  assert.ok(introIndex > fixedIndex);
});
