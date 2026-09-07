'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const {
  IDENT_DURATION_MS,
  TYPE_START_DELAY_MS,
  TYPE_INTERVAL_MS,
  IDENT_EXIT_MS,
  TITLE_STAGE_GAP_MS,
  TITLE_STAGE_FADE_MS,
  TITLE_BAR_HOLD_MS,
  SIGNATURE_TYPE_INTERVAL_MS,
  HEADER_MOVE_DURATION_MS,
  BACKGROUND_FADE_MS,
  REVEAL_DURATION_MS,
  HELP_CUE_DURATION_MS,
  injectReportEntryIntro,
  introMarkup,
  introScript,
  introStyle,
} = require('../../src/export/report-entry-intro');

const repositoryRoot = path.resolve(__dirname, '..', '..');

test('entry intro keeps the clean centered TREEPOLO typing ident', () => {
  const css = introStyle();
  assert.match(css, /\.report-entry-intro\{[^}]*position:fixed[^}]*background:#000/u);
  assert.match(css, /\.tree-polo-ident-word\{[^}]*display:inline-flex[^}]*width:max-content[^}]*justify-content:center/u);
  assert.match(css, /\.tree-polo-ident-word\{[^}]*font-family:Arial,Helvetica,"Segoe UI",sans-serif/u);
  assert.match(css, /\.tree-polo-ident-tree\{color:#00a65a\}/u);
  assert.match(css, /\.tree-polo-ident-polo\{color:#f5f5f5\}/u);
  assert.doesNotMatch(css, /text-shadow|filter:blur|tree-polo-ident-spectrum/u);
});

test('entry timing keeps a deliberate black beat, mirrored fades and established reveal pacing', () => {
  assert.ok(TYPE_START_DELAY_MS >= 650);
  assert.ok(IDENT_DURATION_MS >= 2800);
  assert.equal(TITLE_STAGE_FADE_MS, IDENT_EXIT_MS);
  assert.equal(TITLE_STAGE_GAP_MS, 420);
  assert.ok(TITLE_BAR_HOLD_MS >= 500);
  assert.equal(HEADER_MOVE_DURATION_MS, 1750);
  assert.equal(BACKGROUND_FADE_MS, 746);
  assert.ok(BACKGROUND_FADE_MS < HEADER_MOVE_DURATION_MS);
  assert.equal(REVEAL_DURATION_MS, 2300);
});

test('title fades in only after TREEPOLO and backdrop waits for report reveal', () => {
  const css = introStyle();
  const source = introScript();
  assert.match(css, /report-entry-intro-active\[data-tree-polo-background="true"\]::before\{opacity:0\}/u);
  assert.match(css, new RegExp(`report-entry-report-reveal\\[data-tree-polo-background="true"\\]::before\\{animation:tree-polo-report-background-in ${BACKGROUND_FADE_MS}ms linear both\\}`,'u'));
  assert.doesNotMatch(css, /report-entry-title-stage\[data-tree-polo-background[^}]*animation/u);
  assert.match(source, new RegExp(`const titleFadeAnimation = header\\.animate\\([\\s\\S]*?opacity: 0[\\s\\S]*?opacity: 1[\\s\\S]*?duration: ${TITLE_STAGE_FADE_MS}`,'u'));
});

test('background fade duration remains derived from ninety percent of title travel', async () => {
  const source = await fs.readFile(path.join(repositoryRoot, 'src', 'export', 'report-entry-intro.js'), 'utf8');
  assert.match(source, /const HEADER_MOVE_HOLD_OFFSET = \.06/u);
  assert.match(source, /const HEADER_MOVE_EASING = 'cubic-bezier\(\.22,\.72,\.16,1\)'/u);
  assert.match(source, /const BACKGROUND_REVEAL_TRAVEL_FRACTION = \.9/u);
  assert.match(source, /HEADER_MOVE_DURATION_MS \* timeFractionForEasedProgress/u);
});

test('title stage uses the real header and leaves responsive hero geometry to the header owner', () => {
  const css = introStyle();
  assert.match(css, /body\.report-entry-title-stage>main\{visibility:visible\}/u);
  assert.doesNotMatch(css, /report-entry-title-only|report-entry-title-bar/u);
  assert.doesNotMatch(css, /report-entry-intro-active>main header[^}]*height:/u);
  assert.doesNotMatch(css, /report-entry-intro-active>main header[^}]*min-height:/u);
  assert.doesNotMatch(css, /report-entry-intro-active>main header[^}]*width:/u);
});

