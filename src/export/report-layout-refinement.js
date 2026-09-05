'use strict';

function reportLayoutRefinementCss() {
  return `<style data-report-layout-refinement>
/* Annotation controls share the player control region. Visual skin belongs to the canonical report theme. */
body>main .report-annotation-controls,
.report-help-live-preview .report-annotation-controls {
  grid-column: 1 / -1 !important;
  width: 100% !important;
  max-width: 100% !important;
  min-height: 0 !important;
  margin: .18rem 0 0 !important;
  padding: .35rem 0 0 !important;
  border-top: 1px solid #e6e6e6 !important;
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
body>main .portable-frame-navigation > button,
.report-help-live-preview .portable-frame-navigation > button {
  position: relative !important;
  display: grid !important;
  place-items: center !important;
  padding: 0 !important;
  line-height: 1 !important;
  text-align: center !important;
}
body>main button[data-frame-action="toggle"]::before,
.report-help-live-preview button[data-frame-action="toggle"]::before {
  position: absolute !important;
  left: 50% !important;
  top: 50% !important;
  transform: translate(-44%, -50%) !important;
}
body>main button[data-frame-action="toggle"][aria-pressed="true"]::before,
.report-help-live-preview button[data-frame-action="toggle"][aria-pressed="true"]::before {
  transform: translate(-50%, -50%) !important;
}
body>main button[data-frame-action="previous"],
body>main button[data-frame-action="next"],
.report-help-live-preview button[data-frame-action="previous"],
.report-help-live-preview button[data-frame-action="next"] {
  font-size: 0 !important;
}
body>main button[data-frame-action="previous"]::before,
body>main button[data-frame-action="next"]::before,
.report-help-live-preview button[data-frame-action="previous"]::before,
.report-help-live-preview button[data-frame-action="next"]::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 7px;
  height: 7px;
  border: solid currentColor;
  border-width: 0 1.5px 1.5px 0;
  transform-origin: 50% 50%;
}
body>main button[data-frame-action="previous"]::before,
.report-help-live-preview button[data-frame-action="previous"]::before {
  transform: translate(-43%, -50%) rotate(135deg);
}
body>main button[data-frame-action="next"]::before,
.report-help-live-preview button[data-frame-action="next"]::before {
  transform: translate(-57%, -50%) rotate(-45deg);
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
body>main .portable-frame-rate-row,
.report-help-live-preview .portable-frame-rate-row {
  display: grid !important;
  grid-template-columns: 4.5rem minmax(0, 1fr) 4.5rem !important;
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
  justify-self: end !important;
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
    margin: .12rem 0 0 !important;
    padding-top: .32rem !important;
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
    grid-template-columns: 4.5rem minmax(0, 1fr) 4.5rem !important;
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
    grid-template-columns: 4.2rem minmax(0, 1fr) 4.2rem !important;
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
