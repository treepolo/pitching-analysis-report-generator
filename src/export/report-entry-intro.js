'use strict';

const IDENT_DURATION_MS = 4200;
const REVEAL_DURATION_MS = 1750;

function introStyle() {
  return `<style data-report-entry-intro-style>
html.report-entry-intro-lock,body.report-entry-intro-lock{overflow:hidden!important;overscroll-behavior:none!important}
.report-help-trigger{transition:opacity .34s ease,visibility .34s ease!important}
body.report-entry-intro-active .report-help-trigger{opacity:0!important;visibility:hidden!important;pointer-events:none!important}
body.report-entry-intro-active[data-tree-polo-background="true"]::before{filter:brightness(.16) saturate(.72);opacity:.16}
body.report-entry-report-reveal[data-tree-polo-background="true"]::before{animation:tree-polo-report-light-up 1.36s cubic-bezier(.2,.72,.2,1) both}
.report-entry-intro[hidden]{display:none!important}
.report-entry-intro{position:fixed;inset:0;z-index:5000;overflow:hidden;background:#000;color:#fff;cursor:default;touch-action:none;user-select:none;-webkit-user-select:none}
.report-entry-intro-stage{position:absolute;inset:0;display:grid;place-items:center;background:#000;transition:opacity .12s linear}
.report-entry-intro.is-report-reveal .report-entry-intro-stage{opacity:0}
.tree-polo-ident-word{position:absolute;left:50%;top:50%;margin:0;color:#72e57d;font-family:Impact,"Arial Black","Segoe UI Black",sans-serif;font-size:clamp(46px,8.2vw,128px);font-weight:900;line-height:.82;letter-spacing:.055em;text-transform:uppercase;white-space:nowrap;transform:translate(-50%,-50%) scaleX(.78);transform-origin:50% 50%;text-shadow:-1px 0 0 #9dffa0,1px 0 0 #155c2d,0 0 16px rgba(66,220,105,.2);animation:tree-polo-ident-word 1.46s cubic-bezier(.2,.72,.2,1) both}
.tree-polo-ident-mark{position:absolute;left:50%;top:50%;width:min(24vw,190px);height:min(38vw,300px);min-width:112px;min-height:176px;transform:translate(-50%,-50%);opacity:0;animation:tree-polo-ident-mark 2.34s cubic-bezier(.19,.73,.18,1) 1.18s both}
.tree-polo-ident-mark::before{content:"";position:absolute;left:39%;top:0;width:22%;height:100%;background:linear-gradient(90deg,#103d22 0%,#56d978 34%,#a8ff9c 52%,#3dba66 72%,#0f4525 100%);box-shadow:0 0 20px rgba(85,240,119,.17)}
.tree-polo-ident-mark::after{content:"";position:absolute;left:0;top:0;width:100%;height:21%;background:linear-gradient(180deg,#8aff96 0%,#4fca70 43%,#18572f 100%);box-shadow:0 0 18px rgba(91,244,121,.15)}
.tree-polo-ident-edge{position:absolute;inset:0;pointer-events:none}
.tree-polo-ident-edge::before,.tree-polo-ident-edge::after{content:"";position:absolute;top:0;height:100%;width:2px;background:rgba(194,255,202,.78);filter:blur(.15px);opacity:.7}
.tree-polo-ident-edge::before{left:39%}.tree-polo-ident-edge::after{right:39%}
.tree-polo-ident-spectrum{position:absolute;inset:-6%;opacity:0;transform:scaleX(.055);transform-origin:50% 50%;background:repeating-linear-gradient(90deg,#07170d 0 .8%,#1c6b36 .8% 1.6%,#5ed97a 1.6% 2.35%,#b6ff97 2.35% 2.85%,#42b979 2.85% 3.65%,#0f614f 3.65% 4.35%,#62e5c6 4.35% 5.15%,#d5ff9e 5.15% 5.72%,#2fa95e 5.72% 6.7%,#123b27 6.7% 7.45%);filter:saturate(1.18) contrast(1.1);animation:tree-polo-ident-spectrum 2.02s cubic-bezier(.17,.64,.2,1) 2.13s both}
.tree-polo-ident-spectrum::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.52),transparent 21%,rgba(255,255,255,.08) 50%,transparent 79%,rgba(0,0,0,.52)),radial-gradient(ellipse at center,rgba(160,255,170,.18),transparent 58%);mix-blend-mode:screen}
.tree-polo-ident-vignette{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 20%,rgba(0,0,0,.18) 58%,rgba(0,0,0,.86) 100%);pointer-events:none;opacity:0;animation:tree-polo-ident-vignette 2.02s ease 2.13s both}
@keyframes tree-polo-ident-word{0%{opacity:0;filter:blur(1.6px);transform:translate(-50%,-50%) scaleX(.72) scale(.965)}18%{opacity:1;filter:blur(0)}62%{opacity:1;transform:translate(-50%,-50%) scaleX(.78) scale(1)}100%{opacity:0;filter:blur(.5px);transform:translate(-50%,-50%) scaleX(.79) scale(1.025)}}
@keyframes tree-polo-ident-mark{0%{opacity:0;filter:blur(2px);transform:translate(-50%,-50%) scale(.88)}13%{opacity:1;filter:blur(0)}43%{opacity:1;transform:translate(-50%,-50%) scale(1)}69%{opacity:1;transform:translate(-50%,-50%) scale(1.08)}100%{opacity:0;filter:blur(2px);transform:translate(-50%,-50%) scale(5.9)}}
@keyframes tree-polo-ident-spectrum{0%{opacity:0;filter:blur(2px) saturate(1.05);transform:scaleX(.055)}12%{opacity:.96}46%{opacity:1;filter:blur(.35px) saturate(1.2);transform:scaleX(.94)}76%{opacity:1;transform:scaleX(1.08)}100%{opacity:0;filter:blur(2.6px) saturate(.92);transform:scaleX(1.17)}}
@keyframes tree-polo-ident-vignette{0%{opacity:0}15%{opacity:.72}75%{opacity:.86}100%{opacity:1}}
@keyframes tree-polo-report-light-up{0%{filter:brightness(.12) saturate(.68);opacity:.12}45%{filter:brightness(.58) saturate(.88);opacity:.66}100%{filter:brightness(1) saturate(1);opacity:1}}
@media(max-width:700px){.tree-polo-ident-word{font-size:clamp(38px,13vw,78px);letter-spacing:.04em}.tree-polo-ident-mark{width:31vw;height:50vw}}
@media print{.report-entry-intro{display:none!important}}
</style>`;
}

