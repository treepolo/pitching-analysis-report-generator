'use strict';

function helpCss() {
  return `<style data-report-help-style>
.report-help-trigger{position:fixed;top:14px;right:16px;z-index:900;display:inline-flex;align-items:center;gap:.42rem;min-height:32px;padding:5px 10px 5px 7px;border:1px solid #718397;border-radius:3px;background:linear-gradient(#fff 0%,#eef5fb 45%,#c9dcec 52%,#e8f1f8 100%);box-shadow:inset 1px 1px 0 #fff,0 1px 3px rgba(0,0,0,.18);color:#172536;font:600 .82rem/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer}
.report-help-trigger:hover{border-color:#3f74a6;background:linear-gradient(#fff 0%,#f7fbff 42%,#b9d9f3 52%,#e9f5ff 100%)}
.report-help-trigger:focus-visible,.report-help-close:focus-visible,.report-help-tutorial-button:focus-visible,.report-help-live-marker:focus-visible{outline:2px solid #2b70b3;outline-offset:2px}
.report-help-icon{display:grid;place-items:center;width:18px;height:18px;border:1px solid #52779a;border-radius:50%;background:linear-gradient(#fff,#dcecf8);font:bold 12px/1 Georgia,serif;color:#214f79}
.report-help-backdrop[hidden]{display:none}
.report-help-backdrop{position:fixed;inset:0;z-index:4000;display:flex;align-items:center;justify-content:center;padding:5vh 6vw;background:rgba(15,23,34,.34);backdrop-filter:blur(1px);overflow:auto}
.report-help-dialog{position:relative;width:min(900px,88vw);max-height:84vh;overflow:auto;border:1px solid #7c8d9e;border-radius:5px;background:#f8fafc;box-shadow:0 18px 54px rgba(0,0,0,.34),inset 1px 1px 0 #fff;color:#17212b}
.report-help-header{position:sticky;top:0;z-index:2;display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;padding:18px 20px 14px;border-bottom:1px solid #b6c1cb;background:linear-gradient(#fff,#edf3f8)}
.report-help-header h2{margin:0 0 4px;font-size:1.25rem}.report-help-header p{margin:0;color:#586674;font-size:.84rem}
.report-help-close{flex:0 0 auto;width:30px;height:28px;border:1px solid #8996a3;border-radius:3px;background:linear-gradient(#fff,#dce3e9);font:700 18px/1 sans-serif;color:#33414e;cursor:pointer}
.report-help-content{padding:18px 20px 24px}.report-help-content h3{margin:1.4rem 0 .65rem;font-size:1rem}.report-help-content h3:first-child{margin-top:0}
.report-help-figure{margin:0;padding:14px;border:1px solid #abb8c4;background:linear-gradient(#e8edf2,#d8e0e7);box-shadow:inset 1px 1px 0 rgba(255,255,255,.9)}
.report-help-demo-screen{height:170px;border:1px solid #65717c;background:linear-gradient(145deg,#111923,#263444);box-shadow:inset 0 0 28px rgba(0,0,0,.35)}
.report-help-demo-controls{display:grid;grid-template-columns:auto auto minmax(92px,1fr) minmax(190px,2fr) auto auto;align-items:center;gap:7px;margin-top:10px}
.report-help-demo-rate{display:grid;grid-template-columns:70px minmax(180px,1fr) auto auto;align-items:center;gap:7px;margin-top:8px}
.report-help-demo-annotation{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin-top:10px;padding-top:10px;border-top:1px solid #aeb8c1}
.report-help-demo-control{position:relative;display:inline-flex;align-items:center;justify-content:center;min-height:28px;padding:3px 8px;border:1px solid #7b8792;border-radius:2px;background:linear-gradient(#fff,#dce5ec);box-shadow:inset 1px 1px 0 #fff;color:#1c2731;font:inherit}
.report-help-demo-control.is-range{min-width:110px;height:8px;min-height:8px;padding:0;border-radius:4px;background:linear-gradient(#c6d0d8,#f8fbfd);box-shadow:inset 0 1px 2px rgba(0,0,0,.28)}
.report-help-demo-control.is-output{border-color:transparent;background:transparent;box-shadow:none;white-space:nowrap}
.report-help-demo-control.is-annotation{background:#fff}.report-help-demo-control.is-wide{min-width:150px}
.report-help-demo-badge{position:absolute;top:-13px;right:-9px;display:grid;place-items:center;width:22px;height:22px;border:2px solid #fff;border-radius:50%;background:#245f94;box-shadow:0 1px 4px rgba(0,0,0,.32);color:#fff;font:bold 12px/1 system-ui,sans-serif;z-index:1}
.report-help-figure figcaption{margin-top:9px;color:#52606d;font-size:.78rem}
.report-help-guide{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px 14px;margin:0;padding:0;list-style:none}
.report-help-guide li{display:grid;grid-template-columns:28px 1fr;gap:8px;align-items:start;padding:9px;border:1px solid #d2d9df;background:#fff}
.report-help-number{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:#245f94;color:#fff;font-weight:700;font-size:.78rem}
.report-help-guide strong{display:block;margin-bottom:2px;font-size:.86rem}.report-help-guide p{margin:0;color:#4d5a66;font-size:.79rem;line-height:1.48}
.report-help-shortcuts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.report-help-shortcut{padding:9px;border:1px solid #cbd4dc;background:#fff;font-size:.78rem}.report-help-shortcut kbd{display:inline-block;min-width:29px;margin-right:5px;padding:2px 5px;border:1px solid #8996a3;border-bottom-width:2px;border-radius:3px;background:#f7f9fa;box-shadow:inset 0 1px 0 #fff;font:600 .76rem/1.2 system-ui,sans-serif;text-align:center}
.report-help-note{margin:.7rem 0 0;padding:9px 11px;border-left:3px solid #527ea5;background:#eef5fb;color:#455463;font-size:.79rem;line-height:1.5}
.report-help-actions{display:flex;flex-wrap:wrap;align-items:center;gap:9px;margin-top:18px;padding-top:14px;border-top:1px solid #cbd3da}.report-help-tutorial-button{min-height:31px;padding:5px 11px;border:1px solid #5c7790;border-radius:3px;background:linear-gradient(#fff,#dceaf5 48%,#bfd5e7 52%,#e9f3fa);color:#17334b;font:600 .8rem/1.2 system-ui,sans-serif;cursor:pointer}.report-help-actions span{color:#5b6874;font-size:.76rem}
.report-help-tutorial-stop{position:fixed;right:16px;bottom:16px;z-index:3900;min-height:34px;padding:6px 12px;border:1px solid #6c7680;border-radius:4px;background:#fff;box-shadow:0 3px 12px rgba(0,0,0,.24);color:#202a33;font:600 .8rem/1.2 system-ui,sans-serif;cursor:pointer}.report-help-tutorial-stop[hidden]{display:none}
.report-help-live-marker{position:absolute;z-index:3800;display:grid;place-items:center;width:26px;height:26px;padding:0;border:2px solid #fff;border-radius:50%;background:#245f94;box-shadow:0 2px 7px rgba(0,0,0,.42);color:#fff;font:bold 12px/1 system-ui,sans-serif;cursor:pointer;transform:translate(-50%,-50%)}
.report-help-live-target{outline:2px solid rgba(36,95,148,.78)!important;outline-offset:2px!important}
@media(max-width:720px){.report-help-backdrop{padding:4vh 4vw}.report-help-dialog{width:92vw;max-height:86vh}.report-help-content{padding:14px}.report-help-guide{grid-template-columns:1fr}.report-help-shortcuts{grid-template-columns:repeat(2,minmax(0,1fr))}.report-help-demo-controls{grid-template-columns:auto auto minmax(70px,1fr)}.report-help-demo-controls .is-range{grid-column:1/-1}.report-help-demo-rate{grid-template-columns:70px 1fr auto}.report-help-demo-rate .is-range{grid-column:1/-1}.report-help-trigger{top:8px;right:8px}}
@media print{.report-help-trigger,.report-help-backdrop,.report-help-tutorial-stop,.report-help-live-marker{display:none!important}.report-help-live-target{outline:none!important}}
</style>`;
}

