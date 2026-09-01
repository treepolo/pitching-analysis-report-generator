'use strict';

function floatingUiCss() {
  return `<style data-report-floating-ui-refinement>
/* Keep the branded report title visible while the reader scrolls. The final
   Tree Polo theme still owns the visuals; this layer only owns positioning. */
body>main header.tree-polo-report-header {
  position: sticky !important;
  top: 0 !important;
  z-index: 850 !important;
}

/* Keep the help entry point away from the pinned title bar. */
.report-help-trigger {
  top: auto !important;
  right: 16px !important;
  bottom: 16px !important;
}

@media (max-width: 720px) {
  .report-help-trigger {
    top: auto !important;
    right: 8px !important;
    bottom: 8px !important;
  }
}

@media print {
  body>main header.tree-polo-report-header {
    position: relative !important;
    top: auto !important;
  }
}
</style>`;
}

function injectReportFloatingUiRefinement(html) {
  const source = String(html);
  if (source.includes('data-report-floating-ui-refinement')) return source;
  const css = floatingUiCss();
  return source.includes('</head>')
    ? source.replace('</head>', `${css}\n</head>`)
    : `${css}\n${source}`;
}

module.exports = {
  floatingUiCss,
  injectReportFloatingUiRefinement,
};
