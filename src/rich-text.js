'use strict';

(function exposeRichText(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.pitchingRichText = api;
  }
}(typeof globalThis === 'undefined' ? this : globalThis, () => {
  const ALLOWED_TAGS = new Set(['A', 'B', 'BR', 'DIV', 'EM', 'I', 'LI', 'OL', 'P', 'SPAN', 'STRONG', 'UL']);
  const BLOCK_TAGS = new Set(['DIV', 'LI', 'OL', 'P', 'UL']);
  const DROP_CONTENT_TAGS = new Set(['IFRAME', 'MATH', 'OBJECT', 'SCRIPT', 'STYLE', 'SVG', 'TEMPLATE']);
  const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:']);
  const ENTITY_PATTERN = /&(?:(?:#\d+)|(?:#x[\da-f]+)|(?:[a-z][\da-z]+));/iu;
  const TAG_PATTERN = /<!--[\s\S]*?-->|<\/?[a-z][^>]*>/giu;
  const ATTRIBUTE_PATTERN = /([a-z][\w:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/giu;

  function escapeText(value) {
    return String(value ?? '')
      .replace(/&(?!#\d+;|#x[\da-f]+;|[a-z][\da-z]+;)/giu, '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  function escapeAttribute(value) {
    return escapeText(value)
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function decodeKnownEntities(value) {
    return String(value ?? '')
      .replace(/&quot;/giu, '"')
      .replace(/&#39;|&apos;/giu, "'")
      .replace(/&lt;/giu, '<')
      .replace(/&gt;/giu, '>')
      .replace(/&amp;/giu, '&')
      .replace(/&#(\d+);/gu, (match, code) => {
        const number = Number(code);
        return Number.isInteger(number) && number >= 0 && number <= 0x10ffff
          ? String.fromCodePoint(number)
          : match;
      })
      .replace(/&#x([\da-f]+);/giu, (match, code) => {
        const number = Number.parseInt(code, 16);
        return Number.isInteger(number) && number >= 0 && number <= 0x10ffff
          ? String.fromCodePoint(number)
          : match;
      });
  }

  function sanitizeHref(value) {
    if (value === null || value === undefined) return null;
    const href = decodeKnownEntities(value)
      .replace(/[\u0000-\u0020\u007f]/gu, ' ')
      .trim();
    if (!href || href.startsWith('//')) return null;
    if (href.startsWith('#') || href.startsWith('/') || href.startsWith('./') || href.startsWith('../') || href.startsWith('?')) {
      return href;
    }
    try {
      const parsed = new URL(href, 'https://pitching-report.invalid/');
      return SAFE_SCHEMES.has(parsed.protocol) ? href : null;
    } catch {
      return null;
    }
  }

  function attributeValue(source, name) {
    ATTRIBUTE_PATTERN.lastIndex = 0;
    for (const match of source.matchAll(ATTRIBUTE_PATTERN)) {
      if (match[1].toLowerCase() === name) return match[2] ?? match[3] ?? match[4] ?? '';
    }
    return null;
  }

  function normalizeTag(tagName) {
    const upper = String(tagName).toUpperCase();
    if (upper === 'B') return 'STRONG';
    if (upper === 'I') return 'EM';
    return upper;
  }

  function sanitizeRichTextHtml(value) {
    const source = String(value ?? '');
    let output = '';
    let cursor = 0;
    let dropDepth = 0;
    const openTags = [];
    for (const match of source.matchAll(TAG_PATTERN)) {
      if (dropDepth === 0) output += escapeText(source.slice(cursor, match.index));
      cursor = match.index + match[0].length;
      if (match[0].startsWith('<!--')) continue;
      const closing = /^<\//u.test(match[0]);
      const parsed = /^<\/?([a-z][\w:-]*)/iu.exec(match[0]);
      if (!parsed) continue;
      const upper = parsed[1].toUpperCase();
      if (dropDepth > 0) {
        if (!closing && DROP_CONTENT_TAGS.has(upper) && !/\/\s*>$/u.test(match[0])) dropDepth += 1;
        if (closing && DROP_CONTENT_TAGS.has(upper)) dropDepth = Math.max(0, dropDepth - 1);
        continue;
      }
      if (DROP_CONTENT_TAGS.has(upper)) {
        if (!closing && !/\/\s*>$/u.test(match[0])) dropDepth = 1;
        continue;
      }
      const normalized = normalizeTag(upper);
      if (!ALLOWED_TAGS.has(upper) && !ALLOWED_TAGS.has(normalized)) continue;
      if (closing) {
        if (normalized === 'BR') continue;
        if (openTags.at(-1) !== normalized) continue;
        openTags.pop();
        output += `</${normalized.toLowerCase()}>`;
        continue;
      }
      if (normalized === 'BR') {
        output += '<br>';
        continue;
      }
      if (normalized === 'A') {
        const href = sanitizeHref(attributeValue(match[0], 'href'));
        if (href) {
          output += `<a href="${escapeAttribute(href)}">`;
          openTags.push('A');
        }
        continue;
      }
      output += `<${normalized.toLowerCase()}>`;
      openTags.push(normalized);
    }
    if (dropDepth === 0) output += escapeText(source.slice(cursor));
    while (openTags.length > 0) output += `</${openTags.pop().toLowerCase()}>`;
    return output;
  }

  function escapeRichTextPlain(value) {
    return escapeText(value).replace(/\r\n?/gu, '\n').replaceAll('\n', '<br>');
  }

  function sanitizeRichTextEditorHtml(value) {
    return sanitizeRichTextHtml(value).replace(/^(?:<div><br><\/div>|<p><br><\/p>)$/iu, '');
  }

  function appendPlainText(existingHtml, plainText) {
    const existing = sanitizeRichTextEditorHtml(existingHtml);
    const appended = escapeRichTextPlain(plainText);
    if (!existing) return appended;
    if (!appended) return existing;
    return `${existing}<br><br>${appended}`;
  }

  return Object.freeze({
    appendPlainText,
    escapeRichTextPlain,
    sanitizeHref,
    sanitizeRichTextEditorHtml,
    sanitizeRichTextHtml,
  });
}));
