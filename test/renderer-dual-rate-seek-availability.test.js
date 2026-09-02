'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer.js'), 'utf8');

function functionSlice(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test('dual shared speed controls stay enabled during exact seek without changing single-player gating', () => {
  const controls = functionSlice(
    renderer,
    'function updateFramePlayerControls(card)',
    'function bindFramePlayerActionButtons(card)',
  );

  assert.match(controls, /const pendingSeek = runtime\.lifecycle === 'loading' \|\| runtime\.exactSeek !== null;/u);
  assert.match(controls, /const available = count > 0 && !pendingSeek;/u);
  assert.match(
    controls,
    /const rateAvailable = entry\.block\?\.type === 'comparisonVideo'\s*\? count > 0 && runtime\.lifecycle !== 'loading'\s*: available;/u,
  );

  assert.match(controls, /timeline\.disabled = !available;/u);
  assert.match(controls, /resetRate\.disabled = !rateAvailable;/u);
  assert.match(controls, /rateSlider\.disabled = !rateAvailable;/u);
  assert.match(controls, /rateInput\.disabled = !rateAvailable;/u);
  assert.doesNotMatch(controls, /rateSlider\.disabled = !available;/u);
  assert.doesNotMatch(controls, /rateInput\.disabled = !available;/u);
});
