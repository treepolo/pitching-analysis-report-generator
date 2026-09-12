'use strict';

// TEMPORARY DIAGNOSTIC RUNTIME.
// Remove this module and its renderer injection after the first-play and Safari
// loop/presentation issues have been reproduced and fixed.

function diagnosticStyle() {
  return `<style data-report-player-diagnostics-style>
[data-report-player-diagnostics-toggle]{position:fixed;right:10px;bottom:10px;z-index:2147483646;min-height:32px;padding:5px 9px;border:1px solid #222;border-radius:4px;background:#fff;color:#111;font:11px/1.2 monospace;box-shadow:0 2px 8px rgba(0,0,0,.28);opacity:0;pointer-events:none}
[data-report-player-diagnostics-toggle][data-ready="true"]{opacity:.9;pointer-events:auto}
[data-report-player-diagnostics-panel]{position:fixed;inset:10px;z-index:2147483647;display:grid;grid-template-rows:auto minmax(0,1fr);gap:8px;padding:10px;background:rgba(10,10,10,.97);color:#fff;font:12px/1.35 monospace}
[data-report-player-diagnostics-panel][hidden]{display:none!important}
[data-report-player-diagnostics-toolbar]{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
[data-report-player-diagnostics-toolbar] button{min-height:30px;padding:4px 8px}
[data-report-player-diagnostics-count]{margin-left:auto}
[data-report-player-diagnostics-output]{width:100%;height:100%;min-height:0;resize:none;background:#050505;color:#d7ffd7;border:1px solid #555;padding:8px;font:11px/1.35 monospace;white-space:pre;overflow:auto;-webkit-user-select:text;user-select:text}
@media print{[data-report-player-diagnostics-toggle],[data-report-player-diagnostics-panel]{display:none!important}}
</style>`;
}

function diagnosticMarkup() {
  return `<button type="button" data-report-player-diagnostics-toggle aria-label="開啟播放器診斷資料">TP DIAG</button>
<section data-report-player-diagnostics-panel hidden aria-label="播放器診斷資料">
  <div data-report-player-diagnostics-toolbar>
    <strong>TREEPOLO TEMP PLAYER DIAGNOSTICS</strong>
    <button type="button" data-report-player-diagnostics-refresh>重新整理</button>
    <button type="button" data-report-player-diagnostics-copy>複製 JSON</button>
    <button type="button" data-report-player-diagnostics-download>下載 JSON</button>
    <button type="button" data-report-player-diagnostics-close>關閉</button>
    <span data-report-player-diagnostics-count></span>
  </div>
  <textarea readonly spellcheck="false" data-report-player-diagnostics-output></textarea>
</section>`;
}

