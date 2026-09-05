'use strict';

const base = require('./report-renderer-base');
const { injectAnnotationReportHtml } = require('./annotation-report-runtime');
const { injectAnnotationNavigationHtml } = require('./annotation-navigation-runtime');
const { injectReportHelpHtml } = require('./report-help-runtime');
const { injectReportLayoutRefinement } = require('./report-layout-refinement');
const { injectReportMobileShellRefinement } = require('./report-mobile-shell-refinement');
const { injectReportTitleAlignmentRefinement } = require('./report-title-alignment-refinement');
const { injectReportEntrySpotlight } = require('./report-entry-spotlight');
const { injectReportFixedHeaderRuntime } = require('./report-fixed-header-runtime');

function renderReportHtml(reportDocument, options = {}) {
  const portable = base.toPortableReportDocument(reportDocument);
  let html = base.renderReportHtml(portable, options);
  html = injectAnnotationReportHtml(html, portable);
  html = injectAnnotationNavigationHtml(html, portable);
  html = injectReportHelpHtml(html);
  html = injectReportLayoutRefinement(html);
  html = injectReportMobileShellRefinement(html);
  html = injectReportTitleAlignmentRefinement(html);
  html = injectReportEntrySpotlight(html);
  html = injectReportFixedHeaderRuntime(html);
  return html;
}

module.exports = {
  ...base,
  renderReportHtml,
};
