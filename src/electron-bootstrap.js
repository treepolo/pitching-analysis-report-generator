'use strict';

const { app, BrowserWindow } = require('electron');

const isSmokeMode = process.env.PITCHING_SMOKE === '1' || process.argv.includes('--smoke');

if (isSmokeMode) {
  require('./main');
} else {
  const hasPrimaryInstanceLock = app.requestSingleInstanceLock();

  if (!hasPrimaryInstanceLock) {
    app.quit();
  } else {
    app.on('second-instance', () => {
      const [window] = BrowserWindow.getAllWindows();
      if (!window || window.isDestroyed()) return;
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    });

    require('./main');
  }
}
