'use strict';

function renderReportTheme() {
  return `
:root {
  color-scheme: light;
  font-family: Tahoma, "Segoe UI", "Microsoft JhengHei", sans-serif;
  --reader-face: #fff;
  --reader-face-light: #fafafa;
  --reader-text: #242424;
  --reader-muted: #6b6b6b;
  --reader-line: #e6e6e6;
  --reader-input-line: #d0d0d0;
  --reader-accent: #1a8917;
  --reader-accent-dark: #156d12;
  --reader-danger: #9b1c1c;
}
* { box-sizing: border-box; }
html { min-height: 100%; background: #f2f2f2; }
body, body * { -webkit-user-select: text; user-select: text; -webkit-touch-callout: default; }
body { min-width: 0; min-height: 100vh; margin: 0; overflow-x: hidden; background: #f2f2f2; color: var(--reader-text); font: 13px/1.5 Tahoma, "Segoe UI", "Microsoft JhengHei", sans-serif; }
button, input, select { font-family: Tahoma, "Segoe UI", "Microsoft JhengHei", sans-serif; font-size: 11px; }
main { width: min(calc(100% - 16px), 1100px); min-width: 0; margin: 8px auto 28px; padding: 0 8px 12px; border: 1px solid #e6e6e6; background: #fff; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
.report-header { position: relative; min-height: 54px; margin: 0 -8px 8px; padding: 10px 12px; border-bottom: 1px solid #e6e6e6; background: #fff; box-shadow: none; color: #242424; }
.report-header::before { display: none; }
.eyebrow { margin: 0 0 2px; color: #6b6b6b; font-size: 10px; font-weight: 600; letter-spacing: normal; text-shadow: none; text-transform: none; }
h1, h2, h3, h4 { color: #242424; line-height: 1.2; letter-spacing: normal; }
.report-header h1 { margin: 0; color: #242424; font-size: 20px; text-shadow: none; }
h2 { margin: -5px -5px 7px; padding: 4px 6px; border-bottom: 1px solid #e6e6e6; background: #fff; color: #242424; font-size: 14px; }
h3 { margin: 0; font-size: 13px; }
h4 { margin: 8px 0 4px; padding-bottom: 2px; border-bottom: 1px solid #e6e6e6; color: #6b6b6b; font-size: 12px; }
.report-section { margin: 0 0 8px; padding: 5px; border: 1px solid var(--reader-line); border-radius: 0; background: #fff; box-shadow: none; }
.report-text { margin: 0; padding: 2px 3px 5px; overflow-wrap: anywhere; white-space: pre-wrap; color: #242424; font-family: Georgia, "Times New Roman", "Noto Serif TC", "PMingLiU", serif; line-height: 1.55; }
.muted { color: var(--reader-muted); }
.report-media { min-width: 0; margin: 8px 0 0; }
.report-media video, .report-media img { display: block; width: 100%; max-height: 620px; border: 1px solid #4d4d4d; border-radius: 0; background: #000; object-fit: contain; }
.report-media img { border-color: #e6e6e6; background: #fff; }
figcaption { margin-top: 3px; color: #6b6b6b; font-size: 11px; }
.comparison-media { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }

.portable-player { width: 100%; min-width: 0; padding: 8px; border: 1px solid #e6e6e6; border-radius: 8px; background: #fafafa; box-shadow: none; }
.portable-player-header, .portable-player-side-heading, .portable-player-actions { display: flex; align-items: center; gap: 6px; }
.portable-player-header { margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #e6e6e6; }
.portable-player-header h3, .portable-player-side-heading h3 { margin: 0; }
.portable-player-grid { display: grid; width: 100%; min-width: 0; gap: 6px; }
.portable-player-grid-side-by-side { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.portable-player-grid-stacked { grid-template-columns: 1fr; }
.portable-player-side { width: 100%; min-width: 0; padding: 2px; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
.portable-player-grid-side-by-side > .portable-player-side + .portable-player-side, .portable-player-grid-side-by-side > .portable-player + .portable-player { padding-left: 8px; border-left: 1px solid #e6e6e6; }
.portable-player-grid-stacked > .portable-player-side + .portable-player-side, .portable-player-grid-stacked > .portable-player + .portable-player { margin-top: 4px; padding-top: 8px; border-top: 1px solid #e6e6e6; }
.portable-player[data-frame-selected="true"] { border-color: #24a96c; outline: none; background: #f5fbf5; box-shadow: 0 0 0 1px rgba(185,255,104,.42), 0 0 9px 2px rgba(66,211,146,.40); }
.report-help-live-preview .portable-player[data-frame-selected="true"] { border-color: #24a96c !important; box-shadow: 0 0 0 1px rgba(185,255,104,.42), 0 0 9px 2px rgba(66,211,146,.40) !important; }
.portable-player, .portable-player:focus, .portable-player:focus-visible, .portable-player-side, .portable-player-side:focus, .portable-frame-surface:focus { outline: none; }
.portable-player-side-heading { min-height: 20px; justify-content: space-between; margin-bottom: 3px; }
.portable-player-side-heading h3 { color: #242424; font-size: 12px; }
.portable-player-side-heading span { overflow-wrap: anywhere; color: var(--reader-muted); font-size: 10px; }
.portable-player-side video { max-height: 460px; }
.portable-frame-surface { position: relative; display: grid; min-height: 220px; place-items: center; overflow: hidden; border: 1px solid #4d4d4d; border-radius: 0; background: #000; box-shadow: none; }
.portable-frame-surface img, .portable-frame-surface video { width: 100%; max-height: 460px; border: 0; object-fit: contain; }
.portable-frame-surface [data-frame-placeholder] { position: absolute; inset: 50% auto auto 50%; transform: translate(-50%, -50%); color: #fff; font-size: 10px; pointer-events: none; }
.portable-frame-surface [hidden] { display: none; }
.portable-frame-side-status, .portable-frame-fallback { min-height: 16px; margin: 3px 0 0; color: #6b6b6b; font-size: 9px; }

.portable-frame-controls { display: grid; grid-template-columns: 25px 25px minmax(5.5rem, 5.5rem) minmax(0, 1fr) minmax(5.5rem, 5.5rem) 25px; column-gap: 5px; row-gap: 5px; margin-top: 6px; }
.portable-frame-navigation { display: contents; }
.portable-frame-navigation > button { width: 25px; min-width: 25px; min-height: 23px; height: 23px; padding: 0; display: inline-flex; align-items: center; justify-content: center; overflow: hidden; font-family: inherit; font-size: 14px; line-height: 1; text-align: center; }
.portable-frame-navigation [data-frame-current] { grid-column: 3; width: 5.5rem; min-width: 5.5rem; }
.portable-frame-navigation input[type="range"] { grid-column: 4; min-width: 0; width: 100%; padding: 0; margin: 0; }
.portable-frame-navigation [data-frame-total] { grid-column: 5; width: 5.5rem; min-width: 5.5rem; }
.portable-frame-rate-row { grid-column: 1 / -1; display: flex; align-items: center; gap: 5px; width: 100%; }
.portable-frame-rate-row input[type="range"] { flex: 1 1 auto; min-width: 0; padding: 0; margin: 0; }
.portable-frame-loop, .portable-player-loop { grid-column: 1 / -1; display: inline-flex; align-items: center; gap: 3px; color: #6b6b6b; font-size: 10px; }
.portable-frame-shared-controls { grid-column: 1 / -1; width: 100%; }
.portable-frame-controls button, .portable-player-rate-row button, .portable-frame-rate-row button, .portable-player-actions button, body>main .report-annotation-controls button { min-height: 23px; padding: 3px 8px; border: 1px solid #d0d0d0; border-radius: 999px; background: #fff; box-shadow: none; color: #242424; cursor: pointer; font-weight: normal; text-shadow: none; }
.portable-frame-controls button:hover:not(:disabled), .portable-player-rate-row button:hover:not(:disabled), .portable-frame-rate-row button:hover:not(:disabled), .portable-player-actions button:hover:not(:disabled), body>main .report-annotation-controls button:hover:not(:disabled) { border-color: #242424; background: #f2f2f2; color: #242424; }
.portable-frame-controls button:active:not(:disabled), .portable-player-rate-row button:active:not(:disabled), .portable-frame-rate-row button:active:not(:disabled), .portable-player-actions button:active:not(:disabled), body>main .report-annotation-controls button:active:not(:disabled) { background: #eaeaea; box-shadow: none; }
.portable-frame-controls button:disabled, .portable-player-rate-row button:disabled, .portable-frame-rate-row button:disabled, body>main .report-annotation-controls button:disabled { border-color: #e6e6e6; background: #f2f2f2; box-shadow: none; color: #b3b3b3; cursor: not-allowed; opacity: 1; }
.portable-frame-controls button:focus-visible, .portable-player-actions button:focus-visible, input:focus-visible { outline: 2px solid #1a8917; outline-offset: 2px; }
.portable-frame-controls output, .portable-player-side-controls output { color: #6b6b6b; font: 10px Consolas, "Courier New", monospace; font-variant-numeric: tabular-nums; white-space: nowrap; text-align: center; }
.portable-frame-player-status { grid-column: 1 / -1; min-height: 1rem; margin: 0; overflow: hidden; color: #6b6b6b; font-size: .75rem; line-height: 1.25; white-space: nowrap; text-overflow: ellipsis; }
.portable-frame-controls .portable-frame-player-status[data-state="error"] { color: var(--reader-danger); }
.portable-player-side-controls { display: grid; grid-template-columns: minmax(0, 1fr) max-content; column-gap: 5px; row-gap: 5px; margin-top: 5px; }
.portable-player-timeline-row { display: contents; }
.portable-player-timeline-row input[type="range"] { grid-column: 1; min-width: 0; width: 100%; }
.portable-player-timeline-row output { grid-column: 2; }
.portable-player-rate-row { grid-column: 1 / -1; display: flex; align-items: center; gap: 5px; width: 100%; }
.portable-player-side-controls label { display: inline-flex; align-items: center; gap: 3px; color: #6b6b6b; font-size: 10px; }
.portable-player-rate-input, .portable-player-rate-row input[type="number"] { flex: 0 0 5.5rem; width: 5.5rem; }
.portable-frame-rate-row input[type="number"] { flex: 0 0 4.5rem; width: 4.5rem; }
.portable-frame-rate-row input[type="number"], .portable-player-rate-row input[type="number"] { min-height: 23px; padding: 3px 5px; border: 1px solid #d0d0d0; border-radius: 4px; background: #fff; color: #242424; box-shadow: none; }
.portable-player-rate-reset, .portable-frame-rate-row button { flex: 0 0 25px; width: 25px; height: 23px; padding: 0 !important; border-radius: 0 !important; font-size: 13px; line-height: 1; }
.portable-player-actions { margin-top: 6px; }
input[type="range"] { min-height: 18px; accent-color: var(--reader-accent); }
input[type="checkbox"] { accent-color: var(--reader-accent); }

/* Readable text hierarchy with full-width media. */
html body>main section.report-section{position:relative!important;margin:0 0 12px!important;padding:8px 5px 22px!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}
html body>main section.report-section+section.report-section{margin-top:16px!important;padding-top:30px!important}
html body>main section.report-section+section.report-section::before{content:"";position:absolute;top:0;left:50%;width:calc(100% - 40px);max-width:560px;height:1px;background:#cfcfcf;transform:translateX(-50%)}
html body>main section.report-section>h2{position:relative;width:calc(100% - 40px);max-width:560px;margin:0 auto 20px!important;padding:0 0 13px!important;border:0!important;background:transparent!important;box-shadow:none!important;color:#242424!important;font-size:26px!important;font-weight:700!important;line-height:1.22!important;letter-spacing:-.015em!important}
html body>main section.report-section>h2::after{content:"";display:block;width:76px;height:2px;margin-top:11px;border-radius:999px;background:#1a8917}
html body>main section.report-section>.report-text,html body>main section.report-section>h4,html body>main section.report-section>.muted{box-sizing:border-box;width:calc(100% - 40px)!important;max-width:560px!important;margin-left:auto!important;margin-right:auto!important}
html body>main section.report-section>h4{font-size:18px!important;line-height:1.35!important}
html body>main section.report-section>.muted{display:block}
html body>main .portable-player-header{margin-bottom:11px!important;padding-bottom:10px!important;border-bottom:1px solid #e6e6e6!important}
html body>main .portable-player-header h3{color:#242424!important;font-size:21px!important;font-weight:700!important;line-height:1.28!important;letter-spacing:-.01em!important}
html body>main .portable-player-side-heading h3{color:#242424!important;font-size:17px!important;font-weight:650!important;line-height:1.3!important}

/* Player glyphs and range affordances. */
html body>main button[data-frame-action="toggle"]{display:grid!important;place-items:center!important;padding:0!important;font-size:0!important;line-height:1!important;text-align:center!important}
html body>main button[data-frame-action="toggle"]::before{content:"";display:block;width:0;height:0;border-top:5px solid transparent;border-bottom:5px solid transparent;border-left:8px solid #242424;transform:translateX(1px)}
html body>main button[data-frame-action="toggle"][aria-pressed="true"]::before{width:8px;height:10px;border:0;background:linear-gradient(90deg,#242424 0 3px,transparent 3px 5px,#242424 5px 8px);transform:none}
html body>main button[data-frame-action="toggle"]:disabled::before{border-left-color:#b3b3b3}
html body>main button[data-frame-action="toggle"][aria-pressed="true"]:disabled::before{background:linear-gradient(90deg,#b3b3b3 0 3px,transparent 3px 5px,#b3b3b3 5px 8px)}
html body>main input[data-frame-timeline][type="range"]{appearance:none!important;-webkit-appearance:none!important;height:20px!important;margin:0!important;padding:0!important;background:transparent!important;cursor:pointer}
html body>main input[data-frame-timeline][type="range"]::-webkit-slider-runnable-track{height:3px!important;border:0!important;border-radius:999px!important;background:#d9d9d9!important;box-shadow:none!important}
html body>main input[data-frame-timeline][type="range"]::-webkit-slider-thumb{appearance:none!important;-webkit-appearance:none!important;width:12px!important;height:12px!important;margin-top:-4.5px!important;border:0!important;border-radius:50%!important;background:#242424!important;box-shadow:none!important}
html body>main input[data-frame-timeline][type="range"]:hover::-webkit-slider-thumb{background:#1a8917!important}
html body>main input[data-frame-timeline][type="range"]::-moz-range-track{height:3px!important;border:0!important;border-radius:999px!important;background:#d9d9d9!important;box-shadow:none!important}
html body>main input[data-frame-timeline][type="range"]::-moz-range-progress{height:3px!important;border:0!important;border-radius:999px!important;background:#6b6b6b!important}
html body>main input[data-frame-timeline][type="range"]::-moz-range-thumb{width:12px!important;height:12px!important;border:0!important;border-radius:50%!important;background:#242424!important;box-shadow:none!important}
html body>main input[data-frame-timeline][type="range"]:hover::-moz-range-thumb{background:#1a8917!important}
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

/* Annotation skin; geometry stays in report-layout-refinement.js. */
body>main .report-annotation-controls{border:0!important;background:transparent!important;box-shadow:none!important;font-size:10px!important;color:#242424!important}
.report-help-live-preview .report-annotation-controls{border:0!important;background:#fafafa!important;box-shadow:none!important;font-size:10px!important;color:#242424!important}
body>main .report-annotation-jump,.report-help-live-preview .report-annotation-jump{font-size:10px!important}
body>main .report-annotation-track-toggle,.report-help-live-preview .report-annotation-track-toggle{border-color:#e6e6e6!important;background:#fff!important;color:#242424!important}

/* Tree Polo branding. Package helper provides semantic title/icon/background assets; this theme owns appearance. */
body>main .tree-polo-report-header{display:flex;align-items:center;min-height:54px;margin:0 -8px 8px;padding:10px 12px;border-bottom:1px solid #e6e6e6;background:#fff;box-shadow:none;color:#242424}
body>main .tree-polo-report-header::before,body>main .tree-polo-report-header::after{display:none!important}
body>main .tree-polo-brand-copy{position:relative;z-index:2;min-width:0}
body>main .tree-polo-report-header h1{font-family:Tahoma,"Segoe UI","Microsoft JhengHei","Microsoft YaHei",sans-serif!important;font-size:18px!important;font-weight:700!important;line-height:1.28!important;letter-spacing:.035em!important;color:#242424!important;text-shadow:none!important}
body>main .tree-polo-signature{display:inline-block!important;color:#6b6b6b!important;font-size:.84em!important;font-weight:500!important;letter-spacing:.02em!important;margin-left:.12em!important;vertical-align:.08em!important}
body>main .tree-polo-signature-tree,body>main .tree-polo-signature-polo{color:#1a8917!important;font-weight:550;text-shadow:none!important}
body[data-tree-polo-background="true"]{background:transparent;position:relative;isolation:isolate}
body[data-tree-polo-background="true"]::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background-color:#d8e8df;background-image:url("images/tree-polo-report-background.jpg");background-size:cover;background-position:center;background-repeat:no-repeat}

/* Help skin and typography. Structural geometry stays in report-help-runtime.js. */
.report-help-trigger{border:1px solid #d0d0d0!important;border-radius:999px!important;background:#fff!important;box-shadow:none!important;color:#242424!important;font:600 .82rem/1.2 system-ui,-apple-system,"Segoe UI",sans-serif!important;text-shadow:none!important}
.report-help-trigger:hover{border-color:#242424!important;background:#f2f2f2!important;color:#242424!important}
.report-help-icon{border:0!important;border-radius:50%!important;background:#242424!important;box-shadow:none!important;color:#fff!important;font:bold 12px/1 Georgia,serif!important}
.report-help-backdrop{background:rgba(0,0,0,.30)!important;backdrop-filter:blur(2px)!important}
.report-help-dialog{border:1px solid #e6e6e6!important;border-radius:14px!important;background:#fff!important;box-shadow:0 20px 60px rgba(0,0,0,.18)!important;color:#242424!important}
.report-help-header{border:0!important;border-bottom:1px solid #e6e6e6!important;border-radius:0!important;background:#fff!important;box-shadow:none!important}
.report-help-header h2{padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important;color:#242424!important;font-size:28px!important;font-weight:700!important;line-height:1.2!important;letter-spacing:-.015em!important;text-shadow:none!important}
.report-help-header p{color:#6b6b6b!important;font-size:14px!important;line-height:1.5!important}
.report-help-close{border:1px solid #e6e6e6!important;border-radius:50%!important;background:#fff!important;box-shadow:none!important;color:#242424!important;font:700 18px/1 sans-serif!important}
.report-help-close:hover{border-color:#242424!important;background:#f2f2f2!important}
.report-help-content h3{color:#242424!important;font-size:20px!important;font-weight:700!important;line-height:1.3!important}
.report-help-figure{border:1px solid #e6e6e6!important;border-radius:12px!important;background:#fafafa!important;box-shadow:none!important}
.report-help-live-preview{border-radius:8px!important;background:#fff!important;box-shadow:none!important}
.report-help-live-preview video{background:#000!important}
.report-help-live-preview-empty{border:1px dashed #d0d0d0!important;border-radius:8px!important;background:#fafafa!important;color:#6b6b6b!important}
.report-help-preview-marker,.report-help-number,.report-help-live-marker{border-radius:50%!important;background:#1a8917!important;box-shadow:none!important;color:#fff!important}
.report-help-preview-marker{border:2px solid #fff!important;font:bold 11px/1 system-ui,sans-serif!important}
.report-help-live-marker{border:2px solid #fff!important;font:bold 12px/1 system-ui,sans-serif!important}
.report-help-live-target{outline:2px solid rgba(26,137,23,.68)!important;outline-offset:2px!important}.report-help-live-target.is-current{outline:3px solid #156d12!important;outline-offset:3px!important}
.report-help-figure figcaption{color:#6b6b6b!important;font-size:13px!important;line-height:1.5!important}
.report-help-guide li{border:1px solid #e6e6e6!important;border-radius:10px!important;background:#fff!important;box-shadow:none!important}
.report-help-number{font-size:.78rem!important;font-weight:700!important}
.report-help-guide strong{color:#242424!important;font-size:14px!important}.report-help-guide p{color:#6b6b6b!important;font-size:13px!important;line-height:1.55!important}
.report-help-shortcut{border:1px solid #e6e6e6!important;border-radius:9px!important;background:#fff!important;color:#242424!important;font-size:13px!important}.report-help-shortcut kbd{border:1px solid #d0d0d0!important;border-radius:5px!important;background:#f7f7f7!important;box-shadow:none!important;color:#242424!important;font:600 .76rem/1.2 system-ui,sans-serif!important}
.report-help-note{border-left:3px solid #1a8917!important;border-radius:0 8px 8px 0!important;background:#f7f7f7!important;color:#525252!important;font-size:13px!important;line-height:1.55!important}
.report-help-actions{border-top:1px solid #e6e6e6!important}.report-help-actions span{color:#6b6b6b!important;font-size:12px!important}
.report-help-tutorial-button,.report-help-tutorial-stop,.report-help-tutorial-controls button{border:1px solid #d0d0d0!important;border-radius:999px!important;background:#fff!important;box-shadow:none!important;color:#242424!important;text-shadow:none!important}
.report-help-tutorial-button{font:600 .8rem/1.2 system-ui,sans-serif!important}.report-help-tutorial-stop{font:700 .76rem/1.2 system-ui,sans-serif!important}.report-help-tutorial-controls button{font:600 .76rem/1.2 system-ui,sans-serif!important}
.report-help-tutorial-button:hover,.report-help-tutorial-stop:hover,.report-help-tutorial-controls button:hover:not(:disabled){border-color:#242424!important;background:#f2f2f2!important;color:#242424!important}
.report-help-tutorial-button,.report-help-tutorial-controls [data-report-help-tutorial-full]{border-color:#1a8917!important;background:#1a8917!important;color:#fff!important}
.report-help-tutorial-button:hover,.report-help-tutorial-controls [data-report-help-tutorial-full]:hover{border-color:#156d12!important;background:#156d12!important;color:#fff!important}
.report-help-tutorial-controls button:disabled{opacity:.48!important}
.report-help-tutorial-panel{border:1px solid #e6e6e6!important;border-radius:12px!important;background:#fff!important;box-shadow:0 12px 34px rgba(0,0,0,.16)!important;color:#242424!important;font-family:system-ui,-apple-system,"Segoe UI",sans-serif!important}
.report-help-tutorial-panel-header{border-bottom:1px solid #e6e6e6!important;background:#fff!important}
.report-help-tutorial-step{color:#6b6b6b!important;font-size:.75rem!important;font-weight:700!important}.report-help-tutorial-copy strong{font-size:.98rem!important}.report-help-tutorial-copy p{color:#6b6b6b!important;font-size:.82rem!important;line-height:1.5!important}
.report-help-trigger:focus-visible,.report-help-close:focus-visible,.report-help-tutorial-button:focus-visible,.report-help-live-marker:focus-visible,.report-help-tutorial-panel button:focus-visible{outline:2px solid #1a8917!important;outline-offset:2px!important}
.report-help-live-preview .portable-player{border:1px solid #e6e6e6!important;border-radius:8px!important;background:#fafafa!important;box-shadow:none!important}
.report-help-live-preview .portable-player-header{border-bottom:1px solid #e6e6e6!important}
.report-help-live-preview .portable-player-header h3{color:#242424!important;font-size:18px!important;font-weight:700!important}
.report-help-live-preview .portable-player-side-heading h3{color:#242424!important;font-size:15px!important;font-weight:650!important}
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

@media (max-width: 700px) {
  main { width: 100%; margin: 0; padding-inline: 5px; border-right: 0; border-left: 0; box-shadow: none; }
  .report-header { margin-inline: -5px; }
  .report-section { margin-bottom: 6px; }
  .comparison-media, .portable-player-grid-side-by-side { grid-template-columns: 1fr; }
  .portable-player-grid-side-by-side > .portable-player-side + .portable-player-side, .portable-player-grid-side-by-side > .portable-player + .portable-player { margin-top: 4px; padding-top: 8px; padding-left: 2px; border-top: 1px solid #e6e6e6; border-left: 0; }
  .portable-player-side-controls { grid-template-columns: minmax(0, 1fr) max-content; }
  body>main .tree-polo-report-header{min-height:54px;padding:10px 12px}
  body>main .tree-polo-report-header h1{font-size:16px!important;letter-spacing:.025em!important}
  body>main .tree-polo-signature{font-size:.82em!important}
  body>main .portable-frame-navigation [data-frame-current],body>main .portable-frame-navigation [data-frame-total],.report-help-live-preview .portable-frame-navigation [data-frame-current],.report-help-live-preview .portable-frame-navigation [data-frame-total]{font-size:10px!important}
}
@media(max-width:760px){
  html body>main section.report-section+section.report-section::before,html body>main section.report-section>h2,html body>main section.report-section>.report-text,html body>main section.report-section>h4,html body>main section.report-section>.muted{width:calc(100% - 24px)!important}
  html body>main section.report-section>h2{font-size:23px!important}
  html body>main .portable-player-header h3{font-size:19px!important}
  .report-help-header h2{font-size:24px!important}
}
@media (max-width: 480px) {
  body { font-size: 12px; }
  .report-header { min-height: 50px; }
  .report-header h1 { font-size: 17px; }
  .report-section { padding: 4px; }
  .portable-player { padding: 6px; }
  .portable-frame-surface { min-height: 160px; }
  .portable-frame-navigation > button, .portable-frame-rate-row button, .portable-player-actions button { min-height: 30px; }
}
@media (max-width: 420px) {
  body>main .portable-frame-navigation [data-frame-current],body>main .portable-frame-navigation [data-frame-total],.report-help-live-preview .portable-frame-navigation [data-frame-current],.report-help-live-preview .portable-frame-navigation [data-frame-total]{font-size:9px!important}
}
@media (forced-colors: active) {
  .report-header, h2 { background: Canvas; color: CanvasText; }
  .report-header h1, .report-header .eyebrow { color: CanvasText; text-shadow: none; }
}
@media print {
  html, body { background: #fff; }
  main { width: 100%; margin: 0; border: 0; box-shadow: none; }
  .report-header { break-after: avoid; }
  .report-section, .portable-player { break-inside: avoid; }
  body[data-tree-polo-background="true"]::before { display: none; }
}
  `;
}

module.exports = { renderReportTheme };
