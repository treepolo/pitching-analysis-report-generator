'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const {
  injectReportLayoutRefinement,
  reportLayoutRefinementCss,
} = require('../../src/export/report-layout-refinement');

const repositoryRoot = path.resolve(__dirname, '..', '..');

test('layout refinement no longer owns report or help visual skin', () => {
  const css = reportLayoutRefinementCss();
  assert.doesNotMatch(css, /tree-polo-brand-copy h1|tree-polo-signature/u);
  assert.doesNotMatch(css, /\.report-help-header(?:\s|\{|h2|p)/u);
  assert.doesNotMatch(css, /background:\s|box-shadow:\s/u);
});

test('annotation controls share the player control region with one separator and no box', () => {
  const css = reportLayoutRefinementCss();
  assert.match(css, /body>main \.report-annotation-controls/u);
  assert.match(css, /\.report-help-live-preview \.report-annotation-controls/u);
  assert.match(css, /grid-column: 1 \/ -1 !important/u);
  assert.match(css, /width: 100% !important/u);
  assert.match(css, /margin: \.18rem 0 0 !important/u);
  assert.match(css, /padding: \.35rem 0 0 !important/u);
  assert.match(css, /border-top: 1px solid #e6e6e6 !important/u);
  assert.match(css, /gap: \.18rem \.42rem !important/u);
  assert.doesNotMatch(css, /\.report-annotation-controls[\s\S]{0,320}?(?:background|box-shadow|border-left|border-right|border-bottom)/u);
});

test('player glyph geometry centers toggle and frame-step affordances independently of font baselines', () => {
  const css = reportLayoutRefinementCss();
  assert.match(css, /\.portable-frame-navigation > button[\s\S]*?position: relative !important[\s\S]*?place-items: center !important/u);
  assert.match(css, /button\[data-frame-action="toggle"\]::before[\s\S]*?left: 50% !important[\s\S]*?top: 50% !important/u);
  assert.match(css, /button\[data-frame-action="toggle"\]\[aria-pressed="true"\]::before[\s\S]*?translate\(-50%, -50%\)/u);
  assert.match(css, /button\[data-frame-action="previous"\][\s\S]*?font-size: 0 !important/u);
  assert.match(css, /button\[data-frame-action="previous"\]::before[\s\S]*?rotate\(135deg\)/u);
  assert.match(css, /button\[data-frame-action="next"\]::before[\s\S]*?rotate\(-45deg\)/u);
});

test('annotation navigation buttons and toggles retain player-scale geometry', () => {
  const css = reportLayoutRefinementCss();
  assert.match(css, /\.report-annotation-jump/u);
  assert.match(css, /min-height: 20px !important/u);
  assert.match(css, /height: 20px !important/u);
  assert.match(css, /padding: 1px 6px !important/u);
  assert.match(css, /\.report-annotation-controls input\[type="checkbox"\]/u);
  assert.match(css, /width: 12px !important/u);
  assert.match(css, /height: 12px !important/u);
  assert.match(css, /\.report-annotation-swatch/u);
  assert.match(css, /width: 9px !important/u);
  assert.match(css, /height: 9px !important/u);
});

test('frame timeline consumes remaining width while frame labels shrink to content', () => {
  const css = reportLayoutRefinementCss();
  assert.match(css, /grid-template-columns: 25px 25px max-content minmax\(0, 1fr\) max-content 25px !important/u);
  assert.match(css, /\[data-frame-current\]/u);
  assert.match(css, /\[data-frame-total\]/u);
  assert.match(css, /width: max-content !important/u);
  assert.match(css, /min-width: 0 !important/u);
  assert.match(css, /portable-frame-navigation input\[type="range"\]/u);
  assert.match(css, /width: 100% !important/u);
});

test('playback-rate slider has equal outer columns so 1x is centered in the player row', () => {
  const css = reportLayoutRefinementCss();
  assert.match(css, /\.portable-frame-rate-row[\s\S]*?grid-template-columns: 4\.5rem minmax\(0, 1fr\) 4\.5rem !important/u);
  assert.match(css, /\.portable-frame-rate-row button[\s\S]*?justify-self: end !important/u);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?grid-template-columns: 4\.5rem minmax\(0, 1fr\) 4\.5rem !important/u);
  assert.match(css, /@media \(max-width: 420px\)[\s\S]*?grid-template-columns: 4\.2rem minmax\(0, 1fr\) 4\.2rem !important/u);
});

test('routine playback status line is hidden but errors remain visible', () => {
  const css = reportLayoutRefinementCss();
  assert.match(css, /\.portable-frame-player-status \{[\s\S]*?display: none !important/u);
  assert.match(css, /\.portable-frame-player-status\[data-state="error"\][\s\S]*?display: block !important/u);
  assert.match(css, /\.report-help-live-preview \.portable-frame-player-status/u);
});

test('mobile annotation points shrink without changing their position selectors', () => {
  const css = reportLayoutRefinementCss();
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?\.report-annotation-point[\s\S]*?r: 3\.2px !important[\s\S]*?stroke-width: \.8 !important/u);
  assert.match(css, /@media \(max-width: 420px\)[\s\S]*?\.report-annotation-point[\s\S]*?r: 2\.6px !important[\s\S]*?stroke-width: \.65 !important/u);
  assert.doesNotMatch(css, /\.report-annotation-point[^}]*\b(?:cx|cy)\s*:/u);
});

test('mobile layout uses explicit compact navigation and symmetric rate grids', () => {
  const css = reportLayoutRefinementCss();
  assert.match(css, /@media \(max-width: 700px\)/u);
  assert.match(css, /\.portable-frame-navigation \{[\s\S]*?display: grid !important/u);
  assert.match(css, /grid-template-columns: 32px 32px max-content minmax\(0, 1fr\) max-content 32px !important/u);
  assert.match(css, /grid-template-columns: 4\.5rem minmax\(0, 1fr\) 4\.5rem !important/u);
  assert.match(css, /@media \(max-width: 420px\)/u);
  assert.match(css, /grid-template-columns: 30px 30px max-content minmax\(0, 1fr\) max-content 30px !important/u);
});

test('layout refinement covers cloned player geometry without styling the help shell', () => {
  const css = reportLayoutRefinementCss();
  const helpCloneSelectors = css.match(/\.report-help-live-preview/g) || [];
  assert.ok(helpCloneSelectors.length >= 18);
  assert.doesNotMatch(css, /\.report-help-(?:header|dialog|guide|note|shortcut|actions)/u);
});

test('layout refinement injects once before the closing head', () => {
  const source = '<html><head><title>測試</title></head><body></body></html>';
  const once = injectReportLayoutRefinement(source);
  const twice = injectReportLayoutRefinement(once);
  assert.match(once, /data-report-layout-refinement/u);
  assert.equal((twice.match(/data-report-layout-refinement/g) || []).length, 1);
  assert.ok(once.indexOf('data-report-layout-refinement') < once.indexOf('</head>'));
});

test('report renderer loads and applies the layout refinement after help injection', async () => {
  const source = await fs.readFile(path.join(repositoryRoot, 'src', 'export', 'report-renderer.js'), 'utf8');
  assert.match(source, /require\('\.\/report-layout-refinement'\)/u);
  const helpIndex = source.indexOf('html = injectReportHelpHtml(html);');
  const layoutIndex = source.indexOf('html = injectReportLayoutRefinement(html);');
  assert.ok(helpIndex >= 0);
  assert.ok(layoutIndex > helpIndex);
});
