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
  assert.doesNotMatch(css, /tree-polo-ident-char|tree-polo-ident-mark|tree-polo-ident-spectrum|tree-polo-ident-vignette/u);
  assert.doesNotMatch(css, /text-shadow|filter:blur/u);
  assert.match(css, /report-entry-intro-active \.report-help-trigger/u);
  assert.match(css, /visibility:hidden!important/u);
});

test('entry timing keeps a deliberate black beat, mirrored fades and the established reveal pacing', () => {
  assert.ok(TYPE_START_DELAY_MS >= 650);
  assert.ok(IDENT_DURATION_MS >= 2800);
  assert.ok(IDENT_EXIT_MS >= 220);
  assert.equal(TITLE_STAGE_FADE_MS, IDENT_EXIT_MS);
  assert.equal(TITLE_STAGE_GAP_MS, 420);
  assert.ok(TITLE_BAR_HOLD_MS >= 500);
  assert.ok(SIGNATURE_TYPE_INTERVAL_MS >= 60);
  assert.equal(HEADER_MOVE_DURATION_MS, 1750);
  assert.equal(BACKGROUND_FADE_MS, 746);
  assert.ok(BACKGROUND_FADE_MS < HEADER_MOVE_DURATION_MS);
  assert.equal(REVEAL_DURATION_MS, 2300);
  assert.ok(REVEAL_DURATION_MS > HEADER_MOVE_DURATION_MS);
});

test('title stage uses the real final title bar without content-specific entrance effects', () => {
  const css = introStyle();
  assert.match(css, /body\.report-entry-title-stage>main\{visibility:visible\}/u);
  assert.doesNotMatch(css, /report-entry-content-in/u);
  assert.doesNotMatch(css, /report-entry-report-reveal>main>:not\(header\).*animation/u);
  assert.doesNotMatch(css, /report-entry-title-only|report-entry-title-bar/u);
  assert.doesNotMatch(css, /body\.report-entry-title-stage>main h1[^}]*transform/u);
});

test('title fades in after TREEPOLO and backdrop waits for the report reveal', () => {
  const css = introStyle();
  const source = introScript();
  assert.match(css, /body\.report-entry-intro-active\[data-tree-polo-background="true"\]\{background:#000!important\}/u);
  assert.match(css, /body\.report-entry-intro-active\[data-tree-polo-background="true"\]::before\{opacity:0\}/u);
  assert.match(css, new RegExp(`body\\.report-entry-report-reveal\\[data-tree-polo-background="true"\\]::before\\{animation:tree-polo-report-background-in ${BACKGROUND_FADE_MS}ms linear both\\}`,'u'));
  assert.match(css, /@keyframes tree-polo-report-background-in\{from\{opacity:0\}to\{opacity:1\}\}/u);
  assert.match(css, /\.report-entry-intro\.is-title-stage,\.report-entry-intro\.is-title-stage \.report-entry-intro-stage\{background:transparent\}/u);
  assert.doesNotMatch(css, /report-entry-title-stage\[data-tree-polo-background[^}]*animation/u);
  assert.match(source, new RegExp(`const titleFadeAnimation = header\\.animate\\([\\s\\S]*?opacity: 0[\\s\\S]*?opacity: 1[\\s\\S]*?duration: ${TITLE_STAGE_FADE_MS}[\\s\\S]*?easing: 'linear'`,'u'));
  assert.match(source, /body\.classList\.add\('report-entry-report-reveal'\)/u);
  assert.doesNotMatch(source, /overlayAnimation/u);
});

test('background fade duration is derived from ninety percent of title travel under the same easing', async () => {
  const source = await fs.readFile(path.join(repositoryRoot, 'src', 'export', 'report-entry-intro.js'), 'utf8');
  assert.match(source, /const HEADER_MOVE_HOLD_OFFSET = \.06/u);
  assert.match(source, /const HEADER_MOVE_EASING = 'cubic-bezier\(\.22,\.72,\.16,1\)'/u);
  assert.match(source, /const BACKGROUND_REVEAL_TRAVEL_FRACTION = \.9/u);
  assert.match(source, /function timeFractionForEasedProgress/u);
  assert.match(source, /HEADER_MOVE_HOLD_OFFSET[\s\S]*\(1 - HEADER_MOVE_HOLD_OFFSET\) \* BACKGROUND_REVEAL_TRAVEL_FRACTION/u);
  assert.match(source, /HEADER_MOVE_DURATION_MS \* timeFractionForEasedProgress/u);
});

test('phone entry does not override title-bar geometry during the intro', () => {
  const css = introStyle();
  assert.doesNotMatch(css, /report-entry-intro-active>main header[^}]*position:absolute/u);
  assert.doesNotMatch(css, /report-entry-intro-active>main header[^}]*height:/u);
  assert.doesNotMatch(css, /report-entry-intro-active>main header[^}]*min-height:/u);
  assert.doesNotMatch(css, /report-entry-intro-active>main header[^}]*width:/u);
});

