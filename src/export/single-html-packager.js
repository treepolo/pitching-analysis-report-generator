'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { ExportValidationError } = require('./asset-paths');

const MIME_BY_EXTENSION = Object.freeze({
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
});

const INLINE_VIDEO_SOURCE_ATTRIBUTE = 'data-tree-polo-inline-video-src';
const INLINE_VIDEO_PAYLOAD_ATTRIBUTE = 'data-tree-polo-inline-video-payload';
const INLINE_VIDEO_MEDIA_TYPE_ATTRIBUTE = 'data-tree-polo-inline-video-media-type';

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function encodeAssetPath(relativePath) {
  return String(relativePath)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function assetMimeType(asset) {
  const declared = typeof asset?.mediaType === 'string' ? asset.mediaType.trim().toLowerCase() : '';
  if (/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/iu.test(declared)) return declared;
  const extension = path.posix.extname(String(asset?.relativePath || '')).toLowerCase();
  if (MIME_BY_EXTENSION[extension]) return MIME_BY_EXTENSION[extension];
  if (asset?.kind === 'video') return 'video/mp4';
  if (asset?.kind === 'image') return 'application/octet-stream';
  return 'application/octet-stream';
}

function validatePackagerInput(html, stagedAssets, rootPath) {
  if (typeof html !== 'string') throw new ExportValidationError('Single HTML source must be text');
  if (!Array.isArray(stagedAssets)) throw new ExportValidationError('Single HTML staged assets must be an array');
  if (typeof rootPath !== 'string' || rootPath.length === 0) {
    throw new ExportValidationError('Single HTML staging root is required');
  }
}

function injectBeforeBodyEnd(html, addition) {
  const closingBodyIndex = html.lastIndexOf('</body>');
  if (closingBodyIndex === -1) return `${html}${addition}`;
  return `${html.slice(0, closingBodyIndex)}${addition}${html.slice(closingBodyIndex)}`;
}

function renderInlineVideoRuntime() {
  return `<script data-tree-polo-inline-video-runtime>
(() => {
  const sourceAttribute = '${INLINE_VIDEO_SOURCE_ATTRIBUTE}';
  const payloadAttribute = '${INLINE_VIDEO_PAYLOAD_ATTRIBUTE}';
  const mediaTypeAttribute = '${INLINE_VIDEO_MEDIA_TYPE_ATTRIBUTE}';
  const payloads = new Map();
  const objectUrls = new Map();
  const pending = new WeakSet();
  let decodeQueue = Promise.resolve();

  document.querySelectorAll('script[' + payloadAttribute + ']').forEach((node) => {
    const key = node.getAttribute(payloadAttribute);
    if (key) payloads.set(key, node);
  });

  const decodeBase64Blob = (base64, mediaType) => {
    const chunkCharacters = 4 * 1024 * 1024;
    const parts = [];
    for (let offset = 0; offset < base64.length; offset += chunkCharacters) {
      const binary = atob(base64.slice(offset, offset + chunkCharacters));
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      parts.push(bytes);
    }
    return new Blob(parts, { type: mediaType || 'video/mp4' });
  };

  const materialize = (key) => {
    if (objectUrls.has(key)) return objectUrls.get(key);
    const payload = payloads.get(key);
    if (!payload) throw new Error('Embedded video payload is missing');
    const base64 = (payload.textContent || '').trim();
    const mediaType = payload.getAttribute(mediaTypeAttribute) || 'video/mp4';
    const blob = decodeBase64Blob(base64, mediaType);
    const objectUrl = URL.createObjectURL(blob);
    objectUrls.set(key, objectUrl);
    payload.textContent = '';
    payload.remove();
    payloads.delete(key);
    return objectUrl;
  };

  const failVideo = (video) => {
    pending.delete(video);
    try { video.dispatchEvent(new Event('error')); } catch {}
  };

  const activate = (video) => {
    if (!video || pending.has(video) || video.dataset.treePoloInlineVideoReady === 'true') return;
    const key = video.getAttribute(sourceAttribute);
    if (!key) return;
    pending.add(video);
    decodeQueue = decodeQueue
      .then(() => new Promise((resolve) => setTimeout(resolve, 0)))
      .then(() => materialize(key))
      .then((objectUrl) => {
        if (!video.isConnected) return;
        video.src = objectUrl;
        video.dataset.treePoloInlineVideoReady = 'true';
        video.removeAttribute(sourceAttribute);
        pending.delete(video);
        video.load();
      })
      .catch(() => failVideo(video));
  };

  const videos = [...document.querySelectorAll('video[' + sourceAttribute + ']')];
  const observer = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        activate(entry.target);
      });
    }, { rootMargin: '1200px 0px' })
    : null;

  videos.forEach((video) => {
    const side = video.closest('[data-native-frame-player]') || video;
    side.addEventListener('pointerdown', () => activate(video), { passive: true });
    side.addEventListener('focusin', () => activate(video));
    if (observer) observer.observe(video);
    else activate(video);
  });

  window.addEventListener('pagehide', () => {
    objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
    objectUrls.clear();
  }, { once: true });
})();
</script>`;
}

function replaceVideoSources(html, videoLookup) {
  const variants = [...videoLookup.keys()].sort((left, right) => right.length - left.length);
  if (variants.length === 0) return html;
  const matcher = new RegExp(`\\bsrc\\s*=\\s*(["'])(${variants.map(escapeRegex).join('|')})\\1`, 'gu');
  return html.replace(matcher, (_full, _quote, matched) => {
    const record = videoLookup.get(matched);
    record.replacements += 1;
    return `${INLINE_VIDEO_SOURCE_ATTRIBUTE}="${record.inlineKey}"`;
  });
}

function replaceDirectAssets(html, directLookup) {
  const variants = [...directLookup.keys()].sort((left, right) => right.length - left.length);
  if (variants.length === 0) return html;
  const matcher = new RegExp(variants.map(escapeRegex).join('|'), 'gu');
  return html.replace(matcher, (matched) => {
    const record = directLookup.get(matched);
    record.replacements += 1;
    return record.dataUrl;
  });
}

function appendInlineVideoPayloads(html, records) {
  const usedVideos = records.filter((record) => record.kind === 'video' && record.replacements > 0);
  if (usedVideos.length === 0) return html;
  const payloads = usedVideos.map((record) => (
    `<script type="application/octet-stream" ${INLINE_VIDEO_PAYLOAD_ATTRIBUTE}="${record.inlineKey}" ${INLINE_VIDEO_MEDIA_TYPE_ATTRIBUTE}="${record.mediaType}">${record.base64}</script>`
  )).join('');
  return injectBeforeBodyEnd(html, `${payloads}${renderInlineVideoRuntime()}`);
}

async function inlineReportAssets({ html, stagedAssets, rootPath, signal } = {}) {
  validatePackagerInput(html, stagedAssets, rootPath);
  const source = String(html);
  const records = [];
  const directLookup = new Map();
  const videoLookup = new Map();
  const variantOwners = new Map();
  let videoIndex = 0;

  for (const asset of stagedAssets) {
    if (signal?.aborted) {
      const error = new ExportValidationError('Export cancelled');
      error.code = 'EXPORT_CANCELLED';
      throw error;
    }
    if (!asset || typeof asset !== 'object' || typeof asset.relativePath !== 'string') {
      throw new ExportValidationError('Single HTML asset descriptor is invalid');
    }
    const filePath = path.join(rootPath, ...asset.relativePath.split('/'));
    const data = await fs.readFile(filePath, signal ? { signal } : undefined);
    const mediaType = assetMimeType(asset);
    const kind = asset.kind === 'video' ? 'video' : asset.kind;
    const record = {
      id: asset.id,
      kind,
      relativePath: asset.relativePath,
      mediaType,
      byteLength: data.length,
      replacements: 0,
      ...(kind === 'video'
        ? { inlineKey: `video-${videoIndex += 1}`, base64: data.toString('base64') }
        : { dataUrl: `data:${mediaType};base64,${data.toString('base64')}` }),
    };
    records.push(record);

    for (const variant of new Set([asset.relativePath, encodeAssetPath(asset.relativePath)])) {
      if (variantOwners.has(variant)) {
        throw new ExportValidationError(`Single HTML asset URL collision: ${variant}`);
      }
      variantOwners.set(variant, record);
      if (kind === 'video') videoLookup.set(variant, record);
      else directLookup.set(variant, record);
    }
  }

  let output = replaceVideoSources(source, videoLookup);
  output = replaceDirectAssets(output, directLookup);
  output = appendInlineVideoPayloads(output, records);

  const stripPayload = (record) => {
    const { dataUrl: _dataUrl, base64: _base64, inlineKey: _inlineKey, ...safeRecord } = record;
    return safeRecord;
  };
  const inlinedAssets = records
    .filter((record) => record.replacements > 0)
    .map(stripPayload);
  const unusedAssets = records
    .filter((record) => record.replacements === 0)
    .map(stripPayload);

  return {
    html: output,
    byteLength: Buffer.byteLength(output),
    inlinedAssetCount: inlinedAssets.length,
    inlinedAssets,
    unusedAssets,
  };
}

module.exports = {
  assetMimeType,
  encodeAssetPath,
  inlineReportAssets,
};
