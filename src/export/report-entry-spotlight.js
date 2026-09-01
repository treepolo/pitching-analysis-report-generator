'use strict';

function spotlightCss() {
  return `<style data-report-entry-spotlight-style>
.report-entry-spotlight[hidden]{display:none!important}
.report-entry-spotlight{
  position:fixed;
  inset:0;
  z-index:875;
  background:rgba(3,10,7,.72);
  cursor:default;
  overflow:hidden;
}
.report-entry-guide{
  --guide-distance:240px;
  --guide-angle:38deg;
  position:absolute;
  left:50%;
  top:50%;
  width:0;
  height:0;
  z-index:1;
  pointer-events:none;
}
.report-entry-guide-origin{
  position:absolute;
  left:0;
  top:0;
  width:24px;
  height:24px;
  border:1px solid rgba(224,250,237,.78);
  border-radius:50%;
  background:radial-gradient(circle,rgba(210,255,232,.9) 0 12%,rgba(96,221,161,.34) 20% 42%,rgba(96,221,161,0) 72%);
  box-shadow:0 0 22px rgba(113,239,179,.72);
  transform:translate(-50%,-50%);
  animation:report-entry-origin-pulse 1.65s ease-in-out infinite;
}
.report-entry-guide-track{
  position:absolute;
  left:0;
  top:-1px;
  width:var(--guide-distance);
  height:3px;
  transform:rotate(var(--guide-angle));
  transform-origin:0 50%;
  background:linear-gradient(90deg,rgba(111,235,175,.08) 0%,rgba(133,244,190,.2) 28%,rgba(176,255,217,.54) 72%,rgba(226,255,241,.88) 100%);
  filter:drop-shadow(0 0 5px rgba(116,238,178,.72));
}
.report-entry-guide-track::after{
  content:"";
  position:absolute;
  right:-2px;
  top:50%;
  width:9px;
  height:9px;
  border-top:2px solid rgba(231,255,243,.95);
  border-right:2px solid rgba(231,255,243,.95);
  transform:translateY(-50%) rotate(45deg);
  filter:drop-shadow(0 0 4px rgba(128,246,188,.82));
}
.report-entry-guide-comet{
  position:absolute;
  left:0;
  top:50%;
  width:11px;
  height:11px;
  border-radius:50%;
  background:#eafff2;
  box-shadow:0 0 7px #dffff0,0 0 16px rgba(117,244,183,.95),-12px 0 16px rgba(117,244,183,.42);
  transform:translate(-50%,-50%);
  animation:report-entry-guide-travel 1.65s cubic-bezier(.35,.02,.28,1) infinite;
}
body.report-entry-spotlight-active .report-help-trigger{
  z-index:910!important;
  box-shadow:inset 1px 1px 0 #fff,0 1px 3px rgba(0,0,0,.18),0 0 0 3px rgba(255,255,255,.88),0 0 24px rgba(164,221,255,1)!important;
  animation:report-entry-help-pulse 1.65s ease-in-out infinite;
}
@keyframes report-entry-guide-travel{
  0%{left:0;opacity:0;transform:translate(-50%,-50%) scale(.72)}
  16%{opacity:1}
  78%{opacity:1}
  100%{left:100%;opacity:0;transform:translate(-50%,-50%) scale(1.16)}
}
@keyframes report-entry-origin-pulse{
  0%,100%{opacity:.48;transform:translate(-50%,-50%) scale(.82)}
  45%{opacity:1;transform:translate(-50%,-50%) scale(1.12)}
}
@keyframes report-entry-help-pulse{
  0%,100%{filter:brightness(1)}
  52%{filter:brightness(1.1)}
}
@media(max-width:720px){
  .report-entry-spotlight{background:rgba(3,10,7,.76)}
  .report-entry-guide-origin{width:20px;height:20px}
  .report-entry-guide-track{height:2px}
  .report-entry-guide-comet{width:9px;height:9px}
}
@media(prefers-reduced-motion:reduce){
  .report-entry-guide-origin,.report-entry-guide-comet,body.report-entry-spotlight-active .report-help-trigger{animation:none!important}
  .report-entry-guide-comet{left:72%;opacity:1}
}
@media print{
  .report-entry-spotlight{display:none!important}
}
</style>`;
}

function spotlightMarkup() {
  return `<div class="report-entry-spotlight" data-report-entry-spotlight aria-label="點擊任意空白處開始瀏覽報告">
  <div class="report-entry-guide" data-report-entry-guide aria-hidden="true">
    <span class="report-entry-guide-origin"></span>
    <span class="report-entry-guide-track"><span class="report-entry-guide-comet"></span></span>
  </div>
</div>`;
}

function spotlightScript() {
  return `<script data-report-entry-spotlight-runtime>
(() => {
  const overlay = document.querySelector('[data-report-entry-spotlight]');
  const guide = document.querySelector('[data-report-entry-guide]');
  const helpTrigger = document.querySelector('[data-report-help-open]');
  if (!overlay || !guide || !helpTrigger) return;

  let active = true;
  document.body.classList.add('report-entry-spotlight-active');

  const updateGuideGeometry = () => {
    if (!active) return;
    const target = helpTrigger.getBoundingClientRect();
    const startX = window.innerWidth / 2;
    const startY = window.innerHeight / 2;
    const targetX = target.left + target.width / 2;
    const targetY = target.top + target.height / 2;
    const dx = targetX - startX;
    const dy = targetY - startY;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    guide.style.setProperty('--guide-distance', distance + 'px');
    guide.style.setProperty('--guide-angle', angle + 'deg');
  };

  const dismiss = () => {
    if (!active) return;
    active = false;
    overlay.hidden = true;
    document.body.classList.remove('report-entry-spotlight-active');
    window.removeEventListener('resize', updateGuideGeometry);
  };

  overlay.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    dismiss();
  });

  helpTrigger.addEventListener('click', () => {
    dismiss();
  }, true);

  document.addEventListener('keydown', (event) => {
    if (!active) return;
    const playbackShortcut = event.key === ' '
      || event.key === 'Spacebar'
      || event.key === 'ArrowLeft'
      || event.key === 'ArrowRight'
      || event.code === 'KeyA'
      || event.code === 'KeyD';
    if (!playbackShortcut) return;
    if (event.target === helpTrigger) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }, true);

  window.addEventListener('resize', updateGuideGeometry);
  requestAnimationFrame(updateGuideGeometry);
})();
</script>`;
}

function injectReportEntrySpotlight(html) {
  const source = String(html);
  if (source.includes('data-report-entry-spotlight-runtime')) return source;
  const css = spotlightCss();
  const markup = spotlightMarkup();
  const script = spotlightScript();
  let output = source.includes('</head>')
    ? source.replace('</head>', `${css}\n</head>`)
    : `${css}\n${source}`;
  output = output.includes('<body>')
    ? output.replace('<body>', `<body>\n${markup}`)
    : `${markup}\n${output}`;
  output = output.includes('</body>')
    ? output.replace('</body>', `${script}\n</body>`)
    : `${output}\n${script}`;
  return output;
}

module.exports = {
  injectReportEntrySpotlight,
  spotlightCss,
  spotlightMarkup,
  spotlightScript,
};
