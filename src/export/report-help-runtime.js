'use strict';

const HELP_ITEMS = Object.freeze([
  ['1', '播放／暫停', '按 ▶ 開始播放，播放中會變成 ⏸；再次按下即可暫停。'],
  ['2', '上一幀', '往前精確移動 1 幀，適合逐幀檢查動作。'],
  ['3', '目前幀／總幀數', '顯示現在停在哪一幀，以及影片可查看的總幀數。'],
  ['4', '播放進度拖桿', '拖曳到想看的位置；放開後會精確定位到該幀。'],
  ['5', '下一幀', '往後精確移動 1 幀。'],
  ['6', '播放速度數值', '可直接輸入倍率；支援從 1/64× 到 64×。'],
  ['7', '播放速度拖桿', '連續調整播放速度；可直接跨越一般播放與超慢／超快範圍。'],
  ['8', '重置速度', '按 ↻ 立即回到 1.00×。'],
  ['9', '循環播放', '開啟後會在此影片／共同播放區間內重複播放。'],
  ['10', '上一標註幀', '跳到目前位置之前最近的一個標註幀；鍵盤 A 功能相同。'],
  ['11', '下一標註幀', '跳到目前位置之後最近的一個標註幀；鍵盤 D 功能相同。'],
  ['12', '標註顯示', '「點」控制標註點、「線」控制軌跡連線；各圖層勾選框可個別顯示或隱藏。'],
]);

function helpCss() {
  return `<style data-report-help-style>
/* Structural/interaction geometry only. Product skin and typography belong to report-theme.js. */
.report-help-trigger{position:fixed;top:14px;right:16px;z-index:900;display:inline-flex;align-items:center;gap:.42rem;min-height:34px;padding:6px 13px;cursor:pointer}
.report-help-icon{display:grid;place-items:center;width:18px;height:18px}
.report-help-backdrop[hidden],.report-help-tutorial-panel[hidden]{display:none}
.report-help-backdrop{position:fixed;inset:0;z-index:4000;display:flex;align-items:center;justify-content:center;padding:5vh 6vw;overflow:auto}
.report-help-dialog{position:relative;width:min(940px,88vw);max-height:84vh;overflow:auto}
.report-help-header{position:relative;top:auto;z-index:2;display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;margin:0;padding:24px 28px 18px}
.report-help-header h2{margin:0}.report-help-header p{margin:7px 0 0}
.report-help-close{flex:0 0 auto;width:36px;height:36px;padding:0;cursor:pointer}
.report-help-content{padding:24px 28px 30px}.report-help-content h3{margin:30px 0 12px}.report-help-content h3:first-child{margin-top:0}
.report-help-figure{margin:0;padding:14px;overflow:hidden}
.report-help-live-preview{position:relative;overflow:hidden}
.report-help-live-preview-empty{margin:0;padding:24px;text-align:center}
.report-help-live-preview .report-video{margin:0!important;max-width:none!important;width:100%!important;pointer-events:none!important}
.report-help-preview-marker{position:absolute;z-index:6;display:grid;place-items:center;width:22px;height:22px;transform:translate(-50%,-50%);pointer-events:none}
.report-help-figure figcaption{margin-top:10px}
.report-help-guide{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 16px;margin:0;padding:0;list-style:none}
.report-help-guide li{display:grid;grid-template-columns:28px 1fr;gap:8px;align-items:start;padding:12px}
.report-help-number{display:grid;place-items:center;width:24px;height:24px}
.report-help-guide strong{display:block;margin-bottom:2px}.report-help-guide p{margin:0}
.report-help-shortcuts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.report-help-shortcut{padding:10px}.report-help-shortcut kbd{display:inline-block;min-width:29px;margin-right:5px;padding:2px 5px;text-align:center}
.report-help-note{margin:.7rem 0 0;padding:11px 13px}
.report-help-actions{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:22px;padding-top:18px}.report-help-tutorial-button{min-height:34px;padding:6px 13px;cursor:pointer}
.report-help-live-marker{position:absolute;z-index:3800;display:grid;place-items:center;width:27px;height:27px;padding:0;cursor:pointer;transform:translate(-50%,-50%)}
.report-help-live-marker.is-current{width:31px;height:31px}
.report-help-tutorial-panel{position:fixed;right:16px;bottom:16px;z-index:3850;width:min(380px,calc(100vw - 32px))}
.report-help-tutorial-panel-header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 10px}
.report-help-tutorial-stop{min-height:34px;padding:6px 13px;cursor:pointer}
.report-help-tutorial-copy{padding:12px}.report-help-tutorial-copy strong{display:block;margin:0 0 5px}.report-help-tutorial-copy p{margin:0}
.report-help-tutorial-controls{display:flex;flex-wrap:wrap;gap:7px;padding:0 12px 12px}.report-help-tutorial-controls button{min-height:34px;padding:6px 13px;cursor:pointer}.report-help-tutorial-controls button:disabled{cursor:default}.report-help-tutorial-controls [data-report-help-tutorial-full]{margin-left:auto}
@media(max-width:760px){.report-help-dialog{width:92vw}.report-help-header{padding:20px 18px 15px}.report-help-content{padding:18px}.report-help-guide{grid-template-columns:1fr}.report-help-shortcuts{grid-template-columns:repeat(2,minmax(0,1fr))}.report-help-tutorial-panel{right:8px;bottom:8px;width:min(360px,calc(100vw - 16px))}}
@media print{.report-help-trigger,.report-help-backdrop,.report-help-tutorial-panel,.report-help-live-marker{display:none!important}.report-help-live-target{outline:none!important}}
</style>`;
}

