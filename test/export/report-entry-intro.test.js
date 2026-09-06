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
  TITLE_HOLD_MS,
  REVEAL_DURATION_MS,
  HELP_CUE_DURATION_MS,
  injectReportEntryIntro,
  introMarkup,
  introScript,
  introStyle,
} = require('../../src/export/report-entry-intro');

const repositoryRoot = path.resolve(__dirname, '..', '..');

test('entry intro is a clean centered TREEPOLO typing ident with plain split colors', () => {
  const css = introStyle();
  assert.match(css, /\.report-entry-intro\{[^}]*position:fixed[^}]*background:#000/u);
  assert.match(css, /\.tree-polo-ident-word\{[^}]*display:inline-flex[^}]*width:max-content[^}]*justify-content:center/u);
  assert.match(css, /\.tree-polo-ident-word\{[^}]*font-family:Arial,Helvetica,"Segoe UI",sans-serif/u);
  assert.match(css, /\.tree-polo-ident-tree\{color:#00a65a\}/u);
  assert.match(css, /\.tree-polo-ident-polo\{color:#f5f5f5\}/u);
  assert.doesNotMatch(css, /tree-polo-ident-char|tree-polo-ident-mark|tree-polo-ident-spectrum|tree-polo-ident-vignette/u);
  assert.doesNotMatch(css, /text-shadow|filter:blur|linear-gradient|radial-gradient/u);
  assert.match(css, /report-entry-intro-active \.report-help-trigger/u);
  assert.match(css, /visibility:hidden!important/u);
});

test('entry timing keeps a longer pure-black lead-in and a longer isolated title hold', () => {
  assert.ok(TYPE_START_DELAY_MS >= 650);
  assert.ok(IDENT_DURATION_MS >= 2800);
  assert.ok(IDENT_EXIT_MS >= 220);
  assert.ok(TITLE_HOLD_MS >= 1000);
  assert.ok(REVEAL_DURATION_MS >= 1600);
});

test('entry intro hides the report before title stage and fully retires the word before report reveal', () => {
  const css = introStyle();
  assert.match(css, /body\.report-entry-intro-active>main\{visibility:hidden\}/u);
  assert.match(css, /body\.report-entry-title-stage>main\{visibility:visible\}/u);
  assert.match(css, /\.report-entry-intro\.is-ident-exit \.tree-polo-ident-word\{opacity:0\}/u);
  assert.match(css, /\.report-entry-intro\.is-title-stage \.tree-polo-ident-word\{opacity:0\}/u);
  assert.match(css, /report-entry-intro-active\[data-tree-polo-background="true"\]::before\{opacity:0\}/u);
  assert.match(css, /report-entry-report-reveal\[data-tree-polo-background="true"\]::before/u);
  assert.match(css, /@keyframes tree-polo-report-light-up/u);
});

test('entry intro markup starts with zero-width TREE and POLO spans so typing grows from screen center', () => {
  const markup = introMarkup();
  assert.match(markup, /aria-label="TREEPOLO"/u);
  assert.match(markup, /data-tree-polo-ident-tree><\/span><span class="tree-polo-ident-polo" data-tree-polo-ident-polo><\/span>/u);
  assert.doesNotMatch(markup, />TREEPOLO</u);
  assert.doesNotMatch(markup, /tree-polo-ident-char|tree-polo-ident-mark|tree-polo-ident-spectrum|tree-polo-ident-vignette/u);
});

test('entry runtime types by changing centered span contents and separates ident exit from title stage', () => {
  const source = introScript();
  assert.match(source, /const text = 'TREEPOLO'\.slice\(0,typedCount\)/u);
  assert.match(source, /identTree\.textContent = text\.slice\(0,4\)/u);
  assert.match(source, /identPolo\.textContent = text\.slice\(4\)/u);
  assert.match(source, new RegExp(`setTimeout\\(typeNextCharacter,${TYPE_START_DELAY_MS}\\)`,'u'));
  assert.match(source, new RegExp(`setTimeout\\(typeNextCharacter,${TYPE_INTERVAL_MS}\\)`,'u'));
  assert.match(source, new RegExp(`setTimeout\\(\\(\\) => overlay\\.classList\\.add\\('is-ident-exit'\\),${IDENT_DURATION_MS - IDENT_EXIT_MS}\\)`,'u'));
  assert.match(source, new RegExp(`setTimeout\\(beginTitleStage,${IDENT_DURATION_MS}\\)`,'u'));
  assert.match(source, new RegExp(`setTimeout\\(beginReportReveal,${TITLE_HOLD_MS}\\)`,'u'));
});

test('entry runtime starts with an enlarged text-width title frame then expands to canonical report geometry', () => {
  const script = introScript();
  const source = script.match(/<script data-report-entry-intro-runtime>\s*([\s\S]*?)\s*<\/script>/u)?.[1];
  assert.ok(source);
  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(source, /const title = header\?\.querySelector\('h1'\)/u);
  assert.match(source, /const targetWidth = Math\.max\(1,Math\.ceil\(naturalMainRect\.width\)\)/u);
  assert.match(source, /const targetHeight = Math\.max\(1,Math\.ceil\(naturalMainRect\.height\)\)/u);
  assert.match(source, /title\?\.scrollWidth/u);
  assert.match(source, /const frameWidth = Math\.max\(180,Math\.min\(targetWidth,titleWidth \+ framePadding\)\)/u);
  assert.match(source, /const initialScale = Math\.min\(1\.34,scaleLimit\)/u);
  assert.match(source, /main\.style\.setProperty\('width',frameWidth \+ 'px'\)/u);
  assert.match(source, /main\.style\.setProperty\('height',collapsedHeight \+ 'px'\)/u);
  assert.match(source, /main\.style\.setProperty\('transform','translateY\(' \+ dy \+ 'px\) scale\(' \+ initialScale \+ '\)'\)/u);
  assert.match(source, /main\.style\.setProperty\('overflow','hidden','important'\)/u);
  assert.doesNotMatch(source, /setProperty\('height',[^\n]*'important'\)/u);
  assert.doesNotMatch(source, /setProperty\('width',[^\n]*'important'\)/u);
  assert.doesNotMatch(source, /setProperty\('transform',[^\n]*'important'\)/u);
  assert.match(source, /const mainAnimation = main\.animate\(/u);
  assert.match(source, /height: targetHeight \+ 'px'/u);
  assert.match(source, /width: targetWidth \+ 'px'/u);
  assert.match(source, /transform: 'translateY\(0px\) scale\(1\)'/u);
  assert.doesNotMatch(source, /clipPath|header\.animate\(|sections\.forEach/u);
  assert.match(source, /treepolo:entry-start/u);
  assert.match(source, /treepolo:entry-complete/u);
});

test('post-entry help cue dims everything outside help and pulses a bright ring without extra cue markup', () => {
  const css = introStyle();
  const source = introScript();
  assert.match(css, /body\.report-entry-help-cue-active \.report-help-trigger\{[^}]*z-index:4100!important/u);
  assert.match(css, /report-help-trigger::before\{[^}]*box-shadow:0 0 0 100vmax rgba\(0,0,0,\.52\)/u);
  assert.match(css, /report-help-trigger::after\{[^}]*border:2px solid rgba\(178,255,213,\.96\)/u);
  assert.match(css, /@keyframes report-entry-help-ring/u);
  assert.match(css, /25%,75%/u);
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
