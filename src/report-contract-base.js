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
    if (value === true) return { enabled: true };
    if (!isRecord(value)) return undefined;
    return { enabled: value.enabled !== false };
  }

  function cloneSegmentConfig(value, legacyLoop) {
    const source = isRecord(value) ? value : isRecord(legacyLoop) ? legacyLoop : undefined;
    if (!source) return undefined;
    const start = source.in ?? source.start ?? source.startFrame;
    const end = source.out ?? source.end ?? source.endFrame;
    const normalizedStart = Number.isFinite(Number(start)) ? Math.max(0, Math.round(Number(start))) : 0;
    const normalizedEnd = Number.isFinite(Number(end)) && Number(end) > 0
      ? Math.max(0, Math.round(Number(end)))
      : 0;
    return normalizedEnd > 0 && normalizedEnd < normalizedStart
      ? { in: normalizedStart, out: normalizedStart }
      : { in: normalizedStart, out: normalizedEnd };
  }

  function cloneDualSync(value) {
    if (!isRecord(value)
      || !Number.isInteger(value.leftFrame) || value.leftFrame < 0
      || !Number.isInteger(value.rightFrame) || value.rightFrame < 0) {
      return undefined;
    }
    return { leftFrame: value.leftFrame, rightFrame: value.rightFrame };
  }

  function cloneCommonSegment(value) {
    if (!isRecord(value)) return { in: 0, out: 0 };
    const start = value.in ?? value.start ?? value.startFrame;
    const end = value.out ?? value.end ?? value.endFrame;
    const normalizedStart = Number.isInteger(start) && start > 0 ? start : 0;
    const normalizedEnd = Number.isInteger(end) && end > 0 ? end : 0;
    return { in: normalizedStart, out: normalizedEnd };
  }
  function clonePlaybackConfig(value) {
    if (!isRecord(value)) return undefined;
    const playback = {};
    copyBoolean(value, playback, 'autoplay');
    copyBoolean(value, playback, 'controls');
    copyBoolean(value, playback, 'muted');
    const loop = cloneLoopConfig(value.loop);
    if (loop) playback.loop = loop;
    else {
      const legacyLoop = cloneLoopConfig(value.loopRange);
      if (legacyLoop) playback.loop = legacyLoop;
    }
    return Object.keys(playback).length > 0 ? playback : undefined;
  }

  function cloneSideConfig(value) {
    if (!isRecord(value)) return undefined;
    const side = {};
    copyAssetReferences(value, side);
    copyString(value, side, 'label');
    const segment = cloneSegmentConfig(value.segment);
    if (segment) side.segment = segment;
    const playback = clonePlaybackConfig(value.playback);
    if (playback) {
      delete playback.loop;
      side.playback = playback;
    }
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
    if (block.contentFormat === 'html') output.contentFormat = 'html';

    if (type === 'image') {
      copyAssetReferences(block, output);
      copyString(block, output, 'caption');
      copyString(block, output, 'alt');
    }

    if (type === 'singleVideo') {
      copyAssetReferences(block, output);
      copyString(block, output, 'label');
      if (typeof block.sourceLabel === 'string') output.sourceLabel = block.sourceLabel;
      else if (typeof block.label === 'string') output.sourceLabel = block.label;
      copyString(block, output, 'caption');
      const legacyLoop = block.loop ?? block.loopRange ?? block.playback?.loop ?? block.playback?.loopRange;
      const segment = cloneSegmentConfig(block.segment, legacyLoop);
      if (segment) output.segment = segment;
      const playback = clonePlaybackConfig(block.playback);
      if (playback) output.playback = playback;
      const playbackOptions = clonePlaybackConfig(block.playbackOptions);
      if (playbackOptions) output.playbackOptions = playbackOptions;
      const loop = cloneLoopConfig(block.loop);
      if (loop) output.loop = loop;
      else {
        const legacyLoopConfig = cloneLoopConfig(legacyLoop);
        output.loop = legacyLoopConfig || { enabled: true };
      }
    }

    if (type === 'comparisonVideo') {
      copyAssetReferences(block, output);
      const left = cloneSideConfig(block.left);
      if (left) output.left = left;
      const right = cloneSideConfig(block.right);
      if (right) output.right = right;
      copyString(block, output, 'label');
      copyString(block, output, 'caption');
      copyString(block, output, 'layout');
      copyStringArray(block, output, 'labels');
      const hasSync = Object.prototype.hasOwnProperty.call(block, 'sync');
      const sync = cloneDualSync(block.sync);
      if (sync) output.sync = sync;
      else if (!hasSync) output.sync = { leftFrame: 0, rightFrame: 0 };
      output.commonSegment = cloneCommonSegment(block.commonSegment);
      output.loop = cloneLoopConfig(block.loop) || { enabled: true };
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