function introMarkup() {
  return `<div class="report-entry-intro" data-report-entry-intro aria-hidden="true">
  <div class="report-entry-intro-stage">
    <p class="tree-polo-ident-word">TREEPOLO</p>
    <div class="tree-polo-ident-mark" aria-hidden="true"><span class="tree-polo-ident-edge"></span></div>
    <div class="tree-polo-ident-spectrum" aria-hidden="true"></div>
    <div class="tree-polo-ident-vignette" aria-hidden="true"></div>
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
  const header = document.querySelector('body>main header.tree-polo-report-header,body>main header.report-header');
  const sections = main ? [...main.querySelectorAll(':scope>section.report-section')] : [];
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
    body.classList.remove('report-entry-intro-active','report-entry-report-reveal','report-entry-intro-lock');
    root.classList.remove('report-entry-intro-lock');
    return;
  }
  markEntrySeen();
  root.classList.add('report-entry-intro-lock');
  body.classList.add('report-entry-intro-lock','report-entry-intro-active');

  let identTimer = 0;
  let finishTimer = 0;
  let audioCleanup = () => {};
  let activeAnimations = [];
  let finished = false;
  let suppressClickTimer = 0;

  const preventInteraction = (event) => {
    if (finished) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };
  const blockedEvents = ['wheel','touchmove','keydown'];
  blockedEvents.forEach((type) => document.addEventListener(type,preventInteraction,{ capture:true,passive:false }));

  const clearAnimatedState = () => {
    activeAnimations.forEach((animation) => { try { animation.cancel(); } catch {} });
    activeAnimations = [];
    if (header) {
      header.style.removeProperty('z-index');
      header.style.removeProperty('will-change');
    }
    sections.forEach((section) => section.style.removeProperty('will-change'));
  };

  const removeInteractionBlock = () => {
    blockedEvents.forEach((type) => document.removeEventListener(type,preventInteraction,{ capture:true }));
  };

  const playIdentSound = () => {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return () => {};
    let context;
    try { context = new AudioContextCtor(); } catch { return () => {}; }
    const start = context.currentTime + 0.03;
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001,start);
    master.gain.exponentialRampToValueAtTime(0.88,start + 0.018);
    master.gain.exponentialRampToValueAtTime(0.0001,start + 2.55);
    master.connect(context.destination);
    const strike = (time,frequency,decay,level) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency,time);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(36,frequency * 0.58),time + decay);
      gain.gain.setValueAtTime(level,time);
      gain.gain.exponentialRampToValueAtTime(0.0001,time + decay);
      oscillator.connect(gain); gain.connect(master); oscillator.start(time); oscillator.stop(time + decay + .03);
    };
    strike(start + .05,118,.34,.78);
    strike(start + .31,82,.72,.98);
    strike(start + .34,164,.46,.24);
    const shimmer = context.createOscillator();
    const shimmerGain = context.createGain();
    shimmer.type = 'triangle';
    shimmer.frequency.setValueAtTime(276,start + .56);
    shimmer.frequency.exponentialRampToValueAtTime(520,start + 1.86);
    shimmerGain.gain.setValueAtTime(.0001,start + .52);
    shimmerGain.gain.exponentialRampToValueAtTime(.075,start + .79);
    shimmerGain.gain.exponentialRampToValueAtTime(.0001,start + 2.18);
    shimmer.connect(shimmerGain); shimmerGain.connect(master); shimmer.start(start + .52); shimmer.stop(start + 2.22);
    if (context.state === 'suspended') context.resume().catch(() => {});
    return () => { try { context.close().catch(() => {}); } catch {} };
  };

  const finishEntry = (skipped = false) => {
    if (finished) return;
    finished = true;
    if (identTimer) window.clearTimeout(identTimer);
    if (finishTimer) window.clearTimeout(finishTimer);
    if (suppressClickTimer) window.clearTimeout(suppressClickTimer);
    audioCleanup();
    clearAnimatedState();
    removeInteractionBlock();
    overlay.hidden = true;
    overlay.remove();
    root.classList.remove('report-entry-intro-lock');
    body.classList.remove('report-entry-intro-lock','report-entry-intro-active','report-entry-report-reveal');
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
  overlay.addEventListener('pointerdown',skipEntry,{ capture:true,passive:false });
  overlay.addEventListener('touchstart',skipEntry,{ capture:true,passive:false });

  const beginReportReveal = () => {
    if (finished) return;
    overlay.classList.add('is-report-reveal');
    body.classList.add('report-entry-report-reveal');
    const overlayAnimation = overlay.animate([
      { opacity: 1, offset: 0 },
      { opacity: 1, offset: .18 },
      { opacity: 0, offset: 1 },
    ], { duration: ${REVEAL_DURATION_MS}, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'forwards' });
    activeAnimations.push(overlayAnimation);

    if (header) {
      const rect = header.getBoundingClientRect();
      const centerX = (window.innerWidth || document.documentElement.clientWidth || 0) / 2;
      const centerY = (window.innerHeight || document.documentElement.clientHeight || 0) / 2;
      const dx = centerX - (rect.left + rect.width / 2);
      const dy = centerY - (rect.top + rect.height / 2);
      header.style.setProperty('z-index','5101','important');
      header.style.setProperty('will-change','transform,opacity');
      activeAnimations.push(header.animate([
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(1.035)', opacity: 0, offset: 0 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(1.035)', opacity: 1, offset: .18 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(1.035)', opacity: 1, offset: .42 },
        { transform: 'translate(0px,0px) scale(1)', opacity: 1, offset: 1 },
      ], { duration: ${REVEAL_DURATION_MS}, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'forwards' }));
    }

    sections.forEach((section,index) => {
      section.style.setProperty('will-change','clip-path,transform,opacity');
      activeAnimations.push(section.animate([
        { clipPath: 'inset(0 0 100% 0)', transform: 'translateY(-14px)', opacity: .08, offset: 0 },
        { clipPath: 'inset(0 0 100% 0)', transform: 'translateY(-14px)', opacity: .08, offset: .25 },
        { clipPath: 'inset(0 0 0 0)', transform: 'translateY(0)', opacity: 1, offset: 1 },
      ], { duration: ${REVEAL_DURATION_MS} + Math.min(index,3) * 55, easing: 'cubic-bezier(.2,.72,.2,1)', fill: 'forwards' }));
    });

    finishTimer = window.setTimeout(() => finishEntry(false),${REVEAL_DURATION_MS} + 90);
  };

  audioCleanup = playIdentSound();
  identTimer = window.setTimeout(beginReportReveal,${IDENT_DURATION_MS});
})();
</script>`;
}

function injectReportEntryIntro(html) {
  let source = String(html);
  if (!source.includes('data-report-entry-intro-style')) {
    const style = introStyle();
    source = source.includes('</head>') ? source.replace('</head>', style + '\n</head>') : style + '\n' + source;
  }
  if (!source.includes('data-report-entry-intro')) {
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
  REVEAL_DURATION_MS,
  injectReportEntryIntro,
  introMarkup,
  introScript,
  introStyle,
};
