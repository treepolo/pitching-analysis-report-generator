'use strict';

const IDENT_DURATION_MS = 4200;

function introStyle() {
  return `<style data-report-entry-intro-style>
html.report-entry-intro-lock,body.report-entry-intro-lock{overflow:hidden!important;overscroll-behavior:none!important}
body.report-entry-intro-active .report-help-trigger{opacity:0!important;visibility:hidden!important;pointer-events:none!important}
.report-entry-intro[hidden]{display:none!important}
.report-entry-intro{position:fixed;inset:0;z-index:5000;overflow:hidden;background:#000;color:#fff;cursor:default;touch-action:none;user-select:none;-webkit-user-select:none}
.report-entry-intro-stage{position:absolute;inset:0;display:grid;place-items:center;background:#000}
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
  root.classList.add('report-entry-intro-lock');
  body.classList.add('report-entry-intro-lock','report-entry-intro-active');

  const playIdentSound = () => {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;
    let context;
    try { context = new AudioContextCtor(); } catch { return; }
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
    window.setTimeout(() => context.close().catch(() => {}),2900);
  };

  const finish = () => {
    overlay.hidden = true;
    overlay.remove();
    root.classList.remove('report-entry-intro-lock');
    body.classList.remove('report-entry-intro-lock','report-entry-intro-active');
    window.dispatchEvent(new CustomEvent('treepolo:intro-ident-complete'));
  };

  playIdentSound();
  window.setTimeout(finish,${IDENT_DURATION_MS});
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
  injectReportEntryIntro,
  introMarkup,
  introScript,
  introStyle,
};