test('entry intro markup starts with zero-width TREE and POLO spans so typing grows from screen center', () => {
  const markup = introMarkup();
  assert.match(markup, /aria-label="TREEPOLO"/u);
  assert.match(markup, /data-tree-polo-ident-tree><\/span><span class="tree-polo-ident-polo" data-tree-polo-ident-polo><\/span>/u);
  assert.doesNotMatch(markup, />TREEPOLO</u);
  assert.doesNotMatch(markup, /tree-polo-ident-char|tree-polo-ident-mark|tree-polo-ident-spectrum|tree-polo-ident-vignette/u);
});

test('scrollbar stays visually hidden through entry and reveals only after user intent', () => {
  const css = introStyle();
  const source = introScript();
  assert.match(css, /html\.report-scrollbar-pending\{[^}]*scrollbar-width:none!important[^}]*-ms-overflow-style:none!important/u);
  assert.match(css, /html\.report-scrollbar-pending::-webkit-scrollbar\{[^}]*width:0!important[^}]*height:0!important[^}]*display:none!important/u);
  assert.match(source, /const scrollbarIntentEvents = \['pointerdown','touchstart','wheel'\]/u);
  assert.match(source, /scrollbarInteractionSeen = true;[\s\S]*?if \(scrollbarMayReveal\) revealScrollbar\(\)/u);
  assert.match(source, /root\.classList\.remove\('report-scrollbar-pending'\)/u);
  assert.match(source, /scrollbarMayReveal = true;\n    if \(scrollbarInteractionSeen\) revealScrollbar\(\)/u);
  const html = injectReportEntryIntro('<html lang="zh-Hant"><head></head><body><main>report</main></body></html>');
  assert.match(html, /<html lang="zh-Hant" class="report-scrollbar-pending">/u);
});

test('entry runtime types the ident and starts the title stage only after ident exit and a deliberate black beat', () => {
  const source = introScript();
  assert.match(source, /const text = 'TREEPOLO'\.slice\(0,typedCount\)/u);
  assert.match(source, /identTree\.textContent = text\.slice\(0,4\)/u);
  assert.match(source, /identPolo\.textContent = text\.slice\(4\)/u);
  assert.match(source, new RegExp(`setTimeout\\(typeNextCharacter,${TYPE_START_DELAY_MS}\\)`,'u'));
  assert.match(source, new RegExp(`setTimeout\\(typeNextCharacter,${TYPE_INTERVAL_MS}\\)`,'u'));
  assert.match(source, new RegExp(`setTimeout\\(\\(\\) => overlay\\.classList\\.add\\('is-ident-exit'\\),${IDENT_DURATION_MS - IDENT_EXIT_MS}\\)`,'u'));
  assert.match(source, new RegExp(`setTimeout\\(beginTitleStage,${IDENT_DURATION_MS} \\+ ${TITLE_STAGE_GAP_MS}\\)`,'u'));
});

