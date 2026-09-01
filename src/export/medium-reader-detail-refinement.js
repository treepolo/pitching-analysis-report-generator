'use strict';

function mediumReaderDetailCss() {
  return `<style data-medium-reader-detail-refinement>
/* Medium-style hierarchy: text lives in a readable centered column while media
   keeps the full report width. Sections are separated by whitespace and a rule
   aligned to that text column, not by boxed panels. */
html body>main section.report-section{position:relative!important;margin:0 0 12px!important;padding:8px 5px 22px!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}
html body>main section.report-section+section.report-section{margin-top:16px!important;padding-top:30px!important}
html body>main section.report-section+section.report-section::before{content:"";position:absolute;top:0;left:50%;width:calc(100% - 40px);max-width:560px;height:1px;background:#cfcfcf;transform:translateX(-50%)}
html body>main section.report-section>h2{position:relative;width:calc(100% - 40px);max-width:560px;margin:0 auto 20px!important;padding:0 0 13px!important;border:0!important;background:transparent!important;box-shadow:none!important;color:#242424!important;font-size:26px!important;font-weight:700!important;line-height:1.22!important;letter-spacing:-.015em!important}
html body>main section.report-section>h2::after{content:"";display:block;width:76px;height:2px;margin-top:11px;border-radius:999px;background:#1a8917}
html body>main section.report-section>.report-text,html body>main section.report-section>h4,html body>main section.report-section>.muted{box-sizing:border-box;width:calc(100% - 40px)!important;max-width:560px!important;margin-left:auto!important;margin-right:auto!important}
html body>main section.report-section>h4{font-size:18px!important;line-height:1.35!important}
html body>main section.report-section>.muted{display:block}

/* Player headings get their own lower level in the visual hierarchy. Media and
   its controls deliberately remain full-width. */
html body>main .portable-player-header{margin-bottom:11px!important;padding-bottom:10px!important;border-bottom:1px solid #e6e6e6!important}
html body>main .portable-player-header h3{color:#242424!important;font-size:21px!important;font-weight:700!important;line-height:1.28!important;letter-spacing:-.01em!important}
html body>main .portable-player-side-heading h3{color:#242424!important;font-size:17px!important;font-weight:650!important;line-height:1.3!important}

/* Draw the play/pause glyphs ourselves so their optical centre is stable. */
html body>main button[data-frame-action="toggle"]{display:grid!important;place-items:center!important;padding:0!important;font-size:0!important;line-height:1!important;text-align:center!important}
html body>main button[data-frame-action="toggle"]::before{content:"";display:block;width:0;height:0;border-top:5px solid transparent;border-bottom:5px solid transparent;border-left:8px solid #242424;transform:translateX(1px)}
html body>main button[data-frame-action="toggle"][aria-pressed="true"]::before{width:8px;height:10px;border:0;background:linear-gradient(90deg,#242424 0 3px,transparent 3px 5px,#242424 5px 8px);transform:none}
html body>main button[data-frame-action="toggle"]:disabled::before{border-left-color:#b3b3b3}
html body>main button[data-frame-action="toggle"][aria-pressed="true"]:disabled::before{background:linear-gradient(90deg,#b3b3b3 0 3px,transparent 3px 5px,#b3b3b3 5px 8px)}

/* Progress timeline keeps a round thumb. */
html body>main input[data-frame-timeline][type="range"]{appearance:none!important;-webkit-appearance:none!important;height:20px!important;margin:0!important;padding:0!important;background:transparent!important;cursor:pointer}
html body>main input[data-frame-timeline][type="range"]::-webkit-slider-runnable-track{height:3px!important;border:0!important;border-radius:999px!important;background:#d9d9d9!important;box-shadow:none!important}
html body>main input[data-frame-timeline][type="range"]::-webkit-slider-thumb{appearance:none!important;-webkit-appearance:none!important;width:12px!important;height:12px!important;margin-top:-4.5px!important;border:0!important;border-radius:50%!important;background:#242424!important;box-shadow:none!important}
html body>main input[data-frame-timeline][type="range"]:hover::-webkit-slider-thumb{background:#1a8917!important}
html body>main input[data-frame-timeline][type="range"]::-moz-range-track{height:3px!important;border:0!important;border-radius:999px!important;background:#d9d9d9!important;box-shadow:none!important}
html body>main input[data-frame-timeline][type="range"]::-moz-range-progress{height:3px!important;border:0!important;border-radius:999px!important;background:#6b6b6b!important}
html body>main input[data-frame-timeline][type="range"]::-moz-range-thumb{width:12px!important;height:12px!important;border:0!important;border-radius:50%!important;background:#242424!important;box-shadow:none!important}
html body>main input[data-frame-timeline][type="range"]:hover::-moz-range-thumb{background:#1a8917!important}

/* Playback-rate sliders use the same quiet track but a rectangular thumb so
   speed control remains distinguishable from seek/progress. */
html body>main input[data-frame-rate][type="range"],html body>main input[data-player-rate][type="range"]{appearance:none!important;-webkit-appearance:none!important;height:20px!important;margin:0!important;padding:0!important;background:transparent!important;cursor:pointer}
html body>main input[data-frame-rate][type="range"]::-webkit-slider-runnable-track,html body>main input[data-player-rate][type="range"]::-webkit-slider-runnable-track{height:3px!important;border:0!important;border-radius:999px!important;background:#d9d9d9!important;box-shadow:none!important}
html body>main input[data-frame-rate][type="range"]::-webkit-slider-thumb,html body>main input[data-player-rate][type="range"]::-webkit-slider-thumb{appearance:none!important;-webkit-appearance:none!important;width:8px!important;height:16px!important;margin-top:-6.5px!important;border:0!important;border-radius:2px!important;background:#242424!important;box-shadow:none!important}
html body>main input[data-frame-rate][type="range"]:hover::-webkit-slider-thumb,html body>main input[data-player-rate][type="range"]:hover::-webkit-slider-thumb{background:#1a8917!important}
html body>main input[data-frame-rate][type="range"]:disabled::-webkit-slider-runnable-track,html body>main input[data-player-rate][type="range"]:disabled::-webkit-slider-runnable-track{background:#ececec!important}
html body>main input[data-frame-rate][type="range"]:disabled::-webkit-slider-thumb,html body>main input[data-player-rate][type="range"]:disabled::-webkit-slider-thumb{background:#b3b3b3!important}
html body>main input[data-frame-rate][type="range"]::-moz-range-track,html body>main input[data-player-rate][type="range"]::-moz-range-track{height:3px!important;border:0!important;border-radius:999px!important;background:#d9d9d9!important;box-shadow:none!important}
html body>main input[data-frame-rate][type="range"]::-moz-range-progress,html body>main input[data-player-rate][type="range"]::-moz-range-progress{height:3px!important;border:0!important;border-radius:999px!important;background:#6b6b6b!important}
html body>main input[data-frame-rate][type="range"]::-moz-range-thumb,html body>main input[data-player-rate][type="range"]::-moz-range-thumb{width:8px!important;height:16px!important;border:0!important;border-radius:2px!important;background:#242424!important;box-shadow:none!important}
html body>main input[data-frame-rate][type="range"]:hover::-moz-range-thumb,html body>main input[data-player-rate][type="range"]:hover::-moz-range-thumb{background:#1a8917!important}
html body>main input[data-frame-rate][type="range"]:disabled::-moz-range-track,html body>main input[data-player-rate][type="range"]:disabled::-moz-range-track{background:#ececec!important}
html body>main input[data-frame-rate][type="range"]:disabled::-moz-range-thumb,html body>main input[data-player-rate][type="range"]:disabled::-moz-range-thumb{background:#b3b3b3!important}

/* Help is now part of the same Medium-style system, including its cloned player. */
.report-help-backdrop{padding:5vh 6vw!important;background:rgba(0,0,0,.30)!important;backdrop-filter:blur(2px)!important}
.report-help-dialog{width:min(940px,88vw)!important;max-height:84vh!important;border:1px solid #e6e6e6!important;border-radius:14px!important;background:#fff!important;box-shadow:0 20px 60px rgba(0,0,0,.18)!important;color:#242424!important}
.report-help-header{position:relative!important;top:auto!important;margin:0!important;padding:24px 28px 18px!important;border:0!important;border-bottom:1px solid #e6e6e6!important;border-radius:0!important;background:#fff!important;box-shadow:none!important}
.report-help-header h2{margin:0!important;padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important;color:#242424!important;font-size:28px!important;font-weight:700!important;line-height:1.2!important;letter-spacing:-.015em!important}
.report-help-header p{margin:7px 0 0!important;color:#6b6b6b!important;font-size:14px!important;line-height:1.5!important}
.report-help-close{width:36px!important;height:36px!important;padding:0!important;border:1px solid #e6e6e6!important;border-radius:50%!important;background:#fff!important;box-shadow:none!important;color:#242424!important;font-size:18px!important;line-height:1!important}
.report-help-close:hover{border-color:#242424!important;background:#f2f2f2!important}
.report-help-content{padding:24px 28px 30px!important}
.report-help-content h3{margin:30px 0 12px!important;color:#242424!important;font-size:20px!important;font-weight:700!important;line-height:1.3!important}
.report-help-content h3:first-child{margin-top:0!important}
.report-help-figure{margin:0!important;padding:14px!important;border:1px solid #e6e6e6!important;border-radius:12px!important;background:#fafafa!important;box-shadow:none!important;overflow:hidden!important}
.report-help-live-preview{border-radius:8px!important;background:#fff!important;box-shadow:none!important;overflow:hidden!important}
.report-help-live-preview-empty{border:1px dashed #d0d0d0!important;border-radius:8px!important;background:#fafafa!important;color:#6b6b6b!important}
.report-help-figure figcaption{margin-top:10px!important;color:#6b6b6b!important;font-size:13px!important;line-height:1.5!important}
.report-help-guide{gap:12px 16px!important}
.report-help-guide li{padding:12px!important;border:1px solid #e6e6e6!important;border-radius:10px!important;background:#fff!important;box-shadow:none!important}
.report-help-number,.report-help-preview-marker,.report-help-live-marker{background:#1a8917!important;box-shadow:none!important}
.report-help-guide strong{font-size:14px!important;color:#242424!important}
.report-help-guide p{color:#6b6b6b!important;font-size:13px!important;line-height:1.55!important}
.report-help-shortcut{padding:10px!important;border:1px solid #e6e6e6!important;border-radius:9px!important;background:#fff!important;font-size:13px!important}
.report-help-shortcut kbd{border:1px solid #d0d0d0!important;border-radius:5px!important;background:#f7f7f7!important;box-shadow:none!important;color:#242424!important}
.report-help-note{padding:11px 13px!important;border-left:3px solid #1a8917!important;border-radius:0 8px 8px 0!important;background:#f7f7f7!important;color:#525252!important;font-size:13px!important;line-height:1.55!important}
.report-help-actions{gap:10px!important;margin-top:22px!important;padding-top:18px!important;border-top:1px solid #e6e6e6!important}
.report-help-actions span{color:#6b6b6b!important;font-size:12px!important}
.report-help-trigger,.report-help-tutorial-button,.report-help-tutorial-controls button,.report-help-tutorial-stop{min-height:34px!important;padding:6px 13px!important;border:1px solid #d0d0d0!important;border-radius:999px!important;background:#fff!important;box-shadow:none!important;color:#242424!important;text-shadow:none!important}
.report-help-trigger:hover,.report-help-tutorial-button:hover,.report-help-tutorial-controls button:hover,.report-help-tutorial-stop:hover{border-color:#242424!important;background:#f2f2f2!important;color:#242424!important}
.report-help-tutorial-button,.report-help-tutorial-controls [data-report-help-tutorial-full]{border-color:#1a8917!important;background:#1a8917!important;color:#fff!important}
.report-help-tutorial-button:hover,.report-help-tutorial-controls [data-report-help-tutorial-full]:hover{border-color:#156d12!important;background:#156d12!important;color:#fff!important}
.report-help-icon{border:0!important;background:#242424!important;color:#fff!important;box-shadow:none!important}
.report-help-tutorial-panel{border:1px solid #e6e6e6!important;border-radius:12px!important;background:#fff!important;box-shadow:0 12px 34px rgba(0,0,0,.16)!important;color:#242424!important}
.report-help-tutorial-panel-header{border-bottom:1px solid #e6e6e6!important;background:#fff!important}
.report-help-tutorial-step,.report-help-tutorial-copy p{color:#6b6b6b!important}
.report-help-trigger:focus-visible,.report-help-close:focus-visible,.report-help-tutorial-button:focus-visible,.report-help-live-marker:focus-visible,.report-help-tutorial-panel button:focus-visible{outline:2px solid #1a8917!important;outline-offset:2px!important}

/* The help illustration is a clone of the real player, so restyle it explicitly
   instead of depending on body>main selectors. */
.report-help-live-preview .portable-player{border:1px solid #e6e6e6!important;border-radius:8px!important;background:#fafafa!important;box-shadow:none!important}
.report-help-live-preview .portable-player-header{margin-bottom:9px!important;padding-bottom:8px!important;border-bottom:1px solid #e6e6e6!important}
.report-help-live-preview .portable-player-header h3{color:#242424!important;font-size:18px!important;font-weight:700!important}
.report-help-live-preview .portable-player-side-heading h3{color:#242424!important;font-size:15px!important;font-weight:650!important}
.report-help-live-preview .report-annotation-controls{border-color:#e6e6e6!important;background:#fafafa!important;box-shadow:none!important}
.report-help-live-preview button{border-color:#d0d0d0!important;border-radius:999px!important;background:#fff!important;box-shadow:none!important;color:#242424!important;text-shadow:none!important}
.report-help-live-preview button[data-frame-action="toggle"]{display:grid!important;place-items:center!important;padding:0!important;font-size:0!important;line-height:1!important;text-align:center!important}
.report-help-live-preview button[data-frame-action="toggle"]::before{content:"";display:block;width:0;height:0;border-top:5px solid transparent;border-bottom:5px solid transparent;border-left:8px solid #242424;transform:translateX(1px)}
.report-help-live-preview button[data-frame-action="toggle"][aria-pressed="true"]::before{width:8px;height:10px;border:0;background:linear-gradient(90deg,#242424 0 3px,transparent 3px 5px,#242424 5px 8px);transform:none}
.report-help-live-preview .portable-frame-navigation>button{display:grid!important;place-items:center!important;padding:0!important;line-height:1!important;text-align:center!important}
.report-help-live-preview .portable-frame-navigation>button[data-frame-action="previous"],.report-help-live-preview .portable-frame-navigation>button[data-frame-action="next"]{font-size:0!important}
.report-help-live-preview .portable-frame-navigation>button[data-frame-action="previous"]::before{content:"←";font-size:14px;line-height:1;transform:translateX(.5px)}
.report-help-live-preview .portable-frame-navigation>button[data-frame-action="next"]::before{content:"→";font-size:14px;line-height:1;transform:translateX(-.5px)}
.report-help-live-preview input[type="checkbox"]{accent-color:#1a8917!important}
.report-help-live-preview input[data-frame-timeline][type="range"],.report-help-live-preview input[data-frame-rate][type="range"],.report-help-live-preview input[data-player-rate][type="range"]{appearance:none!important;-webkit-appearance:none!important;height:20px!important;background:transparent!important}
.report-help-live-preview input[data-frame-timeline][type="range"]::-webkit-slider-runnable-track,.report-help-live-preview input[data-frame-rate][type="range"]::-webkit-slider-runnable-track,.report-help-live-preview input[data-player-rate][type="range"]::-webkit-slider-runnable-track{height:3px!important;border:0!important;border-radius:999px!important;background:#d9d9d9!important;box-shadow:none!important}
.report-help-live-preview input[data-frame-timeline][type="range"]::-webkit-slider-thumb{appearance:none!important;-webkit-appearance:none!important;width:12px!important;height:12px!important;margin-top:-4.5px!important;border:0!important;border-radius:50%!important;background:#242424!important;box-shadow:none!important}
.report-help-live-preview input[data-frame-rate][type="range"]::-webkit-slider-thumb,.report-help-live-preview input[data-player-rate][type="range"]::-webkit-slider-thumb{appearance:none!important;-webkit-appearance:none!important;width:8px!important;height:16px!important;margin-top:-6.5px!important;border:0!important;border-radius:2px!important;background:#242424!important;box-shadow:none!important}
.report-help-live-preview input[data-frame-timeline][type="range"]::-moz-range-track,.report-help-live-preview input[data-frame-rate][type="range"]::-moz-range-track,.report-help-live-preview input[data-player-rate][type="range"]::-moz-range-track{height:3px!important;border:0!important;border-radius:999px!important;background:#d9d9d9!important;box-shadow:none!important}
.report-help-live-preview input[data-frame-timeline][type="range"]::-moz-range-thumb{width:12px!important;height:12px!important;border:0!important;border-radius:50%!important;background:#242424!important;box-shadow:none!important}
.report-help-live-preview input[data-frame-rate][type="range"]::-moz-range-thumb,.report-help-live-preview input[data-player-rate][type="range"]::-moz-range-thumb{width:8px!important;height:16px!important;border:0!important;border-radius:2px!important;background:#242424!important;box-shadow:none!important}

@media(max-width:760px){
  html body>main section.report-section+section.report-section::before,html body>main section.report-section>h2,html body>main section.report-section>.report-text,html body>main section.report-section>h4,html body>main section.report-section>.muted{width:calc(100% - 24px)!important}
  html body>main section.report-section>h2{font-size:23px!important}
  html body>main .portable-player-header h3{font-size:19px!important}
  .report-help-dialog{width:92vw!important}
  .report-help-header{padding:20px 18px 15px!important}
  .report-help-header h2{font-size:24px!important}
  .report-help-content{padding:18px!important}
}
</style>`;
}

function injectMediumReaderDetailRefinement(html) {
  const source = String(html);
  if (source.includes('data-medium-reader-detail-refinement')) return source;
  const style = mediumReaderDetailCss();
  return source.includes('</head>')
    ? source.replace('</head>', `${style}\n</head>`)
    : `${style}\n${source}`;
}

module.exports = {
  injectMediumReaderDetailRefinement,
  mediumReaderDetailCss,
};
