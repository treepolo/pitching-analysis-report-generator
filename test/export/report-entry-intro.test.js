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
});

test('entry runtime collapses the actual report main to header height then expands its real height', () => {
  const script = introScript();
  const source = script.match(/<script data-report-entry-intro-runtime>\s*([\s\S]*?)\s*<\/script>/u)?.[1];
  assert.ok(source);
  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(source, /const main = document\.querySelector\('body>main'\)/u);
  assert.match(source, /header\.getBoundingClientRect\(\)/u);
  assert.match(source, /main\.getBoundingClientRect\(\)/u);
  assert.match(source, /const targetHeight = Math\.max\(1,Math\.ceil\(mainRect\.height\)\)/u);
  assert.match(source, /const collapsedHeight = Math\.max\(1,Math\.min\(targetHeight,Math\.ceil\(headerRect\.bottom - mainRect\.top\)\)\)/u);
  assert.match(source, /main\.style\.setProperty\('height',collapsedHeight \+ 'px','important'\)/u);
  assert.match(source, /main\.style\.setProperty\('overflow','hidden','important'\)/u);
  assert.match(source, /const mainAnimation = main\.animate\(/u);
  assert.match(source, /height: collapsedHeight \+ 'px'/u);
  assert.match(source, /height: targetHeight \+ 'px'/u);
  assert.doesNotMatch(source, /clipPath|header\.animate\(|sections\.forEach/u);
  assert.match(source, /treepolo:entry-start/u);
  assert.match(source, /treepolo:entry-complete/u);
  assert.match(source, new RegExp(`setTimeout\\(beginReportReveal,${TITLE_HOLD_MS}\\)`,'u'));
  assert.ok(REVEAL_DURATION_MS > 0);
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
