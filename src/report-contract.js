'use strict';

(function exposeReportContract(root, factory) {
  const contract = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = contract;
  } else {
    root.pitchingReportContract = contract;
  }
}(typeof globalThis === 'undefined' ? this : globalThis, () => {
  const BLOCK_TYPES = new Set(['rich-text', 'text', 'image', 'singleVideo', 'comparisonVideo']);
  const ASSET_REFERENCE_KEYS = [
    'assetId',
    'assetIds',
    'assetRef',
    'assetRefs',
    'mediaAssetId',
    'mediaAssetIds',
    'imageAssetId',
    'videoAssetId',
    'posterAssetId',
    'posterImageAssetId',
    'leftAssetId',
    'rightAssetId',
    'firstAssetId',
    'secondAssetId',
    'leftMediaAssetId',
    'rightMediaAssetId',
    'firstMediaAssetId',
    'secondMediaAssetId',
    'videoAssetIds',
  ];

  function isRecord(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function copyString(source, target, key) {
    if (typeof source[key] === 'string') target[key] = source[key];
  }

  function copyBoolean(source, target, key) {
    if (typeof source[key] === 'boolean') target[key] = source[key];
  }

  function copyFiniteNumber(source, target, key) {
    if (typeof source[key] === 'number' && Number.isFinite(source[key])) target[key] = source[key];
  }

  function copyStringArray(source, target, key) {
    if (!Array.isArray(source[key])) return;
    const values = source[key].filter((value) => typeof value === 'string');
    if (values.length > 0) target[key] = [...values];
  }

  function cloneAssetReference(value) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
      return value
        .map((entry) => cloneAssetReference(entry))
        .filter((entry) => entry !== undefined);
    }
    if (!isRecord(value)) return undefined;

    const reference = {};
    for (const key of ['id', 'kind', 'relativePath', 'path', 'label', 'mediaType']) {
      copyString(value, reference, key);
    }
    return Object.keys(reference).length > 0 ? reference : undefined;
  }

  function copyAssetReferences(source, target) {
    for (const key of ASSET_REFERENCE_KEYS) {
      const value = cloneAssetReference(source[key]);
      if (value !== undefined) target[key] = value;
    }
  }

  function cloneLoopConfig(value) {
    if (!isRecord(value)) return undefined;
    const loop = {};
    copyBoolean(value, loop, 'enabled');
    copyFiniteNumber(value, loop, 'start');
    copyFiniteNumber(value, loop, 'end');
    copyFiniteNumber(value, loop, 'startTime');
    copyFiniteNumber(value, loop, 'endTime');
    return Object.keys(loop).length > 0 ? loop : undefined;
  }

  function cloneSegmentConfig(value) {
    if (!isRecord(value)) return undefined;
    const segment = {};
    copyFiniteNumber(value, segment, 'in');
    copyFiniteNumber(value, segment, 'out');
    copyFiniteNumber(value, segment, 'start');
    copyFiniteNumber(value, segment, 'end');
    return Object.keys(segment).length > 0 ? segment : undefined;
  }

  function cloneSyncConfig(value) {
    if (!isRecord(value)) return undefined;
    const sync = {};
    if (value.mode === 'time' || value.mode === 'frame') sync.mode = value.mode;
    const startAnchor = cloneAnchor(value.startAnchor);
    if (startAnchor) sync.startAnchor = startAnchor;
    return Object.keys(sync).length > 0 ? sync : undefined;
  }

  function clonePlaybackConfig(value) {
    if (!isRecord(value)) return undefined;
    const playback = {};
    copyFiniteNumber(value, playback, 'rate');
    copyBoolean(value, playback, 'autoplay');
    copyBoolean(value, playback, 'controls');
    copyBoolean(value, playback, 'muted');
    const loop = cloneLoopConfig(value.loop);
    if (loop) playback.loop = loop;
    const loopRange = cloneLoopConfig(value.loopRange);
    if (loopRange) playback.loopRange = loopRange;
    return Object.keys(playback).length > 0 ? playback : undefined;
  }

  function cloneTimingMetadata(value) {
    if (!isRecord(value)) return undefined;
    const metadata = {};
    copyFiniteNumber(value, metadata, 'fps');
    copyFiniteNumber(value, metadata, 'duration');
    copyBoolean(value, metadata, 'isVfr');
    copyString(value, metadata, 'normalizationState');
    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }

  function cloneAnchor(value) {
    if (!isRecord(value)) return undefined;
    const anchor = {};
    copyFiniteNumber(value, anchor, 'observedTime');
    copyFiniteNumber(value, anchor, 'frameIndex');
    copyString(value, anchor, 'precision');
    copyString(value, anchor, 'capturedAt');
    const timingMetadata = cloneTimingMetadata(value.timingMetadata);
    if (timingMetadata) anchor.timingMetadata = timingMetadata;
    return Object.keys(anchor).length > 0 ? anchor : undefined;
  }

  function cloneSideConfig(value) {
    if (!isRecord(value)) return undefined;
    const side = {};
    copyAssetReferences(value, side);
    copyString(value, side, 'label');
    copyString(value, side, 'precision');
    copyString(value, side, 'precisionState');
    const anchor = cloneAnchor(value.anchor);
    if (anchor) side.anchor = anchor;
    const loop = cloneLoopConfig(value.loop);
    if (loop) side.loop = loop;
    const loopRange = cloneLoopConfig(value.loopRange);
    if (loopRange) side.loopRange = loopRange;
    const segment = cloneSegmentConfig(value.segment);
    if (segment) side.segment = segment;
    const playback = clonePlaybackConfig(value.playback);
    if (playback) side.playback = playback;
    return Object.keys(side).length > 0 ? side : undefined;
  }

  function cloneBlock(block) {
    if (!isRecord(block)) return { type: 'unknown' };
    const type = typeof block.type === 'string' && BLOCK_TYPES.has(block.type)
      ? block.type
      : 'unknown';
    const output = { type };

    // Content is the only common text field exposed by the current editor.
    copyString(block, output, 'content');

    if (type === 'image') {
      copyAssetReferences(block, output);
      copyString(block, output, 'caption');
      copyString(block, output, 'alt');
    }

    if (type === 'singleVideo') {
      copyAssetReferences(block, output);
      copyString(block, output, 'label');
      copyString(block, output, 'caption');
      copyString(block, output, 'layout');
      const segment = cloneSegmentConfig(block.segment);
      if (segment) output.segment = segment;
      const sync = cloneSyncConfig(block.sync);
      if (sync) output.sync = sync;
      const anchor = cloneAnchor(block.anchor);
      if (anchor) output.anchor = anchor;
      const playback = clonePlaybackConfig(block.playback);
      if (playback) output.playback = playback;
      const playbackOptions = clonePlaybackConfig(block.playbackOptions);
      if (playbackOptions) output.playbackOptions = playbackOptions;
      const loop = cloneLoopConfig(block.loop);
      if (loop) output.loop = loop;
      const loopRange = cloneLoopConfig(block.loopRange);
      if (loopRange) output.loopRange = loopRange;
    }

    if (type === 'comparisonVideo') {
      copyAssetReferences(block, output);
      const left = cloneSideConfig(block.left);
      if (left) output.left = left;
      const right = cloneSideConfig(block.right);
      if (right) output.right = right;
      if (isRecord(block.sides)) {
        const sides = {};
        const sideLeft = cloneSideConfig(block.sides.left);
        if (sideLeft) sides.left = sideLeft;
        const sideRight = cloneSideConfig(block.sides.right);
        if (sideRight) sides.right = sideRight;
        if (Object.keys(sides).length > 0) output.sides = sides;
      }
      copyString(block, output, 'label');
      copyString(block, output, 'caption');
      copyString(block, output, 'layout');
      const sync = cloneSyncConfig(block.sync);
      if (sync) output.sync = sync;
      copyStringArray(block, output, 'labels');
    }

    return output;
  }

  function cloneSection(section) {
    if (!isRecord(section)) return { title: '', blocks: [] };
    return {
      title: typeof section.title === 'string' ? section.title : '',
      blocks: Array.isArray(section.blocks) ? section.blocks.map(cloneBlock) : [],
    };
  }

  function toReportDocument(project) {
    if (project === null || typeof project !== 'object' || Array.isArray(project)) {
      throw new Error('Project is required to build a report document');
    }
    const fallbackTitle = typeof project.displayName === 'string'
      ? project.displayName
      : (typeof project.title === 'string' ? project.title : '');
    const reportTitle = typeof project.reportTitle === 'string' && project.reportTitle.trim() !== ''
      ? project.reportTitle
      : fallbackTitle;
    return {
      schemaVersion: 1,
      title: reportTitle,
      sections: Array.isArray(project.sections) ? project.sections.map(cloneSection) : [],
    };
  }

  return Object.freeze({ toReportDocument });
}));
