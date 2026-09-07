'use strict';

const DESKTOP_TOP_GAP = 28;
const DESKTOP_HERO_HEADER_HEIGHT = 118;
const PHONE_HERO_HEADER_HEIGHT = 98;
const COMPACT_HEADER_HEIGHT = 54;
const DESKTOP_HERO_TITLE_SIZE = 46;
const PHONE_HERO_TITLE_SIZE = 32;
const DESKTOP_COMPACT_TITLE_SIZE = 18;
const PHONE_COMPACT_TITLE_SIZE = 16;
const DESKTOP_HERO_LETTER_SPACING = -0.025;
const PHONE_HERO_LETTER_SPACING = -0.022;
const DESKTOP_COMPACT_LETTER_SPACING = 0.035;
const PHONE_COMPACT_LETTER_SPACING = 0.025;
const DESKTOP_SIGNATURE_SIZE = 15.12;
const PHONE_SIGNATURE_SIZE = 13.12;
const MOBILE_CONTENT_GAP = 16;
const TITLE_ALIGN_STAGGER_SPAN = 0.45;

function fixedHeaderStyle() {
  return `<style data-report-fixed-header-style>
@media (min-width: 701px) {
  body>main {
    margin-top: ${DESKTOP_TOP_GAP}px !important;
  }
}
body>main header.tree-polo-report-header[data-report-header-fixed="true"] {
  position: fixed !important;
  top: 0 !important;
  right: auto !important;
  margin: 0 !important;
  z-index: 850 !important;
}
.report-fixed-header-spacer {
  display: none;
  width: auto;
  height: 0;
  padding: 0;
  border: 0;
  pointer-events: none;
}
.report-fixed-header-spacer[data-active="true"] {
  display: block;
}
@media (max-width: 700px) {
  body>main header.tree-polo-report-header[data-report-header-fixed="true"] {
    left: 0 !important;
    right: auto !important;
    width: 100% !important;
    max-width: none !important;
  }
  .report-fixed-header-spacer,
  .report-fixed-header-spacer[data-active="true"] {
    display: none !important;
  }
}
@media print {
  body>main header.tree-polo-report-header,
  body>main header.tree-polo-report-header[data-report-header-fixed="true"] {
    position: relative !important;
    top: auto !important;
    left: auto !important;
    right: auto !important;
    width: auto !important;
    margin: 0 -8px 8px !important;
  }
  .report-fixed-header-spacer {
    display: none !important;
  }
}
</style>`;
}

