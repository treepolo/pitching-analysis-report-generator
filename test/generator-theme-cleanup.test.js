'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..');
const srcRoot = path.join(repositoryRoot, 'src');
const indexHtml = fs.readFileSync(path.join(srcRoot, 'index.html'), 'utf8');
const parityTheme = fs.readFileSync(path.join(srcRoot, 'generator-report-parity.css'), 'utf8');
const exportRenderer = fs.readFileSync(path.join(srcRoot, 'export', 'report-renderer.js'), 'utf8');

const LEGACY_GENERATOR_THEMES = [
  'generator-xp7.css',
  'range-xp7.css',
  'generator-medium.css',
];

test('generator loads the structural, annotation, and single current parity stylesheets in order', () => {
  const structuralIndex = indexHtml.indexOf('href="./styles.css"');
  const annotationIndex = indexHtml.indexOf('href="./annotations.css"');
  const parityIndex = indexHtml.indexOf('href="./generator-report-parity.css"');

  assert.ok(structuralIndex >= 0);
  assert.ok(annotationIndex > structuralIndex);
  assert.ok(parityIndex > annotationIndex);
  assert.match(indexHtml, /<body class="document-app">/u);

  for (const legacyTheme of LEGACY_GENERATOR_THEMES) {
    assert.equal(fs.existsSync(path.join(srcRoot, legacyTheme)), false, `${legacyTheme} should be retired`);
    assert.equal(indexHtml.includes(legacyTheme), false, `${legacyTheme} should not be loaded`);
  }
});

test('current parity theme owns the generator visual language and responsive player affordances', () => {
  for (const signature of [
    'Final generator parity layer',
    '--report-green: #1a8917',
    'body.document-app .document-topbar',
    'body.document-app #document-command-bar',
    'body.document-app .button-primary',
    'body.document-app .block-section-header',
    'body.document-app input[type="range"]::-webkit-slider-thumb',
    'body.document-app input[data-frame-rate][type="range"]::-webkit-slider-thumb',
    '@media (max-width: 760px)',
  ]) {
    assert.ok(parityTheme.includes(signature), `missing current parity-theme signature: ${signature}`);
  }

  assert.match(parityTheme, /button:focus-visible/u);
  assert.match(parityTheme, /input:focus-visible/u);
  assert.match(parityTheme, /textarea:focus-visible/u);
});

test('portable report renderer stays independent from generator-only theme files', () => {
  assert.doesNotMatch(
    exportRenderer,
    /generator-(?:xp7|medium|report-parity)\.css|range-xp7\.css/u,
  );
});
