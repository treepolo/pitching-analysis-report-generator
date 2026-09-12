'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');

const { introScript } = require('../../src/export/report-entry-intro');

test('entry skip consumes the activation click itself without leaving a future click suppressor', () => {
  const source = introScript();
  const body = source
    .replace(/^<script[^>]*>/u, '')
    .replace(/<\/script>$/u, '');

  assert.doesNotThrow(() => new vm.Script(body));
  assert.match(source, /document\.addEventListener\('click',skipEntry,\{ capture:true,passive:false \}\)/u);
  assert.match(source, /document\.removeEventListener\('click',skipEntry,true\)/u);

  const skipStart = source.indexOf('const skipEntry = (event) => {');
  const preventIndex = source.indexOf('preventInteraction(event);', skipStart);
  const finishIndex = source.indexOf('finishEntry(true);', skipStart);
  assert.ok(skipStart >= 0);
  assert.ok(preventIndex > skipStart);
  assert.ok(finishIndex > preventIndex);

  assert.doesNotMatch(source, /swallowNextClick/u);
  assert.doesNotMatch(source, /suppressClickTimer/u);
  assert.doesNotMatch(source, /addEventListener\('pointerdown',skipEntry/u);
  assert.doesNotMatch(source, /addEventListener\('touchstart',skipEntry/u);
});