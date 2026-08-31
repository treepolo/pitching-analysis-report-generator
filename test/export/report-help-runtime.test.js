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
  assert.match(script, /if \(event\.key !== 'Escape'\) return/u);
  assert.match(script, /dialog\.addEventListener\('click', \(event\) => event\.stopPropagation\(\)\)/u);
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

test('help is injected as self-contained CSS markup and script', () => {
  const base = '<html><head></head><body><main>report</main></body></html>';
  const html = injectReportHelpHtml(base);
  assert.match(html, /data-report-help-style/u);
  assert.match(html, /data-report-help-open/u);
  assert.match(html, /data-report-help-backdrop/u);
  assert.match(html, /data-report-help-runtime/u);
  assert.match(html, /data-report-help-tutorial/u);
});