function helpMarkup() {
  const itemHtml = HELP_ITEMS.map(([number, title, text]) => `<li data-report-help-item="${number}"><span class="report-help-number">${number}</span><div><strong>${title}</strong><p>${text}</p></div></li>`).join('');
  return `<button type="button" class="report-help-trigger" data-report-help-open aria-haspopup="dialog"><span class="report-help-icon" aria-hidden="true">i</span><span>使用教學</span></button>
<div class="report-help-backdrop" data-report-help-backdrop hidden>
  <section class="report-help-dialog" data-report-help-dialog role="dialog" aria-modal="true" aria-labelledby="report-help-title" tabindex="-1">
    <header class="report-help-header"><div><h2 id="report-help-title">報告播放器使用教學</h2><p>以下圖解直接使用這份報告中的實際播放器介面。</p></div><button type="button" class="report-help-close" data-report-help-close aria-label="關閉使用教學" title="關閉">×</button></header>
    <div class="report-help-content">
      <h3>實際播放器圖解</h3>
      <figure class="report-help-figure" aria-label="本報告實際播放器控制項標註圖解">
        <div class="report-help-live-preview" data-report-help-preview><p class="report-help-live-preview-empty">正在建立本報告的播放器圖解…</p></div>
        <figcaption>這裡會直接複製本報告中的實際播放器介面，因此按鈕排列、標註控制、進度條與速度控制會和你正在看的報告一致。藍色編號與下方說明相同。</figcaption>
      </figure>
      <h3>每個控制項的用途</h3>
      <ol class="report-help-guide">${itemHtml}</ol>
      <h3>鍵盤快捷鍵</h3>
      <div class="report-help-shortcuts">
        <div class="report-help-shortcut"><kbd>Space</kbd>播放／暫停</div>
        <div class="report-help-shortcut"><kbd>←</kbd>上一幀</div>
        <div class="report-help-shortcut"><kbd>→</kbd>下一幀</div>
        <div class="report-help-shortcut"><kbd>A</kbd>上一標註幀</div>
        <div class="report-help-shortcut"><kbd>D</kbd>下一標註幀</div>
      </div>
      <p class="report-help-note"><strong>雙影片：</strong>主控制列會同時控制兩支影片；進度與逐幀操作依報告建立時設定的同步關係一起移動。左右側的標註仍各自屬於自己的影片。</p>
      <p class="report-help-note"><strong>標註：</strong>播放到某一幀時，只會顯示截至該幀已建立的標註歷史；尚未到達的未來標註不會提前出現。</p>
      <div class="report-help-actions"><button type="button" class="report-help-tutorial-button" data-report-help-tutorial>在報告中顯示教學標記</button><span>開啟後會在真實控制項旁顯示編號，右下角同時會常駐文字說明與「結束教學」。</span></div>
    </div>
  </section>
</div>
<aside class="report-help-tutorial-panel" data-report-help-tutorial-panel hidden aria-live="polite">
  <div class="report-help-tutorial-panel-header"><span class="report-help-tutorial-step" data-report-help-tutorial-step>教學模式</span><button type="button" class="report-help-tutorial-stop" data-report-help-tutorial-stop>結束教學</button></div>
  <div class="report-help-tutorial-copy"><strong data-report-help-tutorial-title>播放器教學</strong><p data-report-help-tutorial-description>點選任一藍色標號即可查看該控制項的用途。</p></div>
  <div class="report-help-tutorial-controls"><button type="button" data-report-help-tutorial-previous>← 上一項</button><button type="button" data-report-help-tutorial-next>下一項 →</button><button type="button" data-report-help-tutorial-full>查看完整說明</button></div>
</aside>`;
}

