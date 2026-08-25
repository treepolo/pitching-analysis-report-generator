'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { renderReportHtml } = require('../../src/export/report-renderer');

test('portable HTML leaves Ctrl +/- page zoom to the host browser', () => {
  const html = renderReportHtml({
    schemaVersion: 1,
    title: 'Zoom shortcut contract',
    sections: [{ blocks: [{ type: 'singleVideo', mediaAssetId: 'pitch' }] }],
  }, {
    assetManifest: [{ id: 'pitch', kind: 'video', relativePath: 'videos/pitch.mp4' }],
  });
  const inlineScript = [...html.matchAll(/<script>\s*([\s\S]*?)\s*<\/script>/g)]
    .map((match) => match[1])
    .join('\n');
  assert.doesNotMatch(inlineScript, /(?:ctrlKey|metaKey|setZoom(?:Factor|Level)|event\.key\s*===\s*['"](?:\+|=|-|_)['"])/u);
  assert.match(inlineScript, /const isArrow = event\.key === 'ArrowLeft'/u);
});