test('entry intro markup starts empty so TREEPOLO grows around screen center', () => {
  const markup = introMarkup();
  assert.match(markup, /aria-label="TREEPOLO"/u);
  assert.match(markup, /data-tree-polo-ident-tree><\/span><span class="tree-polo-ident-polo" data-tree-polo-ident-polo><\/span>/u);
  assert.doesNotMatch(markup, />TREEPOLO</u);
});

test('scrollbar stays visually absent through entry and reveals only after user intent', () => {
  const css = introStyle();
  const source = introScript();
  assert.match(css, /html\.report-scrollbar-pending\{[^}]*scrollbar-width:none!important/u);
  assert.match(css, /html\.report-scrollbar-pending::-webkit-scrollbar\{[^}]*width:0!important[^}]*display:none!important/u);
  assert.match(source, /const scrollbarIntentEvents = \['pointerdown','touchstart','wheel'\]/u);
  assert.match(source, /if \(scrollbarMayReveal\) revealScrollbar\(\)/u);
  const html = injectReportEntryIntro('<html lang="zh-Hant"><head></head><body><main>report</main></body></html>');
  assert.match(html, /<html lang="zh-Hant" class="report-scrollbar-pending">/u);
});

test('ident exit finishes before the deliberate black beat and title stage', () => {
  const source = introScript();
  assert.match(source, /const text = 'TREEPOLO'\.slice\(0,typedCount\)/u);
  assert.match(source, new RegExp(`setTimeout\\(typeNextCharacter,${TYPE_START_DELAY_MS}\\)`,'u'));
  assert.match(source, new RegExp(`setTimeout\\(typeNextCharacter,${TYPE_INTERVAL_MS}\\)`,'u'));
  assert.match(source, new RegExp(`setTimeout\\(\\(\\) => overlay\\.classList\\.add\\('is-ident-exit'\\),${IDENT_DURATION_MS - IDENT_EXIT_MS}\\)`,'u'));
  assert.match(source, new RegExp(`setTimeout\\(beginTitleStage,${IDENT_DURATION_MS} \\+ ${TITLE_STAGE_GAP_MS}\\)`,'u'));
});

test('report sheet physically unfolds from zero height at the title instead of revealing an already-expanded sheet', () => {
  const source = introScript().match(/<script data-report-entry-intro-runtime>\s*([\s\S]*?)\s*<\/script>/u)?.[1];
  assert.ok(source);
  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(source, /const sheetEndY = isPhoneLayout \? 0 : headerHeight/u);
  assert.match(source, /reportBodyInner\.style\.transformOrigin = 'top center'/u);
  assert.match(source, /reportBodyInner\.style\.transform = 'translateY\(' \+ sheetEndY \+ 'px\) scaleY\(0\)'/u);
  assert.match(source, /reportBody\.style\.height = targetBodyHeight \+ 'px'/u);
  assert.match(source, new RegExp(`const sheetUnfoldAnimation = reportBodyInner\\.animate\\([\\s\\S]*?scaleY\\(0\\)[\\s\\S]*?scaleY\\(1\\)[\\s\\S]*?duration: ${REVEAL_DURATION_MS}[\\s\\S]*?easing: 'linear'`,'u'));
  assert.doesNotMatch(source, /bodyHeightAnimation|sheetSlideAnimation|sheetStartY/u);
  assert.match(source, /const unwrapReportBody = \(\) =>/u);
});

test('opening header starts from actual viewport center and travels to current hero endpoint without a hard-coded final offset', () => {
  const source = introScript();
  assert.match(source, /const positionedHeaderRect = header\.getBoundingClientRect\(\)/u);
  assert.match(source, /const visualViewport = window\.visualViewport/u);
  assert.match(source, /visualViewport\.offsetTop \+ visualViewport\.height \/ 2/u);
  assert.match(source, /const dy = viewportCenterY - \(positionedHeaderRect\.top \+ positionedHeaderRect\.height \/ 2\)/u);
  assert.match(source, new RegExp(`const headerAnimation = header\\.animate\\([\\s\\S]*?translateY\\(0px\\)[\\s\\S]*?duration: ${HEADER_MOVE_DURATION_MS}`,'u'));
  assert.doesNotMatch(source, /finalHeaderTop|legacyHeader|targetHeaderY/u);
});

