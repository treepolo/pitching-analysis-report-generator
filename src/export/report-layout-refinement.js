'use strict';

function reportLayoutRefinementCss() {
  return `<style data-report-layout-refinement>
/* Annotation controls already live inside the player panel.  Remove the extra
   framed sub-panel so the controls do not look like a box nested inside a box. */
body>main .report-annotation-controls,
.report-help-live-preview .report-annotation-controls {
  margin: .35rem 0 .25rem !important;
  padding: 0 !important;
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}

/* Let the current/total frame labels size to their text instead of reserving
   5.5rem on both sides.  The timeline receives every remaining pixel.  The
   same selectors cover single-video controls, comparison shared controls and
   the cloned real-player preview used by the help dialog. */
body>main .portable-frame-controls,
.report-help-live-preview .portable-frame-controls {
  grid-template-columns: 25px 25px max-content minmax(0, 1fr) max-content 25px !important;
  column-gap: 4px !important;
}
body>main .portable-frame-navigation [data-frame-current],
body>main .portable-frame-navigation [data-frame-total],
.report-help-live-preview .portable-frame-navigation [data-frame-current],
.report-help-live-preview .portable-frame-navigation [data-frame-total] {
  width: max-content !important;
  min-width: 0 !important;
  max-width: none !important;
  padding-inline: 2px !important;
  white-space: nowrap !important;
}
body>main .portable-frame-navigation input[type="range"],
.report-help-live-preview .portable-frame-navigation input[type="range"] {
  width: 100% !important;
  min-width: 0 !important;
}

@media (max-width: 700px) {
  body>main .portable-frame-controls,
  .report-help-live-preview .portable-frame-controls {
    grid-template-columns: 25px 25px max-content minmax(0, 1fr) max-content 25px !important;
    column-gap: 3px !important;
  }
  body>main .portable-frame-navigation [data-frame-current],
  body>main .portable-frame-navigation [data-frame-total],
  .report-help-live-preview .portable-frame-navigation [data-frame-current],
  .report-help-live-preview .portable-frame-navigation [data-frame-total] {
    padding-inline: 1px !important;
  }
}
</style>`;
}

function injectReportLayoutRefinement(html) {
  const source = String(html);
  if (source.includes('data-report-layout-refinement')) return source;
  const css = reportLayoutRefinementCss();
  return source.includes('</head>')
    ? source.replace('</head>', `${css}\n</head>`)
    : `${css}\n${source}`;
}

module.exports = {
  injectReportLayoutRefinement,
  reportLayoutRefinementCss,
};
