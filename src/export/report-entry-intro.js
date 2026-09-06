'use strict';

const IDENT_DURATION_MS = 2050;
const TYPE_START_DELAY_MS = 250;
const TYPE_INTERVAL_MS = 115;
const IDENT_EXIT_MS = 220;
const TITLE_HOLD_MS = 520;
const REVEAL_DURATION_MS = 1650;

function introStyle() {
  return `<style data-report-entry-intro-style>
html.report-entry-intro-lock,body.report-entry-intro-lock{overflow:hidden!important;overscroll-behavior:none!important}
.report-help-trigger{transition:opacity .34s ease,visibility .34s ease!important}
body.report-entry-intro-active .report-help-trigger{opacity:0!important;visibility:hidden!important;pointer-events:none!important}
body.report-entry-intro-active>main{visibility:hidden}
body.report-entry-title-stage>main{visibility:visible}
body.report-entry-intro-active[data-tree-polo-background="true"]::before{opacity:0}
body.report-entry-report-reveal[data-tree-polo-background="true"]::before{animation:tree-polo-report-light-up 1.2s cubic-bezier(.2,.72,.2,1) both}
.report-entry-intro[hidden]{display:none!important}
.report-entry-intro{position:fixed;inset:0;z-index:5000;overflow:hidden;background:#000;color:#fff;cursor:default;touch-action:none;user-select:none;-webkit-user-select:none}
.report-entry-intro-stage{position:absolute;inset:0;display:grid;place-items:center;background:#000}
.tree-polo-ident-word{display:inline-flex;width:max-content;align-items:baseline;justify-content:center;margin:0;font-family:Arial,Helvetica,"Segoe UI",sans-serif;font-size:clamp(44px,7.2vw,104px);font-weight:700;line-height:1;letter-spacing:.075em;white-space:nowrap;opacity:1;transition:opacity ${IDENT_EXIT_MS}ms linear}
.tree-polo-ident-tree{color:#00a65a}
.tree-polo-ident-polo{color:#f5f5f5}
.report-entry-intro.is-ident-exit .tree-polo-ident-word{opacity:0}
.report-entry-intro.is-title-stage .tree-polo-ident-word{opacity:0}
@keyframes tree-polo-report-light-up{0%{opacity:0}35%{opacity:.42}100%{opacity:1}}
@media(max-width:700px){.tree-polo-ident-word{font-size:clamp(38px,12vw,68px);letter-spacing:.06em}}
@media print{.report-entry-intro{display:none!important}}
</style>`;
}

function introMarkup() {
  return `<div class="report-entry-intro" data-report-entry-intro aria-hidden="true">
  <div class="report-entry-intro-stage">
    <p class="tree-polo-ident-word" aria-label="TREEPOLO"><span class="tree-polo-ident-tree" data-tree-polo-ident-tree></span><span class="tree-polo-ident-polo" data-tree-polo-ident-polo></span></p>
  </div>
</div>`;
}

