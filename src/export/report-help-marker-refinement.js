'use strict';

function helpMarkerRefinementScript() {
  return `<script data-report-help-marker-refinement>
(() => {
  const speedSliderSelector = '[data-frame-rate]';

  function sliderPoint(slider) {
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

  function visiblePlayer() {
    const players = [...document.querySelectorAll('figure.report-video')];
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

  function findNumberedMarker(selector, number) {
    return [...document.querySelectorAll(selector)].find((marker) => marker.textContent.trim() === String(number)) || null;
  }

  function placePreviewMarker() {
    const host = document.querySelector('[data-report-help-preview]');
    if (!host) return;
    const marker = [...host.querySelectorAll('.report-help-preview-marker')]
      .find((candidate) => candidate.textContent.trim() === '7');
    const slider = host.querySelector(speedSliderSelector);
    if (!marker || !slider) return;
    const point = sliderPoint(slider);
    if (!point) return;
    const hostRect = host.getBoundingClientRect();
    marker.style.left = (point.x - hostRect.left) + 'px';
    marker.style.top = (point.y - hostRect.top) + 'px';
  }

  function placeLiveMarker() {
    const marker = findNumberedMarker('.report-help-live-marker', 7);
    const player = visiblePlayer();
    const slider = player?.querySelector(speedSliderSelector) || null;
    if (!marker || !slider) return;
    const point = sliderPoint(slider);
    if (!point) return;
    marker.style.left = (window.scrollX + point.x) + 'px';
    marker.style.top = (window.scrollY + point.y) + 'px';
  }

  let refreshFrame = null;
  function refresh() {
    if (refreshFrame !== null) cancelAnimationFrame(refreshFrame);
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = null;
      placePreviewMarker();
      placeLiveMarker();
    });
  }

  const observer = new MutationObserver(refresh);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('input', (event) => {
    if (event.target?.matches?.(speedSliderSelector)) refresh();
  }, true);
  document.addEventListener('change', (event) => {
    if (event.target?.matches?.(speedSliderSelector)) refresh();
  }, true);
  document.addEventListener('click', () => setTimeout(refresh, 0), true);
  window.addEventListener('resize', refresh);
  window.addEventListener('scroll', refresh, true);
  refresh();
})();
</script>`;
}

function injectReportHelpMarkerRefinement(html) {
  const source = String(html);
  if (source.includes('data-report-help-marker-refinement')) return source;
  const script = helpMarkerRefinementScript();
  return source.includes('</body>')
    ? source.replace('</body>', `${script}\n</body>`)
    : `${source}\n${script}`;
}

module.exports = {
  helpMarkerRefinementScript,
  injectReportHelpMarkerRefinement,
};
