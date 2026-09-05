'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const {
  HELP_ITEMS,
  helpCss,
  helpMarkup,
  helpScript,
  injectReportHelpHtml,
} = require('../../src/export/report-help-runtime');

const repositoryRoot = path.resolve(__dirname, '..', '..');

test('report help runtime compiles as browser JavaScript', () => {
  const script = helpScript().match(/<script data-report-help-runtime>\s*([\s\S]*?)\s*<\/script>/u)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new vm.Script(script));
});

test('help component owns inset dialog geometry without owning product skin', () => {
  const css = helpCss();
  assert.match(css, /\.report-help-backdrop\{[^}]*padding:5vh 6vw/u);
  assert.match(css, /\.report-help-dialog\{[^}]*width:min\(940px,88vw\)[^}]*max-height:84vh/u);
  assert.match(css, /\.report-help-header\{[^}]*position:relative[^}]*padding:24px 28px 18px/u);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}|linear-gradient|box-shadow:/iu);
  assert.doesNotMatch(css, /\.report-help-dialog\{[^}]*width:100vw/u);
  assert.doesNotMatch(css, /\.report-help-dialog\{[^}]*height:100vh/u);
});

test('clicking outside the help panel and pressing Escape close the help', () => {
  const script = helpScript();
  assert.match(script, /if \(event\.target === backdrop\) closeHelp\(\)/u);
  assert.match(script, /event\.key === 'Escape'/u);
  assert.match(script, /dialog\.addEventListener\('click', \(event\) => event\.stopPropagation\(\)\)/u);
});

test('help modal blocks report playback shortcuts while it is open', () => {
  const script = helpScript();
  assert.match(script, /if \(!backdrop\.hidden\)/u);
  assert.match(script, /event\.key === 'ArrowLeft'/u);
  assert.match(script, /event\.key === 'ArrowRight'/u);
  assert.match(script, /event\.code === 'KeyA'/u);
  assert.match(script, /event\.code === 'KeyD'/u);
  assert.match(script, /event\.stopImmediatePropagation\(\)/u);
});

test('help content includes every control and shortcut explanation', () => {
  const markup = helpMarkup();
  assert.equal(HELP_ITEMS.length, 12);
  assert.match(markup, /data-report-help-open/u);
  assert.match(markup, /報告播放器使用教學/u);
  assert.match(markup, /data-report-help-preview/u);
  for (let number = 1; number <= 12; number += 1) {
    assert.match(markup, new RegExp(`data-report-help-item="${number}"`, 'u'));
  }
  assert.match(markup, /上一標註幀/u);
  assert.match(markup, /下一標註幀/u);
  assert.match(markup, /標註顯示/u);
  assert.match(markup, /<kbd>Space<\/kbd>/u);
  assert.match(markup, /<kbd>A<\/kbd>/u);
  assert.match(markup, /<kbd>D<\/kbd>/u);
});

test('help illustration clones the actual exported player instead of drawing a mock control bar', () => {
  const script = helpScript();
  const markup = helpMarkup();
  assert.match(script, /const clone = player\.cloneNode\(true\)/u);
  assert.match(script, /previewHost\.append\(clone\)/u);
  assert.match(script, /clone\.querySelectorAll\('video'\)/u);
  assert.match(script, /video\.removeAttribute\('src'\)/u);
  assert.match(script, /player\.querySelector\('\.report-annotation-controls'\)/u);
  assert.doesNotMatch(markup, /report-help-demo-screen/u);
  assert.doesNotMatch(markup, /report-help-demo-controls/u);
});

test('tutorial mode targets real controls and provides persistent text guidance', () => {
  const script = helpScript();
  const markup = helpMarkup();
  assert.match(script, /figure\.report-video/u);
  assert.match(script, /\[data-frame-action="toggle"\]/u);
  assert.match(script, /\[data-frame-timeline\]/u);
  assert.match(script, /\[data-frame-rate\]/u);
  assert.match(script, /\[data-annotation-jump="previous"\]/u);
  assert.match(script, /\[data-annotation-jump="next"\]/u);
  assert.match(script, /\.report-annotation-controls/u);
  assert.match(script, /tutorialDescription\.textContent = guide\?\.text/u);
  assert.match(script, /activeGuideIndex = index/u);
  assert.match(markup, /data-report-help-tutorial-panel/u);
  assert.match(markup, /data-report-help-tutorial-title/u);
  assert.match(markup, /data-report-help-tutorial-description/u);
  assert.match(markup, /data-report-help-tutorial-previous/u);
  assert.match(markup, /data-report-help-tutorial-next/u);
  assert.match(markup, /data-report-help-tutorial-stop>結束教學/u);
});

test('help runtime owns speed-slider marker geometry without a post-render refinement', async () => {
  const script = helpScript();
  assert.match(script, /function sliderMarkerPoint\(slider\)/u);
  assert.match(script, /const thumbHalfWidth = 4/u);
  assert.match(script, /guide\?\.number === 7/u);
  assert.match(script, /target\?\.matches\?\.\('\[data-frame-rate\]'\)/u);
  assert.match(script, /const point = markerPoint\(target, guide\)/u);
  assert.match(script, /point\.x - hostRect\.left/u);
  assert.match(script, /window\.scrollX \+ point\.x/u);
  assert.match(script, /document\.addEventListener\('input', refreshSliderMarker, true\)/u);
  assert.match(script, /document\.addEventListener\('change', refreshSliderMarker, true\)/u);
  assert.doesNotMatch(script, /MutationObserver/u);
  const renderer = await fs.readFile(path.join(repositoryRoot, 'src', 'export', 'report-renderer.js'), 'utf8');
  assert.doesNotMatch(renderer, /report-help-marker-refinement|injectReportHelpMarkerRefinement/u);
});

test('tutorial mode has direct exit and full-guide actions', () => {
  const script = helpScript();
  assert.match(script, /tutorialStop\.addEventListener\('click', stopTutorial\)/u);
  assert.match(script, /tutorialFull\?\.addEventListener\('click', \(\) => openHelp/u);
  assert.match(script, /if \(event\.key === 'Escape' && tutorialActive\)/u);
});

test('help is injected at the start of body so its capture handler owns modal shortcuts first', () => {
  const base = '<html><head></head><body><main>report</main><script>window.player=true;</script></body></html>';
  const html = injectReportHelpHtml(base);
  assert.match(html, /data-report-help-style/u);
  assert.match(html, /data-report-help-open/u);
  assert.match(html, /data-report-help-backdrop/u);
  assert.match(html, /data-report-help-runtime/u);
  assert.match(html, /data-report-help-tutorial/u);
  assert.ok(html.indexOf('data-report-help-runtime') < html.indexOf('<main>report</main>'));
  assert.ok(html.indexOf('data-report-help-runtime') < html.indexOf('window.player=true'));
});