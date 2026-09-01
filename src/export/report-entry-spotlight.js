'use strict';

function spotlightCss() {
  return `<style data-report-entry-spotlight-style>
.report-entry-spotlight[hidden]{display:none!important}
.report-entry-spotlight{
  position:fixed;
  inset:0;
  z-index:875;
  background:rgba(5,14,10,.58);
  cursor:default;
}
body.report-entry-spotlight-active .report-help-trigger{
  z-index:910!important;
  box-shadow:inset 1px 1px 0 #fff,0 1px 3px rgba(0,0,0,.18),0 0 0 3px rgba(255,255,255,.78),0 0 18px rgba(164,221,255,.92)!important;
}
@media(max-width:720px){
  .report-entry-spotlight{background:rgba(5,14,10,.62)}
}
@media print{
  .report-entry-spotlight{display:none!important}
}
</style>`;
}

function spotlightMarkup() {
  return '<div class="report-entry-spotlight" data-report-entry-spotlight aria-label="點擊任意空白處開始瀏覽報告"></div>';
}

function spotlightScript() {
  return `<script data-report-entry-spotlight-runtime>
(() => {
  const overlay = document.querySelector('[data-report-entry-spotlight]');
  const helpTrigger = document.querySelector('[data-report-help-open]');
  if (!overlay || !helpTrigger) return;

  let active = true;
  document.body.classList.add('report-entry-spotlight-active');

  const dismiss = () => {
    if (!active) return;
    active = false;
    overlay.hidden = true;
    document.body.classList.remove('report-entry-spotlight-active');
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
