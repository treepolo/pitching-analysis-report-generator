'use strict';

const IDENT_DURATION_MS = 2200;
const TITLE_HOLD_MS = 560;
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
.tree-polo-ident-word{display:inline-flex;align-items:baseline;margin:0;font-family:Arial,Helvetica,"Segoe UI",sans-serif;font-size:clamp(44px,7.2vw,104px);font-weight:700;line-height:1;letter-spacing:.075em;white-space:nowrap}
.tree-polo-ident-char{display:inline-block;opacity:0;animation:tree-polo-type-char 1ms linear forwards;animation-delay:var(--type-delay)}
.tree-polo-ident-tree{color:#49b675}
.tree-polo-ident-polo{color:#f4f4f4}
.report-entry-intro.is-title-stage .tree-polo-ident-word{opacity:0;transition:opacity .16s linear}
@keyframes tree-polo-type-char{to{opacity:1}}
@keyframes tree-polo-report-light-up{0%{opacity:0}35%{opacity:.42}100%{opacity:1}}
@media(max-width:700px){.tree-polo-ident-word{font-size:clamp(38px,12vw,68px);letter-spacing:.06em}}
@media print{.report-entry-intro{display:none!important}}
</style>`;
}

function introMarkup() {
  const characters = [
    ['T', 'tree', 0.18],
    ['R', 'tree', 0.31],
    ['E', 'tree', 0.44],
    ['E', 'tree', 0.57],
    ['P', 'polo', 0.70],
    ['O', 'polo', 0.83],
    ['L', 'polo', 0.96],
    ['O', 'polo', 1.09],
  ];
  const word = characters
    .map(([character, group, delay]) => `<span class="tree-polo-ident-char tree-polo-ident-${group}" style="--type-delay:${delay}s">${character}</span>`)
    .join('');
  return `<div class="report-entry-intro" data-report-entry-intro aria-hidden="true">
  <div class="report-entry-intro-stage">
    <p class="tree-polo-ident-word" aria-label="TREEPOLO">${word}</p>
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

  let identTimer = 0;
  let titleHoldTimer = 0;
  let finishTimer = 0;
  let suppressClickTimer = 0;
  let activeAnimations = [];
  let audioCleanup = () => {};
  let finished = false;
  let collapsedState = null;

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
      'position','z-index','transform','transform-origin','clip-path',
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

  const playIntroSound = () => {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return () => {};
    let context;
    try { context = new AudioContextCtor(); } catch { return () => {}; }
    const start = context.currentTime + 0.03;
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001,start);
    master.gain.exponentialRampToValueAtTime(0.3,start + 0.02);
    master.gain.exponentialRampToValueAtTime(0.0001,start + 1.72);
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

    strike(start + 1.08,132,.38,.42);
    strike(start + 1.25,88,.72,.72);
    if (context.state === 'suspended') context.resume().catch(() => {});
    return () => { try { context.close().catch(() => {}); } catch {} };
  };

  const finishEntry = (skipped = false) => {
    if (finished) return;
    finished = true;
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
    const visibleHeight = Math.max(1, Math.min(mainRect.height, headerRect.bottom - mainRect.top));
    const clippedBottom = Math.max(0, mainRect.height - visibleHeight);

    collapsedState = { dx, dy, clippedBottom };
    main.style.setProperty('position','relative','important');
    main.style.setProperty('z-index','5001','important');
    main.style.setProperty('isolation','isolate','important');
    main.style.setProperty('transform-origin','top center','important');
    main.style.setProperty('transform','translate(' + dx + 'px,' + dy + 'px)','important');
    main.style.setProperty('clip-path','inset(0 0 ' + clippedBottom + 'px 0)','important');
    main.style.setProperty('will-change','transform,clip-path','important');
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

    const { dx, dy, clippedBottom } = collapsedState;
    const mainAnimation = main.animate([
      {
        transform: 'translate(' + dx + 'px,' + dy + 'px)',
        clipPath: 'inset(0 0 ' + clippedBottom + 'px 0)',
        offset: 0,
      },
      {
        transform: 'translate(' + dx + 'px,' + dy + 'px)',
        clipPath: 'inset(0 0 ' + clippedBottom + 'px 0)',
        offset: .08,
      },
      {
        transform: 'translate(0px,0px)',
        clipPath: 'inset(0 0 0px 0)',
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
      { opacity: 1, offset: .34 },
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
  TITLE_HOLD_MS,
  REVEAL_DURATION_MS,
  injectReportEntryIntro,
  introMarkup,
  introScript,
  introStyle,
};
