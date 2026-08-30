'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const generatorCss = fs.readFileSync(path.join(__dirname, '..', 'src', 'range-xp7.css'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
const { injectXp7RangeTheme, renderXp7RangeTheme } = require('../src/export/xp7-range-theme');

test('generator loads the XP7 range theme after its existing styles', () => {
  const styleIndex = index.indexOf('./range-xp7.css');
  assert.ok(styleIndex > index.indexOf('./generator-xp7.css'));
  assert.ok(styleIndex > index.indexOf('./annotations.css'));
});

test('generator range theme styles both the track and thumb', () => {
  assert.match(generatorCss, /::-webkit-slider-runnable-track/u);
  assert.match(generatorCss, /::-webkit-slider-thumb/u);
  assert.match(generatorCss, /::-moz-range-track/u);
  assert.match(generatorCss, /::-moz-range-thumb/u);
  assert.match(generatorCss, /linear-gradient/u);
});

test('exported reader injects the same XP7-style range affordance', () => {
  const style = renderXp7RangeTheme();
  assert.match(style, /data-xp7-range-theme/u);
  assert.match(style, /::-webkit-slider-runnable-track/u);
  assert.match(style, /::-webkit-slider-thumb/u);

  const html = injectXp7RangeTheme('<html><head></head><body></body></html>');
  assert.match(html, /data-xp7-range-theme/u);
  assert.equal((html.match(/data-xp7-range-theme/gu) || []).length, 1);
  assert.equal(injectXp7RangeTheme(html), html);
});
