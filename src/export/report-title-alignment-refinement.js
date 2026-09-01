'use strict';

function titleAlignmentCss() {
  return `<style data-report-title-alignment-refinement>
/* Center the report title against the full title-bar width, not the residual
   flex space beside the logo. The logo remains independently anchored left. */
body>main header.tree-polo-report-header .tree-polo-brand-copy {
  position: absolute !important;
  left: 50% !important;
  top: 50% !important;
  z-index: 3 !important;
  width: max-content !important;
  max-width: calc(100% - 170px) !important;
  transform: translate(-50%, -50%) !important;
  text-align: center !important;
  pointer-events: none !important;
}
body>main header.tree-polo-report-header .tree-polo-brand-copy h1 {
  max-width: 100% !important;
  margin: 0 !important;
  overflow: hidden !important;
  white-space: nowrap !important;
  text-overflow: ellipsis !important;
  text-align: center !important;
}
/* Keep the author signature subordinate to the primary report title, but large
   enough to remain intentional beside the longer "投球分析報告" wording. */
body>main header.tree-polo-report-header .tree-polo-signature {
  font-size: .84em !important;
  font-weight: 500 !important;
  letter-spacing: .02em !important;
  margin-left: .12em !important;
  vertical-align: .08em !important;
}

@media (max-width: 700px) {
  body>main header.tree-polo-report-header .tree-polo-brand-copy {
    max-width: calc(100% - 136px) !important;
  }
  body>main header.tree-polo-report-header .tree-polo-signature {
    font-size: .82em !important;
  }
}

@media print {
  body>main header.tree-polo-report-header .tree-polo-brand-copy {
    pointer-events: auto !important;
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
