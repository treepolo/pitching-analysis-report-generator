'use strict';

function reportLayoutRefinementCss() {
  return `<style data-report-layout-refinement>
/* Annotation controls already live inside the player panel. Remove the extra
   framed sub-panel and keep the row compact so it reads as a lightweight
   auxiliary toolbar instead of a second player control deck. */
body>main .report-annotation-controls,
.report-help-live-preview .report-annotation-controls {
  width: max-content !important;
  max-width: 100% !important;
  min-height: 0 !important;
  margin: .18rem 0 .12rem !important;
  padding: 0 !important;
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  gap: .18rem .42rem !important;
  font-size: 10px !important;
  line-height: 1.15 !important;
}
body>main .report-annotation-controls label,
.report-help-live-preview .report-annotation-controls label {
  gap: .14rem !important;
  line-height: 1.15 !important;
}
body>main .report-annotation-controls input[type="checkbox"],
.report-help-live-preview .report-annotation-controls input[type="checkbox"] {
  width: 12px !important;
  height: 12px !important;
  margin: 0 !important;
}
body>main .report-annotation-navigation,
.report-help-live-preview .report-annotation-navigation {
  gap: 3px !important;
  margin-right: 2px !important;
}
body>main .report-annotation-jump,
.report-help-live-preview .report-annotation-jump {
  min-height: 20px !important;
  height: 20px !important;
  padding: 1px 6px !important;
  font-size: 10px !important;
  line-height: 16px !important;
}
body>main .report-annotation-track-toggle,
.report-help-live-preview .report-annotation-track-toggle {
  padding: 1px 3px !important;
}
body>main .report-annotation-swatch,
.report-help-live-preview .report-annotation-swatch {
  width: 9px !important;
  height: 9px !important;
}

/* Let the current/total frame labels size to their text instead of reserving
   5.5rem on both sides. The timeline receives every remaining pixel. The same
   selectors cover single-video controls, comparison shared controls and the
   cloned real-player preview used by the help dialog. */
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
  body>main .report-annotation-controls,
  .report-help-live-preview .report-annotation-controls {
    width: auto !important;
    margin: .14rem 0 .1rem !important;
    gap: .16rem .32rem !important;
  }
  body>main .report-annotation-jump,
  .report-help-live-preview .report-annotation-jump {
    min-height: 19px !important;
    height: 19px !important;
    padding-inline: 5px !important;
    font-size: 9px !important;
  }
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