function helpMarkup() {
  const items = [
    ['1','播放／暫停','按 ▶ 開始播放，播放中會變成 ⏸；再次按下即可暫停。'],
    ['2','上一幀','往前精確移動 1 幀，適合逐幀檢查動作。'],
    ['3','目前幀／總幀數','顯示現在停在哪一幀，以及影片可查看的總幀數。'],
    ['4','播放進度拖桿','拖曳到想看的位置；放開後會精確定位到該幀。'],
    ['5','下一幀','往後精確移動 1 幀。'],
    ['6','播放速度數值','可直接輸入倍率；支援從 1/64× 到 64×。'],
    ['7','播放速度拖桿','連續調整播放速度；可直接跨越一般播放與超慢／超快範圍。'],
    ['8','重置速度','按 ↻ 立即回到 1.00×。'],
    ['9','循環播放','開啟後會在此影片／共同播放區間內重複播放。'],
    ['10','上一標註幀','跳到目前位置之前最近的一個標註幀；鍵盤 A 功能相同。'],
    ['11','下一標註幀','跳到目前位置之後最近的一個標註幀；鍵盤 D 功能相同。'],
    ['12','標註顯示','「點」控制標註點、「線」控制軌跡連線；各圖層勾選框可個別顯示或隱藏。'],
  ];
  const itemHtml = items.map(([number,title,text]) => `<li data-report-help-item="${number}"><span class="report-help-number">${number}</span><div><strong>${title}</strong><p>${text}</p></div></li>`).join('');
  return `<button type="button" class="report-help-trigger" data-report-help-open aria-haspopup="dialog"><span class="report-help-icon" aria-hidden="true">i</span><span>使用教學</span></button>
<div class="report-help-backdrop" data-report-help-backdrop hidden>
  <section class="report-help-dialog" data-report-help-dialog role="dialog" aria-modal="true" aria-labelledby="report-help-title" tabindex="-1">
    <header class="report-help-header"><div><h2 id="report-help-title">報告播放器使用教學</h2><p>播放器、逐幀、播放速度與標註控制快速說明</p></div><button type="button" class="report-help-close" data-report-help-close aria-label="關閉使用教學" title="關閉">×</button></header>
    <div class="report-help-content">
      <h3>播放器圖解</h3>
      <figure class="report-help-figure" aria-label="播放器控制項標註示意圖">
        <div class="report-help-demo-screen" aria-hidden="true"></div>
        <div class="report-help-demo-controls" aria-hidden="true">
          <span class="report-help-demo-control">▶<span class="report-help-demo-badge">1</span></span>
          <span class="report-help-demo-control">←<span class="report-help-demo-badge">2</span></span>
          <span class="report-help-demo-control is-output">第 31 幀 / 共 120 幀<span class="report-help-demo-badge">3</span></span>
          <span class="report-help-demo-control is-range"><span class="report-help-demo-badge">4</span></span>
          <span class="report-help-demo-control">→<span class="report-help-demo-badge">5</span></span>
          <span></span>
        </div>
        <div class="report-help-demo-rate" aria-hidden="true">
          <span class="report-help-demo-control">1.00×<span class="report-help-demo-badge">6</span></span>
          <span class="report-help-demo-control is-range"><span class="report-help-demo-badge">7</span></span>
          <span class="report-help-demo-control">↻<span class="report-help-demo-badge">8</span></span>
          <span class="report-help-demo-control">☑ 循環<span class="report-help-demo-badge">9</span></span>
        </div>
        <div class="report-help-demo-annotation" aria-hidden="true">
          <span class="report-help-demo-control">← 上一標註幀<span class="report-help-demo-badge">10</span></span>
          <span class="report-help-demo-control">下一標註幀 →<span class="report-help-demo-badge">11</span></span>
          <span class="report-help-demo-control is-annotation">☑ 點　☐ 線　☑ 圖層<span class="report-help-demo-badge">12</span></span>
        </div>
        <figcaption>示意圖中的編號與下方說明相同；實際控制項會依單影片／雙影片與是否含標註略有不同。</figcaption>
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
      <div class="report-help-actions"><button type="button" class="report-help-tutorial-button" data-report-help-tutorial>在報告中顯示教學標記</button><span>會關閉本視窗，並在目前可見播放器的真實控制項旁顯示編號。再次按右下角「結束教學」即可離開。</span></div>
    </div>
  </section>
</div>
<button type="button" class="report-help-tutorial-stop" data-report-help-tutorial-stop hidden>結束教學</button>`;
}

