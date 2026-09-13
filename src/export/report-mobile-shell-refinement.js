'use strict';

const LOCKED_VIEWPORT = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';

function mobileShellCss() {
  return `<style data-report-mobile-shell-refinement>
/* iOS WebKit owns range drags explicitly. Other platforms keep their native
   slider gesture behavior unchanged. This does not enlarge the track, thumb,
   padding, or hit target. */
html.report-ios-webkit input[type="range"] {
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

function iosRangeDragScript() {
  return `<script data-report-ios-range-drag>
(() => {
  const isIOSWebKit = (() => {
    const userAgent = String(navigator.userAgent || '');
    const platform = String(navigator.platform || '');
    return /(?:iPad|iPhone|iPod)/iu.test(userAgent)
      || (platform === 'MacIntel' && Number(navigator.maxTouchPoints) > 1);
  })();
  if (!isIOSWebKit) return;
  document.documentElement.classList.add('report-ios-webkit');

  const selector = 'input[type="range"][data-frame-timeline], input[type="range"][data-frame-rate]';
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  let active = null;

  const valueFromClientX = (input, clientX) => {
    const rect = input.getBoundingClientRect();
    const minimum = Number.isFinite(Number(input.min)) ? Number(input.min) : 0;
    const maximum = Number.isFinite(Number(input.max)) ? Number(input.max) : 100;
    const fallback = Number.isFinite(Number(input.value)) ? Number(input.value) : minimum;
    if (!(rect.width > 0) || !(maximum > minimum) || !Number.isFinite(Number(clientX))) return fallback;

    const fraction = clamp((Number(clientX) - rect.left) / rect.width, 0, 1);
    let value = minimum + fraction * (maximum - minimum);
    const step = Number(input.step);
    if (Number.isFinite(step) && step > 0) {
      value = minimum + Math.round((value - minimum) / step) * step;
    }
    return clamp(value, minimum, maximum);
  };

  const updateFromPointer = (input, event) => {
    const value = valueFromClientX(input, event.clientX);
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const ownsPointer = (event) => Boolean(
    active
    && active.input === event.target
    && active.pointerId === event.pointerId
  );

  document.addEventListener('pointerdown', (event) => {
    const input = event.target?.closest?.(selector);
    if (!input || input.disabled || event.isPrimary === false) return;
    active = { input, pointerId: event.pointerId };
    event.preventDefault();
    try { input.focus({ preventScroll: true }); } catch { input.focus?.(); }
    try { input.setPointerCapture?.(event.pointerId); } catch {}
    updateFromPointer(input, event);
  }, { capture: true, passive: false });

  document.addEventListener('pointermove', (event) => {
    if (!ownsPointer(event)) return;
    event.preventDefault();
    updateFromPointer(active.input, event);
  }, { capture: true, passive: false });

  document.addEventListener('pointerup', (event) => {
    if (!ownsPointer(event)) return;
    const { input, pointerId } = active;
    event.preventDefault();
    updateFromPointer(input, event);
    try { input.releasePointerCapture?.(pointerId); } catch {}
    active = null;
  }, { capture: true, passive: false });

  document.addEventListener('pointercancel', (event) => {
    if (!ownsPointer(event)) return;
    const { input, pointerId } = active;
    try { input.releasePointerCapture?.(pointerId); } catch {}
    active = null;
  }, { capture: true, passive: false });
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
  if (!source.includes('data-report-ios-range-drag')) {
    const script = iosRangeDragScript();
    source = source.includes('</body>')
      ? source.replace('</body>', `${script}\n</body>`)
      : `${source}\n${script}`;
  }
  return source;
}

module.exports = {
  LOCKED_VIEWPORT,
  injectReportMobileShellRefinement,
  iosRangeDragScript,
  mobileShellCss,
  mobileZoomLockScript,
};