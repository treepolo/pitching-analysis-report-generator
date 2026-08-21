'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(repositoryRoot, 'src', 'index.html'), 'utf8');
const renderer = fs.readFileSync(path.join(repositoryRoot, 'src', 'renderer.js'), 'utf8');
const styles = fs.readFileSync(path.join(repositoryRoot, 'src', 'styles.css'), 'utf8');

test('document shell exposes the frozen block-editor DOM contract', () => {
  for (const id of [
    'document-command-bar',
    'project-list',
    'project-empty',
    'editor-empty',
    'editor',
    'project-title',
    'project-meta',
    'block-canvas',
    'block-section-target',
    'add-text-block',
    'add-editor-single-video',
    'add-editor-comparison-video',
    'import-text',
    'import-media',
    'save-project',
    'save-state',
    'root-path',
    'app-error',
    'choose-export-directory',
    'export-directory-status',
    'export-kind',
    'export-report',
    'export-cancel',
    'export-retry',
    'export-status',
    'new-project',
    'empty-new-project',
    'new-project-dialog',
    'new-project-form',
    'new-project-name',
    'import-text-dialog',
    'import-text-name',
    'import-text-preview',
    'import-text-error',
    'cancel-import-text',
    'confirm-import-text',
  ]) {
    assert.match(indexHtml, new RegExp(`id="${id}"`, 'u'));
  }

  for (const legacyId of ['media-library', 'player-panel', 'preview', 'section-list', 'project-picker']) {
    assert.doesNotMatch(indexHtml, new RegExp(`id="${legacyId}"`, 'u'));
  }
  for (const legacyClass of [
    'editor-grid',
    'sidebar',
    'topbar',
    'media-panel',
    'player-panel',
    'preview-panel',
  ]) {
    assert.doesNotMatch(indexHtml, new RegExp(`class="(?:[^"]*\\s)?${legacyClass}(?:\\s|")`, 'u'));
  }

  assert.match(indexHtml, /id="document-command-bar"[\s\S]*id="project-list"[\s\S]*id="save-project"[\s\S]*id="export-report"/u);
  assert.match(indexHtml, /<div id="block-canvas"[^>]*aria-label="長篇文件區塊"/u);
  assert.doesNotMatch(indexHtml, /<video\b/u);
  assert.match(renderer, /resolveMediaSource\(state\.activeProject\.id, assetId\)/u);
  assert.doesNotMatch(renderer, /data-block-path="(?:sync|binding)\./u);
  assert.doesNotMatch(renderer, /明確影格模式|持續綁定|控制側|同步錨點|同步播放/u);
  assert.match(renderer, /projectEmpty\.hidden = state\.projects\.length > 0/u);
  assert.match(renderer, /function mostRecentlyOpenedProject\(\)/u);
  assert.match(renderer, /const recentProject = mostRecentlyOpenedProject\(\)/u);
  assert.match(renderer, /await openProject\(recentProject\.id\)/u);
  assert.match(renderer, /startExport\(request\)/u);
  assert.match(renderer, /pickExportDirectory/u);
  assert.match(renderer, /normalizeExportDirectoryPick/u);
  assert.match(renderer, /已取消資料夾選擇；尚未開始匯出/u);
  assert.match(renderer, /getExportStatus\(jobId\)/u);
  assert.match(renderer, /cancelExport\(jobId\)/u);
  assert.match(renderer, /retryExport\(jobId\)/u);
  assert.match(renderer, /await flushPendingChanges\(\)/u);
  assert.match(renderer, /outputKind: elements\.exportKind\?\.value \|\| 'folder'/u);
  assert.match(renderer, /state\.export\.outputDirectory \|\| defaultExportDirectory\(\)/u);
  assert.match(renderer, /data-inline-video-block/u);
  assert.match(renderer, /function playerSideTitle\(block, side\)/u);
  assert.match(renderer, /side === 'single' \? config\.sourceLabel : config\.label/u);
  assert.match(renderer, /const sourceLabelPath = comparison \? `\$\{prefix\}label` : 'sourceLabel'/u);
  assert.match(renderer, /sourceLabel: asset\?\.displayName/u);
  assert.match(renderer, /block\.sourceLabel = typeof block\.left\?\.label/u);
  assert.match(renderer, /data-inline-side-title/u);
  assert.match(renderer, /elements\.blockCanvas\?\.addEventListener\('click'/u);
  assert.match(renderer, /function safeInlineMediaSourceUrl\(source\)/u);
  assert.match(renderer, /parsed\.protocol !== 'file:'/u);
  assert.match(renderer, /video\.dataset\.mediaAssetId = assetId/u);
  assert.match(renderer, /video\.removeAttribute\('src'\)/u);
  assert.doesNotMatch(renderer, /sync\.binding|block\.binding =/u);
  assert.doesNotMatch(renderer, /stored\.offsets\?\.\[side\]/u);
  assert.doesNotMatch(renderer, /data-block-path="[^"]*offsetSeconds/u);
  assert.doesNotMatch(renderer, /循環起點|循環終點/u);
  assert.doesNotMatch(renderer, /inlineBindingAnchor|data-inline-action="capture-anchor"/u);
  assert.match(renderer, /影片區塊標題/u);
  assert.match(renderer, /影片區塊左上角標題/u);
  assert.match(renderer, /const fileName = asset\.metadata\?\.fileName \|\| asset\.displayName/u);
  assert.match(renderer, /來源標題/u);
  assert.match(renderer, /comparison \? `<label>版面/u);
  assert.doesNotMatch(renderer, /singleVideo[\s\S]{0,200}data-block-path="layout"/u);
  assert.match(renderer, /comparison && block\.layout === 'stacked'/u);
  assert.match(renderer, /: 'stacked';/u);
  assert.match(styles, /\.inline-frame-controls \{[^}]*display: grid;/u);
  assert.match(styles, /\.inline-frame-rate-row \{[^}]*grid-column: 1 \/ -1;[^}]*width: 100%/u);
  assert.match(renderer, /data-frame-player/u);
  assert.match(renderer, /data-frame-timeline/u);
  assert.match(renderer, /data-frame-action="toggle"/u);
  assert.match(renderer, /data-frame-action="previous"/u);
  assert.match(renderer, /data-frame-action="next"/u);
  assert.match(renderer, /video\.preload = 'auto'/u);
  assert.match(renderer, /requestAnimationFrame/u);
  assert.match(renderer, /video\.fastSeek/u);
  assert.match(renderer, /requestVideoFrameCallback/u);
  assert.match(renderer, /data-frame-rate/u);
  assert.match(renderer, /data-frame-rate-input/u);
  assert.match(renderer, /PLAYBACK_RATE_MIN = 1 \/ 64/u);
  assert.match(renderer, /PLAYBACK_RATE_MAX = 64/u);
  assert.match(renderer, /handleFramePlayerKeydown/u);
  assert.match(renderer, /\['ArrowLeft', 'ArrowRight'\]\.includes\(event\.key\)/u);
  assert.match(renderer, /event\.key === 'ArrowRight'/u);
  assert.match(renderer, /framePlayerByCard: new WeakMap\(\)/u);
  assert.match(renderer, /sideTitleElement\.textContent = sideTitle/u);
  assert.match(renderer, /surface\.setAttribute\('aria-label', `\$\{sideTitle\}影格畫面`\)/u);
  assert.match(renderer, /影片尚未全部準備完成/u);
  assert.match(renderer, /無法使用畫面層橋接/u);
  assert.match(renderer, /elements\.appError\) return/u);
  assert.doesNotMatch(renderer, /elements\.(mediaLibrary|playerPanel|preview|sectionList)\s*=|document\.querySelector\('#(?:media-library|player-panel|preview|section-list)'\)/u);
  assert.match(styles, /\.export-directory-status/u);
  assert.match(styles, /\.inline-frame-controls/u);
  assert.match(styles, /\.inline-frame-rate-reset\s*\{[^}]*width: 28px[^}]*min-width: 28px[^}]*height: 28px[^}]*border-radius: 50%/u);
  assert.match(indexHtml, /img-src 'self' data: blob: file:/u);
});

test('renderer source never constructs a media URL from a filesystem path', () => {
  assert.doesNotMatch(renderer, /path\.(join|resolve|normalize)\(/u);
  assert.doesNotMatch(renderer, /file:\/\//u);
  assert.match(renderer, /video\.src = safeInlineMediaSourceUrl\(source\)/u);
  assert.doesNotMatch(renderer, /video\.src = source\.sourceUrl/u);
});
