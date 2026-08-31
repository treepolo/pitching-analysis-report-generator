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
.report-help-trigger{position:fixed;top:14px;right:16px;z-index:900;display:inline-flex;align-items:center;gap:.42rem;min-height:32px;padding:5px 10px 5px 7px;border:1px solid #718397;border-radius:3px;background:linear-gradient(#fff 0%,#eef5fb 45%,#c9dcec 52%,#e8f1f8 100%);box-shadow:inset 1px 1px 0 #fff,0 1px 3px rgba(0,0,0,.18);color:#172536;font:600 .82rem/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer}
.report-help-trigger:hover{border-color:#3f74a6;background:linear-gradient(#fff 0%,#f7fbff 42%,#b9d9f3 52%,#e9f5ff 100%)}
.report-help-trigger:focus-visible,.report-help-close:focus-visible,.report-help-tutorial-button:focus-visible,.report-help-live-marker:focus-visible,.report-help-tutorial-panel button:focus-visible{outline:2px solid #2b70b3;outline-offset:2px}
.report-help-icon{display:grid;place-items:center;width:18px;height:18px;border:1px solid #52779a;border-radius:50%;background:linear-gradient(#fff,#dcecf8);font:bold 12px/1 Georgia,serif;color:#214f79}
.report-help-backdrop[hidden],.report-help-tutorial-panel[hidden]{display:none}
.report-help-backdrop{position:fixed;inset:0;z-index:4000;display:flex;align-items:center;justify-content:center;padding:5vh 6vw;background:rgba(15,23,34,.34);backdrop-filter:blur(1px);overflow:auto}
.report-help-dialog{position:relative;width:min(920px,88vw);max-height:84vh;overflow:auto;border:1px solid #7c8d9e;border-radius:5px;background:#f8fafc;box-shadow:0 18px 54px rgba(0,0,0,.34),inset 1px 1px 0 #fff;color:#17212b}
.report-help-header{position:sticky;top:0;z-index:2;display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;padding:18px 20px 14px;border-bottom:1px solid #b6c1cb;background:linear-gradient(#fff,#edf3f8)}
.report-help-header h2{margin:0 0 4px;font-size:1.25rem}.report-help-header p{margin:0;color:#586674;font-size:.84rem}
.report-help-close{flex:0 0 auto;width:30px;height:28px;border:1px solid #8996a3;border-radius:3px;background:linear-gradient(#fff,#dce3e9);font:700 18px/1 sans-serif;color:#33414e;cursor:pointer}
.report-help-content{padding:18px 20px 24px}.report-help-content h3{margin:1.4rem 0 .65rem;font-size:1rem}.report-help-content h3:first-child{margin-top:0}
.report-help-figure{margin:0;padding:12px;border:1px solid #abb8c4;background:#e8edf2;box-shadow:inset 1px 1px 0 rgba(255,255,255,.9)}
.report-help-live-preview{position:relative;overflow:hidden;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.14)}
.report-help-live-preview-empty{margin:0;padding:24px;text-align:center;color:#5a6874;background:#f5f7f9;border:1px dashed #9ca8b2}
.report-help-live-preview .report-video{margin:0!important;max-width:none!important;width:100%!important;pointer-events:none!important}
.report-help-live-preview video{background:#000!important}
.report-help-preview-marker{position:absolute;z-index:6;display:grid;place-items:center;width:22px;height:22px;border:2px solid #fff;border-radius:50%;background:#245f94;box-shadow:0 1px 5px rgba(0,0,0,.38);color:#fff;font:bold 11px/1 system-ui,sans-serif;transform:translate(-50%,-50%);pointer-events:none}
.report-help-figure figcaption{margin-top:9px;color:#52606d;font-size:.78rem;line-height:1.45}
.report-help-guide{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px 14px;margin:0;padding:0;list-style:none}
.report-help-guide li{display:grid;grid-template-columns:28px 1fr;gap:8px;align-items:start;padding:9px;border:1px solid #d2d9df;background:#fff}
.report-help-number{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:#245f94;color:#fff;font-weight:700;font-size:.78rem}
.report-help-guide strong{display:block;margin-bottom:2px;font-size:.86rem}.report-help-guide p{margin:0;color:#4d5a66;font-size:.79rem;line-height:1.48}
.report-help-shortcuts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.report-help-shortcut{padding:9px;border:1px solid #cbd4dc;background:#fff;font-size:.78rem}.report-help-shortcut kbd{display:inline-block;min-width:29px;margin-right:5px;padding:2px 5px;border:1px solid #8996a3;border-bottom-width:2px;border-radius:3px;background:#f7f9fa;box-shadow:inset 0 1px 0 #fff;font:600 .76rem/1.2 system-ui,sans-serif;text-align:center}
.report-help-note{margin:.7rem 0 0;padding:9px 11px;border-left:3px solid #527ea5;background:#eef5fb;color:#455463;font-size:.79rem;line-height:1.5}
.report-help-actions{display:flex;flex-wrap:wrap;align-items:center;gap:9px;margin-top:18px;padding-top:14px;border-top:1px solid #cbd3da}.report-help-tutorial-button{min-height:31px;padding:5px 11px;border:1px solid #5c7790;border-radius:3px;background:linear-gradient(#fff,#dceaf5 48%,#bfd5e7 52%,#e9f3fa);color:#17334b;font:600 .8rem/1.2 system-ui,sans-serif;cursor:pointer}.report-help-actions span{color:#5b6874;font-size:.76rem}
.report-help-live-marker{position:absolute;z-index:3800;display:grid;place-items:center;width:27px;height:27px;padding:0;border:2px solid #fff;border-radius:50%;background:#245f94;box-shadow:0 2px 7px rgba(0,0,0,.42);color:#fff;font:bold 12px/1 system-ui,sans-serif;cursor:pointer;transform:translate(-50%,-50%)}
.report-help-live-marker.is-current{background:#b03d24;width:31px;height:31px}
.report-help-live-target{outline:2px solid rgba(36,95,148,.68)!important;outline-offset:2px!important}.report-help-live-target.is-current{outline:3px solid #b03d24!important;outline-offset:3px!important}
.report-help-tutorial-panel{position:fixed;right:16px;bottom:16px;z-index:3850;width:min(380px,calc(100vw - 32px));border:1px solid #718397;border-radius:5px;background:#f8fafc;box-shadow:0 8px 28px rgba(0,0,0,.32),inset 1px 1px 0 #fff;color:#172536;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.report-help-tutorial-panel-header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 10px;border-bottom:1px solid #b9c5cf;background:linear-gradient(#fff,#e4edf4)}
.report-help-tutorial-step{font-size:.75rem;color:#52616e;font-weight:700}.report-help-tutorial-stop{min-height:27px;padding:3px 9px;border:1px solid #8f5c50;border-radius:3px;background:linear-gradient(#fff,#f0d8d2);color:#713322;font:700 .76rem/1.2 system-ui,sans-serif;cursor:pointer}
.report-help-tutorial-copy{padding:12px}.report-help-tutorial-copy strong{display:block;margin:0 0 5px;font-size:.98rem}.report-help-tutorial-copy p{margin:0;color:#475765;font-size:.82rem;line-height:1.5}
.report-help-tutorial-controls{display:flex;flex-wrap:wrap;gap:7px;padding:0 12px 12px}.report-help-tutorial-controls button{min-height:29px;padding:4px 9px;border:1px solid #788997;border-radius:3px;background:linear-gradient(#fff,#dde7ee);color:#233746;font:600 .76rem/1.2 system-ui,sans-serif;cursor:pointer}.report-help-tutorial-controls button:disabled{opacity:.48;cursor:default}.report-help-tutorial-controls [data-report-help-tutorial-full]{margin-left:auto}
@media(max-width:720px){.report-help-backdrop{padding:4vh 4vw}.report-help-dialog{width:92vw;max-height:86vh}.report-help-content{padding:14px}.report-help-guide{grid-template-columns:1fr}.report-help-shortcuts{grid-template-columns:repeat(2,minmax(0,1fr))}.report-help-trigger{top:8px;right:8px}.report-help-tutorial-panel{right:8px;bottom:8px;width:min(360px,calc(100vw - 16px))}}
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
      const rect = target.getBoundingClientRect();
      const badge = document.createElement('span');
      badge.className = 'report-help-preview-marker';
      badge.textContent = String(guide.number);
      badge.style.left = (rect.right - hostRect.left) + 'px';
      badge.style.top = (rect.top - hostRect.top) + 'px';
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
      const rect = target.getBoundingClientRect();
      const marker = document.createElement('button');
      marker.type = 'button';
      marker.className = 'report-help-live-marker' + (index === activeGuideIndex ? ' is-current' : '');
      marker.textContent = String(guide.number);
      marker.title = guide.title;
      marker.setAttribute('aria-label', guide.title + '：顯示文字說明');
      marker.style.left = (window.scrollX + rect.right) + 'px';
      marker.style.top = (window.scrollY + rect.top) + 'px';
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