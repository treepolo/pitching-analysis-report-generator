'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { renderReportHtml } = require('../../src/export/report-renderer');

test('exports rich text formatting as sanitized semantic HTML', () => {
  const html = renderReportHtml({
    title: '格式測試',
    sections: [{
      title: '內容',
      blocks: [{
        type: 'rich-text',
        contentFormat: 'html',
        content: '<strong>粗體</strong><em>斜體</em><a href="https://example.com" onclick="bad()">超連結</a><script>bad()</script>',
      }],
    }],
  }, { assetManifest: [] });

  assert.match(html, /<strong>粗體<\/strong><em>斜體<\/em><a href="https:\/\/example\.com">超連結<\/a>/u);
  assert.doesNotMatch(html, /onclick|<script>bad/iu);
});
