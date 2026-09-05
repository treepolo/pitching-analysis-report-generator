'use strict';

const STYLE_TAG_PATTERN = /<style\b([^>]*)>([\s\S]*?)<\/style>/giu;
const STYLESHEET_LINK_PATTERN = /<link\b(?=[^>]*\brel\s*=\s*(?:["']stylesheet["']|stylesheet\b))[^>]*>/iu;
const DATA_ATTRIBUTE_PATTERN = /\b(data-[a-z0-9:_-]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/giu;

const STYLE_SOURCE_ROLES = Object.freeze({
  'data-report-canonical-theme': 'canonical-visual',
  'data-annotation-reader-style': 'component-style',
  'data-annotation-navigation-style': 'functional-layout',
  'data-report-help-style': 'functional-layout',
  'data-report-layout-refinement': 'functional-layout',
  'data-report-mobile-shell-refinement': 'functional-layout',
  'data-report-title-alignment-refinement': 'functional-layout',
  'data-report-entry-spotlight-style': 'component-style',
  'data-report-fixed-header-style': 'functional-layout',
});

function styleDataMarkers(attributes) {
  return [...String(attributes).matchAll(DATA_ATTRIBUTE_PATTERN)].map((match) => match[1]);
}

function hasOnlyDataAttributes(attributes) {
  return String(attributes).replace(DATA_ATTRIBUTE_PATTERN, '').trim() === '';
}

function styleSourceLabel(attributes, index) {
  const markers = styleDataMarkers(attributes);
  return markers[0] || `inline-style-${index + 1}`;
}

function styleSourceRole(label) {
  return STYLE_SOURCE_ROLES[label] || 'unclassified';
}

function bundledStyleBlock(styles) {
  const css = styles.map((style, index) => {
    const label = styleSourceLabel(style.attributes, index);
    const role = styleSourceRole(label);
    return `/* report-style-source:${label}; role:${role} */${style.css}`;
  }).join('\n');
  return `<style data-report-style-bundle data-report-style-source-count="${styles.length}">${css}\n</style>`;
}

function bundleReportStyles(html) {
  const source = String(html);
  if (source.includes('data-report-style-bundle')) return source;

  const headMatch = source.match(/<head\b[^>]*>[\s\S]*?<\/head>/iu);
  if (!headMatch) return source;
  const head = headMatch[0];

  // Keep cascade semantics conservative. A linked stylesheet can sit between
  // inline style tags, so moving those tags together could change precedence.
  if (STYLESHEET_LINK_PATTERN.test(head)) return source;

  const styles = [...head.matchAll(STYLE_TAG_PATTERN)].map((match) => ({
    full: match[0],
    attributes: match[1] || '',
    css: match[2] || '',
  }));
  if (styles.length <= 1) return source;
  if (styles.some((style) => !hasOnlyDataAttributes(style.attributes))) return source;

  const bundle = bundledStyleBlock(styles);
  let inserted = false;
  const bundledHead = head.replace(STYLE_TAG_PATTERN, () => {
    if (inserted) return '';
    inserted = true;
    return bundle;
  });
  return source.replace(head, bundledHead);
}

module.exports = {
  STYLE_SOURCE_ROLES,
  bundleReportStyles,
  hasOnlyDataAttributes,
  styleDataMarkers,
  styleSourceLabel,
  styleSourceRole,
};
