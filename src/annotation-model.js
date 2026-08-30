'use strict';

(function exposeAnnotationModel(root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.pitchingAnnotationModel = model;
}(typeof globalThis === 'undefined' ? this : globalThis, () => {
  const DEFAULT_COLOR = '#e53935';
  const DEFAULT_VIEW = Object.freeze({ showPoints: true, showLines: false });
  const TRACK_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,95}$/u;
  const COLOR_PATTERN = /^#[0-9a-f]{6}$/iu;

  function isRecord(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function normalizeStepFrames(value, fallback = 1) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10000) return fallback;
    return parsed;
  }

  function normalizeOptionalFrame(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  }

  function normalizePoint(value) {
    if (!isRecord(value)) return undefined;
    const frame = Number(value.frame);
    const x = Number(value.x);
    const y = Number(value.y);
    if (!Number.isInteger(frame) || frame < 0) return undefined;
    if (!Number.isFinite(x) || x < 0 || x > 1 || !Number.isFinite(y) || y < 0 || y > 1) return undefined;
    return { frame, x, y };
  }

  function normalizeTrack(value, index = 0) {
    if (!isRecord(value)) return undefined;
    const id = typeof value.id === 'string' && TRACK_ID_PATTERN.test(value.id)
      ? value.id
      : `track-${index + 1}`;
    const rawName = typeof value.name === 'string' ? value.name.trim() : '';
    const name = (rawName || `標註 ${index + 1}`).slice(0, 80);
    const color = typeof value.color === 'string' && COLOR_PATTERN.test(value.color)
      ? value.color.toLowerCase()
      : DEFAULT_COLOR;
    const visible = value.visible !== false;
    const startFrame = normalizeOptionalFrame(value.startFrame);
    let endFrame = normalizeOptionalFrame(value.endFrame);
    if (startFrame !== null && endFrame !== null && endFrame < startFrame) endFrame = startFrame;

    const byFrame = new Map();
    if (Array.isArray(value.points)) {
      value.points.forEach((entry) => {
        const point = normalizePoint(entry);
        if (point) byFrame.set(point.frame, point);
      });
    }
    const points = [...byFrame.values()].sort((a, b) => a.frame - b.frame);
    return { id, name, color, visible, startFrame, endFrame, points };
  }

  function normalizeView(value) {
    const view = isRecord(value) ? value : {};
    return {
      showPoints: view.showPoints !== false,
      showLines: view.showLines === true,
    };
  }

  function normalizeAnnotations(value) {
    const source = isRecord(value) ? value : {};
    const usedIds = new Set();
    const tracks = [];
    if (Array.isArray(source.tracks)) {
      source.tracks.forEach((entry, index) => {
        const track = normalizeTrack(entry, index);
        if (!track) return;
        let id = track.id;
        let suffix = 2;
        while (usedIds.has(id)) id = `${track.id}-${suffix++}`;
        track.id = id;
        usedIds.add(id);
        tracks.push(track);
      });
    }
    return { view: normalizeView(source.view), tracks };
  }

  function hasAnnotations(value) {
    return normalizeAnnotations(value).tracks.length > 0;
  }

  return Object.freeze({
    DEFAULT_COLOR,
    DEFAULT_VIEW,
    hasAnnotations,
    normalizeAnnotations,
    normalizeOptionalFrame,
    normalizePoint,
    normalizeStepFrames,
    normalizeTrack,
  });
}));
