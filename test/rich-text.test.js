'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  appendPlainText,
  escapeRichTextPlain,
  sanitizeHref,
  sanitizeRichTextEditorHtml,
  sanitizeRichTextHtml,
} = require('../src/rich-text');

test('sanitizes editor formatting while preserving the supported semantic subset', () => {
  const html = sanitizeRichTextEditorHtml(
    '<strong>粗體</strong><em>斜體</em><a href="https://example.com" onclick="alert(1)">連結</a><br><script>alert(1)</script>',
  );
  assert.equal(html, '<strong>粗體</strong><em>斜體</em><a href="https://example.com">連結</a><br>');
});

test('rejects unsafe links and preserves plain text as escaped markup', () => {
  assert.equal(sanitizeHref('javascript:alert(1)'), null);
  assert.equal(sanitizeHref('data:text/html,evil'), null);
  assert.equal(sanitizeHref('//evil.example/path'), null);
  assert.equal(sanitizeHref('/report/page'), '/report/page');
  assert.equal(escapeRichTextPlain('<tag>\n下一行'), '&lt;tag&gt;<br>下一行');
  assert.equal(sanitizeRichTextHtml('<a href="javascript:bad">文字</a>'), '文字');
});

test('appends imported plain text without allowing markup injection', () => {
  assert.equal(
    appendPlainText('<strong>既有</strong>', '<img src=x onerror=alert(1)>\n新段落'),
    '<strong>既有</strong><br><br>&lt;img src=x onerror=alert(1)&gt;<br>新段落',
  );
});
