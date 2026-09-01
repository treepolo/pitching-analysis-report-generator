'use strict';

function deskSurfaceCss() {
  return `<style data-report-desk-surface-refinement>
/* The report itself keeps its existing light reader surface. Only the page
   outside the report becomes a dark wooden desk, with a soft cast shadow that
   suggests a small air gap instead of a thick paper stack. */
html,
body {
  background-color: #21140e !important;
  background-image:
    radial-gradient(ellipse at 12% 18%, rgba(119, 77, 49, .16) 0 10%, transparent 34%),
    radial-gradient(ellipse at 78% 64%, rgba(94, 57, 37, .14) 0 12%, transparent 38%),
    repeating-linear-gradient(0deg, rgba(255, 244, 226, .018) 0 1px, rgba(0, 0, 0, .028) 1px 3px, transparent 3px 9px),
    linear-gradient(90deg, #160c08 0%, #2c1a11 17%, #1d110b 35%, #382317 56%, #21130d 76%, #321e14 100%) !important;
  background-attachment: fixed !important;
}

body>main {
  box-shadow:
    0 28px 54px rgba(0, 0, 0, .42),
    0 9px 18px rgba(0, 0, 0, .34) !important;
}

@media (max-width: 700px) {
  /* Reveal only a narrow strip of desk around the report on phones. The report
     remains visually identical; this spacing merely gives its cast shadow a
     surface to land on. */
  body>main {
    width: calc(100% - 10px) !important;
    margin: 5px auto 18px !important;
    box-shadow:
      0 16px 30px rgba(0, 0, 0, .38),
      0 5px 11px rgba(0, 0, 0, .30) !important;
  }
}

@media print {
  html,
  body {
    background: #fff !important;
  }
  body>main {
    box-shadow: none !important;
  }
}
</style>`;
}

function injectReportDeskSurfaceRefinement(html) {
  const source = String(html);
  if (source.includes('data-report-desk-surface-refinement')) return source;
  const css = deskSurfaceCss();
  return source.includes('</head>')
    ? source.replace('</head>', `${css}\n</head>`)
    : `${css}\n${source}`;
}

module.exports = {
  deskSurfaceCss,
  injectReportDeskSurfaceRefinement,
};