function fixedHeaderScript() {
  return `<script data-report-fixed-header-runtime>
(() => {
  const header = document.querySelector('body>main header.tree-polo-report-header');
  const main = header?.closest('main');
  const title = header?.querySelector('h1') || null;
  if (!header || !main || !title) return;

  const mobileQuery = window.matchMedia('(max-width: 700px)');
  const spacer = document.createElement('div');
  spacer.className = 'report-fixed-header-spacer';
  spacer.setAttribute('aria-hidden', 'true');
  spacer.dataset.active = 'false';
  header.insertAdjacentElement('afterend', spacer);

  let fixed = false;
  let printing = false;
  let introSuspended = Boolean(document.querySelector('[data-report-entry-intro]'));
  let rafId = 0;
  let wasMobile = mobileQuery.matches;
  let titleCharacters = [];
  let centerShift = 0;
  let centerShiftDirty = true;

  const clamp01 = (value) => Math.max(0, Math.min(1, value));
  const lerp = (start, end, progress) => start + ((end - start) * progress);
  const smoothstep = (progress) => progress * progress * (3 - (2 * progress));
  const numeric = (value) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const viewportWidth = () => Math.max(
    1,
    Math.round(document.documentElement.clientWidth || window.innerWidth || 1),
  );
  const viewportMetrics = () => mobileQuery.matches
    ? {
      heroHeight: ${PHONE_HERO_HEADER_HEIGHT},
      compactHeight: ${COMPACT_HEADER_HEIGHT},
      heroFont: ${PHONE_HERO_TITLE_SIZE},
      compactFont: ${PHONE_COMPACT_TITLE_SIZE},
      heroLetterSpacing: ${PHONE_HERO_LETTER_SPACING},
      compactLetterSpacing: ${PHONE_COMPACT_LETTER_SPACING},
      signatureSize: ${PHONE_SIGNATURE_SIZE},
    }
    : {
      heroHeight: ${DESKTOP_HERO_HEADER_HEIGHT},
      compactHeight: ${COMPACT_HEADER_HEIGHT},
      heroFont: ${DESKTOP_HERO_TITLE_SIZE},
      compactFont: ${DESKTOP_COMPACT_TITLE_SIZE},
      heroLetterSpacing: ${DESKTOP_HERO_LETTER_SPACING},
      compactLetterSpacing: ${DESKTOP_COMPACT_LETTER_SPACING},
      signatureSize: ${DESKTOP_SIGNATURE_SIZE},
    };

  const applyViewportConstants = () => {
    const metrics = viewportMetrics();
    header.style.setProperty('--tree-polo-signature-size', metrics.signatureSize + 'px');
    if (mobileQuery.matches) {
      main.style.setProperty(
        '--tree-polo-mobile-header-space',
        (metrics.heroHeight + ${MOBILE_CONTENT_GAP}) + 'px',
      );
    } else {
      main.style.removeProperty('--tree-polo-mobile-header-space');
    }
  };

  const wrapTitleCharacters = () => {
    if (header.dataset.reportTitleCharacters === 'true') {
      titleCharacters = [...title.querySelectorAll('.tree-polo-title-char')];
      return;
    }
    const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach((textNode) => {
      const characters = Array.from(textNode.nodeValue || '');
      if (characters.length === 0) return;
      const fragment = document.createDocumentFragment();
      characters.forEach((character) => {
        const span = document.createElement('span');
        span.className = 'tree-polo-title-char';
        span.textContent = character;
        fragment.append(span);
      });
      textNode.replaceWith(fragment);
    });
    header.dataset.reportTitleCharacters = 'true';
    titleCharacters = [...title.querySelectorAll('.tree-polo-title-char')];
    centerShiftDirty = true;
  };

  const resetCharacterShifts = () => {
    titleCharacters.forEach((character) => {
      character.style.setProperty('--tree-polo-char-shift', '0px');
    });
  };

  const measureCenterShift = () => {
    if (titleCharacters.length === 0) return 0;
    const left = Math.min(...titleCharacters.map((character) => character.offsetLeft));
    const right = Math.max(...titleCharacters.map(
      (character) => character.offsetLeft + character.offsetWidth,
    ));
    const textWidth = Math.max(0, right - left);
    return ((title.clientWidth - textWidth) / 2) - left;
  };

  const applyCharacterAlignment = (alignProgress) => {
    if (titleCharacters.length === 0) return;
    if (alignProgress <= 0) {
      resetCharacterShifts();
      return;
    }
    if (centerShiftDirty) {
      resetCharacterShifts();
      centerShift = measureCenterShift();
      centerShiftDirty = false;
    }
    const count = titleCharacters.length;
    const movingWindow = 1 - ${TITLE_ALIGN_STAGGER_SPAN};
    titleCharacters.forEach((character, index) => {
      const staggerStart = count <= 1
        ? 0
        : (index / (count - 1)) * ${TITLE_ALIGN_STAGGER_SPAN};
      const local = clamp01((alignProgress - staggerStart) / movingWindow);
      const shift = centerShift * smoothstep(local);
      character.style.setProperty('--tree-polo-char-shift', shift.toFixed(3) + 'px');
    });
  };

  const syncSpacer = (height) => {
    const style = window.getComputedStyle(header);
    spacer.style.height = (height + Math.max(0, numeric(style.marginBottom))) + 'px';
    spacer.style.marginLeft = style.marginLeft;
    spacer.style.marginRight = style.marginRight;
    spacer.style.marginTop = '0';
    spacer.style.marginBottom = '0';
  };

  const clearFixedGeometry = () => {
    header.style.removeProperty('left');
    header.style.removeProperty('right');
    header.style.removeProperty('width');
  };

  const applyFixedGeometry = () => {
    if (mobileQuery.matches) {
      header.style.setProperty('left', '0px', 'important');
      header.style.setProperty('right', 'auto', 'important');
      header.style.setProperty('width', viewportWidth() + 'px', 'important');
      return;
    }
    const rect = spacer.getBoundingClientRect();
    header.style.setProperty('left', rect.left + 'px', 'important');
    header.style.setProperty('right', 'auto', 'important');
    header.style.setProperty('width', rect.width + 'px', 'important');
  };

  const setFixed = (next) => {
    if (fixed === next) return;
    fixed = next;
    if (fixed) {
      spacer.dataset.active = mobileQuery.matches ? 'false' : 'true';
      header.dataset.reportHeaderFixed = 'true';
      applyFixedGeometry();
      return;
    }
    delete header.dataset.reportHeaderFixed;
    spacer.dataset.active = 'false';
    clearFixedGeometry();
  };

  const applyTitleMorph = (scrollY) => {
    const metrics = viewportMetrics();
    const heightDelta = Math.max(1, metrics.heroHeight - metrics.compactHeight);
    const fontProgress = clamp01(scrollY / heightDelta);
    const alignProgress = clamp01((scrollY - heightDelta) / heightDelta);
    const currentHeight = lerp(metrics.heroHeight, metrics.compactHeight, fontProgress);
    const currentFont = lerp(metrics.heroFont, metrics.compactFont, fontProgress);
    const currentLetterSpacing = lerp(
      metrics.heroLetterSpacing,
      metrics.compactLetterSpacing,
      fontProgress,
    );

    header.style.setProperty('--tree-polo-header-height', currentHeight.toFixed(3) + 'px');
    header.style.setProperty('--tree-polo-title-size', currentFont.toFixed(3) + 'px');
    header.style.setProperty(
      '--tree-polo-title-letter-spacing',
      currentLetterSpacing.toFixed(5) + 'em',
    );
    header.style.setProperty('--tree-polo-signature-size', metrics.signatureSize + 'px');
    if (alignProgress >= .999) header.dataset.reportTitleCompact = 'true';
    else delete header.dataset.reportTitleCompact;

    if (fontProgress < .999) centerShiftDirty = true;
    applyCharacterAlignment(alignProgress);
    if (fixed && !mobileQuery.matches) syncSpacer(currentHeight);
    return { currentHeight, heightDelta };
  };

  const update = () => {
    rafId = 0;
    if (printing) return;
    const isMobile = mobileQuery.matches;
    if (isMobile !== wasMobile) {
      setFixed(false);
      wasMobile = isMobile;
      applyViewportConstants();
      centerShiftDirty = true;
    }

    if (introSuspended) {
      setFixed(false);
      applyTitleMorph(0);
      return;
    }

    wrapTitleCharacters();
    const scrollY = Math.max(0, window.scrollY || window.pageYOffset || 0);
    const { currentHeight } = applyTitleMorph(scrollY);

    if (isMobile) {
      setFixed(true);
      applyFixedGeometry();
      return;
    }

    const shouldFix = scrollY > ${DESKTOP_TOP_GAP} + .5;
    if (shouldFix && !fixed) {
      syncSpacer(currentHeight);
      setFixed(true);
    } else if (!shouldFix && fixed) {
      setFixed(false);
    }
    if (fixed) {
      syncSpacer(currentHeight);
      applyFixedGeometry();
    }
  };

  const scheduleUpdate = () => {
    if (rafId) return;
    rafId = window.requestAnimationFrame(update);
  };

  const suspendForIntro = () => {
    introSuspended = true;
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    setFixed(false);
    applyTitleMorph(0);
  };

  const resumeAfterIntro = () => {
    introSuspended = false;
    wasMobile = mobileQuery.matches;
    applyViewportConstants();
    wrapTitleCharacters();
    centerShiftDirty = true;
    scheduleUpdate();
  };

  const handleViewportChange = () => {
    centerShiftDirty = true;
    scheduleUpdate();
  };
  const beforePrint = () => {
    printing = true;
    setFixed(false);
  };
  const afterPrint = () => {
    printing = false;
    centerShiftDirty = true;
    scheduleUpdate();
  };

  applyViewportConstants();
  applyTitleMorph(0);
  if (!introSuspended) wrapTitleCharacters();
  scheduleUpdate();
  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', handleViewportChange, { passive: true });
  window.addEventListener('orientationchange', handleViewportChange, { passive: true });
  window.addEventListener('beforeprint', beforePrint);
  window.addEventListener('afterprint', afterPrint);
  window.addEventListener('treepolo:entry-start', suspendForIntro);
  window.addEventListener('treepolo:entry-complete', resumeAfterIntro);
  mobileQuery.addEventListener?.('change', handleViewportChange);
  window.visualViewport?.addEventListener('resize', handleViewportChange, { passive: true });
})();
</script>`;
}

function injectReportFixedHeaderRuntime(html) {
  let source = String(html);
  if (!source.includes('data-report-fixed-header-style')) {
    const style = fixedHeaderStyle();
    source = source.includes('</head>')
      ? source.replace('</head>', `${style}\n</head>`)
      : `${style}\n${source}`;
  }
  if (!source.includes('data-report-fixed-header-runtime')) {
    const script = fixedHeaderScript();
    source = source.includes('</body>')
      ? source.replace('</body>', `${script}\n</body>`)
      : `${source}\n${script}`;
  }
  return source;
}

module.exports = {
  COMPACT_HEADER_HEIGHT,
  DESKTOP_COMPACT_TITLE_SIZE,
  DESKTOP_HERO_HEADER_HEIGHT,
  DESKTOP_HERO_TITLE_SIZE,
  DESKTOP_TOP_GAP,
  MOBILE_CONTENT_GAP,
  PHONE_COMPACT_TITLE_SIZE,
  PHONE_HERO_HEADER_HEIGHT,
  PHONE_HERO_TITLE_SIZE,
  TITLE_ALIGN_STAGGER_SPAN,
  fixedHeaderScript,
  fixedHeaderStyle,
  injectReportFixedHeaderRuntime,
};
