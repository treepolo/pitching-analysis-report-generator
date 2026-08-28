'use strict';

function renderXp7ReaderTheme() {
  return `
    :root {
      color-scheme: light;
      font-family: Tahoma, "Segoe UI", "Microsoft JhengHei", sans-serif;
      --reader-face: #ece9d8;
      --reader-face-light: #f7f6ef;
      --reader-text: #1e1e1e;
      --reader-muted: #536577;
      --reader-line: #9d9a8e;
      --reader-input-line: #7f9db9;
      --reader-blue: #316ac5;
      --reader-blue-dark: #174e87;
      --reader-green: #267326;
      --reader-danger: #9b1c1c;
    }
    * { box-sizing: border-box; }
    html { min-height: 100%; background: #c9dceb; }
    body, body * { -webkit-user-select: text; user-select: text; -webkit-touch-callout: default; }
    body { min-width: 0; min-height: 100vh; margin: 0; overflow-x: hidden; background: #c9dceb; color: var(--reader-text); font: 13px/1.5 Tahoma, "Segoe UI", "Microsoft JhengHei", sans-serif; }
    button, input, select { font-family: Tahoma, "Segoe UI", "Microsoft JhengHei", sans-serif; font-size: 11px; }
    main { width: min(calc(100% - 16px), 1100px); min-width: 0; margin: 8px auto 28px; padding: 0 8px 12px; border: 1px solid #174e87; background: var(--reader-face); box-shadow: 0 3px 10px rgba(24,61,98,.3); }
    .report-header { position: relative; min-height: 54px; margin: 0 -8px 8px; padding: 7px 10px 7px 34px; border-bottom: 1px solid #0d3d70; background: linear-gradient(180deg, #72b6ec 0%, #438fce 42%, #1764aa 48%, #0f4d8a 100%); box-shadow: inset 0 1px 0 rgba(255,255,255,.45), 0 1px 2px rgba(0,0,0,.28); color: #fff; }
    .report-header::before { position: absolute; top: 10px; left: 9px; width: 16px; height: 16px; border: 1px solid rgba(255,255,255,.88); background: linear-gradient(90deg, transparent 47%, rgba(255,255,255,.68) 48%, rgba(255,255,255,.68) 53%, transparent 54%), linear-gradient(0deg, transparent 47%, rgba(255,255,255,.68) 48%, rgba(255,255,255,.68) 53%, transparent 54%), linear-gradient(135deg, #8dcc49 0%, #58a930 48%, #f3d64d 49%, #e5a824 100%); box-shadow: 0 1px 1px rgba(0,0,0,.45); content: ""; }
    .eyebrow { margin: 0 0 2px; color: #fff; font-size: 10px; font-weight: bold; letter-spacing: normal; text-shadow: 0 1px 1px #0a3f76; text-transform: none; }
    h1, h2, h3, h4 { color: #1f2d3d; line-height: 1.2; letter-spacing: normal; }
    .report-header h1 { margin: 0; color: #fff; font-size: 20px; text-shadow: 0 1px 1px #0a3f76; }
    h2 { margin: -5px -5px 7px; padding: 4px 6px; border-bottom: 1px solid #7fa2c2; background: linear-gradient(180deg, #e9f4fe 0%, #c7dff2 48%, #b1d0e8 100%); color: #173b5b; font-size: 14px; }
    h3 { margin: 0; font-size: 13px; }
    h4 { margin: 8px 0 4px; padding-bottom: 2px; border-bottom: 1px solid #d0cdc3; color: #475d70; font-size: 12px; }
    .report-section { margin: 0 0 8px; padding: 5px; border: 1px solid var(--reader-line); border-radius: 0; background: #fff; box-shadow: none; }
    .report-text { margin: 0; padding: 2px 3px 5px; overflow-wrap: anywhere; white-space: pre-wrap; line-height: 1.55; }
    .muted { color: var(--reader-muted); }
    .report-media { min-width: 0; margin: 8px 0 0; }
    .report-media video, .report-media img { display: block; width: 100%; max-height: 620px; border: 1px solid #4d4d4d; border-radius: 0; background: #000; object-fit: contain; }
    .report-media img { border-color: var(--reader-input-line); background: #fff; }
    figcaption { margin-top: 3px; color: var(--reader-muted); font-size: 11px; }
    .comparison-media { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }

    .portable-player { width: 100%; min-width: 0; padding: 8px; border: 1px solid #8fa9c1; border-radius: 1px; background: #f6f8fa; box-shadow: none; }
    .portable-player-header, .portable-player-side-heading, .portable-player-actions { display: flex; align-items: center; gap: 6px; }
    .portable-player-header { margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #b9c6d1; }
    .portable-player-header h3, .portable-player-side-heading h3 { margin: 0; }
    .portable-player-grid { display: grid; width: 100%; min-width: 0; gap: 6px; }
    .portable-player-grid-side-by-side { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .portable-player-grid-stacked { grid-template-columns: 1fr; }
    .portable-player-side { width: 100%; min-width: 0; padding: 2px; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
    .portable-player-grid-side-by-side > .portable-player-side + .portable-player-side, .portable-player-grid-side-by-side > .portable-player + .portable-player { padding-left: 8px; border-left: 1px solid #c2bfb5; }
    .portable-player-grid-stacked > .portable-player-side + .portable-player-side, .portable-player-grid-stacked > .portable-player + .portable-player { margin-top: 4px; padding-top: 8px; border-top: 1px solid #c2bfb5; }
    .portable-player[data-frame-selected="true"] { border-color: #1764aa; outline: none; background: #eef6fc; box-shadow: none; }
    .portable-player, .portable-player:focus, .portable-player:focus-visible, .portable-player-side, .portable-player-side:focus, .portable-frame-surface:focus { outline: none; }
    .portable-player-side-heading { min-height: 20px; justify-content: space-between; margin-bottom: 3px; }
    .portable-player-side-heading h3 { color: #1f3f5b; font-size: 12px; }
    .portable-player-side-heading span { overflow-wrap: anywhere; color: var(--reader-muted); font-size: 10px; }
    .portable-player-side video { max-height: 460px; }
    .portable-frame-surface { position: relative; display: grid; min-height: 220px; place-items: center; overflow: hidden; border: 1px solid #4d4d4d; border-radius: 0; background: #000; box-shadow: none; }
    .portable-frame-surface img, .portable-frame-surface video { width: 100%; max-height: 460px; border: 0; object-fit: contain; }
    .portable-frame-surface [data-frame-placeholder] { position: absolute; inset: 50% auto auto 50%; transform: translate(-50%, -50%); color: #fff; font-size: 10px; pointer-events: none; }
    .portable-frame-surface [hidden] { display: none; }
    .portable-frame-side-status, .portable-frame-fallback { min-height: 16px; margin: 3px 0 0; color: #5f6d78; font-size: 9px; }

    .portable-frame-controls { display: grid; grid-template-columns: 25px 25px minmax(5.5rem, 5.5rem) minmax(0, 1fr) minmax(5.5rem, 5.5rem) 25px; column-gap: 5px; row-gap: 5px; margin-top: 6px; }
    .portable-frame-navigation { display: contents; }
    .portable-frame-navigation > button { width: 25px; min-width: 25px; min-height: 23px; height: 23px; padding: 0; display: inline-flex; align-items: center; justify-content: center; overflow: hidden; font-family: inherit; font-size: 14px; line-height: 1; text-align: center; }
    .portable-frame-navigation [data-frame-current] { grid-column: 3; width: 5.5rem; min-width: 5.5rem; }
    .portable-frame-navigation input[type="range"] { grid-column: 4; min-width: 0; width: 100%; padding: 0; margin: 0; }
    .portable-frame-navigation [data-frame-total] { grid-column: 5; width: 5.5rem; min-width: 5.5rem; }
    .portable-frame-rate-row { grid-column: 1 / -1; display: flex; align-items: center; gap: 5px; width: 100%; }
    .portable-frame-rate-row input[type="range"] { flex: 1 1 auto; min-width: 0; padding: 0; margin: 0; }
    .portable-frame-loop, .portable-player-loop { grid-column: 1 / -1; display: inline-flex; align-items: center; gap: 3px; color: #344b60; font-size: 10px; }
    .portable-frame-shared-controls { grid-column: 1 / -1; width: 100%; }
    .portable-frame-controls button, .portable-player-rate-row button, .portable-frame-rate-row button, .portable-player-actions button { min-height: 23px; padding: 3px 8px; border: 1px solid #707070; border-radius: 2px; background: linear-gradient(180deg, #fff 0%, #f2f2f2 42%, #e2e2e2 48%, #d8d8d8 100%); box-shadow: inset 0 0 0 1px rgba(255,255,255,.72); color: var(--reader-text); cursor: pointer; font-weight: normal; text-shadow: 0 1px #fff; }
    .portable-frame-controls button:hover:not(:disabled), .portable-player-rate-row button:hover:not(:disabled), .portable-frame-rate-row button:hover:not(:disabled), .portable-player-actions button:hover:not(:disabled) { border-color: #3c7fb1; background: linear-gradient(180deg, #fafdff 0%, #eaf6fd 42%, #d9eef9 48%, #c5e4f3 100%); color: #163c5d; }
    .portable-frame-controls button:active:not(:disabled), .portable-player-rate-row button:active:not(:disabled), .portable-frame-rate-row button:active:not(:disabled), .portable-player-actions button:active:not(:disabled) { border-color: #2c628b; background: #dceef6; box-shadow: inset 0 1px 3px rgba(0,0,0,.24); }
    .portable-frame-controls button:disabled, .portable-player-rate-row button:disabled, .portable-frame-rate-row button:disabled { border-color: #a9a9a9; background: #e9e9e9; box-shadow: inset 0 0 0 1px #f7f7f7; color: #8b8b8b; cursor: not-allowed; opacity: 1; }
    .portable-frame-controls button:focus-visible, .portable-player-actions button:focus-visible, input:focus-visible { outline: 1px dotted #1e1e1e; outline-offset: -3px; }
    .portable-frame-controls output, .portable-player-side-controls output { color: #3f4d59; font: 10px Consolas, "Courier New", monospace; font-variant-numeric: tabular-nums; white-space: nowrap; text-align: center; }
    .portable-frame-player-status { grid-column: 1 / -1; min-height: 1rem; margin: 0; overflow: hidden; color: #6f7987; font-size: .75rem; line-height: 1.25; white-space: nowrap; text-overflow: ellipsis; }
    .portable-frame-controls .portable-frame-player-status[data-state="loaded"], .portable-frame-controls .portable-frame-player-status[data-state="pending"] { color: #6f7987; }
    .portable-frame-controls .portable-frame-player-status[data-state="error"] { color: var(--reader-danger); }
    .portable-player-side-controls { display: grid; grid-template-columns: minmax(0, 1fr) max-content; column-gap: 5px; row-gap: 5px; margin-top: 5px; }
    .portable-player-timeline-row { display: contents; }
    .portable-player-timeline-row input[type="range"] { grid-column: 1; min-width: 0; width: 100%; }
    .portable-player-timeline-row output { grid-column: 2; }
    .portable-player-rate-row { grid-column: 1 / -1; display: flex; align-items: center; gap: 5px; width: 100%; }
    .portable-player-side-controls label { display: inline-flex; align-items: center; gap: 3px; color: #344b60; font-size: 10px; }
    .portable-player-rate-input, .portable-player-rate-row input[type="number"] { flex: 0 0 5.5rem; width: 5.5rem; }
    .portable-frame-rate-row input[type="number"] { flex: 0 0 4.5rem; width: 4.5rem; }
    .portable-frame-rate-row input[type="number"], .portable-player-rate-row input[type="number"] { min-height: 23px; padding: 3px 5px; border: 1px solid var(--reader-input-line); border-radius: 0; background: #fff; color: var(--reader-text); box-shadow: inset 1px 1px 2px rgba(0,0,0,.12); }
    .portable-player-rate-reset, .portable-frame-rate-row button { flex: 0 0 25px; width: 25px; height: 23px; padding: 0 !important; border-radius: 0 !important; font-size: 13px; line-height: 1; }
    .portable-player-actions { margin-top: 6px; }
    input[type="range"] { min-height: 18px; accent-color: var(--reader-blue); }
    input[type="checkbox"] { accent-color: var(--reader-blue); }

    @media (max-width: 700px) {
      main { width: 100%; margin: 0; padding-inline: 5px; border-right: 0; border-left: 0; box-shadow: none; }
      .report-header { margin-inline: -5px; }
      .report-section { margin-bottom: 6px; }
      .comparison-media, .portable-player-grid-side-by-side { grid-template-columns: 1fr; }
      .portable-player-grid-side-by-side > .portable-player-side + .portable-player-side, .portable-player-grid-side-by-side > .portable-player + .portable-player { margin-top: 4px; padding-top: 8px; padding-left: 2px; border-top: 1px solid #c2bfb5; border-left: 0; }
      .portable-frame-controls { grid-template-columns: 1fr; }
      .portable-frame-navigation { display: flex; flex-wrap: wrap; align-items: center; }
      .portable-frame-navigation input[type="range"] { flex: 1 1 10rem; }
      .portable-frame-navigation [data-frame-current], .portable-frame-navigation [data-frame-total] { flex: 0 0 5.5rem; width: 5.5rem; }
      .portable-frame-rate-row { grid-column: 1; }
      .portable-player-side-controls { grid-template-columns: minmax(0, 1fr) max-content; }
    }
    @media (max-width: 480px) {
      body { font-size: 12px; }
      .report-header { min-height: 50px; }
      .report-header h1 { font-size: 17px; }
      .report-section { padding: 4px; }
      h2 { margin: -4px -4px 6px; }
      .portable-player { padding: 6px; }
      .portable-frame-surface { min-height: 160px; }
      .portable-frame-navigation > button, .portable-frame-rate-row button, .portable-player-actions button { min-height: 30px; }
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
    }
  `;
}

module.exports = { renderXp7ReaderTheme };
