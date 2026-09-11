'use strict';

(() => {
  const EXPORT_KIND_STORAGE_KEY = 'pitching-analysis-report-generator.last-export-kind.v1';
  const exportKind = document.querySelector('#export-kind');
  if (!exportKind) return;

  const normalizeExportKind = (value) => {
    if (typeof value !== 'string') return '';
    const normalized = value.trim();
    return [...exportKind.options].some((option) => option.value === normalized)
      ? normalized
      : '';
  };

  const readRememberedExportKind = () => {
    try {
      return normalizeExportKind(window.localStorage?.getItem(EXPORT_KIND_STORAGE_KEY));
    } catch {
      return '';
    }
  };

  const rememberExportKind = (value) => {
    const normalized = normalizeExportKind(value);
    if (!normalized) return false;
    try {
      window.localStorage?.setItem(EXPORT_KIND_STORAGE_KEY, normalized);
      return true;
    } catch {
      return false;
    }
  };

  const remembered = readRememberedExportKind();
  if (remembered) exportKind.value = remembered;

  exportKind.addEventListener('change', () => {
    rememberExportKind(exportKind.value);
  });
})();
