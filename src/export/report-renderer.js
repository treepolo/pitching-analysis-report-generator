'use strict';

const base = require('./report-renderer-base');
const { injectAnnotationReportHtml } = require('./annotation-report-runtime');

function renderReportHtml(reportDocument, options = {}) {
  const portable = base.toPortableReportDocument(reportDocument);
  const html = base.renderReportHtml(portable, options);
  return injectAnnotationReportHtml(html, portable);
}

module.exports = {
  ...base,
  renderReportHtml,
};
