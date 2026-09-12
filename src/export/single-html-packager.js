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

  const yieldToBrowser = () => new Promise((resolve) => setTimeout(resolve, 0));
  const decodeBase64Blob = async (base64, mediaType) => {
    const chunkCharacters = 2 * 1024 * 1024;
    const parts = [];
    for (let offset = 0; offset < base64.length; offset += chunkCharacters) {
      const end = Math.min(base64.length, offset + chunkCharacters);
      const binary = atob(base64.slice(offset, end));
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      parts.push(bytes);
      if (end < base64.length) await yieldToBrowser();
    }
    return new Blob(parts, { type: mediaType || 'video/mp4' });
  };

  const materialize = async (key) => {
    if (objectUrls.has(key)) return objectUrls.get(key);
    const payload = payloads.get(key);
    if (!payload) throw new Error('Embedded video payload is missing');
    const base64 = (payload.textContent || '').trim();
    const mediaType = payload.getAttribute(mediaTypeAttribute) || 'video/mp4';
    const blob = await decodeBase64Blob(base64, mediaType);
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
    }, { rootMargin: '400px 0px' })
    : null;

  videos.forEach((video) => {
    const side = video.closest('[data-native-frame-player]') || video;
    side.addEventListener('pointerdown', () => activate(video), { passive: true });
    side.addEventListener('focusin', () => activate(video));
    if (observer) observer.observe(video);
    else activate(video);
  });

  const debugEntries = [];
  const debugLimit = 500;
  const debugNodeIds = new WeakMap();
  const debugPointerStarts = new Map();
  let debugNextNodeId = 1;
  let debugLastTogglePointerUp = null;
  const debugNodeId = (node) => {
    if (!node || (typeof node !== 'object' && typeof node !== 'function')) return null;
    if (!debugNodeIds.has(node)) debugNodeIds.set(node, debugNextNodeId++);
    return debugNodeIds.get(node);
  };
  const describeDebugNode = (node) => {
    if (!node) return null;
    const element = node.nodeType === 1 ? node : node.parentElement;
    if (!element) return { nodeId: debugNodeId(node), nodeType: node.nodeType || null };
    return {
      nodeId: debugNodeId(element),
      tag: String(element.tagName || '').toLowerCase(),
      id: element.id || null,
      className: typeof element.className === 'string' ? element.className : null,
      action: element.getAttribute?.('data-frame-action') || null,
      role: element.getAttribute?.('role') || null,
      connected: Boolean(element.isConnected),
    };
  };
  const debugHitTarget = (event) => {
    const x = Number(event?.clientX);
    const y = Number(event?.clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y) || typeof document.elementFromPoint !== 'function') return null;
    try { return describeDebugNode(document.elementFromPoint(x, y)); } catch { return null; }
  };
  const debugEventExtra = (event) => ({
    eventType: event?.type || null,
    pointerId: Number.isFinite(Number(event?.pointerId)) ? Number(event.pointerId) : null,
    pointerType: event?.pointerType || null,
    button: Number.isFinite(Number(event?.button)) ? Number(event.button) : null,
    buttons: Number.isFinite(Number(event?.buttons)) ? Number(event.buttons) : null,
    clientX: Number.isFinite(Number(event?.clientX)) ? Number(event.clientX) : null,
    clientY: Number.isFinite(Number(event?.clientY)) ? Number(event.clientY) : null,
    defaultPrevented: Boolean(event?.defaultPrevented),
    cancelBubble: Boolean(event?.cancelBubble),
    eventPhase: Number(event?.eventPhase) || null,
    target: describeDebugNode(event?.target),
    currentTarget: describeDebugNode(event?.currentTarget),
    hitTarget: debugHitTarget(event),
    path: typeof event?.composedPath === 'function'
      ? event.composedPath().slice(0, 6).map(describeDebugNode)
      : [],
  });
  const runtimeSnapshot = (runtime) => runtime ? {
    index: runtime.index,
    rate: runtime.rate,
    playing: runtime.playing,
    playOperation: runtime.playOperation,
    manual: runtime.manual,
    seekSerial: runtime.seekSerial,
    operationSerial: runtime.operationSerial,
    rateSerial: runtime.rateSerial,
    exactSeek: runtime.exactSeek,
    rateTransition: runtime.rateTransition,
    lifecycle: runtime.lifecycle,
  } : null;
  const playerSnapshot = (target) => {
    const block = target?.closest?.('[data-native-frame-player-block]') || null;
    const toggle = target?.closest?.('[data-frame-action="toggle"]')
      || block?.querySelector?.('[data-frame-action="toggle"]')
      || null;
    const sides = block
      ? [...block.querySelectorAll('[data-native-frame-player]')]
      : [];
    return {
      toggle: toggle ? {
        nodeId: debugNodeId(toggle),
        disabled: Boolean(toggle.disabled),
        ariaPressed: toggle.getAttribute('aria-pressed'),
        text: toggle.textContent,
        connected: Boolean(toggle.isConnected),
      } : null,
      sides: sides.map((side) => {
        const video = side.querySelector('[data-player-video]');
        return {
          side: side.dataset.playerSide || null,
          runtime: runtimeSnapshot(side.__nativeFramePlayerActions?.runtime),
          video: video ? {
            paused: video.paused,
            seeking: video.seeking,
            ended: video.ended,
            currentTime: Number(video.currentTime),
            readyState: video.readyState,
            playbackRate: Number(video.playbackRate),
          } : null,
        };
      }),
    };
  };
  const recordPlayerDebug = (type, target, extra = null) => {
    const entry = {
      at: new Date().toISOString(),
      time: typeof performance !== 'undefined' && Number.isFinite(performance.now()) ? performance.now() : Date.now(),
      type,
      snapshot: playerSnapshot(target),
      ...(extra ? { extra } : {}),
    };
    debugEntries.push(entry);
    if (debugEntries.length > debugLimit) debugEntries.splice(0, debugEntries.length - debugLimit);
  };
  window.__TREEPOLO_PLAYER_DEBUG__ = {
    entries: debugEntries,
    snapshot: () => debugEntries.slice(),
    text: () => JSON.stringify(debugEntries, null, 2),
    clear: () => { debugEntries.length = 0; debugPointerStarts.clear(); debugLastTogglePointerUp = null; },
  };
  document.addEventListener('pointerdown', (event) => {
    const toggle = event.target?.closest?.('[data-frame-action="toggle"]');
    if (!toggle) return;
    const pointerId = Number.isFinite(Number(event.pointerId)) ? Number(event.pointerId) : -1;
    debugPointerStarts.set(pointerId, {
      toggle,
      toggleNodeId: debugNodeId(toggle),
      startedAt: typeof performance !== 'undefined' && Number.isFinite(performance.now()) ? performance.now() : Date.now(),
    });
    recordPlayerDebug('toggle-pointerdown', toggle, debugEventExtra(event));
  }, true);
  document.addEventListener('pointerup', (event) => {
    const pointerId = Number.isFinite(Number(event.pointerId)) ? Number(event.pointerId) : -1;
    const start = debugPointerStarts.get(pointerId);
    const toggle = start?.toggle || event.target?.closest?.('[data-frame-action="toggle"]');
    if (!toggle) return;
    const now = typeof performance !== 'undefined' && Number.isFinite(performance.now()) ? performance.now() : Date.now();
    debugLastTogglePointerUp = {
      at: now,
      pointerId,
      toggle,
      toggleNodeId: start?.toggleNodeId || debugNodeId(toggle),
      clientX: Number(event.clientX),
      clientY: Number(event.clientY),
    };
    recordPlayerDebug('toggle-pointerup', toggle, {
      ...debugEventExtra(event),
      startedToggleNodeId: start?.toggleNodeId || null,
      sameToggleNode: Boolean(start?.toggle && start.toggle === toggle),
    });
    debugPointerStarts.delete(pointerId);
  }, true);
  ['pointercancel', 'lostpointercapture'].forEach((eventName) => {
    document.addEventListener(eventName, (event) => {
      const pointerId = Number.isFinite(Number(event.pointerId)) ? Number(event.pointerId) : -1;
      const start = debugPointerStarts.get(pointerId);
      if (!start) return;
      recordPlayerDebug('toggle-' + eventName, start.toggle, {
        ...debugEventExtra(event),
        startedToggleNodeId: start.toggleNodeId,
      });
      debugPointerStarts.delete(pointerId);
    }, true);
  });
  document.addEventListener('click', (event) => {
    const directToggle = event.target?.closest?.('[data-frame-action="toggle"]');
    const now = typeof performance !== 'undefined' && Number.isFinite(performance.now()) ? performance.now() : Date.now();
    const recent = debugLastTogglePointerUp && now - debugLastTogglePointerUp.at <= 800
      ? debugLastTogglePointerUp
      : null;
    if (!directToggle && !recent) return;
    const toggle = directToggle || recent.toggle;
    recordPlayerDebug(directToggle ? 'toggle-click' : 'global-click-after-toggle', toggle, {
      ...debugEventExtra(event),
      priorToggleNodeId: recent?.toggleNodeId || null,
      clickHitsSameToggleNode: Boolean(directToggle && recent?.toggle && directToggle === recent.toggle),
      millisecondsAfterPointerUp: recent ? now - recent.at : null,
    });
    if (directToggle) {
      setTimeout(() => recordPlayerDebug('toggle-click-after-task', toggle, {
        toggleNodeId: debugNodeId(toggle),
        connected: Boolean(toggle.isConnected),
      }), 0);
    }
    debugLastTogglePointerUp = null;
  }, true);
  document.querySelectorAll('video[data-player-video]').forEach((video) => {
    ['play', 'playing', 'pause', 'waiting', 'stalled', 'seeking', 'seeked', 'ended', 'ratechange'].forEach((eventName) => {
      video.addEventListener(eventName, () => recordPlayerDebug('media-' + eventName, video));
    });
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
