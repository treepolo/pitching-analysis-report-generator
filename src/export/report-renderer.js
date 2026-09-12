'use strict';

const base = require('./report-renderer-base');
const { injectAnnotationReportHtml } = require('./annotation-report-runtime');
const { injectAnnotationNavigationHtml } = require('./annotation-navigation-runtime');
const { injectReportHelpHtml } = require('./report-help-runtime');
const { injectReportLayoutRefinement } = require('./report-layout-refinement');
const { injectReportMobileShellRefinement } = require('./report-mobile-shell-refinement');
const { injectReportTitleAlignmentRefinement } = require('./report-title-alignment-refinement');
const { injectReportFixedHeaderRuntime } = require('./report-fixed-header-runtime');
const { injectReportPlayerDiagnostics } = require('./report-player-diagnostics');
const { injectReportEntryIntro } = require('./report-entry-intro');

function renderReportHtml(reportDocument, options = {}) {
  const portable = base.toPortableReportDocument(reportDocument);
  let html = base.renderReportHtml(portable, options);
  html = injectAnnotationReportHtml(html, portable);
  html = injectAnnotationNavigationHtml(html, portable);
  html = injectReportHelpHtml(html);
  html = injectReportLayoutRefinement(html);
  html = injectReportMobileShellRefinement(html);
  html = injectReportTitleAlignmentRefinement(html);
  html = injectReportFixedHeaderRuntime(html);
  // Temporary observer must execute before the intro runtime so it can see
  // whether the first interaction is consumed by the entry click-through guard.
  html = injectReportPlayerDiagnostics(html);
  html = injectReportEntryIntro(html);
  return html;
}

module.exports = {
  ...base,
  renderReportHtml,
};