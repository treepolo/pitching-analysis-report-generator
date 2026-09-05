'use strict';

const annotationModel = require('../annotation-model');

function mediaReferenceId(value) {
  if (typeof value === 'string' && value.trim() !== '') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  for (const key of ['mediaAssetId', 'videoAssetId', 'assetId', 'id']) {
    if (typeof value[key] === 'string' && value[key].trim() !== '') return value[key];
  }
  return null;
}

function sideHasVideo(block, side) {
  if (side === 'single') return Boolean(mediaReferenceId(block));
  return Boolean(mediaReferenceId(block?.[side]));
}

function collectAnnotationPayload(reportDocument) {
  const records = [];
  let renderedVideoIndex = 0;
  for (const section of Array.isArray(reportDocument?.sections) ? reportDocument.sections : []) {
    for (const block of Array.isArray(section?.blocks) ? section.blocks : []) {
      if (!block || !['singleVideo', 'comparisonVideo'].includes(block.type)) continue;
      const renderedSides = block.type === 'singleVideo'
        ? (sideHasVideo(block, 'single') ? ['single'] : [])
        : ['left', 'right'].filter((side) => sideHasVideo(block, side));
      if (renderedSides.length === 0) continue;
      const record = { videoIndex: renderedVideoIndex, sides: {} };
      for (const side of renderedSides) {
        const source = side === 'single' ? block.annotations : block?.[side]?.annotations;
        const annotations = annotationModel.normalizeAnnotations(source);
        if (annotations.tracks.length > 0) record.sides[side] = annotations;
      }
      if (Object.keys(record.sides).length > 0) records.push(record);
      renderedVideoIndex += 1;
    }
  }
  return records;
}