test('by 小樹Polo types while the real sheet unfolds', () => {
  const source = introScript();
  assert.match(source, /signatureByNode\.nodeValue = ''/u);
  assert.match(source, /signatureTree\.textContent = ''/u);
  assert.match(source, /signaturePolo\.textContent = ''/u);
  assert.match(source, /const text = 'by小樹Polo'\.slice\(0,signatureTypedCount\)/u);
  assert.match(source, new RegExp(`setTimeout\\(typeNextSignatureCharacter,${SIGNATURE_TYPE_INTERVAL_MS}\\)`,'u'));
  assert.match(source, /report-entry-report-reveal[\s\S]*?signatureTypeTimer = window\.setTimeout\(typeNextSignatureCharacter,0\)/u);
});

test('post-entry help cue retains its large smooth spotlight falloff', () => {
  const css = introStyle();
  const source = introScript();
  assert.match(css, /radial-gradient\(circle max\(160px,30vw\)/u);
  assert.match(css, /rgba\(0,0,0,0\) 6%/u);
  assert.match(css, /rgba\(0,0,0,\.88\) 100%/u);
  assert.match(source, new RegExp(`setTimeout\\(stopHelpCue,${HELP_CUE_DURATION_MS}\\)`,'u'));
});

test('entry runtime replays on every load without session or history gating', () => {
  const source = introScript();
  assert.doesNotMatch(source, /sessionStorage|history\.state|history\.replaceState|treePoloEntrySeen/u);
  assert.match(source, /root\.classList\.add\('report-entry-intro-lock'\)/u);
});

test('help cue is claimed once per report URL with persistent local storage', () => {
  const source = introScript();
  assert.match(source, /const helpCueStorageKey = 'treepolo-report-help-cue-seen:' \+ String\(location\.href\)\.split\('#'\)\[0\]/u);
  assert.match(source, /localStorage\.getItem\(helpCueStorageKey\) === '1'/u);
  assert.match(source, /localStorage\.setItem\(helpCueStorageKey,'1'\)/u);
  assert.match(source, /if \(shouldShowHelpCue\) startHelpCue\(\)/u);
});

test('entry blocks report interaction and allows invisible pointer or touch skip', () => {
  const source = introScript();
  assert.match(source, /const blockedEvents = \['wheel','touchmove','keydown'\]/u);
  assert.match(source, /event\.preventDefault\(\)/u);
  assert.match(source, /document\.addEventListener\('pointerdown',skipEntry/u);
  assert.match(source, /document\.addEventListener\('touchstart',skipEntry/u);
  assert.match(source, /finishEntry\(true\)/u);
  assert.doesNotMatch(introMarkup(), /skip|跳過/iu);
});

test('entry keeps the restrained local two-strike sound without shimmer', () => {
  const source = introScript();
  assert.match(source, /AudioContext/u);
  assert.match(source, /strike\(start \+ \.94,132/u);
  assert.match(source, /strike\(start \+ 1\.08,88/u);
  assert.doesNotMatch(source, /shimmer/u);
});

test('entry intro injects style, markup, runtime and pending scrollbar state exactly once', () => {
  const base = '<html><head></head><body><main>report</main></body></html>';
  const once = injectReportEntryIntro(base);
  const twice = injectReportEntryIntro(once);
  assert.equal((twice.match(/data-report-entry-intro-style/g) || []).length, 1);
  assert.equal((twice.match(/data-report-entry-intro-runtime/g) || []).length, 1);
  assert.equal((twice.match(/data-report-entry-intro aria-hidden/g) || []).length, 1);
  assert.equal((twice.match(/<html[^>]*\breport-scrollbar-pending\b/gu) || []).length, 1);
});

test('renderer injects header runtime before entry intro', async () => {
  const source = await fs.readFile(path.join(repositoryRoot, 'src', 'export', 'report-renderer.js'), 'utf8');
  const fixedIndex = source.indexOf('html = injectReportFixedHeaderRuntime(html);');
  const introIndex = source.indexOf('html = injectReportEntryIntro(html);');
  assert.ok(fixedIndex >= 0);
  assert.ok(introIndex > fixedIndex);
  assert.doesNotMatch(source, /report-entry-spotlight/u);
});
