'use strict';

// main.js imports ExportJobController from app-bridge and constructs it with no
// arguments. Replace only that exported controller with a subclass whose
// default exporter is the Tree Polo wrapper. The underlying exporter module is
// left untouched, so the branded wrapper can safely call the original exporter
// without recursive self-invocation.
const appBridge = require('./export/app-bridge');
const { exportReport: brandedExportReport } = require('./export/tree-polo-branded-exporter');

const BaseExportJobController = appBridge.ExportJobController;
class TreePoloExportJobController extends BaseExportJobController {
  constructor(options = {}) {
    super({ exporter: brandedExportReport, ...options });
  }
}

appBridge.ExportJobController = TreePoloExportJobController;

require('./main');