function safeScriptJson(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function annotationReaderCss() {
  return `
<style data-annotation-reader-style>
  .portable-frame-surface { position: relative; }
  .report-annotation-overlay { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; overflow:visible; z-index:4; }
  .report-annotation-line { fill:none; stroke-width:2.5; stroke-linecap:round; stroke-linejoin:round; vector-effect:non-scaling-stroke; }
  .report-annotation-point { stroke:#fff; stroke-width:1.25; vector-effect:non-scaling-stroke; }
  .report-annotation-controls { display:flex; flex-wrap:wrap; align-items:center; gap:.35rem .6rem; font-size:.78rem; }
  .report-annotation-controls label { display:inline-flex; align-items:center; gap:.22rem; }
  .report-annotation-track-toggle { padding:.08rem .3rem; }
  .report-annotation-swatch { display:inline-block; width:.7rem; height:.7rem; border:1px solid #6e7780; }
</style>`;
}

function annotationReaderScript(records) {
  const payload = safeScriptJson(records);
  return `<script data-annotation-reader-runtime>
(() => {
  const payload = ${payload};
  const players = [...document.querySelectorAll('figure.report-video')];
  const frameTimesCache = new WeakMap();

  function frameTimes(side) {
    if (frameTimesCache.has(side)) return frameTimesCache.get(side);
    let values = [];
    try {
      const parsed = JSON.parse(side.dataset.frameTimes || '[]');
      if (Array.isArray(parsed)) values = parsed.map((value) => Number.isFinite(Number(value)) ? Number(value) : null);
    } catch {}
    frameTimesCache.set(side, values);
    return values;
  }

  function currentFrame(side) {
    const video = side.querySelector('[data-player-video]');
    if (!video) return 0;
    const currentTime = Math.max(0, Number(video.currentTime) || 0);
    const times = frameTimes(side);
    if (times.length > 0 && times.every((time) => Number.isFinite(time))) {
      let low = 0;
      let high = times.length - 1;
      let result = 0;
      while (low <= high) {
        const mid = (low + high) >> 1;
        const time = times[mid];
        if (time <= currentTime + 0.000001) {
          result = mid;
          low = mid + 1;
        } else high = mid - 1;
      }
      return result;
    }
    const fps = Number(side.dataset.frameFps) > 0 ? Number(side.dataset.frameFps) : 30;
    const count = Number(side.dataset.frameCount);
    const frame = Math.max(0, Math.round(currentTime * fps));
    return Number.isInteger(count) && count > 0 ? Math.min(count - 1, frame) : frame;
  }

  function actualVideoRect(surface, video) {
    const surfaceRect = surface.getBoundingClientRect();
    const videoRect = video.getBoundingClientRect();
    const sourceWidth = Number(video.videoWidth);
    const sourceHeight = Number(video.videoHeight);
    if (!(videoRect.width > 0 && videoRect.height > 0 && sourceWidth > 0 && sourceHeight > 0)) return null;
    const scale = Math.min(videoRect.width / sourceWidth, videoRect.height / sourceHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    return {
      surfaceRect,
      left: videoRect.left - surfaceRect.left + (videoRect.width - width) / 2,
      top: videoRect.top - surfaceRect.top + (videoRect.height - height) / 2,
      width,
      height,
    };
  }

  function visiblePoints(track, frame) {
    const start = track.startFrame == null ? 0 : track.startFrame;
    if (frame < start) return [];
    if (track.endFrame != null && frame > track.endFrame) return [];
    return track.points.filter((point) => point.frame >= start && point.frame <= frame);
  }

  function addControls(side, annotations) {
    const controls = document.createElement('div');
    const sideName = side.dataset.playerSide || 'single';
    controls.className = 'report-annotation-controls';
    controls.dataset.annotationControlsFor = sideName;
    controls.setAttribute('aria-label', '標註顯示控制');

    const pointLabel = document.createElement('label');
    const pointInput = document.createElement('input');
    pointInput.type = 'checkbox';
    pointInput.checked = annotations.view.showPoints;
    pointInput.addEventListener('change', () => { annotations.view.showPoints = pointInput.checked; });
    pointLabel.append(pointInput, document.createTextNode('點'));
    controls.append(pointLabel);

    const lineLabel = document.createElement('label');
    const lineInput = document.createElement('input');
    lineInput.type = 'checkbox';
    lineInput.checked = annotations.view.showLines;
    lineInput.addEventListener('change', () => { annotations.view.showLines = lineInput.checked; });
    lineLabel.append(lineInput, document.createTextNode('線'));
    controls.append(lineLabel);

    annotations.tracks.forEach((track) => {
      const label = document.createElement('label');
      label.className = 'report-annotation-track-toggle';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = track.visible;
      input.addEventListener('change', () => { track.visible = input.checked; });
      const swatch = document.createElement('span');
      swatch.className = 'report-annotation-swatch';
      swatch.style.backgroundColor = track.color;
      label.append(input, swatch, document.createTextNode(track.name));
      controls.append(label);
    });

    const player = side.closest('[data-native-frame-player-block]');
    const controlRegion = sideName === 'single'
      ? side.querySelector('[data-frame-controls]')
      : player?.querySelector('[data-frame-shared-controls]');
    if (controlRegion) controlRegion.append(controls);
    else side.append(controls);
  }

  const mounted = [];
  for (const record of payload) {
    const player = players[record.videoIndex];
    if (!player) continue;
    for (const [sideName, annotations] of Object.entries(record.sides)) {
      const side = player.querySelector('[data-player-side="' + sideName + '"]');
      const surface = side?.querySelector('[data-frame-surface]');
      const video = side?.querySelector('[data-player-video]');
      if (!side || !surface || !video) continue;
      const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      overlay.setAttribute('class', 'report-annotation-overlay');
      overlay.setAttribute('aria-hidden', 'true');
      surface.append(overlay);
      addControls(side, annotations);
      mounted.push({ side, surface, video, overlay, annotations });
    }
  }

  function draw(entry) {
    const rect = actualVideoRect(entry.surface, entry.video);
    if (!rect) {
      entry.overlay.replaceChildren();
      return;
    }
    entry.overlay.setAttribute('viewBox', '0 0 ' + Math.max(1, rect.surfaceRect.width) + ' ' + Math.max(1, rect.surfaceRect.height));
    const frame = currentFrame(entry.side);
    const nodes = [];
    for (const track of entry.annotations.tracks) {
      if (!track.visible) continue;
      const points = visiblePoints(track, frame);
      if (entry.annotations.view.showLines && points.length >= 2) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        line.setAttribute('class', 'report-annotation-line');
        line.setAttribute('stroke', track.color);
        line.setAttribute('points', points.map((point) => (rect.left + point.x * rect.width) + ',' + (rect.top + point.y * rect.height)).join(' '));
        nodes.push(line);
      }
      if (entry.annotations.view.showPoints) {
        for (const point of points) {
          const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          circle.setAttribute('class', 'report-annotation-point');
          circle.setAttribute('cx', String(rect.left + point.x * rect.width));
          circle.setAttribute('cy', String(rect.top + point.y * rect.height));
          circle.setAttribute('r', '5');
          circle.setAttribute('fill', track.color);
          nodes.push(circle);
        }
      }
    }
    entry.overlay.replaceChildren(...nodes);
  }

  function loop() {
    mounted.forEach(draw);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
</script>`;
}

function injectAnnotationReportHtml(html, reportDocument) {
  const records = collectAnnotationPayload(reportDocument);
  if (records.length === 0) return html;
  let output = String(html);
  const css = annotationReaderCss();
  output = output.includes('</head>') ? output.replace('</head>', `${css}\n</head>`) : `${css}\n${output}`;
  const script = annotationReaderScript(records);
  output = output.includes('</body>') ? output.replace('</body>', `${script}\n</body>`) : `${output}\n${script}`;
  return output;
}

module.exports = {
  collectAnnotationPayload,
  injectAnnotationReportHtml,
};
