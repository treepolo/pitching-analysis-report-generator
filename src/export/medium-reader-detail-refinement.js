'use strict';

function mediumReaderDetailCss() {
  return `<style data-medium-reader-detail-refinement>
/* Medium-style hierarchy: text lives in a readable centered column while media
   keeps the full report width. Sections are separated by whitespace and a rule
   aligned to that text column, not by boxed panels. */
html body>main section.report-section{position:relative!important;margin:0 0 12px!important;padding:8px 5px 22px!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}
html body>main section.report-section+section.report-section{margin-top:16px!important;padding-top:30px!important}
html body>main section.report-section+section.report-section::before{content:"";position:absolute;top:0;left:50%;width:calc(100% - 40px);max-width:680px;height:1px;background:#cfcfcf;transform:translateX(-50%)}
html body>main section.report-section>h2{position:relative;width:calc(100% - 40px);max-width:680px;margin:0 auto 20px!important;padding:0 0 13px!important;border:0!important;background:transparent!important;box-shadow:none!important;color:#242424!important;font-size:26px!important;font-weight:700!important;line-height:1.22!important;letter-spacing:-.015em!important}
html body>main section.report-section>h2::after{content:"";display:block;width:76px;height:2px;margin-top:11px;border-radius:999px;background:#1a8917}
html body>main section.report-section>.report-text,html body>main section.report-section>h4,html body>main section.report-section>.muted{box-sizing:border-box;width:calc(100% - 40px)!important;max-width:680px!important;margin-left:auto!important;margin-right:auto!important}
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

@media(max-width:760px){
  html body>main section.report-section+section.report-section::before,html body>main section.report-section>h2,html body>main section.report-section>.report-text,html body>main section.report-section>h4,html body>main section.report-section>.muted{width:calc(100% - 24px)!important}
  html body>main section.report-section>h2{font-size:23px!important}
  html body>main .portable-player-header h3{font-size:19px!important}
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