function introScript() {
  return `<script data-report-entry-intro-runtime>
(() => {
  const overlay = document.querySelector('[data-report-entry-intro]');
  if (!overlay) return;
  const root = document.documentElement;
  const body = document.body;
  const main = document.querySelector('body>main');
  const header = main?.querySelector(':scope>header.tree-polo-report-header,:scope>header.report-header') || null;
  const identTree = overlay.querySelector('[data-tree-polo-ident-tree]');
  const identPolo = overlay.querySelector('[data-tree-polo-ident-polo]');
  const storageKey = 'treepolo-report-entry-seen:' + String(location.href).split('#')[0];
  const historyKey = '__treePoloEntrySeen';
  const readSessionSeen = () => { try { return sessionStorage.getItem(storageKey) === '1'; } catch { return false; } };
  const readHistorySeen = () => { try { return history.state && history.state[historyKey] === true; } catch { return false; } };
  const markEntrySeen = () => {
    try { sessionStorage.setItem(storageKey,'1'); } catch {}
    try { history.replaceState(Object.assign({},history.state || {},{ [historyKey]: true }),document.title); } catch {}
  };

  if (readSessionSeen() || readHistorySeen()) {
    overlay.remove();
    body.classList.remove('report-entry-intro-active','report-entry-title-stage','report-entry-report-reveal','report-entry-intro-lock');
    root.classList.remove('report-entry-intro-lock');
    return;
  }
  markEntrySeen();
  root.classList.add('report-entry-intro-lock');
  body.classList.add('report-entry-intro-lock','report-entry-intro-active');
  window.dispatchEvent(new CustomEvent('treepolo:entry-start'));

  let typeTimer = 0;
  let identExitTimer = 0;
  let identTimer = 0;
  let titleHoldTimer = 0;
  let finishTimer = 0;
  let suppressClickTimer = 0;
  let activeAnimations = [];
  let audioCleanup = () => {};
  let finished = false;
  let collapsedState = null;
  let typedCount = 0;

  const preventInteraction = (event) => {
    if (finished) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };
  const blockedEvents = ['wheel','touchmove','keydown'];
  blockedEvents.forEach((type) => document.addEventListener(type,preventInteraction,{ capture:true,passive:false }));

  const restoreMain = () => {
    if (!main) return;
    [
      'position','z-index','transform','transform-origin','height','overflow',
      'will-change','opacity','isolation',
    ].forEach((property) => main.style.removeProperty(property));
  };

  const clearAnimatedState = () => {
    activeAnimations.forEach((animation) => { try { animation.cancel(); } catch {} });
    activeAnimations = [];
    restoreMain();
  };

  const removeInteractionBlock = () => {
    blockedEvents.forEach((type) => document.removeEventListener(type,preventInteraction,{ capture:true }));
    document.removeEventListener('pointerdown',skipEntry,true);
    document.removeEventListener('touchstart',skipEntry,true);
  };

  const renderTypedWord = () => {
    const text = 'TREEPOLO'.slice(0,typedCount);
    if (identTree) identTree.textContent = text.slice(0,4);
    if (identPolo) identPolo.textContent = text.slice(4);
  };

  const typeNextCharacter = () => {
    if (finished || typedCount >= 8) return;
    typedCount += 1;
    renderTypedWord();
    if (typedCount < 8) typeTimer = window.setTimeout(typeNextCharacter,${TYPE_INTERVAL_MS});
  };

  const playIntroSound = () => {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return () => {};
    let context;
    try { context = new AudioContextCtor(); } catch { return () => {}; }
    const start = context.currentTime + 0.03;
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001,start);
    master.gain.exponentialRampToValueAtTime(0.24,start + 0.02);
    master.gain.exponentialRampToValueAtTime(0.0001,start + 1.5);
    master.connect(context.destination);

    const strike = (time,frequency,decay,level) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency,time);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(42,frequency * .68),time + decay);
      gain.gain.setValueAtTime(level,time);
      gain.gain.exponentialRampToValueAtTime(0.0001,time + decay);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(time);
      oscillator.stop(time + decay + .03);
    };

    strike(start + .94,132,.34,.34);
    strike(start + 1.08,88,.62,.58);
    if (context.state === 'suspended') context.resume().catch(() => {});
    return () => { try { context.close().catch(() => {}); } catch {} };
  };

  const finishEntry = (skipped = false) => {
    if (finished) return;
    finished = true;
    if (typeTimer) window.clearTimeout(typeTimer);
    if (identExitTimer) window.clearTimeout(identExitTimer);
    if (identTimer) window.clearTimeout(identTimer);
    if (titleHoldTimer) window.clearTimeout(titleHoldTimer);
    if (finishTimer) window.clearTimeout(finishTimer);
    if (suppressClickTimer) window.clearTimeout(suppressClickTimer);
    audioCleanup();
    clearAnimatedState();
    removeInteractionBlock();
    overlay.hidden = true;
    overlay.remove();
    root.classList.remove('report-entry-intro-lock');
    body.classList.remove('report-entry-intro-lock','report-entry-intro-active','report-entry-title-stage','report-entry-report-reveal');
    window.dispatchEvent(new CustomEvent('treepolo:entry-complete',{ detail:{ skipped } }));
  };

  const swallowNextClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    document.removeEventListener('click',swallowNextClick,true);
    if (suppressClickTimer) window.clearTimeout(suppressClickTimer);
  };

  const skipEntry = (event) => {
    if (finished) return;
    if (event) preventInteraction(event);
    document.addEventListener('click',swallowNextClick,true);
    suppressClickTimer = window.setTimeout(() => document.removeEventListener('click',swallowNextClick,true),450);
    finishEntry(true);
  };
  document.addEventListener('pointerdown',skipEntry,{ capture:true,passive:false });
  document.addEventListener('touchstart',skipEntry,{ capture:true,passive:false });

  const prepareCollapsedReport = () => {
    if (!main || !header) return false;
    const mainRect = main.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const dx = viewportWidth / 2 - (headerRect.left + headerRect.width / 2);
    const dy = viewportHeight / 2 - (headerRect.top + headerRect.height / 2);
    const targetHeight = Math.max(1,Math.ceil(mainRect.height));
    const collapsedHeight = Math.max(1,Math.min(targetHeight,Math.ceil(headerRect.bottom - mainRect.top)));

    collapsedState = { dx, dy, collapsedHeight, targetHeight };
    main.style.setProperty('position','relative','important');
    main.style.setProperty('z-index','5001','important');
    main.style.setProperty('isolation','isolate','important');
    main.style.setProperty('transform-origin','top center','important');
    main.style.setProperty('transform','translate(' + dx + 'px,' + dy + 'px)','important');
    main.style.setProperty('height',collapsedHeight + 'px','important');
    main.style.setProperty('overflow','hidden','important');
    main.style.setProperty('will-change','transform,height','important');
    main.style.setProperty('opacity','1','important');
    return true;
  };

  const beginReportReveal = () => {
    if (finished) return;
    if (!collapsedState || !main) {
      finishEntry(false);
      return;
    }
    body.classList.add('report-entry-report-reveal');

    const { dx, dy, collapsedHeight, targetHeight } = collapsedState;
    const mainAnimation = main.animate([
      {
        transform: 'translate(' + dx + 'px,' + dy + 'px)',
        height: collapsedHeight + 'px',
        offset: 0,
      },
      {
        transform: 'translate(' + dx + 'px,' + dy + 'px)',
        height: collapsedHeight + 'px',
        offset: .08,
      },
      {
        transform: 'translate(0px,0px)',
        height: targetHeight + 'px',
        offset: 1,
      },
    ], {
      duration: ${REVEAL_DURATION_MS},
      easing: 'cubic-bezier(.22,.72,.16,1)',
      fill: 'forwards',
    });
    activeAnimations.push(mainAnimation);

    const overlayAnimation = overlay.animate([
      { opacity: 1, offset: 0 },
      { opacity: 1, offset: .18 },
      { opacity: 0, offset: 1 },
    ], {
      duration: ${REVEAL_DURATION_MS},
      easing: 'cubic-bezier(.22,.61,.36,1)',
      fill: 'forwards',
    });
    activeAnimations.push(overlayAnimation);

    finishTimer = window.setTimeout(() => finishEntry(false),${REVEAL_DURATION_MS} + 80);
  };

  const beginTitleStage = () => {
    if (finished) return;
    overlay.classList.add('is-title-stage');
    if (!prepareCollapsedReport()) {
      finishEntry(false);
      return;
    }
    body.classList.add('report-entry-title-stage');
    titleHoldTimer = window.setTimeout(beginReportReveal,${TITLE_HOLD_MS});
  };

  audioCleanup = playIntroSound();
  typeTimer = window.setTimeout(typeNextCharacter,${TYPE_START_DELAY_MS});
  identExitTimer = window.setTimeout(() => overlay.classList.add('is-ident-exit'),${IDENT_DURATION_MS - IDENT_EXIT_MS});
  identTimer = window.setTimeout(beginTitleStage,${IDENT_DURATION_MS});
})();
</script>`;
}

function injectReportEntryIntro(html) {
  let source = String(html);
  if (!source.includes('data-report-entry-intro-style')) {
    const style = introStyle();
    source = source.includes('</head>') ? source.replace('</head>', style + '\n</head>') : style + '\n' + source;
  }
  if (!/\bdata-report-entry-intro(?:\s|=|>)/u.test(source)) {
    const markup = introMarkup();
    source = source.includes('<body>') ? source.replace('<body>', '<body>\n' + markup) : markup + '\n' + source;
  }
  if (!source.includes('data-report-entry-intro-runtime')) {
    const script = introScript();
    source = source.includes('</body>') ? source.replace('</body>', script + '\n</body>') : source + '\n' + script;
  }
  return source;
}

module.exports = {
  IDENT_DURATION_MS,
  TYPE_START_DELAY_MS,
  TYPE_INTERVAL_MS,
  IDENT_EXIT_MS,
  TITLE_HOLD_MS,
  REVEAL_DURATION_MS,
  injectReportEntryIntro,
  introMarkup,
  introScript,
  introStyle,
};
