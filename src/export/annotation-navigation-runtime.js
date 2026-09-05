'use strict';

const { collectAnnotationPayload } = require('./annotation-report-runtime');

function safeScriptJson(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function navigationCss() {
  return `<style data-annotation-navigation-style>
.report-annotation-navigation{display:inline-flex;align-items:center;gap:.25rem;margin-right:.2rem}
.report-annotation-jump{min-height:24px;padding:2px 8px;border:1px solid #718397;border-radius:2px;background:linear-gradient(#fff 0%,#eef5fb 45%,#c9dcec 52%,#e8f1f8 100%);box-shadow:inset 1px 1px 0 #fff,0 1px 1px rgba(0,0,0,.12);color:#172536;font:inherit;cursor:default}
.report-annotation-jump:hover:not(:disabled){border-color:#3f74a6;background:linear-gradient(#fff 0%,#f7fbff 42%,#b9d9f3 52%,#e9f5ff 100%)}
.report-annotation-jump:active:not(:disabled){background:linear-gradient(#aecce5,#eef7ff);box-shadow:inset 1px 1px 2px rgba(0,0,0,.2)}
.report-annotation-jump:disabled{border-color:#aaa;background:linear-gradient(#f1f1f1,#d9d9d9);color:#888}
</style>`;
}

function navigationScript(records) {
  const payload = safeScriptJson(records);
  return `<script data-annotation-navigation-runtime>
(() => {
  const payload = ${payload};
  const players = [...document.querySelectorAll('figure.report-video')];
  const frameTimesCache = new WeakMap();
  let activeEntry = null;

  const numberValue = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

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
        if (times[mid] <= currentTime + 0.000001) {
          result = mid;
          low = mid + 1;
        } else high = mid - 1;
      }
      return result;
    }
    const fps = numberValue(side.dataset.frameFps, 30) > 0 ? numberValue(side.dataset.frameFps, 30) : 30;
    const count = Math.max(0, Math.floor(numberValue(side.dataset.frameCount, 0)));
    const frame = Math.max(0, Math.round(currentTime * fps));
    return count > 0 ? Math.min(count - 1, frame) : frame;
  }

  function annotationFrames(annotations) {
    const values = new Set();
    for (const track of annotations.tracks || []) {
      const start = Number.isInteger(track.startFrame) ? track.startFrame : 0;
      const end = Number.isInteger(track.endFrame) ? track.endFrame : Number.POSITIVE_INFINITY;
      for (const point of track.points || []) {
        if (Number.isInteger(point.frame) && point.frame >= start && point.frame <= end) values.add(point.frame);
      }
    }
    return [...values].sort((a, b) => a - b);
  }

  function sideRange(side) {
    const count = Math.max(0, Math.floor(numberValue(side.dataset.frameCount, 0)));
    if (count <= 0) return null;
    const start = clamp(Math.round(Math.max(0, numberValue(side.dataset.segmentIn, 0))), 0, count - 1);
    const rawEnd = numberValue(side.dataset.segmentOut, 0);
    const end = rawEnd > 0 ? Math.max(start, Math.min(count - 1, Math.round(rawEnd))) : count - 1;
    return { start, end, count };
  }

  function sharedMapping(player) {
    const sides = ['left', 'right'].map((name) => player.querySelector('[data-native-frame-player][data-player-side="' + name + '"]'));
    if (sides.some((side) => !side)) return null;
    const ranges = sides.map(sideRange);
    if (ranges.some((range) => !range)) return null;
    const leftSync = numberValue(player.dataset.syncLeftFrame, Number.NaN);
    const rightSync = numberValue(player.dataset.syncRightFrame, Number.NaN);
    const validSync = Number.isInteger(leftSync) && Number.isInteger(rightSync)
      && leftSync >= ranges[0].start && leftSync <= ranges[0].end
      && rightSync >= ranges[1].start && rightSync <= ranges[1].end;
    const backward = validSync ? Math.max(0, Math.min(leftSync - ranges[0].start, rightSync - ranges[1].start)) : 0;
    const forward = validSync
      ? Math.max(0, Math.min(ranges[0].end - leftSync, ranges[1].end - rightSync))
      : Math.max(0, Math.min(ranges[0].end - ranges[0].start, ranges[1].end - ranges[1].start));
    const baseStarts = validSync
      ? [leftSync - backward, rightSync - backward]
      : [ranges[0].start, ranges[1].start];
    const baseCount = Math.max(0, backward + forward + 1);
    if (baseCount <= 0) return null;
    const rawIn = numberValue(player.dataset.commonSegmentIn, 0);
    const rawOut = numberValue(player.dataset.commonSegmentOut, 0);
    const commonStart = rawIn > 0 ? clamp(Math.round(rawIn), 0, baseCount - 1) : 0;
    let commonEnd = rawOut > 0 ? clamp(Math.round(rawOut), 0, baseCount - 1) : baseCount - 1;
    if (commonEnd < commonStart) commonEnd = commonStart;
    return {
      sides,
      starts: [baseStarts[0] + commonStart, baseStarts[1] + commonStart],
      ends: [baseStarts[0] + commonEnd, baseStarts[1] + commonEnd],
      count: commonEnd - commonStart + 1,
    };
  }

  function allowedFrames(entry) {
    const mapping = sharedMapping(entry.player);
    if (mapping && ['left', 'right'].includes(entry.sideName)) {
      const index = entry.sideName === 'left' ? 0 : 1;
      return entry.frames.filter((frame) => frame >= mapping.starts[index] && frame <= mapping.ends[index]);
    }
    const range = sideRange(entry.side);
    return range ? entry.frames.filter((frame) => frame >= range.start && frame <= range.end) : entry.frames;
  }

  function sharedControlIndex(entry, frame) {
    const mapping = sharedMapping(entry.player);
    if (!mapping || !['left', 'right'].includes(entry.sideName)) return null;
    const index = entry.sideName === 'left' ? 0 : 1;
    if (frame < mapping.starts[index] || frame > mapping.ends[index]) return null;
    return clamp(frame - mapping.starts[index], 0, mapping.count - 1);
  }

  function seekEntry(entry, frame) {
    activeEntry = entry;
    const sharedTimeline = entry.player.querySelector('[data-frame-shared-controls] [data-frame-timeline]');
    const controlIndex = sharedControlIndex(entry, frame);
    if (sharedTimeline && controlIndex !== null) {
      sharedTimeline.value = String(controlIndex);
      sharedTimeline.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    const action = entry.side.__nativeFramePlayerActions;
    if (action && typeof action.seek === 'function') {
      void action.seek(frame);
      return true;
    }
    const timeline = entry.side.querySelector('[data-frame-timeline]');
    if (timeline) {
      timeline.value = String(frame);
      timeline.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    return false;
  }

  function neighbor(entry, direction) {
    const frame = currentFrame(entry.side);
    const frames = allowedFrames(entry);
    if (direction < 0) {
      for (let index = frames.length - 1; index >= 0; index -= 1) {
        if (frames[index] < frame) return frames[index];
      }
      return null;
    }
    return frames.find((candidate) => candidate > frame) ?? null;
  }

  function jump(entry, direction) {
    const target = neighbor(entry, direction);
    if (target === null) return false;
    return seekEntry(entry, target);
  }

  function addNavigation(entry) {
    const controlSelector = '.report-annotation-controls[data-annotation-controls-for="' + entry.sideName + '"]';
    const controls = entry.side.querySelector(controlSelector) || entry.player.querySelector(controlSelector);
    if (!controls || controls.querySelector('[data-annotation-frame-navigation]')) return;
    controls.addEventListener('pointerdown', () => { activeEntry = entry; });
    const nav = document.createElement('span');
    nav.className = 'report-annotation-navigation';
    nav.dataset.annotationFrameNavigation = '';
    const previous = document.createElement('button');
    previous.type = 'button';
    previous.className = 'report-annotation-jump';
    previous.dataset.annotationJump = 'previous';
    previous.textContent = '← 上一標註幀';
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'report-annotation-jump';
    next.dataset.annotationJump = 'next';
    next.textContent = '下一標註幀 →';
    previous.addEventListener('click', () => jump(entry, -1));
    next.addEventListener('click', () => jump(entry, 1));
    nav.append(previous, next);
    controls.prepend(nav);
    entry.previous = previous;
    entry.next = next;
  }

  const mounted = [];
  for (const record of payload) {
    const player = players[record.videoIndex];
    if (!player) continue;
    for (const [sideName, annotations] of Object.entries(record.sides)) {
      const side = player.querySelector('[data-player-side="' + sideName + '"]');
      if (!side) continue;
      const entry = { player, side, sideName, annotations, frames: annotationFrames(annotations), previous: null, next: null };
      side.addEventListener('pointerdown', () => { activeEntry = entry; });
      side.addEventListener('contextmenu', () => { activeEntry = entry; });
      mounted.push(entry);
      addNavigation(entry);
    }
  }
  if (!activeEntry) activeEntry = mounted[0] || null;

  function refresh(entry) {
    if (!entry.previous || !entry.next) return;
    const previousFrame = neighbor(entry, -1);
    const nextFrame = neighbor(entry, 1);
    entry.previous.disabled = previousFrame === null;
    entry.next.disabled = nextFrame === null;
    entry.previous.title = previousFrame === null ? '沒有更前面的標註幀' : '跳到第 ' + (previousFrame + 1) + ' 幀（A）';
    entry.next.title = nextFrame === null ? '沒有更後面的標註幀' : '跳到第 ' + (nextFrame + 1) + ' 幀（D）';
  }

  function keyboardConsumesLetter(target) {
    const element = target?.closest?.('textarea, select, input, [contenteditable="true"]');
    if (!element) return false;
    if (element.matches?.('textarea, select, [contenteditable="true"]') || element.isContentEditable) return true;
    const type = String(element.type || 'text').toLowerCase();
    return !['range', 'checkbox', 'radio', 'button'].includes(type);
  }

  window.addEventListener('keydown', (event) => {
    if (!activeEntry || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (keyboardConsumesLetter(event.target)) return;
    const direction = event.code === 'KeyA' ? -1 : event.code === 'KeyD' ? 1 : 0;
    if (!direction) return;
    const target = neighbor(activeEntry, direction);
    if (target === null) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    seekEntry(activeEntry, target);
  }, true);

  function loop() {
    mounted.forEach(refresh);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
</script>`;
}

function injectAnnotationNavigationHtml(html, reportDocument) {
  const records = collectAnnotationPayload(reportDocument);
  if (records.length === 0) return String(html);
  let output = String(html);
  const css = navigationCss();
  output = output.includes('</head>') ? output.replace('</head>', `${css}\n</head>`) : `${css}\n${output}`;
  const script = navigationScript(records);
  output = output.includes('</body>') ? output.replace('</body>', `${script}\n</body>`) : `${output}\n${script}`;
  return output;
}

module.exports = {
  injectAnnotationNavigationHtml,
  navigationScript,
};
