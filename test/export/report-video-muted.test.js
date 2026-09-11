'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { renderReportHtml } = require('../../src/export/report-renderer');

test('renders every report video muted by default', () => {
  const html = renderReportHtml({
    schemaVersion: 1,
    title: 'Muted report videos',
    sections: [{
      blocks: [{
        type: 'singleVideo',
        mediaAssetId: 'single',
      }, {
        type: 'comparisonVideo',
        left: { mediaAssetId: 'left' },
        right: { mediaAssetId: 'right' },
      }],
    }],
  }, {
    assetManifest: [
      { id: 'single', kind: 'video', relativePath: 'videos/single.mp4' },
      { id: 'left', kind: 'video', relativePath: 'videos/left.mp4' },
      { id: 'right', kind: 'video', relativePath: 'videos/right.mp4' },
    ],
  });

  const videos = [...html.matchAll(/<video\b[^>]*>/gu)].map((match) => match[0]);
  assert.equal(videos.length, 3);
  videos.forEach((video) => assert.match(video, /\bmuted\b/u));
});
