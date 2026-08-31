'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');

const {
  helpCss,
  helpMarkup,
  helpScript,
  injectReportHelpHtml,
} = require('../../src/export/report-help-runtime');

test('report help runtime compiles as browser JavaScript', () => {
  const script = helpScript().match(/<script data-report-help-runtime>\s*([\s\S]*?)\s*<\/script>/u)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new vm.Script(script));
});

test('help dialog stays inset so the underlying report remains visible', () => {
  const css = helpCss();
  assert.match(css, /\.report-help-backdrop\{[^}]*padding:5vh 6vw/u);
  assert.match(css, /\.report-help-dialog\{[^}]*width:min\(900px,88vw\)[^}]*max-height:84vh/u);
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

test('help content includes annotated controls and shortcut explanations', () => {
  const markup = helpMarkup();
  assert.match(markup, /data-report-help-open/u);
  assert.match(markup, /報告播放器使用教學/u);
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

test('tutorial mode targets real exported controls rather than a separate mock player', () => {
  const script = helpScript();
  assert.match(script, /figure\.report-video/u);
  assert.match(script, /\[data-frame-action="toggle"\]/u);
  assert.match(script, /\[data-frame-timeline\]/u);
  assert.match(script, /\[data-frame-rate\]/u);
  assert.match(script, /\[data-annotation-jump="previous"\]/u);
  assert.match(script, /\[data-annotation-jump="next"\]/u);
  assert.match(script, /\.report-annotation-controls/u);
  assert.match(script, /report-help-live-marker/u);
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