test('reveal slides the report sheet from a truly viewport-centered title bar and resolves phone geometry to its fixed-header layout', () => {
  const source = introScript().match(/<script data-report-entry-intro-runtime>\s*([\s\S]*?)\s*<\/script>/u)?.[1];
  assert.ok(source);
  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(source, /const phoneQuery = window\.matchMedia\('\(max-width: 700px\)'\)/u);
  assert.match(source, /const isPhoneLayout = phoneQuery\.matches/u);
  assert.match(source, /reportBody = document\.createElement\('div'\)/u);
  assert.match(source, /reportBody\.dataset\.reportEntryBody = 'true'/u);
  assert.match(source, /reportBodyInner = document\.createElement\('div'\)/u);
  assert.match(source, /reportBodyInner\.dataset\.reportEntryBodyInner = 'true'/u);
  assert.match(source, /contentNodes\.forEach\(\(node\) => reportBodyInner\.append\(node\)\)/u);
  assert.match(source, /reportBody\.append\(reportBodyInner\)/u);
  assert.match(source, /node !== header && !node\.classList\?\.contains\('report-fixed-header-spacer'\)/u);
  assert.match(source, /const phoneContentTop = isPhoneLayout[\s\S]*?window\.getComputedStyle\(contentNodes\[0\]\)\.marginTop/u);
  assert.match(source, /const initialHeaderRect = header\.getBoundingClientRect\(\)/u);
  assert.match(source, /const headerHeight = initialHeaderRect\.height/u);
  assert.match(source, /const sheetStartY = isPhoneLayout \? -headerHeight : 0/u);
  assert.match(source, /const sheetEndY = isPhoneLayout \? 0 : headerHeight/u);
  assert.match(source, /reportBody\.style\.marginTop = \(-headerHeight\) \+ 'px'/u);
  assert.match(source, /reportBody\.style\.background = 'transparent'/u);
  assert.match(source, /reportBodyInner\.style\.display = 'flow-root'/u);
  assert.match(source, /reportBodyInner\.style\.paddingTop = phoneContentTop \+ 'px'/u);
  assert.match(source, /reportBodyInner\.style\.background = '#fff'/u);
  assert.match(source, /reportBodyInner\.style\.transform = 'translateY\(' \+ sheetStartY \+ 'px'\)/u);
  assert.match(source, /reportBody\.style\.zIndex = '1'/u);
  assert.match(source, /header\.style\.setProperty\('z-index','2','important'\)/u);
  assert.match(source, /header\.style\.setProperty\('border-bottom-color','transparent','important'\)/u);
  assert.match(source, /header\.style\.setProperty\('opacity','0'\)/u);
  assert.match(source, /header\.style\.removeProperty\('border-bottom-color'\)/u);
  assert.match(source, /header\.style\.removeProperty\('opacity'\)/u);
  assert.doesNotMatch(source, /seamOffset|naturalBodyRect|border-bottom-width|margin-bottom','0px/u);
  assert.match(source, /reportBodyInner\.scrollHeight/u);
  assert.match(source, /Math\.ceil\(reportBodyInner\.getBoundingClientRect\(\)\.height\)/u);
  assert.match(source, /const targetBodyHeight = Math\.ceil\(contentHeight \+ Math\.max\(0,sheetEndY\)\)/u);
  assert.match(source, /const positionedHeaderRect = header\.getBoundingClientRect\(\)/u);
  assert.match(source, /const visualViewport = window\.visualViewport/u);
  assert.match(source, /visualViewport\.offsetTop \+ visualViewport\.height \/ 2/u);
  assert.match(source, /const dy = viewportCenterY - \(positionedHeaderRect\.top \+ positionedHeaderRect\.height \/ 2\)/u);
  assert.match(source, /revealState = \{ dy, sheetStartY, sheetEndY, targetBodyHeight \}/u);
  assert.match(source, /reportBody\.style\.height = '0px'/u);
  assert.match(source, /reportBody\.style\.overflow = 'hidden'/u);
  assert.match(source, /reportBody\.style\.transform = 'translateY\(' \+ dy \+ 'px'\)/u);
  assert.match(source, /header\.style\.setProperty\('transform','translateY\(' \+ dy \+ 'px'\)'\)/u);
  assert.match(source, new RegExp(`const headerAnimation = header\\.animate\\([\\s\\S]*?offset: 0\\.06[\\s\\S]*?duration: ${HEADER_MOVE_DURATION_MS}[\\s\\S]*?easing: 'cubic-bezier\\(\\.22,\\.72,\\.16,1\\)'`,'u'));
  assert.match(source, new RegExp(`const bodyPositionAnimation = reportBody\\.animate\\([\\s\\S]*?offset: 0\\.06[\\s\\S]*?duration: ${HEADER_MOVE_DURATION_MS}[\\s\\S]*?easing: 'cubic-bezier\\(\\.22,\\.72,\\.16,1\\)'`,'u'));
  assert.match(source, new RegExp(`const bodyHeightAnimation = reportBody\\.animate\\([\\s\\S]*?height: targetBodyHeight \\+ 'px'[\\s\\S]*?duration: ${REVEAL_DURATION_MS}[\\s\\S]*?easing: 'linear'`,'u'));
  assert.match(source, new RegExp(`const sheetSlideAnimation = reportBodyInner\\.animate\\([\\s\\S]*?sheetStartY[\\s\\S]*?sheetEndY[\\s\\S]*?duration: ${REVEAL_DURATION_MS}[\\s\\S]*?easing: 'linear'`,'u'));
  assert.match(source, /const unwrapReportBody = \(\) =>/u);
  assert.match(source, /const source = reportBodyInner \|\| reportBody/u);
  assert.match(source, /while \(source\.firstChild\) main\.insertBefore\(source\.firstChild,reportBody\)/u);
  assert.doesNotMatch(source, /clipPath|clip-path/u);
  assert.doesNotMatch(source, /main\.style\.setProperty\('transform'/u);
  assert.doesNotMatch(source, /opacity:\s*0[^\n]*reportBody|reportBody[^\n]*opacity/u);
  assert.doesNotMatch(source, /desiredHeroFontSize|heroScale|titleAnimation|TITLE_SHRINK|TITLE_HERO/u);
  assert.match(source, new RegExp(`titleBarTimer = window\\.setTimeout\\([\\s\\S]*?beginReportReveal,[\\s\\S]*?${TITLE_STAGE_FADE_MS} \\+ ${TITLE_BAR_HOLD_MS}`,'u'));
});

