'use strict';

(() => {
  const STORAGE_KEY = 'pitching-analysis-report-generator.last-export-directory.v1';
  const MAX_PATH_LENGTH = 4096;
  const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;

  function normalizeDirectory(value) {
    if (typeof value !== 'string') return '';
    const directory = value.trim();
    if (!directory || directory.length > MAX_PATH_LENGTH || CONTROL_CHARACTER_PATTERN.test(directory)) return '';
    return directory;
  }

  function readRememberedDirectory() {
    try {
      return normalizeDirectory(window.localStorage?.getItem(STORAGE_KEY));
    } catch {
      return '';
    }
  }

  function rememberDirectory(value) {
    const directory = normalizeDirectory(value);
    if (!directory) return false;
    try {
      window.localStorage?.setItem(STORAGE_KEY, directory);
      return true;
    } catch {
      return false;
    }
  }

  function restoreRememberedDirectory() {
    const directory = readRememberedDirectory();
    if (!directory || !state?.export) return false;
    state.export.outputDirectory = directory;
    state.export.directoryNotice = '';
    return true;
  }

  if (typeof resetExportSelection === 'function') {
    const baseResetExportSelection = resetExportSelection;
    resetExportSelection = function resetExportSelectionWithMemory() {
      baseResetExportSelection();
      restoreRememberedDirectory();
    };
  }

  if (typeof chooseExportDirectory === 'function') {
    const baseChooseExportDirectory = chooseExportDirectory;
    chooseExportDirectory = async function chooseExportDirectoryWithMemory() {
      const result = await baseChooseExportDirectory();
      rememberDirectory(state?.export?.outputDirectory);
      return result;
    };
  }

  if (restoreRememberedDirectory() && typeof renderExportControls === 'function') {
    renderExportControls();
  }
})();
