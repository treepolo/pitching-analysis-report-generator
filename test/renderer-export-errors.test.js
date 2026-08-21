'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer.js'), 'utf8');

function functionSlice(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing source anchor: ${start}`);
  assert.notEqual(endIndex, -1, `missing source anchor: ${end}`);
  return source.slice(startIndex, endIndex);
}

test('export and picker codes map to safe Traditional Chinese reasons', () => {
  assert.match(renderer, /const DISPLAY_ERROR_CODE_MAP = Object\.freeze\(/u);
  assert.match(renderer, /EXPORT_VALIDATION_FAILED:[\s\S]*匯出資料驗證失敗/u);
  assert.match(renderer, /EXPORT_OUTPUT_NOT_WRITABLE:[\s\S]*匯出資料夾目前無法寫入/u);
  assert.match(renderer, /EXPORT_PICKER_FAILED:[\s\S]*資料夾選擇橋接失敗/u);
  assert.match(renderer, /EXPORT_PHASE_REASON_MAP = Object\.freeze\(/u);
  assert.match(renderer, /系統：\$\{error\.systemCode\}/u);
  assert.match(renderer, /error\?\.reasonCode[\s\S]*error\?\.code/u);
  assert.match(renderer, /錯誤碼：\$\{descriptor\.code\}/u);
  assert.match(renderer, /發生未分類錯誤，請重試。/u);
  assert.doesNotMatch(renderer, /操作失敗，請稍後再試。/u);
});

test('picker and export start catches preserve diagnostic fallback codes', () => {
  const picker = functionSlice(renderer, 'async function chooseExportDirectory()', 'function exportResultLabel');
  assert.match(picker, /displayErrorMessage\(\{ code: 'EXPORT_PICKER_UNAVAILABLE' \}\)/u);
  assert.match(picker, /displayErrorMessage\(\{ code: 'EXPORT_PICKER_INVALID_RESULT' \}\)/u);
  assert.match(picker, /displayErrorMessage\(error, 'EXPORT_PICKER_FAILED'\)/u);

  const exportControls = functionSlice(renderer, 'function renderExportControls()', 'function setExportSnapshot');
  assert.match(exportControls, /displayErrorMessage\(snapshot\?\.error, 'EXPORT_FAILED'\)/u);
  assert.doesNotMatch(exportControls, /snapshot\?\.error\?\.message/u);

  const exportStart = functionSlice(renderer, 'async function startReportExport()', 'async function cancelReportExport');
  assert.match(exportStart, /serializeRendererError\(error, 'EXPORT_START_FAILED'\)/u);
});
