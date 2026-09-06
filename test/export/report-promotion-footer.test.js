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
  assert.match(markup, /希望我的洞察，能在你追求卓越的路上幫上忙。/u);
  assert.match(markup, /<img class="tree-polo-footer-logo" src="images\/tree-polo-logo\.webp"/u);
});

test('promotion footer owns its component style and injects exactly once', () => {
  assert.match(promotionFooterStyle(), /data-report-promotion-footer-style/u);
  assert.match(promotionFooterStyle(), /\.tree-polo-promotion-link:hover/u);
  const source = '<html><head></head><body><main><p>report</p></main></body></html>';
  const once = injectReportPromotionFooter(source, { logoRelativePath: 'images/tree-polo-logo.webp' });
  const twice = injectReportPromotionFooter(once, { logoRelativePath: 'images/tree-polo-logo.webp' });
  assert.equal((twice.match(/data-report-promotion-footer-style/g) || []).length, 1);
  assert.equal((twice.match(/data-tree-polo-promotion/g) || []).length, 1);
  assert.equal((twice.match(/data-tree-polo-footer>/g) || []).length, 1);
});
