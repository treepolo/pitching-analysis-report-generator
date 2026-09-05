'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const {
  injectReportTitleAlignmentRefinement,
  titleAlignmentCss,
} = require('../../src/export/report-title-alignment-refinement');
const { renderReportTheme } = require('../../src/export/report-theme');

const repositoryRoot = path.resolve(__dirname, '..', '..');

test('report title copy is centered against the full title bar', () => {
  const css = titleAlignmentCss();
  assert.match(css, /\.tree-polo-brand-copy \{[\s\S]*?position: absolute !important/u);
  assert.match(css, /left: 50% !important/u);
  assert.match(css, /top: 50% !important/u);
  assert.match(css, /transform: translate\(-50%, -50%\) !important/u);
  assert.match(css, /text-align: center !important/u);
});

test('centered title protects the logo area and long names', () => {
  const css = titleAlignmentCss();
  assert.match(css, /max-width: calc\(100% - 170px\) !important/u);
  assert.match(css, /white-space: nowrap !important/u);
  assert.match(css, /text-overflow: ellipsis !important/u);
  assert.match(css, /@media \(max-width: 700px\)/u);
  assert.match(css, /max-width: calc\(100% - 136px\) !important/u);
});

test('title alignment owns positioning only while canonical theme owns signature typography', () => {
  const alignmentCss = titleAlignmentCss();
  const themeCss = renderReportTheme();
  assert.doesNotMatch(alignmentCss, /tree-polo-signature/u);
  assert.doesNotMatch(alignmentCss, /font-size:|font-weight:|letter-spacing:/u);
  assert.match(themeCss, /tree-polo-signature\{[^}]*font-size:\.84em!important[^}]*font-weight:500!important/u);
  assert.match(themeCss, /tree-polo-signature\{[^}]*letter-spacing:\.02em!important[^}]*margin-left:\.12em!important/u);
  assert.match(themeCss, /@media \(max-width: 700px\)[\s\S]*tree-polo-signature\{font-size:\.82em!important\}/u);
});

test('title alignment refinement injects once', () => {
  const source = '<html><head></head><body><main></main></body></html>';
  const once = injectReportTitleAlignmentRefinement(source);
  const twice = injectReportTitleAlignmentRefinement(once);
  assert.equal((twice.match(/data-report-title-alignment-refinement/g) || []).length, 1);
});

test('renderer applies title alignment after floating layout and before entry spotlight', async () => {
  const source = await fs.readFile(path.join(repositoryRoot, 'src', 'export', 'report-renderer.js'), 'utf8');
  assert.match(source, /require\('\.\/report-title-alignment-refinement'\)/u);
  const floatingIndex = source.indexOf('html = injectReportFloatingUiRefinement(html);');
  const titleIndex = source.indexOf('html = injectReportTitleAlignmentRefinement(html);');
  const spotlightIndex = source.indexOf('html = injectReportEntrySpotlight(html);');
  assert.ok(floatingIndex >= 0);
  assert.ok(titleIndex > floatingIndex);
  assert.ok(spotlightIndex > titleIndex);
});