function diagnosticScript() {
  return `<script data-report-player-diagnostics-runtime>
(() => {
  const MAX_ENTRIES = 3000;
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const entries = [];
  const videoIds = new WeakMap();
  const lastTimes = new WeakMap();
  let nextVideoId = 1;

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const elapsed = () => Math.round((now() - startedAt) * 10) / 10;
  const safeNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  const sideForVideo = (video) => video?.closest?.('[data-native-frame-player]') || null;
  const playerFor = (node) => node?.closest?.('[data-native-frame-player-block]') || null;
  const videoId = (video) => {
    if (!video) return null;
    if (!videoIds.has(video)) videoIds.set(video, nextVideoId++);
    const side = sideForVideo(video);
    return 'v' + videoIds.get(video) + ':' + (side?.dataset?.playerSide || 'unknown');
  };
  const frameForTime = (side, time) => {
    const numericTime = Math.max(0, Number(time) || 0);
    let times = [];
    try {
      const parsed = JSON.parse(side?.dataset?.frameTimes || '[]');
      if (Array.isArray(parsed)) times = parsed.map((value) => Number.isFinite(Number(value)) ? Number(value) : null);
    } catch {}
    if (times.length > 0 && times.every((value) => Number.isFinite(value))) {
      let low = 0;
      let high = times.length - 1;
      let result = 0;
      while (low <= high) {
        const mid = (low + high) >> 1;
        if (times[mid] <= numericTime + 0.000001) {
          result = mid;
          low = mid + 1;
        } else high = mid - 1;
      }
      return result;
    }
    const fps = Number(side?.dataset?.frameFps) > 0 ? Number(side.dataset.frameFps) : 30;
    const count = Number(side?.dataset?.frameCount);
    const frame = Math.max(0, Math.round(numericTime * fps));
    return Number.isInteger(count) && count > 0 ? Math.min(count - 1, frame) : frame;
  };
  const schemeOf = (value) => {
    const text = String(value || '');
    const match = text.match(/^([a-z][a-z0-9+.-]*):/iu);
    return match ? match[1].toLowerCase() : (text ? 'relative' : '');
  };
  const videoSnapshot = (video) => {
    if (!video) return null;
    const side = sideForVideo(video);
    return {
      id: videoId(video),
      currentTime: safeNumber(video.currentTime),
      duration: safeNumber(video.duration),
      readyState: video.readyState,
      networkState: video.networkState,
      paused: video.paused,
      ended: video.ended,
      seeking: video.seeking,
      playbackRate: safeNumber(video.playbackRate),
      frameFromCurrentTime: frameForTime(side, video.currentTime),
      inlineReady: video.dataset.treePoloInlineVideoReady || '',
      inlineSourcePending: video.hasAttribute('data-tree-polo-inline-video-src'),
      srcScheme: schemeOf(video.currentSrc || video.getAttribute('src')),
    };
  };
  const toggleSnapshot = (toggle) => toggle ? {
    disabled: Boolean(toggle.disabled),
    ariaPressed: toggle.getAttribute('aria-pressed'),
    text: toggle.textContent,
    playerSelected: playerFor(toggle)?.dataset?.frameSelected || '',
  } : null;
  const introSnapshot = () => ({
    active: document.body?.classList?.contains('report-entry-intro-active') || false,
    titleStage: document.body?.classList?.contains('report-entry-title-stage') || false,
    reveal: document.body?.classList?.contains('report-entry-report-reveal') || false,
    overlayHidden: document.querySelector('[data-report-entry-intro]')?.hidden ?? null,
  });
  const describeTarget = (target) => {
    if (!(target instanceof Element)) return String(target?.nodeName || 'unknown');
    const action = target.getAttribute('data-frame-action');
    const side = target.closest('[data-native-frame-player]')?.dataset?.playerSide;
    const diagnostic = target.closest('[data-report-player-diagnostics-panel],[data-report-player-diagnostics-toggle]');
    return {
      tag: target.tagName.toLowerCase(),
      action: action || '',
      side: side || '',
      className: typeof target.className === 'string' ? target.className : '',
      diagnostic: Boolean(diagnostic),
    };
  };
  const record = (type, detail = {}) => {
    entries.push({ atMs: elapsed(), type, ...detail });
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    const count = document.querySelector('[data-report-player-diagnostics-count]');
    if (count) count.textContent = entries.length + ' events';
  };
  const exportPayload = () => ({
    generatedAt: new Date().toISOString(),
    environment: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
      viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
      locationScheme: schemeOf(location.href),
      embedded: window.top !== window,
      requestVideoFrameCallback: typeof HTMLVideoElement !== 'undefined' && typeof HTMLVideoElement.prototype.requestVideoFrameCallback === 'function',
    },
    entries: entries.slice(),
  });

  window.__treePoloPlayerDiagnostics = { record, exportPayload };
  record('diagnostic-start', { intro: introSnapshot() });

  window.addEventListener('treepolo:entry-start', () => record('entry-start', { intro: introSnapshot() }));
  window.addEventListener('treepolo:entry-complete', () => {
    record('entry-complete', { intro: introSnapshot() });
    const toggle = document.querySelector('[data-report-player-diagnostics-toggle]');
    if (toggle) toggle.dataset.ready = 'true';
  });

  const trackedInteraction = (event, phase) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-report-player-diagnostics-panel],[data-report-player-diagnostics-toggle]')) return;
    const player = target.closest('[data-native-frame-player-block]');
    const intro = target.closest('[data-report-entry-intro]');
    if (!player && !intro && !document.body?.classList?.contains('report-entry-intro-active')) return;
    const toggle = target.closest('[data-frame-action="toggle"]') || player?.querySelector('[data-frame-action="toggle"]');
    const video = player?.querySelector('[data-player-video]') || null;
    record(event.type + '-' + phase, {
      target: describeTarget(target),
      defaultPrevented: event.defaultPrevented,
      pointerType: event.pointerType || '',
      toggle: toggleSnapshot(toggle),
      video: videoSnapshot(video),
      intro: introSnapshot(),
    });
    if (phase === 'capture') {
      setTimeout(() => record(event.type + '-after-task', {
        target: describeTarget(target),
        toggle: toggleSnapshot(toggle),
        video: videoSnapshot(video),
        intro: introSnapshot(),
      }), 0);
    }
  };
  ['pointerdown','pointerup','click'].forEach((type) => {
    document.addEventListener(type, (event) => trackedInteraction(event, 'capture'), true);
    document.addEventListener(type, (event) => trackedInteraction(event, 'bubble'), false);
  });

  const attachVideo = (video) => {
    videoId(video);
    const events = ['loadstart','loadedmetadata','loadeddata','canplay','play','playing','pause','waiting','stalled','seeking','seeked','ended','error','ratechange'];
    events.forEach((type) => video.addEventListener(type, () => record('media-' + type, { video: videoSnapshot(video) })));
    video.addEventListener('timeupdate', () => {
      const current = Number(video.currentTime) || 0;
      const previous = lastTimes.get(video);
      if (Number.isFinite(previous) && current < previous - 0.04) {
        record('media-backward-time-jump', { from: previous, to: current, video: videoSnapshot(video) });
      }
      lastTimes.set(video, current);
    });
    if (typeof video.requestVideoFrameCallback === 'function') {
      const onFrame = (_now, metadata) => {
        if (!video.isConnected) return;
        const side = sideForVideo(video);
        const mediaTime = safeNumber(metadata?.mediaTime);
        record('presented-frame', {
          video: videoSnapshot(video),
          presented: {
            mediaTime,
            frameFromMediaTime: mediaTime === null ? null : frameForTime(side, mediaTime),
            presentedFrames: safeNumber(metadata?.presentedFrames),
            expectedDisplayTime: safeNumber(metadata?.expectedDisplayTime),
          },
        });
        video.requestVideoFrameCallback(onFrame);
      };
      video.requestVideoFrameCallback(onFrame);
    }
  };

  document.querySelectorAll('[data-player-video]').forEach(attachVideo);

  setInterval(() => {
    document.querySelectorAll('[data-player-video]').forEach((video) => {
      if (!video.paused || video.seeking) record('clock-sample', { video: videoSnapshot(video) });
    });
  }, 100);

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      const target = mutation.target;
      if (!(target instanceof Element)) return;
      if (mutation.type === 'attributes') {
        if (target.matches('[data-player-video]')) {
          record('video-attribute-' + mutation.attributeName, { video: videoSnapshot(target) });
        } else if (target.matches('[data-frame-action="toggle"]')) {
          record('toggle-attribute-' + mutation.attributeName, { toggle: toggleSnapshot(target), intro: introSnapshot() });
        } else if (target === document.body || target === document.documentElement) {
          record('page-attribute-' + mutation.attributeName, { intro: introSnapshot() });
        }
      } else if (mutation.type === 'childList') {
        const status = target.closest?.('[data-frame-player-status],[data-frame-side-status]');
        if (status) record('status-text', { text: status.textContent, state: status.dataset.state || '' });
      }
    });
  });
  observer.observe(document.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled','aria-pressed','data-tree-polo-inline-video-ready','src','class','hidden'],
    childList: true,
  });

  const toggleButton = document.querySelector('[data-report-player-diagnostics-toggle]');
  const panel = document.querySelector('[data-report-player-diagnostics-panel]');
  const output = document.querySelector('[data-report-player-diagnostics-output]');
  const refresh = () => {
    if (output) output.value = JSON.stringify(exportPayload(), null, 2);
  };
  toggleButton?.addEventListener('click', () => { refresh(); panel.hidden = false; });
  document.querySelector('[data-report-player-diagnostics-close]')?.addEventListener('click', () => { panel.hidden = true; });
  document.querySelector('[data-report-player-diagnostics-refresh]')?.addEventListener('click', refresh);
  document.querySelector('[data-report-player-diagnostics-copy]')?.addEventListener('click', async () => {
    refresh();
    const text = output?.value || '';
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {}
    if (!copied && output) {
      output.focus();
      output.select();
      try { copied = document.execCommand('copy'); } catch {}
    }
    record(copied ? 'diagnostic-copy-success' : 'diagnostic-copy-failed');
  });
  document.querySelector('[data-report-player-diagnostics-download]')?.addEventListener('click', () => {
    refresh();
    const blob = new Blob([output?.value || ''], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'treepolo-player-diagnostics.json';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    record('diagnostic-download');
  });
})();
</script>`;
}

function injectReportPlayerDiagnostics(html) {
  let output = String(html);
  if (!output.includes('data-report-player-diagnostics-style')) {
    const style = diagnosticStyle();
    output = output.includes('</head>') ? output.replace('</head>', `${style}\n</head>`) : `${style}\n${output}`;
  }
  if (!output.includes('data-report-player-diagnostics-runtime')) {
    const addition = `${diagnosticMarkup()}\n${diagnosticScript()}`;
    output = output.includes('</body>') ? output.replace('</body>', `${addition}\n</body>`) : `${output}\n${addition}`;
  }
  return output;
}

module.exports = {
  diagnosticMarkup,
  diagnosticScript,
  diagnosticStyle,
  injectReportPlayerDiagnostics,
};