'use strict';

const base = require('./report-renderer-base');
const { injectAnnotationReportHtml } = require('./annotation-report-runtime');
const { injectAnnotationNavigationHtml } = require('./annotation-navigation-runtime');
const { patchNativeFramePlayerHtml } = require('./native-frame-player-fixes');
const { injectXp7RangeTheme } = require('./xp7-range-theme');
const { injectReportHelpHtml } = require('./report-help-runtime');
const { injectReportLayoutRefinement } = require('./report-layout-refinement');
const { injectReportFloatingUiRefinement } = require('./report-floating-ui-refinement');
const { injectReportMobileShellRefinement } = require('./report-mobile-shell-refinement');
const { injectReportTitleAlignmentRefinement } = require('./report-title-alignment-refinement');
const { injectReportPlayerSelectionRefinement } = require('./report-player-selection-refinement');
const { injectReportEntrySpotlight } = require('./report-entry-spotlight');
const { injectReportFixedHeaderRuntime } = require('./report-fixed-header-runtime');
const { injectReportVisibleTitleRuntime } = require('./report-visible-title-runtime');
const { injectMediumReaderDetailRefinement } = require('./medium-reader-detail-refinement');
const { injectReportHelpMarkerRefinement } = require('./report-help-marker-refinement');

function renderReportHtml(reportDocument, options = {}) {
  const portable = base.toPortableReportDocument(reportDocument);
  let html = base.renderReportHtml(portable, options);
  html = patchNativeFramePlayerHtml(html);
  html = injectAnnotationReportHtml(html, portable);
  html = injectAnnotationNavigationHtml(html, portable);
  html = injectXp7RangeTheme(html);
  html = injectReportHelpHtml(html);
  html = injectReportLayoutRefinement(html);
  html = injectReportFloatingUiRefinement(html);
  html = injectReportMobileShellRefinement(html);
  html = injectReportTitleAlignmentRefinement(html);
  html = injectReportPlayerSelectionRefinement(html);
  html = injectReportEntrySpotlight(html);
  html = injectReportFixedHeaderRuntime(html);
  html = injectReportVisibleTitleRuntime(html);
  html = injectMediumReaderDetailRefinement(html);
  html = injectReportHelpMarkerRefinement(html);
  return html;
}

module.exports = {
  ...base,
  renderReportHtml,
};
