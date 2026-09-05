'use strict';

function reportLayoutRefinementCss() {
  return `<style data-report-layout-refinement>
/* Annotation controls own compact geometry only. Visual skin belongs to the canonical report theme. */
body>main .report-annotation-controls,
.report-help-live-preview .report-annotation-controls {
  width: max-content !important;
  max-width: 100% !important;
  min-height: 0 !important;
  margin: .18rem 0 .12rem !important;
  padding: 0 !important;
  gap: .18rem .42rem !important;
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

/* Frame-control geometry is shared by the report and the cloned help player. */
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

/* Routine status is redundant; retain the element for errors only. */
body>main .portable-frame-player-status,
.report-help-live-preview .portable-frame-player-status {
  display: none !important;
  min-height: 0 !important;
  margin: 0 !important;
}
body>main .portable-frame-player-status[data-state="error"],
.report-help-live-preview .portable-frame-player-status[data-state="error"] {
  display: block !important;
  margin-top: 3px !important;
}

@media (max-width: 700px) {
  body>main .report-annotation-point,
  .report-help-live-preview .report-annotation-point {
    r: 3.2px !important;
    stroke-width: .8 !important;
  }

  body>main .report-annotation-controls,
  .report-help-live-preview .report-annotation-controls {
    display: flex !important;
    flex-wrap: wrap !important;
    align-items: center !important;
    width: 100% !important;
    margin: .12rem 0 .1rem !important;
    gap: 4px 7px !important;
  }
  body>main .report-annotation-navigation,
  .report-help-live-preview .report-annotation-navigation {
    display: inline-flex !important;
    flex: 0 0 auto !important;
    gap: 3px !important;
  }
  body>main .report-annotation-jump,
  .report-help-live-preview .report-annotation-jump {
    min-height: 24px !important;
    height: 24px !important;
    padding: 2px 6px !important;
    line-height: 18px !important;
  }

  body>main .portable-frame-controls,
  .report-help-live-preview .portable-frame-controls {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    row-gap: 5px !important;
    column-gap: 0 !important;
    width: 100% !important;
  }
  body>main .portable-frame-navigation,
  .report-help-live-preview .portable-frame-navigation {
    display: grid !important;
    grid-template-columns: 32px 32px max-content minmax(0, 1fr) max-content 32px !important;
    align-items: center !important;
    gap: 4px !important;
    width: 100% !important;
    min-width: 0 !important;
  }
  body>main .portable-frame-navigation > button,
  .report-help-live-preview .portable-frame-navigation > button {
    width: 32px !important;
    min-width: 32px !important;
    height: 30px !important;
    min-height: 30px !important;
    padding: 0 !important;
  }
  body>main .portable-frame-navigation [data-frame-current],
  body>main .portable-frame-navigation [data-frame-total],
  .report-help-live-preview .portable-frame-navigation [data-frame-current],
  .report-help-live-preview .portable-frame-navigation [data-frame-total] {
    width: max-content !important;
    min-width: 0 !important;
    padding-inline: 1px !important;
  }
  body>main .portable-frame-navigation input[type="range"],
  .report-help-live-preview .portable-frame-navigation input[type="range"] {
    width: 100% !important;
    min-width: 0 !important;
    margin: 0 !important;
  }

  body>main .portable-frame-rate-row,
  .report-help-live-preview .portable-frame-rate-row {
    display: grid !important;
    grid-template-columns: 4.5rem minmax(0, 1fr) 32px !important;
    align-items: center !important;
    gap: 4px !important;
    width: 100% !important;
  }
  body>main .portable-frame-rate-row input[type="number"],
  .report-help-live-preview .portable-frame-rate-row input[type="number"] {
    width: 100% !important;
    min-width: 0 !important;
    max-width: none !important;
  }
  body>main .portable-frame-rate-row input[type="range"],
  .report-help-live-preview .portable-frame-rate-row input[type="range"] {
    width: 100% !important;
    min-width: 0 !important;
    margin: 0 !important;
  }
  body>main .portable-frame-rate-row button,
  .report-help-live-preview .portable-frame-rate-row button {
    width: 32px !important;
    min-width: 32px !important;
    height: 30px !important;
  }
  body>main .portable-frame-loop,
  .report-help-live-preview .portable-frame-loop {
    margin-top: 1px !important;
  }
}

@media (max-width: 420px) {
  body>main .report-annotation-point,
  .report-help-live-preview .report-annotation-point {
    r: 2.6px !important;
    stroke-width: .65 !important;
  }
  body>main .portable-frame-navigation,
  .report-help-live-preview .portable-frame-navigation {
    grid-template-columns: 30px 30px max-content minmax(0, 1fr) max-content 30px !important;
    gap: 3px !important;
  }
  body>main .portable-frame-navigation > button,
  .report-help-live-preview .portable-frame-navigation > button,
  body>main .portable-frame-rate-row button,
  .report-help-live-preview .portable-frame-rate-row button {
    width: 30px !important;
    min-width: 30px !important;
  }
  body>main .portable-frame-rate-row,
  .report-help-live-preview .portable-frame-rate-row {
    grid-template-columns: 4.2rem minmax(0, 1fr) 30px !important;
    gap: 3px !important;
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
