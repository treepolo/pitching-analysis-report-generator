'use strict';

const IDENT_DURATION_MS = 2900;
const TYPE_START_DELAY_MS = 700;
const TYPE_INTERVAL_MS = 115;
const IDENT_EXIT_MS = 260;
const TITLE_BAR_HOLD_MS = 620;
const SIGNATURE_TYPE_INTERVAL_MS = 88;
const HEADER_MOVE_DURATION_MS = 1750;
const REVEAL_DURATION_MS = 2300;
const HELP_CUE_DURATION_MS = 6400;

function introStyle() {
  return `<style data-report-entry-intro-style>
html.report-entry-intro-lock,body.report-entry-intro-lock{overflow:hidden!important;overscroll-behavior:none!important}
html.report-scrollbar-pending{scrollbar-width:none!important;-ms-overflow-style:none!important}
html.report-scrollbar-pending::-webkit-scrollbar{width:0!important;height:0!important;display:none!important}
.report-help-trigger{transition:opacity .34s ease,visibility .34s ease!important}
body.report-entry-intro-active .report-help-trigger{opacity:0!important;visibility:hidden!important;pointer-events:none!important}
body.report-entry-intro-active>main{visibility:hidden}
body.report-entry-title-stage>main{visibility:visible}
body.report-entry-intro-active[data-tree-polo-background="true"]::before{opacity:0}
body.report-entry-report-reveal[data-tree-polo-background="true"]::before{animation:tree-polo-report-light-up ${REVEAL_DURATION_MS}ms linear both}
.report-entry-intro[hidden]{display:none!important}
.report-entry-intro{position:fixed;inset:0;z-index:5000;overflow:hidden;background:#000;color:#fff;cursor:default;touch-action:none;user-select:none;-webkit-user-select:none}
.report-entry-intro-stage{position:absolute;inset:0;display:grid;place-items:center;background:#000}
.tree-polo-ident-word{display:inline-flex;width:max-content;align-items:baseline;justify-content:center;margin:0;font-family:Arial,Helvetica,"Segoe UI",sans-serif;font-size:clamp(44px,7.2vw,104px);font-weight:700;line-height:1;letter-spacing:.075em;white-space:nowrap;opacity:1;transition:opacity ${IDENT_EXIT_MS}ms linear}
.tree-polo-ident-tree{color:#00a65a}
.tree-polo-ident-polo{color:#f5f5f5}
.report-entry-intro.is-ident-exit .tree-polo-ident-word{opacity:0}
.report-entry-intro.is-title-stage .tree-polo-ident-word{opacity:0}
body.report-entry-help-cue-active .report-help-trigger{z-index:4100!important;isolation:isolate}
body.report-entry-help-cue-active::after{content:"";position:fixed;inset:0;z-index:4090;pointer-events:none;background:radial-gradient(circle max(160px,30vw) at var(--report-help-cue-x,calc(100vw - 56px)) var(--report-help-cue-y,calc(100vh - 40px)),rgba(0,0,0,0) 0%,rgba(0,0,0,0) 6%,rgba(0,0,0,.025) 16%,rgba(0,0,0,.07) 27%,rgba(0,0,0,.15) 39%,rgba(0,0,0,.27) 52%,rgba(0,0,0,.41) 65%,rgba(0,0,0,.56) 77%,rgba(0,0,0,.69) 87%,rgba(0,0,0,.79) 94%,rgba(0,0,0,.88) 100%);animation:report-entry-help-mask ${HELP_CUE_DURATION_MS}ms ease both}
body.report-entry-help-cue-active .report-help-trigger::after{content:"";position:absolute;inset:-6px;z-index:1;border:2px solid rgba(178,255,213,.96);border-radius:999px;pointer-events:none;animation:report-entry-help-ring 2.4s ease-in-out infinite,report-entry-help-life ${HELP_CUE_DURATION_MS}ms linear both}
@keyframes tree-polo-report-light-up{0%{opacity:0}35%{opacity:.42}100%{opacity:1}}
@keyframes report-entry-help-mask{0%{opacity:0}7%{opacity:1}88%{opacity:1}100%{opacity:0}}
@keyframes report-entry-help-ring{0%,50%,100%{border-color:rgba(178,255,213,.98);box-shadow:0 0 0 1px rgba(0,166,90,.72),0 0 18px rgba(0,166,90,.82)}25%,75%{border-color:rgba(178,255,213,.34);box-shadow:0 0 0 1px rgba(0,166,90,.16),0 0 5px rgba(0,166,90,.18)}}
@keyframes report-entry-help-life{0%{opacity:0}7%{opacity:1}88%{opacity:1}100%{opacity:0}}
@media(max-width:700px){
  .tree-polo-ident-word{font-size:clamp(38px,12vw,68px);letter-spacing:.06em}
}
@media print{.report-entry-intro{display:none!important}body.report-entry-help-cue-active::after,body.report-entry-help-cue-active .report-help-trigger::after{display:none!important}}
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
  const title = header?.querySelector('h1') || null;
  const signature = title?.querySelector('.tree-polo-signature') || null;
  const signatureTree = signature?.querySelector('.tree-polo-signature-tree') || null;
  const signaturePolo = signature?.querySelector('.tree-polo-signature-polo') || null;
  const signatureByNode = signature ? [...signature.childNodes].find((node) => node.nodeType === 3) || null : null;
  const signatureOriginal = {
    by: signatureByNode?.nodeValue || 'by',
    tree: signatureTree?.textContent || '小樹',
    polo: signaturePolo?.textContent || 'Polo',
  };
  const helpTrigger = document.querySelector('[data-report-help-open]');
  const identTree = overlay.querySelector('[data-tree-polo-ident-tree]');
  const identPolo = overlay.querySelector('[data-tree-polo-ident-polo]');
  const phoneQuery = window.matchMedia('(max-width: 700px)');
  const storageKey = 'treepolo-report-entry-seen:' + String(location.href).split('#')[0];
  const historyKey = '__treePoloEntrySeen';
  const readSessionSeen = () => { try { return sessionStorage.getItem(storageKey) === '1'; } catch { return false; } };
  const readHistorySeen = () => { try { return history.state && history.state[historyKey] === true; } catch { return false; } };
  const markEntrySeen = () => {
    try { sessionStorage.setItem(storageKey,'1'); } catch {}
    try { history.replaceState(Object.assign({},history.state || {},{ [historyKey]: true }),document.title); } catch {}
  };

  let scrollbarInteractionSeen = false;
  let scrollbarMayReveal = false;
  const scrollbarIntentEvents = ['pointerdown','touchstart','wheel'];
  const removeScrollbarIntentListeners = () => {
    scrollbarIntentEvents.forEach((type) => document.removeEventListener(type,recordScrollbarInteraction,true));
  };
  const revealScrollbar = () => {
    root.classList.remove('report-scrollbar-pending');
    removeScrollbarIntentListeners();
  };
  const recordScrollbarInteraction = () => {
    scrollbarInteractionSeen = true;
    if (scrollbarMayReveal) revealScrollbar();
  };
  scrollbarIntentEvents.forEach((type) => document.addEventListener(
    type,
    recordScrollbarInteraction,
    { capture:true,passive:true },
  ));

  const clearEntryClasses = () => body.classList.remove(
    'report-entry-intro-active',
    'report-entry-title-stage',
    'report-entry-report-reveal',
    'report-entry-intro-lock',
  );

  if (readSessionSeen() || readHistorySeen()) {
    overlay.remove();
    clearEntryClasses();
    body.classList.remove('report-entry-help-cue-active');
    root.classList.remove('report-entry-intro-lock');
    scrollbarMayReveal = true;
    if (scrollbarInteractionSeen) revealScrollbar();
    return;
  }
  markEntrySeen();
  root.classList.add('report-entry-intro-lock');
  body.classList.add('report-entry-intro-lock','report-entry-intro-active');
  window.dispatchEvent(new CustomEvent('treepolo:entry-start'));

  let typeTimer = 0;
  let identExitTimer = 0;
  let identTimer = 0;
  let titleBarTimer = 0;
  let signatureTypeTimer = 0;
  let finishTimer = 0;
  let suppressClickTimer = 0;
  let helpCueTimer = 0;
  let helpCueDismissHandler = null;
  let activeAnimations = [];
  let audioCleanup = () => {};
  let finished = false;
  let revealState = null;
  let reportBody = null;
  let reportBodyInner = null;
  let typedCount = 0;
  let signatureTypedCount = 0;
  let signaturePrepared = false;

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
      'position','z-index','background','border-color','box-shadow','padding-bottom',
      'will-change','opacity','isolation',
    ].forEach((property) => main.style.removeProperty(property));
  };

  const restoreHeader = () => {
    if (!header) return;
    header.style.removeProperty('transform');
    header.style.removeProperty('will-change');
    header.style.removeProperty('z-index');
    header.style.removeProperty('border-bottom-color');
  };

  const unwrapReportBody = () => {
    if (!reportBody || !main) return;
    const source = reportBodyInner || reportBody;
    while (source.firstChild) main.insertBefore(source.firstChild,reportBody);
    reportBody.remove();
    reportBody = null;
    reportBodyInner = null;
  };

  const restoreSignature = () => {
    if (!signaturePrepared) return;
    if (signatureByNode) signatureByNode.nodeValue = signatureOriginal.by;
    if (signatureTree) signatureTree.textContent = signatureOriginal.tree;
    if (signaturePolo) signaturePolo.textContent = signatureOriginal.polo;
    signaturePrepared = false;
  };

  const clearAnimatedState = () => {
    activeAnimations.forEach((animation) => { try { animation.cancel(); } catch {} });
    activeAnimations = [];
    restoreHeader();
    unwrapReportBody();
    restoreMain();
    restoreSignature();
  };

  const removeInteractionBlock = () => {
    blockedEvents.forEach((type) => document.removeEventListener(type,preventInteraction,{ capture:true }));
    document.removeEventListener('pointerdown',skipEntry,true);
    document.removeEventListener('touchstart',skipEntry,true);
  };

  const stopHelpCue = () => {
    if (helpCueTimer) window.clearTimeout(helpCueTimer);
    helpCueTimer = 0;
    body.classList.remove('report-entry-help-cue-active');
    body.style.removeProperty('--report-help-cue-x');
    body.style.removeProperty('--report-help-cue-y');
    if (helpCueDismissHandler) {
      document.removeEventListener('pointerdown',helpCueDismissHandler,true);
      document.removeEventListener('keydown',helpCueDismissHandler,true);
      helpCueDismissHandler = null;
    }
  };

  const startHelpCue = () => {
    if (!helpTrigger) return;
    stopHelpCue();
    const rect = helpTrigger.getBoundingClientRect();
    body.style.setProperty('--report-help-cue-x',(rect.left + rect.width / 2) + 'px');
    body.style.setProperty('--report-help-cue-y',(rect.top + rect.height / 2) + 'px');
    body.classList.add('report-entry-help-cue-active');
    helpCueDismissHandler = () => stopHelpCue();
    document.addEventListener('pointerdown',helpCueDismissHandler,true);
    document.addEventListener('keydown',helpCueDismissHandler,true);
    helpCueTimer = window.setTimeout(stopHelpCue,${HELP_CUE_DURATION_MS});
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

  const prepareSignatureTyping = () => {
    if (!signature || !signatureByNode || !signatureTree || !signaturePolo) return;
    signaturePrepared = true;
    signatureTypedCount = 0;
    signatureByNode.nodeValue = '';
    signatureTree.textContent = '';
    signaturePolo.textContent = '';
  };

  const renderTypedSignature = () => {
    const text = 'by小樹Polo'.slice(0,signatureTypedCount);
    if (signatureByNode) signatureByNode.nodeValue = text.slice(0,2);
    if (signatureTree) signatureTree.textContent = text.slice(2,4);
    if (signaturePolo) signaturePolo.textContent = text.slice(4);
  };

  const typeNextSignatureCharacter = () => {
    if (finished || !signaturePrepared || signatureTypedCount >= 8) return;
    signatureTypedCount += 1;
    renderTypedSignature();
    if (signatureTypedCount < 8) signatureTypeTimer = window.setTimeout(typeNextSignatureCharacter,${SIGNATURE_TYPE_INTERVAL_MS});
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
    [typeTimer,identExitTimer,identTimer,titleBarTimer,signatureTypeTimer,finishTimer,suppressClickTimer]
      .forEach((timer) => { if (timer) window.clearTimeout(timer); });
    audioCleanup();
    clearAnimatedState();
    removeInteractionBlock();
    overlay.hidden = true;
    overlay.remove();
    root.classList.remove('report-entry-intro-lock');
    clearEntryClasses();
    scrollbarMayReveal = true;
    if (scrollbarInteractionSeen) revealScrollbar();
    window.dispatchEvent(new CustomEvent('treepolo:entry-complete',{ detail:{ skipped } }));
    startHelpCue();
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

  const numberPx = (value) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const prepareCollapsedReport = () => {
    if (!main || !header || !title) return false;
    const contentNodes = [...main.children].filter((node) => (
      node !== header && !node.classList?.contains('report-fixed-header-spacer')
    ));
    if (contentNodes.length === 0) return false;

    const isPhoneLayout = phoneQuery.matches;
    const mainStyle = window.getComputedStyle(main);
    const mainPaddingLeft = numberPx(mainStyle.paddingLeft);
    const mainPaddingRight = numberPx(mainStyle.paddingRight);
    const mainPaddingBottom = numberPx(mainStyle.paddingBottom);
    const phoneContentTop = isPhoneLayout
      ? Math.max(0,numberPx(window.getComputedStyle(contentNodes[0]).marginTop))
      : 0;
    const headerRect = header.getBoundingClientRect();
    const headerHeight = headerRect.height;
    const sheetStartY = isPhoneLayout ? -headerHeight : 0;
    const sheetEndY = isPhoneLayout ? 0 : headerHeight;

    reportBody = document.createElement('div');
    reportBody.dataset.reportEntryBody = 'true';
    reportBodyInner = document.createElement('div');
    reportBodyInner.dataset.reportEntryBodyInner = 'true';
    contentNodes.forEach((node) => reportBodyInner.append(node));
    reportBody.append(reportBodyInner);
    main.append(reportBody);

    reportBody.style.boxSizing = 'border-box';
    reportBody.style.position = 'relative';
    reportBody.style.zIndex = '1';
    reportBody.style.width = main.clientWidth + 'px';
    reportBody.style.marginLeft = (-mainPaddingLeft) + 'px';
    reportBody.style.marginTop = (-headerHeight) + 'px';
    reportBody.style.background = 'transparent';

    reportBodyInner.style.boxSizing = 'border-box';
    reportBodyInner.style.display = 'flow-root';
    reportBodyInner.style.width = '100%';
    reportBodyInner.style.paddingTop = phoneContentTop + 'px';
    reportBodyInner.style.paddingRight = mainPaddingRight + 'px';
    reportBodyInner.style.paddingBottom = mainPaddingBottom + 'px';
    reportBodyInner.style.paddingLeft = mainPaddingLeft + 'px';
    reportBodyInner.style.background = '#fff';
    reportBodyInner.style.transform = 'translateY(' + sheetStartY + 'px)';
    reportBodyInner.style.willChange = 'transform';

    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const dy = (viewportHeight / 2) - (headerRect.top + headerRect.height / 2);
    const contentHeight = Math.max(
      1,
      reportBodyInner.scrollHeight,
      Math.ceil(reportBodyInner.getBoundingClientRect().height),
    );
    const targetBodyHeight = Math.ceil(contentHeight + Math.max(0,sheetEndY));

    revealState = { dy, sheetStartY, sheetEndY, targetBodyHeight };
    main.style.setProperty('position','relative','important');
    main.style.setProperty('z-index','5001','important');
    main.style.setProperty('isolation','isolate','important');
    main.style.setProperty('background','transparent','important');
    main.style.setProperty('border-color','transparent','important');
    main.style.setProperty('box-shadow','none','important');
    main.style.setProperty('padding-bottom','0px','important');
    main.style.setProperty('opacity','1','important');

    header.style.setProperty('z-index','2','important');
    header.style.setProperty('border-bottom-color','transparent','important');
    header.style.setProperty('transform','translateY(' + dy + 'px)');
    header.style.setProperty('will-change','transform');

    reportBody.style.height = '0px';
    reportBody.style.overflow = 'hidden';
    reportBody.style.transform = 'translateY(' + dy + 'px)';
    reportBody.style.willChange = 'height,transform';
    return true;
  };

  const beginReportReveal = () => {
    if (finished) return;
    if (!revealState || !main || !header || !reportBody || !reportBodyInner) {
      finishEntry(false);
      return;
    }
    body.classList.add('report-entry-report-reveal');
    signatureTypeTimer = window.setTimeout(typeNextSignatureCharacter,0);

    const { dy, sheetStartY, sheetEndY, targetBodyHeight } = revealState;
    const headerAnimation = header.animate([
      { transform: 'translateY(' + dy + 'px)', offset: 0 },
      { transform: 'translateY(' + dy + 'px)', offset: .06 },
      { transform: 'translateY(0px)', offset: 1 },
    ], {
      duration: ${HEADER_MOVE_DURATION_MS},
      easing: 'cubic-bezier(.22,.72,.16,1)',
      fill: 'forwards',
    });
    activeAnimations.push(headerAnimation);

    const bodyPositionAnimation = reportBody.animate([
      { transform: 'translateY(' + dy + 'px)', offset: 0 },
      { transform: 'translateY(' + dy + 'px)', offset: .06 },
      { transform: 'translateY(0px)', offset: 1 },
    ], {
      duration: ${HEADER_MOVE_DURATION_MS},
      easing: 'cubic-bezier(.22,.72,.16,1)',
      fill: 'forwards',
    });
    activeAnimations.push(bodyPositionAnimation);

    const bodyHeightAnimation = reportBody.animate([
      { height: '0px' },
      { height: targetBodyHeight + 'px' },
    ], {
      duration: ${REVEAL_DURATION_MS},
      easing: 'linear',
      fill: 'forwards',
    });
    activeAnimations.push(bodyHeightAnimation);

    const sheetSlideAnimation = reportBodyInner.animate([
      { transform: 'translateY(' + sheetStartY + 'px)' },
      { transform: 'translateY(' + sheetEndY + 'px)' },
    ], {
      duration: ${REVEAL_DURATION_MS},
      easing: 'linear',
      fill: 'forwards',
    });
    activeAnimations.push(sheetSlideAnimation);

    const overlayAnimation = overlay.animate([
      { opacity: 1, offset: 0 },
      { opacity: 1, offset: .08 },
      { opacity: 0, offset: 1 },
    ], {
      duration: ${REVEAL_DURATION_MS},
      easing: 'linear',
      fill: 'forwards',
    });
    activeAnimations.push(overlayAnimation);

    finishTimer = window.setTimeout(() => finishEntry(false),${REVEAL_DURATION_MS} + 80);
  };

  const beginTitleStage = () => {
    if (finished) return;
    overlay.classList.add('is-title-stage');
    prepareSignatureTyping();
    if (!prepareCollapsedReport()) {
      finishEntry(false);
      return;
    }
    body.classList.add('report-entry-title-stage');
    titleBarTimer = window.setTimeout(beginReportReveal,${TITLE_BAR_HOLD_MS});
  };

  audioCleanup = playIntroSound();
  typeTimer = window.setTimeout(typeNextCharacter,${TYPE_START_DELAY_MS});
  identExitTimer = window.setTimeout(() => overlay.classList.add('is-ident-exit'),${IDENT_DURATION_MS - IDENT_EXIT_MS});
  identTimer = window.setTimeout(beginTitleStage,${IDENT_DURATION_MS});
})();
</script>`;
}

function ensureRootClass(html, className) {
  return String(html).replace(/<html\b([^>]*)>/iu, (tag, attributes) => {
    const classAttribute = attributes.match(/\bclass=(["'])(.*?)\1/iu);
    if (!classAttribute) return `<html${attributes} class="${className}">`;
    const classes = classAttribute[2].split(/\s+/u).filter(Boolean);
    if (classes.includes(className)) return tag;
    const replacement = `class=${classAttribute[1]}${classAttribute[2]} ${className}${classAttribute[1]}`;
    return tag.replace(classAttribute[0],replacement);
  });
}

function injectReportEntryIntro(html) {
  let source = ensureRootClass(html,'report-scrollbar-pending');
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
  TITLE_BAR_HOLD_MS,
  SIGNATURE_TYPE_INTERVAL_MS,
  HEADER_MOVE_DURATION_MS,
  REVEAL_DURATION_MS,
  HELP_CUE_DURATION_MS,
  injectReportEntryIntro,
  introMarkup,
  introScript,
  introStyle,
};