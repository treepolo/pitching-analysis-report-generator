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

/* Routine play/pause status is redundant because the toggle button already
   communicates playback state. Keep the status element available for errors,
   but remove the normal extra line in single, comparison and help-clone UIs. */
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
  /* Annotation toolbar: keep it compact but allow semantic groups to wrap. */
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
    font-size: 10px !important;
    line-height: 18px !important;
  }

  /* Mobile player controls: do not inherit the old wrapping flex layout.
     Navigation is one deliberate six-column row, with the timeline absorbing
     the flexible middle width. */
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
    font-size: 10px !important;
  }
  body>main .portable-frame-navigation input[type="range"],
  .report-help-live-preview .portable-frame-navigation input[type="range"] {
    width: 100% !important;
    min-width: 0 !important;
    margin: 0 !important;
  }

  /* Speed controls get their own compact row: numeric value | slider | reset. */
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
  body>main .portable-frame-navigation [data-frame-current],
  body>main .portable-frame-navigation [data-frame-total],
  .report-help-live-preview .portable-frame-navigation [data-frame-current],
  .report-help-live-preview .portable-frame-navigation [data-frame-total] {
    font-size: 9px !important;
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
