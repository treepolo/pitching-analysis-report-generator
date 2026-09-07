'use strict';

function titleAlignmentCss() {
  return `<style data-report-title-alignment-refinement>
/* The real report header serves both as the opening headline and the compact
   fixed title. Runtime scroll progress only changes these variables and the
   per-character horizontal shift; there is no duplicate hero title. */
body>main header.tree-polo-report-header {
  --tree-polo-header-height: 118px;
  --tree-polo-title-size: 46px;
  --tree-polo-title-letter-spacing: -.025em;
  --tree-polo-title-inline-pad: 32px;
  --tree-polo-signature-size: 15.12px;
  height: var(--tree-polo-header-height) !important;
  min-height: var(--tree-polo-header-height) !important;
  padding: 0 !important;
  overflow: hidden !important;
}
body>main header.tree-polo-report-header .tree-polo-brand-copy {
  position: absolute !important;
  left: 0 !important;
  right: 0 !important;
  top: 50% !important;
  z-index: 3 !important;
  width: 100% !important;
  max-width: none !important;
  padding: 0 var(--tree-polo-title-inline-pad) !important;
  transform: translateY(-50%) !important;
  text-align: left !important;
  pointer-events: none !important;
}
body>main header.tree-polo-report-header .tree-polo-brand-copy h1 {
  position: relative !important;
  display: block !important;
  width: 100% !important;
  max-width: 100% !important;
  margin: 0 !important;
  overflow: hidden !important;
  white-space: nowrap !important;
  text-overflow: clip !important;
  text-align: left !important;
  font-size: var(--tree-polo-title-size) !important;
  line-height: 1.08 !important;
  letter-spacing: var(--tree-polo-title-letter-spacing) !important;
}
body>main header.tree-polo-report-header .tree-polo-signature {
  font-size: var(--tree-polo-signature-size) !important;
}
body>main header.tree-polo-report-header .tree-polo-title-char {
  display: inline-block;
  transform: translateX(var(--tree-polo-char-shift, 0px));
  will-change: transform;
}
body>main header.tree-polo-report-header[data-report-title-compact="true"] .tree-polo-brand-copy h1 {
  text-overflow: ellipsis !important;
}

@media (max-width: 700px) {
  body>main header.tree-polo-report-header {
    --tree-polo-header-height: 98px;
    --tree-polo-title-size: 32px;
    --tree-polo-title-letter-spacing: -.022em;
    --tree-polo-title-inline-pad: 18px;
    --tree-polo-signature-size: 13.12px;
  }
}

@media print {
  body>main header.tree-polo-report-header {
    height: auto !important;
    min-height: 54px !important;
    padding: 10px 12px !important;
    overflow: visible !important;
  }
  body>main header.tree-polo-report-header .tree-polo-brand-copy {
    position: relative !important;
    inset: auto !important;
    width: auto !important;
    padding: 0 !important;
    transform: none !important;
    pointer-events: auto !important;
  }
  body>main header.tree-polo-report-header .tree-polo-brand-copy h1 {
    width: auto !important;
    overflow: visible !important;
    white-space: normal !important;
    font-size: 18px !important;
    line-height: 1.28 !important;
    letter-spacing: .035em !important;
  }
  body>main header.tree-polo-report-header .tree-polo-title-char {
    transform: none !important;
  }
}
</style>`;
}

function injectReportTitleAlignmentRefinement(html) {
  const source = String(html);
  if (source.includes('data-report-title-alignment-refinement')) return source;
  const css = titleAlignmentCss();
  return source.includes('</head>')
    ? source.replace('</head>', `${css}\n</head>`)
    : `${css}\n${source}`;
}

module.exports = {
  injectReportTitleAlignmentRefinement,
  titleAlignmentCss,
};
