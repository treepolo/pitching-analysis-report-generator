'use strict';

const LOCKED_VIEWPORT = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';

function mobileShellCss() {
  return `<style data-report-mobile-shell-refinement>
/* Range gesture ownership is independent of the phone visual breakpoint.
   Keep touch drags on the native slider on tablets as well, without enlarging
   its track, thumb, padding, or hit target. */
input[type="range"] {
  touch-action: none !important;
}

@media (max-width: 700px) {
  html,
  body {
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow-x: hidden !important;
  }

  /* Keep a black phone canvas underneath the canonical photographic backdrop.
     The backdrop itself stays owned by report-theme.js, while the entry intro
     controls when it becomes visible. */
  html,
  body[data-tree-polo-background="true"] {
    background: #000 !important;
  }

  /* The phone report is edge-to-edge. Keep the report surface itself flush to
     the viewport so the real title bar keeps identical geometry during entry
     and after it becomes fixed. Reserve the fixed bar + visual gap on the
     first report section instead of padding the whole main above the header. */
  body>main {
    width: 100% !important;
    max-width: none !important;
    margin: 0 !important;
    padding: 0 5px 12px !important;
    border-left: 0 !important;
    border-right: 0 !important;
  }
  body>main>section.report-section:first-of-type {
    margin-top: 70px !important;
  }
  body>main header.tree-polo-report-header {
    width: auto !important;
    max-width: none !important;
    margin: 0 -5px 8px !important;
  }

  /* Keep one-finger vertical page scrolling available outside controls. */
  html,
  body {
    touch-action: pan-y !important;
  }
}

@media print {
  body>main>section.report-section:first-of-type {
    margin-top: 0 !important;
  }
}
</style>`;
}

function mobileZoomLockScript() {
  return `<script data-report-mobile-zoom-lock>
(() => {
  const isPhoneLayout = () => window.matchMedia?.('(max-width: 700px)')?.matches === true;
  const blockGesture = (event) => {
    if (isPhoneLayout()) event.preventDefault();
  };
  const blockMultiTouch = (event) => {
    if (isPhoneLayout() && event.touches && event.touches.length > 1) event.preventDefault();
  };
  document.addEventListener('gesturestart', blockGesture, { passive: false });
  document.addEventListener('gesturechange', blockGesture, { passive: false });
  document.addEventListener('touchmove', blockMultiTouch, { passive: false });
})();
</script>`;
}

function injectReportMobileShellRefinement(html) {
  let source = String(html);
  source = source.replace(
    /<meta\s+name="viewport"\s+content="[^"]*">/iu,
    `<meta name="viewport" content="${LOCKED_VIEWPORT}">`,
  );
  if (!source.includes('data-report-mobile-shell-refinement')) {
    const css = mobileShellCss();
    source = source.includes('</head>')
      ? source.replace('</head>', `${css}\n</head>`)
      : `${css}\n${source}`;
  }
  if (!source.includes('data-report-mobile-zoom-lock')) {
    const script = mobileZoomLockScript();
    source = source.includes('</body>')
      ? source.replace('</body>', `${script}\n</body>`)
      : `${source}\n${script}`;
  }
  return source;
}

module.exports = {
  LOCKED_VIEWPORT,
  injectReportMobileShellRefinement,
  mobileShellCss,
  mobileZoomLockScript,
};