'use strict';

// main.js imports ExportJobController from app-bridge and constructs it with no
// arguments. Replace only that exported controller with a subclass whose
// default exporter is the refined Tree Polo wrapper. The underlying exporter
// modules are left untouched, so wrapper layers can safely call one another
// without recursive self-invocation.
const appBridge = require('./export/app-bridge');
const { exportReport: refinedTreePoloExportReport } = require('./export/tree-polo-refined-exporter');

const BaseExportJobController = appBridge.ExportJobController;
class TreePoloExportJobController extends BaseExportJobController {
  constructor(options = {}) {
    super({ exporter: refinedTreePoloExportReport, ...options });
  }
}

appBridge.ExportJobController = TreePoloExportJobController;

require('./main');
