'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const {
  injectReportTitleAlignmentRefinement,
  titleAlignmentCss,
} = require('../../src/export/report-title-alignment-refinement');

const repositoryRoot = path.resolve(__dirname, '..', '..');

test('report title starts as a large left-aligned headline using the real title bar', () => {
  const css = titleAlignmentCss();
  assert.match(css, /--tree-polo-header-height: 118px/u);
  assert.match(css, /--tree-polo-title-size: 46px/u);
  assert.match(css, /--tree-polo-title-letter-spacing: -\.025em/u);
  assert.match(css, /\.tree-polo-brand-copy \{[\s\S]*?position: absolute !important/u);
  assert.match(css, /left: 0 !important/u);
  assert.match(css, /right: 0 !important/u);
  assert.match(css, /padding: 0 var\(--tree-polo-title-inline-pad\) !important/u);
  assert.match(css, /text-align: left !important/u);
  assert.doesNotMatch(css, /left: 50% !important|translate\(-50%, -50%\)/u);
});

test('phone uses the same headline concept at a phone-appropriate scale', () => {
  const css = titleAlignmentCss();
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?--tree-polo-header-height: 98px/u);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?--tree-polo-title-size: 32px/u);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?--tree-polo-title-inline-pad: 18px/u);
});

test('title alignment exposes per-character translation without duplicating the title', () => {
  const css = titleAlignmentCss();
  assert.match(css, /\.tree-polo-title-char \{[\s\S]*?display: inline-block/u);
  assert.match(css, /translateX\(var\(--tree-polo-char-shift, 0px\)\)/u);
  assert.match(css, /will-change: transform/u);
  assert.doesNotMatch(css, /::before[^}]*content:|::after[^}]*content:/u);
});

test('headline typography resolves back to compact printable title geometry', () => {
  const css = titleAlignmentCss();
  assert.match(css, /@media print[\s\S]*?min-height: 54px !important/u);
  assert.match(css, /@media print[\s\S]*?font-size: 18px !important/u);
  assert.match(css, /@media print[\s\S]*?letter-spacing: \.035em !important/u);
  assert.match(css, /@media print[\s\S]*?\.tree-polo-title-char \{[\s\S]*?transform: none !important/u);
});

test('title alignment refinement injects once', () => {
  const source = '<html><head></head><body><main></main></body></html>';
  const once = injectReportTitleAlignmentRefinement(source);
  const twice = injectReportTitleAlignmentRefinement(once);
  assert.equal((twice.match(/data-report-title-alignment-refinement/g) || []).length, 1);
});

test('renderer applies title alignment after mobile shell and before fixed header and entry intro', async () => {
  const source = await fs.readFile(path.join(repositoryRoot, 'src', 'export', 'report-renderer.js'), 'utf8');
  assert.match(source, /require\('\.\/report-title-alignment-refinement'\)/u);
  assert.match(source, /require\('\.\/report-entry-intro'\)/u);
  assert.doesNotMatch(source, /report-floating-ui-refinement|injectReportFloatingUiRefinement/u);
  assert.doesNotMatch(source, /report-entry-spotlight|injectReportEntrySpotlight/u);
  const mobileIndex = source.indexOf('html = injectReportMobileShellRefinement(html);');
  const titleIndex = source.indexOf('html = injectReportTitleAlignmentRefinement(html);');
  const fixedIndex = source.indexOf('html = injectReportFixedHeaderRuntime(html);');
  const introIndex = source.indexOf('html = injectReportEntryIntro(html);');
  assert.ok(mobileIndex >= 0);
  assert.ok(titleIndex > mobileIndex);
  assert.ok(fixedIndex > titleIndex);
  assert.ok(introIndex > fixedIndex);
});
