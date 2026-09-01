'use strict';

const LOCKED_VIEWPORT = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';

function mobileShellCss() {
  return `<style data-report-mobile-shell-refinement>
@media (max-width: 700px) {
  html,
  body {
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow-x: hidden !important;
  }

  /* The phone report is edge-to-edge. Reserve the fixed 62px title bar plus
     its original 8px visual gap from the first paint, so no spacer insertion
     can shift content after load. */
  body>main {
    width: 100% !important;
    max-width: none !important;
    margin: 0 !important;
    padding: 70px 5px 12px !important;
    border-left: 0 !important;
    border-right: 0 !important;
  }
  body>main header.tree-polo-report-header {
    width: auto !important;
    max-width: none !important;
    margin: 0 -5px 8px !important;
  }

  /* Page-scale gestures are disabled on phones while ordinary one-finger
     vertical scrolling and range-slider dragging remain available. */
  html,
  body {
    touch-action: pan-y !important;
  }
  input[type="range"] {
    touch-action: pan-x !important;
  }
}

@media print {
  body>main {
    padding-top: 0 !important;
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
