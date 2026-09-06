'use strict';

const BRAND_LOGO_RELATIVE_PATH = 'images/tree-polo-logo.webp';
const SOCIAL_LINKS = Object.freeze([
  ['instagram', 'Instagram', 'https://www.instagram.com/treepolooo/'],
  ['vocus', '方格子 vocus', 'https://vocus.cc/user/@treepolooo'],
  ['youtube', 'YouTube', 'https://www.youtube.com/@treepolo'],
]);

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function socialIcon(kind) {
  if (kind === 'instagram') {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.25" y="3.25" width="17.5" height="17.5" rx="5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17.55" cy="6.55" r="1.15" fill="currentColor"/></svg>';
  }
  if (kind === 'youtube') {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="4.4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M10 8.7 16 12l-6 3.3z" fill="currentColor"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.25" y="3.25" width="17.5" height="17.5" rx="4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7.2 7.2h3.1l1.75 6.25L13.8 7.2h3.05l-3.25 9.6h-3.2z" fill="currentColor"/></svg>';
}

function promotionFooterStyle() {
  return `<style data-report-promotion-footer-style>
.tree-polo-footer{margin:64px 20px 0;padding:38px 20px 28px;border-top:1px solid #ededed;text-align:center;color:#242424}
.tree-polo-footer-message{width:min(680px,100%);margin:0 auto 28px;font:600 clamp(18px,2.25vw,25px)/1.55 Georgia,"Noto Serif TC","PMingLiU",serif;letter-spacing:.015em;color:#242424}
.tree-polo-footer-brand{display:flex;align-items:center;justify-content:center;gap:10px;margin:0 auto 12px}.tree-polo-footer-logo{display:block;width:auto;height:30px;max-width:130px;object-fit:contain}.tree-polo-footer-wordmark{font:800 13px/1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.11em;color:#1a8917}
.tree-polo-footer-meta{margin:0;color:#858585;font:500 10px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.055em;text-transform:uppercase}
.tree-polo-promotion{margin:0 20px;padding:4px 0 30px}
.tree-polo-promotion-links{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;width:min(760px,100%);margin:0 auto}
.tree-polo-promotion-link{display:flex;align-items:center;justify-content:center;gap:10px;min-height:58px;padding:12px 16px;border:1px solid #e1e1e1;border-radius:10px;background:#fafafa;color:#2b2b2b;text-decoration:none;font:650 13px/1.2 system-ui,-apple-system,"Segoe UI","Microsoft JhengHei",sans-serif;letter-spacing:.01em;transition:transform .18s ease,border-color .18s ease,background .18s ease,color .18s ease,box-shadow .18s ease}
.tree-polo-promotion-link:hover{transform:translateY(-2px);border-color:#1a8917;background:#fff;color:#156d12;box-shadow:0 7px 20px rgba(0,0,0,.07)}
.tree-polo-promotion-link:focus-visible{outline:2px solid #1a8917;outline-offset:3px}
.tree-polo-promotion-icon{display:grid;place-items:center;width:24px;height:24px;flex:0 0 24px}.tree-polo-promotion-icon svg{display:block;width:24px;height:24px}
@media(max-width:700px){.tree-polo-footer{margin:48px 8px 0;padding:30px 12px 24px}.tree-polo-footer-message{font-size:19px;margin-bottom:23px}.tree-polo-footer-logo{height:26px}.tree-polo-promotion{margin:0 8px;padding:2px 0 24px}.tree-polo-promotion-links{gap:6px}.tree-polo-promotion-link{gap:6px;min-height:52px;padding:10px 6px;font-size:11px}.tree-polo-promotion-icon,.tree-polo-promotion-icon svg{width:20px;height:20px}}
@media print{.tree-polo-promotion{display:none!important}.tree-polo-footer{margin-top:32px}.tree-polo-footer-logo{filter:grayscale(1)}}
</style>`;
}

function promotionFooterMarkup({ logoRelativePath = BRAND_LOGO_RELATIVE_PATH } = {}) {
  const links = SOCIAL_LINKS.map(([kind, label, href]) => `<a class="tree-polo-promotion-link tree-polo-promotion-link-${kind}" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" aria-label="前往${escapeHtml(label)}"><span class="tree-polo-promotion-icon">${socialIcon(kind)}</span><span class="tree-polo-promotion-name">${escapeHtml(label)}</span></a>`).join('');
  return `<footer class="tree-polo-footer" data-tree-polo-footer>
  <p class="tree-polo-footer-message">希望我的洞察，能在你追求卓越的路上幫上忙。</p>
  <div class="tree-polo-footer-brand"><img class="tree-polo-footer-logo" src="${escapeHtml(logoRelativePath)}" alt="小樹Polo"><span class="tree-polo-footer-wordmark">TREEPOLO</span></div>
  <p class="tree-polo-footer-meta">Pitching Analysis Report by 小樹Polo · © TREEPOLO</p>
</footer>
<section class="tree-polo-promotion" data-tree-polo-promotion aria-label="小樹Polo 自媒體"><nav class="tree-polo-promotion-links" aria-label="小樹Polo 社群與內容平台">${links}</nav></section>`;
}

function injectReportPromotionFooter(html, options = {}) {
  let output = String(html);
  if (!output.includes('data-report-promotion-footer-style')) {
    const style = promotionFooterStyle();
    output = output.includes('</head>') ? output.replace('</head>', `${style}\n</head>`) : `${style}\n${output}`;
  }
  const hasPromotion = /\bdata-tree-polo-promotion(?:\s|=|>)/u.test(output);
  const hasFooter = /\bdata-tree-polo-footer(?:\s|=|>)/u.test(output);
  if (!hasPromotion && !hasFooter) {
    const markup = promotionFooterMarkup(options);
    output = output.includes('</main>') ? output.replace('</main>', `${markup}\n</main>`) : `${output}\n${markup}`;
  }
  return output;
}

module.exports = {
  SOCIAL_LINKS,
  injectReportPromotionFooter,
  promotionFooterMarkup,
  promotionFooterStyle,
};