function helpScript() {
  return `<script data-report-help-runtime>
(() => {
  const openButton = document.querySelector('[data-report-help-open]');
  const backdrop = document.querySelector('[data-report-help-backdrop]');
  const dialog = document.querySelector('[data-report-help-dialog]');
  const closeButton = document.querySelector('[data-report-help-close]');
  const tutorialButton = document.querySelector('[data-report-help-tutorial]');
  const tutorialStop = document.querySelector('[data-report-help-tutorial-stop]');
  if (!openButton || !backdrop || !dialog || !closeButton || !tutorialButton || !tutorialStop) return;

  let tutorialActive = false;
  let liveMarkers = [];
  let markedTargets = [];
  let markerRefresh = null;
  let lastFocused = null;

  const guides = [
    { number: 1, title: '播放／暫停', selector: '[data-frame-action="toggle"]' },
    { number: 2, title: '上一幀', selector: '[data-frame-action="previous"]' },
    { number: 3, title: '目前幀／總幀數', selector: '[data-frame-current], [data-frame-position]' },
    { number: 4, title: '播放進度拖桿', selector: '[data-frame-timeline]' },
    { number: 5, title: '下一幀', selector: '[data-frame-action="next"]' },
    { number: 6, title: '播放速度數值', selector: '[data-frame-rate-input]' },
    { number: 7, title: '播放速度拖桿', selector: '[data-frame-rate]' },
    { number: 8, title: '重置播放速度', selector: '[data-frame-action="reset-rate"]' },
    { number: 9, title: '循環播放', selector: '[data-frame-loop]' },
    { number: 10, title: '上一標註幀', selector: '[data-annotation-jump="previous"]' },
    { number: 11, title: '下一標註幀', selector: '[data-annotation-jump="next"]' },
    { number: 12, title: '標註顯示控制', selector: '.report-annotation-controls' },
  ];

  function openHelp(number = null) {
    stopTutorial();
    lastFocused = document.activeElement;
    backdrop.hidden = false;
    dialog.focus({ preventScroll: true });
    if (number !== null) {
      const item = dialog.querySelector('[data-report-help-item="' + number + '"]');
      item?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    } else dialog.scrollTop = 0;
  }

  function closeHelp({ restoreFocus = true } = {}) {
    if (backdrop.hidden) return;
    backdrop.hidden = true;
    if (restoreFocus) (lastFocused?.isConnected ? lastFocused : openButton).focus?.({ preventScroll: true });
  }

  function visiblePlayer() {
    const players = [...document.querySelectorAll('figure.report-video')];
    if (players.length === 0) return null;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    let best = null;
    let bestScore = -1;
    for (const player of players) {
      const rect = player.getBoundingClientRect();
      const overlap = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
      const score = overlap * Math.max(1, Math.min(rect.width, window.innerWidth || rect.width));
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

  function clearMarkers() {
    liveMarkers.forEach((marker) => marker.remove());
    markedTargets.forEach((target) => target.classList.remove('report-help-live-target'));
    liveMarkers = [];
    markedTargets = [];
  }

  function renderMarkers() {
    markerRefresh = null;
    if (!tutorialActive) return;
    clearMarkers();
    const player = visiblePlayer();
    if (!player) return;
    for (const guide of guides) {
      const target = markerTarget(player, guide);
      if (!target) continue;
      const rect = target.getBoundingClientRect();
      const marker = document.createElement('button');
      marker.type = 'button';
      marker.className = 'report-help-live-marker';
      marker.textContent = String(guide.number);
      marker.title = guide.title + '：點此查看說明';
      marker.setAttribute('aria-label', guide.title + '，點此查看說明');
      marker.style.left = (window.scrollX + rect.right) + 'px';
      marker.style.top = (window.scrollY + rect.top) + 'px';
      marker.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openHelp(guide.number);
      });
      document.body.append(marker);
      target.classList.add('report-help-live-target');
      liveMarkers.push(marker);
      markedTargets.push(target);
    }
  }

  function queueMarkerRefresh() {
    if (!tutorialActive || markerRefresh !== null) return;
    markerRefresh = requestAnimationFrame(renderMarkers);
  }

  function startTutorial() {
    closeHelp({ restoreFocus: false });
    tutorialActive = true;
    tutorialStop.hidden = false;
    renderMarkers();
  }

  function stopTutorial() {
    if (markerRefresh !== null) cancelAnimationFrame(markerRefresh);
    markerRefresh = null;
    tutorialActive = false;
    tutorialStop.hidden = true;
    clearMarkers();
  }

  openButton.addEventListener('click', () => openHelp());
  closeButton.addEventListener('click', () => closeHelp());
  tutorialButton.addEventListener('click', startTutorial);
  tutorialStop.addEventListener('click', stopTutorial);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) closeHelp();
  });
  dialog.addEventListener('click', (event) => event.stopPropagation());
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!backdrop.hidden) {
      event.preventDefault();
      closeHelp();
      return;
    }
    if (tutorialActive) {
      event.preventDefault();
      stopTutorial();
    }
  }, true);
  window.addEventListener('resize', queueMarkerRefresh);
  window.addEventListener('scroll', queueMarkerRefresh, true);
})();
</script>`;
}

function injectReportHelpHtml(html) {
  let output = String(html);
  const css = helpCss();
  output = output.includes('</head>') ? output.replace('</head>', `${css}\n</head>`) : `${css}\n${output}`;
  const markup = helpMarkup();
  const script = helpScript();
  const addition = `${markup}\n${script}`;
  output = output.includes('</body>') ? output.replace('</body>', `${addition}\n</body>`) : `${output}\n${addition}`;
  return output;
}

module.exports = {
  helpCss,
  helpMarkup,
  helpScript,
  injectReportHelpHtml,
};
