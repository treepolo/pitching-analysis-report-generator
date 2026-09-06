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
  TITLE_BAR_HOLD_MS,
  SIGNATURE_TYPE_INTERVAL_MS,
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

test('entry timing keeps a black lead-in, a final-size title-bar hold and a long reveal', () => {
  assert.ok(TYPE_START_DELAY_MS >= 650);
  assert.ok(IDENT_DURATION_MS >= 2800);
  assert.ok(IDENT_EXIT_MS >= 220);
  assert.ok(TITLE_BAR_HOLD_MS >= 500);
  assert.ok(SIGNATURE_TYPE_INTERVAL_MS >= 60);
  assert.ok(REVEAL_DURATION_MS >= 1600);
});

test('title stage uses the real final title bar without content-specific entrance effects', () => {
  const css = introStyle();
  assert.match(css, /body\.report-entry-title-stage>main\{visibility:visible\}/u);
  assert.doesNotMatch(css, /report-entry-content-in/u);
  assert.doesNotMatch(css, /report-entry-report-reveal>main>:not\(header\).*animation/u);
  assert.doesNotMatch(css, /report-entry-title-only|report-entry-title-bar/u);
  assert.doesNotMatch(css, /body\.report-entry-title-stage>main h1[^}]*transform/u);
});

test('background remains black until the report starts expanding and phone pre-reveal never paints the image', () => {
  const css = introStyle();
  assert.match(css, /report-entry-intro-active\[data-tree-polo-background="true"\]::before\{opacity:0\}/u);
  assert.match(css, /report-entry-report-reveal\[data-tree-polo-background="true"\]::before/u);
  assert.match(css, /@keyframes tree-polo-report-light-up/u);
  assert.match(css, /@media\(max-width:700px\)[\s\S]*?report-entry-intro-active:not\(\.report-entry-report-reveal\)\[data-tree-polo-background="true"\]::before\{[^}]*background-image:none!important[^}]*background-color:#000!important[^}]*opacity:0!important/u);
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

test('entry runtime types the ident and starts the title stage only after ident exit', () => {
  const source = introScript();
  assert.match(source, /const text = 'TREEPOLO'\.slice\(0,typedCount\)/u);
  assert.match(source, /identTree\.textContent = text\.slice\(0,4\)/u);
  assert.match(source, /identPolo\.textContent = text\.slice\(4\)/u);
  assert.match(source, new RegExp(`setTimeout\\(typeNextCharacter,${TYPE_START_DELAY_MS}\\)`,'u'));
  assert.match(source, new RegExp(`setTimeout\\(typeNextCharacter,${TYPE_INTERVAL_MS}\\)`,'u'));
  assert.match(source, new RegExp(`setTimeout\\(\\(\\) => overlay\\.classList\\.add\\('is-ident-exit'\\),${IDENT_DURATION_MS - IDENT_EXIT_MS}\\)`,'u'));
  assert.match(source, new RegExp(`setTimeout\\(beginTitleStage,${IDENT_DURATION_MS}\\)`,'u'));
});

test('reveal builds one temporary report body that unfolds from beneath the moving title bar', () => {
  const source = introScript().match(/<script data-report-entry-intro-runtime>\s*([\s\S]*?)\s*<\/script>/u)?.[1];
  assert.ok(source);
  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(source, /reportBody = document\.createElement\('div'\)/u);
  assert.match(source, /reportBody\.dataset\.reportEntryBody = 'true'/u);
  assert.match(source, /contentNodes\.forEach\(\(node\) => reportBody\.append\(node\)\)/u);
  assert.match(source, /node !== header && !node\.classList\?\.contains\('report-fixed-header-spacer'\)/u);
  assert.match(source, /reportBody\.style\.height = '0px'/u);
  assert.match(source, /reportBody\.style\.overflow = 'hidden'/u);
  assert.match(source, /reportBody\.style\.transform = 'translateY\(' \+ dy \+ 'px\)'/u);
  assert.match(source, /header\.style\.setProperty\('transform','translateY\(' \+ dy \+ 'px\)'\)/u);
  assert.match(source, /const headerAnimation = header\.animate\(/u);
  assert.match(source, /const bodyAnimation = reportBody\.animate\(/u);
  assert.match(source, /height: targetBodyHeight \+ 'px'/u);
  assert.match(source, /\{ transform: 'translateY\(0px\)', offset: 1 \}/u);
  assert.match(source, /const unwrapReportBody = \(\) =>/u);
  assert.match(source, /while \(reportBody\.firstChild\) main\.insertBefore\(reportBody\.firstChild,reportBody\)/u);
  assert.doesNotMatch(source, /clipPath|clip-path/u);
  assert.doesNotMatch(source, /main\.style\.setProperty\('transform'/u);
  assert.doesNotMatch(source, /opacity:\s*0[^\n]*reportBody|reportBody[^\n]*opacity/u);
  assert.doesNotMatch(source, /desiredHeroFontSize|heroScale|titleAnimation|TITLE_SHRINK|TITLE_HERO/u);
  assert.match(source, new RegExp(`setTimeout\\(beginReportReveal,${TITLE_BAR_HOLD_MS}\\)`,'u'));
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

test('entry runtime remembers this open instance so reload does not replay it', () => {
  const source = introScript();
  assert.match(source, /sessionStorage\.getItem\(storageKey\)/u);
  assert.match(source, /sessionStorage\.setItem\(storageKey,'1'\)/u);
  assert.match(source, /history\.state\[historyKey\] === true/u);
  assert.match(source, /history\.replaceState/u);
  assert.match(source, /if \(readSessionSeen\(\) \|\| readHistorySeen\(\)\)/u);
});

test('entry runtime blocks report interaction and allows invisible pointer or touch skip anywhere', () => {
  const source = introScript();
  assert.match(source, /const blockedEvents = \['wheel','touchmove','keydown'\]/u);
  assert.match(source, /event\.preventDefault\(\)/u);
  assert.match(source, /event\.stopImmediatePropagation\(\)/u);
  assert.match(source, /document\.addEventListener\('pointerdown',skipEntry/u);
  assert.match(source, /document\.addEventListener\('touchstart',skipEntry/u);
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

test('entry intro injects style, markup, and runtime exactly once', () => {
  const base = '<html><head></head><body><main>report</main></body></html>';
  const once = injectReportEntryIntro(base);
  const twice = injectReportEntryIntro(once);
  assert.equal((twice.match(/data-report-entry-intro-style/g) || []).length, 1);
  assert.equal((twice.match(/data-report-entry-intro-runtime/g) || []).length, 1);
  assert.equal((twice.match(/data-report-entry-intro aria-hidden/g) || []).length, 1);
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
