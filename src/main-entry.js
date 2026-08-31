'use strict';

// Install the branded export wrapper before main.js loads app-bridge.
// app-bridge destructures exportReport at module load, so this ordering keeps
// the rest of the Electron main process unchanged while making every desktop
// export use the Tree Polo naming, branding, manifest and ZIP post-processing.
const exporterModule = require('./export/exporter');
const { exportReport } = require('./export/tree-polo-branded-exporter');

exporterModule.exportReport = exportReport;

require('./main');
