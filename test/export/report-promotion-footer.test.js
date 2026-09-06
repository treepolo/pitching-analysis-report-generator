'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  SOCIAL_LINKS,
  injectReportPromotionFooter,
  promotionFooterMarkup,
  promotionFooterStyle,
} = require('../../src/export/report-promotion-footer');

test('promotion footer exposes clickable platform icon and brand name in one anchor', () => {
  const markup = promotionFooterMarkup({ logoRelativePath: 'images/tree-polo-logo.webp' });
  for (const [kind, label, href] of SOCIAL_LINKS) {
    assert.match(markup, new RegExp(`tree-polo-promotion-link-${kind}`, 'u'));
    assert.match(markup, new RegExp(href.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
    assert.match(markup, new RegExp(`tree-polo-promotion-name">${label}`, 'u'));
  }
  assert.match(markup, /target="_blank" rel="noopener noreferrer"/u);
  assert.match(markup, /希望我的洞察，能在你追求卓越的路上幫<span class="tree-polo-footer-no-break-tail">上忙。<\/span>/u);
  assert.match(markup, /<img class="tree-polo-footer-logo" src="images\/tree-polo-logo\.webp"/u);
});

test('footer closing sentence keeps its final three characters together without a forced line break', () => {
  const markup = promotionFooterMarkup();
  const css = promotionFooterStyle();
  assert.match(markup, /<span class="tree-polo-footer-no-break-tail">上忙。<\/span>/u);
  assert.doesNotMatch(markup, /<br\b/iu);
  assert.match(css, /\.tree-polo-footer-no-break-tail\{white-space:nowrap\}/u);
});

test('social promotion sits inside the footer between closing message and brand signature', () => {
  const markup = promotionFooterMarkup({ logoRelativePath: 'images/tree-polo-logo.webp' });
  const footerIndex = markup.indexOf('data-tree-polo-footer');
  const messageIndex = markup.indexOf('tree-polo-footer-message');
  const promotionIndex = markup.indexOf('data-tree-polo-promotion');
  const brandIndex = markup.indexOf('tree-polo-footer-brand');
  const footerCloseIndex = markup.indexOf('</footer>');
  assert.ok(footerIndex >= 0);
  assert.ok(messageIndex > footerIndex);
  assert.ok(promotionIndex > messageIndex);
  assert.ok(brandIndex > promotionIndex);
  assert.ok(footerCloseIndex > brandIndex);
});

test('promotion footer owns its component style and injects exactly once', () => {
  const css = promotionFooterStyle();
  assert.match(css, /data-report-promotion-footer-style/u);
  assert.match(css, /\.tree-polo-footer\{margin:64px 20px 0/u);
  assert.match(css, /\.tree-polo-promotion\{width:min\(760px,100%\);margin:0 auto 30px/u);
  assert.match(css, /\.tree-polo-promotion-link:hover/u);
  const source = '<html><head></head><body><main><p>report</p></main></body></html>';
  const once = injectReportPromotionFooter(source, { logoRelativePath: 'images/tree-polo-logo.webp' });
  const twice = injectReportPromotionFooter(once, { logoRelativePath: 'images/tree-polo-logo.webp' });
  assert.equal((twice.match(/data-report-promotion-footer-style/g) || []).length, 1);
  assert.equal((twice.match(/data-tree-polo-promotion/g) || []).length, 1);
  assert.equal((twice.match(/data-tree-polo-footer>/g) || []).length, 1);
});
