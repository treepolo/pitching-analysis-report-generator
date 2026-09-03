'use strict';

function playerSelectionCss() {
  return `<style data-report-player-selection-refinement>
/* Make the keyboard-target player easier to identify without changing the
   selection state machine. Keep the existing border thickness and add only a
   restrained Tree Polo green halo around the selected player block. */
body>main .portable-player[data-frame-selected="true"],
.report-help-live-preview .portable-player[data-frame-selected="true"] {
  border-color: #24a96c !important;
  box-shadow:
    0 0 0 1px rgba(185,255,104,.42),
    0 0 9px 2px rgba(66,211,146,.40) !important;
}
</style>`;
}

function injectReportPlayerSelectionRefinement(html) {
  const source = String(html);
  if (source.includes('data-report-player-selection-refinement')) return source;
  const css = playerSelectionCss();
  return source.includes('</head>')
    ? source.replace('</head>', `${css}\n</head>`)
    : `${css}\n${source}`;
}

module.exports = {
  injectReportPlayerSelectionRefinement,
  playerSelectionCss,
};