test('by 小樹Polo types in while the report body unfolds', () => {
  const source = introScript();
  assert.match(source, /const signatureByNode = signature \? \[\.\.\.signature\.childNodes\]\.find\(\(node\) => node\.nodeType === 3\)/u);
  assert.match(source, /signatureByNode\.nodeValue = ''/u);
  assert.match(source, /signatureTree\.textContent = ''/u);
  assert.match(source, /signaturePolo\.textContent = ''/u);
  assert.match(source, /const text = 'by小樹Polo'\.slice\(0,signatureTypedCount\)/u);
  assert.match(source, /signatureByNode\.nodeValue = text\.slice\(0,2\)/u);
  assert.match(source, /signatureTree\.textContent = text\.slice\(2,4\)/u);
  assert.match(source, /signaturePolo\.textContent = text\.slice\(4\)/u);
  assert.match(source, new RegExp(`setTimeout\\(typeNextSignatureCharacter,${SIGNATURE_TYPE_INTERVAL_MS}\\)`,'u'));
  assert.match(source, /body\.classList\.add\('report-entry-report-reveal'\)[\s\S]*?signatureTypeTimer = window\.setTimeout\(typeNextSignatureCharacter,0\)/u);
  assert.match(source, /restoreSignature/u);
});

test('post-entry help cue has a larger smooth falloff with only a small fully transparent center', () => {
  const css = introStyle();
  const source = introScript();
  assert.match(css, /body\.report-entry-help-cue-active::after\{[^}]*radial-gradient\(circle max\(160px,30vw\)/u);
  assert.match(css, /rgba\(0,0,0,0\) 6%/u);
  assert.match(css, /rgba\(0,0,0,\.025\) 16%/u);
  assert.match(css, /rgba\(0,0,0,\.41\) 65%/u);
  assert.match(css, /rgba\(0,0,0,\.88\) 100%/u);
  assert.match(css, /report-help-trigger::after\{[^}]*inset:-6px[^}]*border:2px solid rgba\(178,255,213,\.96\)/u);
  assert.match(source, /const rect = helpTrigger\.getBoundingClientRect\(\)/u);
  assert.match(source, /--report-help-cue-x/u);
  assert.match(source, /--report-help-cue-y/u);
  assert.match(source, new RegExp(`setTimeout\\(stopHelpCue,${HELP_CUE_DURATION_MS}\\)`,'u'));
});