function helpScript() {
  const guidesJson = JSON.stringify(HELP_ITEMS.map(([number, title, text]) => ({ number: Number(number), title, text })));
  return `<script data-report-help-runtime>
(() => {
  const openButton = document.querySelector('[data-report-help-open]');
  const backdrop = document.querySelector('[data-report-help-backdrop]');
  const dialog = document.querySelector('[data-report-help-dialog]');
  const closeButton = document.querySelector('[data-report-help-close]');
  const tutorialButton = document.querySelector('[data-report-help-tutorial]');
  const tutorialPanel = document.querySelector('[data-report-help-tutorial-panel]');
  const tutorialStop = document.querySelector('[data-report-help-tutorial-stop]');
  const tutorialStep = document.querySelector('[data-report-help-tutorial-step]');
  const tutorialTitle = document.querySelector('[data-report-help-tutorial-title]');
  const tutorialDescription = document.querySelector('[data-report-help-tutorial-description]');
  const tutorialPrevious = document.querySelector('[data-report-help-tutorial-previous]');
  const tutorialNext = document.querySelector('[data-report-help-tutorial-next]');
  const tutorialFull = document.querySelector('[data-report-help-tutorial-full]');
  const previewHost = document.querySelector('[data-report-help-preview]');
  if (!openButton || !backdrop || !dialog || !closeButton || !tutorialButton || !tutorialPanel || !tutorialStop || !previewHost) return;

  const guideCopy = ${guidesJson};
  const selectors = [
    '[data-frame-action="toggle"]',
    '[data-frame-action="previous"]',
    '[data-frame-current], [data-frame-position]',
    '[data-frame-timeline]',
    '[data-frame-action="next"]',
    '[data-frame-rate-input]',
    '[data-frame-rate]',
    '[data-frame-action="reset-rate"]',
    '[data-frame-loop], [data-frame-common-loop]',
    '[data-annotation-jump="previous"]',
    '[data-annotation-jump="next"]',
    '.report-annotation-controls',
  ];
  const guides = guideCopy.map((guide, index) => ({ ...guide, selector: selectors[index] }));

  let tutorialActive = false;
  let activeGuideIndex = 0;
  let liveMarkers = [];
  let markedTargets = [];
  let markerRefresh = null;
  let previewRefresh = null;
  let lastFocused = null;

  function allPlayers() {
    return [...document.querySelectorAll('figure.report-video')];
  }

  function previewPlayer() {
    const players = allPlayers();
    return players.find((player) => player.querySelector('.report-annotation-controls')) || players[0] || null;
  }

  function visiblePlayer() {
    const players = allPlayers();
    if (players.length === 0) return null;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    let best = null;
    let bestScore = -1;
    for (const player of players) {
      const rect = player.getBoundingClientRect();
      const overlapY = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
      const overlapX = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
      const score = overlapY * overlapX;
      if (score > bestScore) { best = player; bestScore = score; }
    }
    return best || players[0];
  }

  function markerTarget(player, guide) {
    if (!player) return null;
    const candidates = [...player.querySelectorAll(guide.selector)];
    return candidates.find((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }) || null;
  }

  function sliderMarkerPoint(slider) {
    if (!slider) return null;
    const rect = slider.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const minimum = Number(slider.min);
    const maximum = Number(slider.max);
    const value = Number(slider.value);
    const min = Number.isFinite(minimum) ? minimum : 0;
    const max = Number.isFinite(maximum) && maximum > min ? maximum : min + 1;
    const current = Number.isFinite(value) ? value : min;
    const ratio = Math.max(0, Math.min(1, (current - min) / (max - min)));
    const thumbHalfWidth = 4;
    const usableWidth = Math.max(0, rect.width - (thumbHalfWidth * 2));
    return {
      x: rect.left + thumbHalfWidth + (usableWidth * ratio),
      y: rect.top - 9,
    };
  }

  function markerPoint(target, guide) {
    if (guide?.number === 7 && target?.matches?.('[data-frame-rate]')) return sliderMarkerPoint(target);
    const rect = target?.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return { x: rect.right, y: rect.top };
  }

  function stripCloneRuntime(clone) {
    clone.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
    clone.querySelectorAll('video').forEach((video) => {
      video.removeAttribute('src');
      video.removeAttribute('poster');
      video.removeAttribute('autoplay');
      video.setAttribute('preload', 'none');
      video.querySelectorAll('source').forEach((source) => source.remove());
    });
    clone.querySelectorAll('button,input,select,textarea,a').forEach((element) => {
      element.setAttribute('tabindex', '-1');
      element.setAttribute('aria-hidden', 'true');
    });
    clone.querySelectorAll('.report-annotation-overlay').forEach((overlay) => overlay.remove());
    clone.removeAttribute('aria-selected');
    clone.removeAttribute('tabindex');
    clone.dataset.frameSelected = 'false';
  }

  function clearPreviewMarkers() {
    previewHost.querySelectorAll('.report-help-preview-marker').forEach((marker) => marker.remove());
  }

  function renderPreviewMarkers() {
    previewRefresh = null;
    clearPreviewMarkers();
    const clone = previewHost.querySelector('figure.report-video');
    if (!clone || backdrop.hidden) return;
    const hostRect = previewHost.getBoundingClientRect();
    for (const guide of guides) {
      const target = markerTarget(clone, guide);
      if (!target) continue;
      const point = markerPoint(target, guide);
      if (!point) continue;
      const badge = document.createElement('span');
      badge.className = 'report-help-preview-marker';
      badge.textContent = String(guide.number);
      badge.style.left = (point.x - hostRect.left) + 'px';
      badge.style.top = (point.y - hostRect.top) + 'px';
      previewHost.append(badge);
    }
  }

  function queuePreviewMarkers() {
    if (previewRefresh !== null) cancelAnimationFrame(previewRefresh);
    previewRefresh = requestAnimationFrame(renderPreviewMarkers);
  }

  function buildLivePreview() {
    const player = previewPlayer();
    previewHost.replaceChildren();
    if (!player) {
      const empty = document.createElement('p');
      empty.className = 'report-help-live-preview-empty';
      empty.textContent = '這份報告目前沒有可供圖解的影片播放器。';
      previewHost.append(empty);
      return;
    }
    const clone = player.cloneNode(true);
    stripCloneRuntime(clone);
    previewHost.append(clone);
    queuePreviewMarkers();
  }

  function openHelp(number = null) {
    stopTutorial();
    lastFocused = document.activeElement;
    backdrop.hidden = false;
    buildLivePreview();
    dialog.focus({ preventScroll: true });
    if (number !== null) {
      const item = dialog.querySelector('[data-report-help-item="' + number + '"]');
      if (item) dialog.scrollTop = Math.max(0, item.offsetTop - (dialog.clientHeight / 2) + (item.clientHeight / 2));
    } else dialog.scrollTop = 0;
  }

  function closeHelp({ restoreFocus = true } = {}) {
    if (backdrop.hidden) return;
    backdrop.hidden = true;
    clearPreviewMarkers();
    if (previewRefresh !== null) cancelAnimationFrame(previewRefresh);
    previewRefresh = null;
    if (restoreFocus) (lastFocused?.isConnected ? lastFocused : openButton).focus?.({ preventScroll: true });
  }

  function clearMarkers() {
    liveMarkers.forEach((marker) => marker.remove());
    markedTargets.forEach((target) => target.classList.remove('report-help-live-target', 'is-current'));
    liveMarkers = [];
    markedTargets = [];
  }

  function availableGuideIndexes(player) {
    return guides.map((guide, index) => markerTarget(player, guide) ? index : -1).filter((index) => index >= 0);
  }

  function updateTutorialPanel(player = visiblePlayer()) {
    const available = availableGuideIndexes(player);
    if (available.length > 0 && !available.includes(activeGuideIndex)) activeGuideIndex = available[0];
    const guide = guides[activeGuideIndex] || guides[0];
    const ordinal = Math.max(0, available.indexOf(activeGuideIndex));
    if (tutorialStep) tutorialStep.textContent = available.length > 0 ? ('教學模式 · 第 ' + (ordinal + 1) + ' / ' + available.length + ' 項') : '教學模式';
    if (tutorialTitle) tutorialTitle.textContent = guide ? (guide.number + '. ' + guide.title) : '播放器教學';
    if (tutorialDescription) tutorialDescription.textContent = guide?.text || '目前畫面沒有可標示的播放器控制項。';
    if (tutorialPrevious) tutorialPrevious.disabled = available.length <= 1 || ordinal <= 0;
    if (tutorialNext) tutorialNext.disabled = available.length <= 1 || ordinal < 0 || ordinal >= available.length - 1;
  }

  function renderMarkers() {
    markerRefresh = null;
    if (!tutorialActive) return;
    clearMarkers();
    const player = visiblePlayer();
    if (!player) {
      updateTutorialPanel(null);
      return;
    }
    const available = availableGuideIndexes(player);
    if (available.length > 0 && !available.includes(activeGuideIndex)) activeGuideIndex = available[0];
    for (const index of available) {
      const guide = guides[index];
      const target = markerTarget(player, guide);
      if (!target) continue;
      const point = markerPoint(target, guide);
      if (!point) continue;
      const marker = document.createElement('button');
      marker.type = 'button';
      marker.className = 'report-help-live-marker' + (index === activeGuideIndex ? ' is-current' : '');
      marker.textContent = String(guide.number);
      marker.title = guide.title;
      marker.setAttribute('aria-label', guide.title + '：顯示文字說明');
      marker.style.left = (window.scrollX + point.x) + 'px';
      marker.style.top = (window.scrollY + point.y) + 'px';
      marker.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        activeGuideIndex = index;
        renderMarkers();
      });
      document.body.append(marker);
      target.classList.add('report-help-live-target');
      if (index === activeGuideIndex) target.classList.add('is-current');
      liveMarkers.push(marker);
      markedTargets.push(target);
    }
    updateTutorialPanel(player);
  }

  function queueMarkerRefresh() {
    if (!tutorialActive || markerRefresh !== null) return;
    markerRefresh = requestAnimationFrame(renderMarkers);
  }

  function startTutorial() {
    closeHelp({ restoreFocus: false });
    tutorialActive = true;
    tutorialPanel.hidden = false;
    const player = visiblePlayer();
    const available = availableGuideIndexes(player);
    activeGuideIndex = available[0] ?? 0;
    renderMarkers();
  }

  function stopTutorial() {
    if (markerRefresh !== null) cancelAnimationFrame(markerRefresh);
    markerRefresh = null;
    tutorialActive = false;
    tutorialPanel.hidden = true;
    clearMarkers();
  }

  function moveTutorial(direction) {
    if (!tutorialActive) return;
    const player = visiblePlayer();
    const available = availableGuideIndexes(player);
    if (available.length === 0) return;
    let ordinal = available.indexOf(activeGuideIndex);
    if (ordinal < 0) ordinal = 0;
    ordinal = Math.max(0, Math.min(available.length - 1, ordinal + direction));
    activeGuideIndex = available[ordinal];
    const target = markerTarget(player, guides[activeGuideIndex]);
    if (target) target.scrollIntoView?.({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    renderMarkers();
    setTimeout(queueMarkerRefresh, 220);
  }

  openButton.addEventListener('click', () => openHelp());
  closeButton.addEventListener('click', () => closeHelp());
  tutorialButton.addEventListener('click', startTutorial);
  tutorialStop.addEventListener('click', stopTutorial);
  tutorialPrevious?.addEventListener('click', () => moveTutorial(-1));
  tutorialNext?.addEventListener('click', () => moveTutorial(1));
  tutorialFull?.addEventListener('click', () => openHelp(guides[activeGuideIndex]?.number || null));
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) closeHelp();
  });
  dialog.addEventListener('click', (event) => event.stopPropagation());
  dialog.addEventListener('scroll', queuePreviewMarkers, { passive: true });
  window.addEventListener('keydown', (event) => {
    if (!backdrop.hidden) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeHelp();
        return;
      }
      const blockedShortcut = event.key === ' ' || event.key === 'Spacebar'
        || event.key === 'ArrowLeft' || event.key === 'ArrowRight'
        || event.code === 'KeyA' || event.code === 'KeyD';
      if (blockedShortcut) event.stopImmediatePropagation();
      return;
    }
    if (event.key === 'Escape' && tutorialActive) {
      event.preventDefault();
      event.stopImmediatePropagation();
      stopTutorial();
    }
  }, true);
  const refreshSliderMarker = (event) => {
    if (!event.target?.matches?.('[data-frame-rate]')) return;
    queueMarkerRefresh();
    if (!backdrop.hidden) queuePreviewMarkers();
  };
  document.addEventListener('input', refreshSliderMarker, true);
  document.addEventListener('change', refreshSliderMarker, true);
  window.addEventListener('resize', () => {
    queueMarkerRefresh();
    if (!backdrop.hidden) queuePreviewMarkers();
  });
  window.addEventListener('scroll', queueMarkerRefresh, true);
})();
</script>`;
}

function injectReportHelpHtml(html) {
  let output = String(html);
  const css = helpCss();
  output = output.includes('</head>') ? output.replace('</head>', `${css}\n</head>`) : `${css}\n${output}`;
  const addition = `${helpMarkup()}\n${helpScript()}`;
  const bodyPattern = /<body\b[^>]*>/iu;
  if (bodyPattern.test(output)) {
    output = output.replace(bodyPattern, (match) => `${match}\n${addition}`);
  } else {
    output = `${addition}\n${output}`;
  }
  return output;
}

module.exports = {
  HELP_ITEMS,
  helpCss,
  helpMarkup,
  helpScript,
  injectReportHelpHtml,
};