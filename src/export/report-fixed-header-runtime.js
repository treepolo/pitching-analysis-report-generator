'use strict';

function fixedHeaderStyle() {
  return `<style data-report-fixed-header-style>
body>main header.tree-polo-report-header[data-report-header-fixed="true"] {
  position: fixed !important;
  top: 0 !important;
  right: auto !important;
  margin: 0 !important;
  z-index: 850 !important;
}
.report-fixed-header-spacer {
  display: none;
  width: auto;
  height: 0;
  padding: 0;
  border: 0;
  pointer-events: none;
}
.report-fixed-header-spacer[data-active="true"] {
  display: block;
}
@media print {
  body>main header.tree-polo-report-header[data-report-header-fixed="true"] {
    position: relative !important;
    top: auto !important;
    left: auto !important;
    width: auto !important;
    margin: 0 -8px 8px !important;
  }
  .report-fixed-header-spacer {
    display: none !important;
  }
}
</style>`;
}

function fixedHeaderScript() {
  return `<script data-report-fixed-header-runtime>
(() => {
  const header = document.querySelector('body>main header.tree-polo-report-header');
  const main = header?.closest('main');
  if (!header || !main) return;

  const spacer = document.createElement('div');
  spacer.className = 'report-fixed-header-spacer';
  spacer.setAttribute('aria-hidden', 'true');
  spacer.dataset.active = 'false';
  header.insertAdjacentElement('afterend', spacer);

  let anchorY = 0;
  let fixed = false;
  let printing = false;
  let rafId = 0;

  const numeric = (value) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const clearFixedGeometry = () => {
    header.style.removeProperty('left');
    header.style.removeProperty('right');
    header.style.removeProperty('width');
  };

  const readNaturalMetrics = () => {
    const rect = header.getBoundingClientRect();
    const style = window.getComputedStyle(header);
    const scrollY = window.scrollY || window.pageYOffset || 0;
    anchorY = rect.top + scrollY;
    spacer.style.height = (rect.height + Math.max(0, numeric(style.marginBottom))) + 'px';
    spacer.style.marginLeft = style.marginLeft;
    spacer.style.marginRight = style.marginRight;
    spacer.style.marginTop = '0';
    spacer.style.marginBottom = '0';
  };

  const applyFixedGeometry = () => {
    const rect = spacer.getBoundingClientRect();
    header.style.setProperty('left', rect.left + 'px', 'important');
    header.style.setProperty('right', 'auto', 'important');
    header.style.setProperty('width', rect.width + 'px', 'important');
  };

  const setFixed = (next) => {
    if (fixed === next) return;
    fixed = next;
    if (fixed) {
      spacer.dataset.active = 'true';
      header.dataset.reportHeaderFixed = 'true';
      applyFixedGeometry();
      return;
    }
    delete header.dataset.reportHeaderFixed;
    spacer.dataset.active = 'false';
    clearFixedGeometry();
  };

  const update = () => {
    rafId = 0;
    if (printing) return;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const shouldFix = scrollY > anchorY + 0.5;
    setFixed(shouldFix);
    if (fixed) applyFixedGeometry();
    else readNaturalMetrics();
  };

  const scheduleUpdate = () => {
    if (rafId) return;
    rafId = window.requestAnimationFrame(update);
  };

  const beforePrint = () => {
    printing = true;
    setFixed(false);
  };
  const afterPrint = () => {
    printing = false;
    readNaturalMetrics();
    scheduleUpdate();
  };

  readNaturalMetrics();
  scheduleUpdate();
  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', scheduleUpdate, { passive: true });
  window.addEventListener('orientationchange', scheduleUpdate, { passive: true });
  window.addEventListener('beforeprint', beforePrint);
  window.addEventListener('afterprint', afterPrint);
  window.visualViewport?.addEventListener('resize', scheduleUpdate, { passive: true });
})();
</script>`;
}

function injectReportFixedHeaderRuntime(html) {
  let source = String(html);
  if (!source.includes('data-report-fixed-header-style')) {
    const style = fixedHeaderStyle();
    source = source.includes('</head>')
      ? source.replace('</head>', `${style}\n</head>`)
      : `${style}\n${source}`;
  }
  if (!source.includes('data-report-fixed-header-runtime')) {
    const script = fixedHeaderScript();
    source = source.includes('</body>')
      ? source.replace('</body>', `${script}\n</body>`)
      : `${source}\n${script}`;
  }
  return source;
}

module.exports = {
  fixedHeaderScript,
  fixedHeaderStyle,
  injectReportFixedHeaderRuntime,
};