test('entry runtime replays on every load without session or history gating', () => {
  const source = introScript();
  assert.doesNotMatch(source, /sessionStorage|history\.state|history\.replaceState|treePoloEntrySeen|readSessionSeen|readHistorySeen|markEntrySeen/u);
  assert.match(source, /root\.classList\.add\('report-entry-intro-lock'\)/u);
  assert.match(source, new RegExp(`typeTimer = window\\.setTimeout\\(typeNextCharacter,${TYPE_START_DELAY_MS}\\)`,'u'));
  assert.match(source, new RegExp(`identTimer = window\\.setTimeout\\(beginTitleStage,${IDENT_DURATION_MS} \\+ ${TITLE_STAGE_GAP_MS}\\)`,'u'));
});

test('help cue is claimed once per report URL with persistent local storage', () => {
  const source = introScript();
  assert.match(source, /const helpCueStorageKey = 'treepolo-report-help-cue-seen:' \+ String\(location\.href\)\.split\('#'\)\[0\]/u);
  assert.match(source, /localStorage\.getItem\(helpCueStorageKey\) === '1'/u);
  assert.match(source, /localStorage\.setItem\(helpCueStorageKey,'1'\)/u);
  assert.match(source, /const shouldShowHelpCue = claimHelpCue\(\)/u);
  assert.match(source, /if \(shouldShowHelpCue\) startHelpCue\(\)/u);
  assert.ok(source.indexOf('const shouldShowHelpCue = claimHelpCue();') < source.indexOf("root.classList.add('report-entry-intro-lock')"));
});

test('entry runtime blocks report interaction and consumes the activation click anywhere', () => {
  const source = introScript();
  assert.match(source, /const blockedEvents = \['wheel','touchmove','keydown'\]/u);
  assert.match(source, /event\.preventDefault\(\)/u);
  assert.match(source, /event\.stopImmediatePropagation\(\)/u);
  assert.match(source, /document\.addEventListener\('click',skipEntry,\{ capture:true,passive:false \}\)/u);
  assert.match(source, /document\.removeEventListener\('click',skipEntry,true\)/u);
  assert.doesNotMatch(source, /document\.addEventListener\('(pointerdown|touchstart)',skipEntry/u);
  assert.doesNotMatch(source, /swallowNextClick|suppressClickTimer/u);
  assert.match(source, /finishEntry\(true\)/u);
  assert.doesNotMatch(introMarkup(), /skip|跳過/iu);
});

test('entry intro runtime keeps a restrained local intro sound without shimmer', () => {
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

test('renderer injects fixed header before the entry intro runtime', async () => {
  const source = await fs.readFile(path.join(repositoryRoot, 'src', 'export', 'report-renderer.js'), 'utf8');
  assert.match(source, /require\('\.\/report-entry-intro'\)/u);
  assert.doesNotMatch(source, /report-entry-spotlight/u);
  const fixedIndex = source.indexOf('html = injectReportFixedHeaderRuntime(html);');
  const introIndex = source.indexOf('html = injectReportEntryIntro(html);');
  assert.ok(fixedIndex >= 0);
  assert.ok(introIndex > fixedIndex);
});