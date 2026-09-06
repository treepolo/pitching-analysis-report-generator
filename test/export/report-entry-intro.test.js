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
  TITLE_HERO_HOLD_MS,
  TITLE_SHRINK_DURATION_MS,
  TITLE_SETTLE_HOLD_MS,
  TITLE_BAR_HOLD_MS,
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

test('entry timing gives black lead-in, hero title, settle, title bar and reveal distinct holds', () => {
  assert.ok(TYPE_START_DELAY_MS >= 650);
  assert.ok(IDENT_DURATION_MS >= 2800);
  assert.ok(IDENT_EXIT_MS >= 220);
  assert.ok(TITLE_HERO_HOLD_MS >= 700);
  assert.ok(TITLE_SHRINK_DURATION_MS >= 600);
  assert.ok(TITLE_SETTLE_HOLD_MS >= 350);
  assert.ok(TITLE_BAR_HOLD_MS >= 450);
  assert.ok(REVEAL_DURATION_MS >= 1600);
});

test('title-only stage has no frame or signature and title-bar stage restores both', () => {
  const css = introStyle();
  assert.match(css, /body\.report-entry-title-only>main\{[^}]*background:transparent!important[^}]*border-color:transparent!important[^}]*box-shadow:none!important/u);
  assert.match(css, /body\.report-entry-title-only>main header\.tree-polo-report-header[^}]*background:transparent!important/u);
  assert.match(css, /body\.report-entry-title-only>main h1\{color:#f5f5f5!important\}/u);
  assert.match(css, /body\.report-entry-title-only>main \.tree-polo-signature\{[^}]*position:absolute!important[^}]*opacity:0!important/u);
  assert.match(css, /body\.report-entry-title-bar>main\{[^}]*background:#fff!important[^}]*border-color:#e6e6e6!important/u);
  assert.match(css, /body\.report-entry-title-bar>main h1\{color:#242424!important\}/u);
  assert.match(css, /body\.report-entry-title-stage:not\(\.report-entry-report-reveal\)>main>:not\(header\)\{visibility:hidden\}/u);
});

test('background remains black before reveal and mobile explicitly suppresses the image pre-reveal', () => {
  const css = introStyle();
  assert.match(css, /report-entry-intro-active\[data-tree-polo-background="true"\]::before\{opacity:0\}/u);
  assert.match(css, /report-entry-report-reveal\[data-tree-polo-background="true"\]::before/u);
  assert.match(css, /@keyframes tree-polo-report-light-up/u);
  assert.match(css, /@media\(max-width:700px\)[\s\S]*?report-entry-intro-active:not\(\.report-entry-report-reveal\)\[data-tree-polo-background="true"\]::before\{[^}]*background-image:none!important[^}]*background-color:#000!important[^}]*opacity:0!important/u);
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

test('title hero matches ident scale, shrinks alone, then reveals bar and expands the actual report', () => {
  const script = introScript();
  const source = script.match(/<script data-report-entry-intro-runtime>\s*([\s\S]*?)\s*<\/script>/u)?.[1];
  assert.ok(source);
  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(source, /const title = header\?\.querySelector\('h1'\)/u);
  assert.match(source, /const signature = title\?\.querySelector\('\.tree-polo-signature'\)/u);
  assert.match(source, /Math\.min\(68,Math\.max\(38,viewportWidth \* \.12\)\)/u);
  assert.match(source, /Math\.min\(104,Math\.max\(44,viewportWidth \* \.072\)\)/u);
  assert.match(source, /const targetWidth = Math\.max\(1,Math\.ceil\(naturalMainRect\.width\)\)/u);
  assert.match(source, /const targetHeight = Math\.max\(1,Math\.ceil\(naturalMainRect\.height\)\)/u);
  assert.match(source, /const heroScale = Math\.max\(1,Math\.min\(requestedScale,widthSafeScale\)\)/u);
  assert.match(source, /main\.style\.setProperty\('width',targetWidth \+ 'px'\)/u);
  assert.match(source, /main\.style\.setProperty\('height',collapsedHeight \+ 'px'\)/u);
  assert.match(source, /main\.style\.setProperty\('transform','translateY\(' \+ dy \+ 'px\)'\)/u);
  assert.match(source, /title\.style\.setProperty\('transform','scale\(' \+ heroScale \+ '\)'\)/u);
  assert.match(source, /const titleAnimation = title\.animate\(/u);
  assert.match(source, /\{ transform: 'scale\(' \+ heroScale \+ '\)' \},\{ transform: 'scale\(1\)' \}/u);
  assert.match(source, /body\.classList\.remove\('report-entry-title-only'\)/u);
  assert.match(source, /body\.classList\.add\('report-entry-title-bar'\)/u);
  assert.match(source, /const signatureAnimation = signature\.animate/u);
  assert.match(source, new RegExp(`setTimeout\\(shrinkTitle,${TITLE_HERO_HOLD_MS}\\)`,'u'));
  assert.match(source, new RegExp(`setTimeout\\(settleTitle,${TITLE_SHRINK_DURATION_MS}\\)`,'u'));
  assert.match(source, new RegExp(`setTimeout\\(showTitleBar,${TITLE_SETTLE_HOLD_MS}\\)`,'u'));
  assert.match(source, new RegExp(`setTimeout\\(beginReportReveal,${TITLE_BAR_HOLD_MS}\\)`,'u'));
  assert.match(source, /body\.classList\.add\('report-entry-report-reveal'\)/u);
  assert.match(source, /const mainAnimation = main\.animate\(/u);
  assert.match(source, /height: targetHeight \+ 'px'/u);
  assert.match(source, /transform: 'translateY\(0px\)'/u);
  assert.doesNotMatch(source, /frameWidth|initialScale|clipPath|header\.animate\(|sections\.forEach/u);
  assert.doesNotMatch(source, /main\.style\.setProperty\('transform',[^\n]*scale/u);
  assert.match(source, /treepolo:entry-start/u);
  assert.match(source, /treepolo:entry-complete/u);
});

test('post-entry help cue uses a darker wide radial falloff and a much smaller pulsing ring', () => {
  const css = introStyle();
  const source = introScript();
  assert.match(css, /body\.report-entry-help-cue-active::after\{[^}]*radial-gradient\(circle max\(96px,16\.667vw\)/u);
  assert.match(css, /rgba\(0,0,0,\.86\) 100%/u);
  assert.match(css, /report-help-trigger::after\{[^}]*inset:-6px[^}]*border:2px solid rgba\(178,255,213,\.96\)/u);
  assert.doesNotMatch(css, /report-help-trigger::before\{[^}]*100vmax/u);
  assert.match(css, /@keyframes report-entry-help-ring/u);
  assert.match(css, /25%,75%/u);
  assert.match(source, /const rect = helpTrigger\.getBoundingClientRect\(\)/u);
  assert.match(source, /--report-help-cue-x/u);
  assert.match(source, /--report-help-cue-y/u);
  assert.match(source, /body\.classList\.add\('report-entry-help-cue-active'\)/u);
  assert.match(source, /document\.addEventListener\('pointerdown',helpCueDismissHandler,true\)/u);
  assert.match(source, /document\.addEventListener\('keydown',helpCueDismissHandler,true\)/u);
  assert.match(source, new RegExp(`setTimeout\\(stopHelpCue,${HELP_CUE_DURATION_MS}\\)`,'u'));
  assert.match(source, /startHelpCue\(\);/u);
  assert.doesNotMatch(introMarkup(), /help-cue|spotlight/iu);
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
