'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  ExportValidationError,
  collectReferencedVideoAssetIds,
  collectReferencedVideoAssetReferences,
  collectReportAssetReferences,
  normalizeAssetManifest,
  normalizeRelativeAssetPath,
  validateReportAssetReferences,
} = require('../../src/export/asset-paths');

test('accepts safe export-local paths and rejects traversal, absolute, and external paths', () => {
  assert.equal(
    normalizeRelativeAssetPath('./videos/pitch clip.mp4', { kind: 'video' }),
    'videos/pitch clip.mp4',
  );
  assert.throws(
    () => normalizeRelativeAssetPath('../videos/pitch.mp4', { kind: 'video' }),
    ExportValidationError,
  );
  assert.throws(
    () => normalizeRelativeAssetPath('C:/media/pitch.mp4', { kind: 'video' }),
    ExportValidationError,
  );
  assert.throws(
    () => normalizeRelativeAssetPath('https://example.test/pitch.mp4', { kind: 'video' }),
    ExportValidationError,
  );
  assert.throws(
    () => normalizeRelativeAssetPath('images/frame.png', { kind: 'video' }),
    ExportValidationError,
  );
});

test('rejects export manifest paths that collide on case-insensitive filesystems', () => {
  assert.throws(
    () => normalizeAssetManifest([
      { id: 'first', kind: 'video', relativePath: 'videos/Clip.mp4' },
      { id: 'second', kind: 'video', relativePath: 'videos/clip.mp4' },
    ]),
    (error) => error instanceof ExportValidationError && /duplicate asset path/i.test(error.message),
  );
});

test('normalizes a manifest and discovers media, poster, and comparison references', () => {
  const document = {
    schemaVersion: 1,
    sections: [{
      blocks: [{
        type: 'singleVideo',
        mediaAssetId: 'pitch',
        posterAssetId: 'poster',
      }, {
        type: 'comparisonVideo',
        leftAssetId: 'pitch',
        rightAssetId: 'comparison',
      }],
    }],
  };
  const references = collectReportAssetReferences(document);
  assert.deepEqual(references.map((reference) => reference.id), [
    'pitch',
    'poster',
    'pitch',
    'comparison',
  ]);

  const validated = validateReportAssetReferences(document, [
    { id: 'pitch', relativePath: 'videos/pitch.mp4' },
    { id: 'poster', relativePath: 'images/poster.png' },
    { id: 'comparison', kind: 'video', relativePath: 'videos/comparison.mp4' },
  ]);
  assert.deepEqual(validated.manifest.map((asset) => asset.kind), ['video', 'image', 'video']);
  assert.deepEqual(normalizeAssetManifest(validated.manifest), validated.manifest);
});

test('collects only assets referenced by canonical video blocks', () => {
  const document = {
    sections: [{
      blocks: [
        { type: 'rich-text', content: 'text' },
        { type: 'image', imageAssetId: 'unused-image' },
        {
          type: 'singleVideo',
          mediaAssetId: 'pitch',
          posterAssetId: 'poster',
        },
        {
          type: 'comparisonVideo',
          left: { mediaAssetId: 'left' },
          right: { mediaAssetId: 'right' },
        },
      ],
    }],
  };
  assert.deepEqual(collectReferencedVideoAssetIds(document), ['pitch', 'poster', 'left', 'right']);
  assert.deepEqual(
    collectReferencedVideoAssetReferences(document).map((reference) => reference.id),
    ['pitch', 'poster', 'left', 'right'],
  );
});

test('reports missing asset ids as an export blocker with reference details', () => {
  assert.throws(
    () => validateReportAssetReferences({
      sections: [{ blocks: [{ type: 'singleVideo', mediaAssetId: 'missing-asset' }] }],
    }, []),
    (error) => {
      assert.equal(error.code, 'EXPORT_VALIDATION_FAILED');
      assert.deepEqual(error.details.missingAssetIds, ['missing-asset']);
      assert.match(error.details.invalidReferences[0] ? 'unexpected' : error.message, /missing asset references/i);
      return true;
    },
  );
});
