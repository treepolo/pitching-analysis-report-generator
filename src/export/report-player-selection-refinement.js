'use strict';

function playerSelectionCss() {
  return `<style data-report-player-selection-refinement>
/* Make the keyboard-target player easier to identify without changing the
   selection state machine. Keep the existing border thickness and add only a
   restrained Tree Polo green halo around the selected player block. */
body>main .portable-player[data-frame-selected="true"],
.report-help-live-preview .portable-player[data-frame-selected="true"] {
  border-color: #24a96c !important;
  box-shadow:
    0 0 0 1px rgba(185,255,104,.42),
    0 0 9px 2px rgba(66,211,146,.40) !important;
}
</style>`;
}

function playerPlaybackOwnershipScript() {
  return `<script data-report-player-playback-ownership>
(() => {
  const blockFor = (item) => item?.matches?.('[data-native-frame-player-block]')
    ? item
    : item?.closest?.('[data-native-frame-player-block]');
  const primaryToggleFor = (block) => block?.querySelector?.('[data-frame-shared-controls] [data-frame-action="toggle"]')
    || block?.querySelector?.('[data-frame-controls] [data-frame-action="toggle"]');
  const blockIsPlaying = (block) => {
    const toggle = primaryToggleFor(block);
    if (toggle?.getAttribute('aria-pressed') === 'true') return true;
    return [...(block?.querySelectorAll?.('[data-player-video]') || [])].some((video) => !video.paused);
  };
  const stopBlock = (block) => {
    const actions = block?.__nativeFramePlayerActions;
    if (typeof actions?.stop === 'function') {
      actions.stop();
      return;
    }
    const toggle = primaryToggleFor(block);
    if (toggle?.getAttribute('aria-pressed') === 'true' && !toggle.disabled) toggle.click();
    (block?.querySelectorAll?.('[data-player-video]') || []).forEach((video) => {
      if (!video.paused) video.pause();
    });
  };
  const claimPlayback = (activeBlock) => {
    if (!activeBlock) return;
    document.querySelectorAll('[data-native-frame-player-block]').forEach((block) => {
      if (block !== activeBlock && blockIsPlaying(block)) stopBlock(block);
    });
  };
  const targetIsEditable = (target) => Boolean(
    target?.matches?.('input:not([type="range"]), textarea, select, [contenteditable="true"]')
    || target?.isContentEditable
  );

  document.addEventListener('click', (event) => {
    const toggle = event.target?.closest?.('[data-frame-action="toggle"]');
    const block = blockFor(toggle);
    if (!block || toggle !== primaryToggleFor(block)) return;
    if (toggle.getAttribute('aria-pressed') !== 'true') claimPlayback(block);
  }, true);

  document.addEventListener('keydown', (event) => {
    const isSpace = event.key === ' ' || event.key === 'Spacebar';
    if (!isSpace || event.repeat || targetIsEditable(event.target)) return;
    const block = document.querySelector('[data-native-frame-player-block][data-frame-selected="true"]');
    const toggle = primaryToggleFor(block);
    if (toggle && toggle.getAttribute('aria-pressed') !== 'true') claimPlayback(block);
  }, true);

  document.addEventListener('play', (event) => {
    const video = event.target;
    if (!video?.matches?.('[data-player-video]')) return;
    claimPlayback(blockFor(video));
  }, true);
})();
</script>`;
}

function injectReportPlayerSelectionRefinement(html) {
  let output = String(html);
  if (!output.includes('data-report-player-selection-refinement')) {
    const css = playerSelectionCss();
    output = output.includes('</head>')
      ? output.replace('</head>', `${css}\n</head>`)
      : `${css}\n${output}`;
  }
  if (!output.includes('data-report-player-playback-ownership')) {
    const script = playerPlaybackOwnershipScript();
    output = output.includes('</body>')
      ? output.replace('</body>', `${script}\n</body>`)
      : `${output}\n${script}`;
  }
  return output;
}

module.exports = {
  injectReportPlayerSelectionRefinement,
  playerPlaybackOwnershipScript,
  playerSelectionCss,
};
