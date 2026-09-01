'use strict';

const base = require('./report-renderer-base');
const { injectAnnotationReportHtml } = require('./annotation-report-runtime');
const { injectAnnotationNavigationHtml } = require('./annotation-navigation-runtime');
const { patchNativeFramePlayerHtml } = require('./native-frame-player-fixes');
const { injectXp7RangeTheme } = require('./xp7-range-theme');
const { injectReportHelpHtml } = require('./report-help-runtime');
const { injectReportLayoutRefinement } = require('./report-layout-refinement');

function renderReportHtml(reportDocument, options = {}) {
  const portable = base.toPortableReportDocument(reportDocument);
  let html = base.renderReportHtml(portable, options);
  html = patchNativeFramePlayerHtml(html);
  html = injectAnnotationReportHtml(html, portable);
  html = injectAnnotationNavigationHtml(html, portable);
  html = injectXp7RangeTheme(html);
  html = injectReportHelpHtml(html);
  html = injectReportLayoutRefinement(html);
  return html;
}

module.exports = {
  ...base,
  renderReportHtml,
};
