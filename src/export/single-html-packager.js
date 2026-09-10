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

async function inlineReportAssets({ html, stagedAssets, rootPath, signal } = {}) {
  validatePackagerInput(html, stagedAssets, rootPath);
  const source = String(html);
  const records = [];
  const lookup = new Map();

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
    const dataUrl = `data:${mediaType};base64,${data.toString('base64')}`;
    const record = {
      id: asset.id,
      relativePath: asset.relativePath,
      mediaType,
      byteLength: data.length,
      replacements: 0,
      dataUrl,
    };
    records.push(record);
    for (const variant of new Set([asset.relativePath, encodeAssetPath(asset.relativePath)])) {
      if (lookup.has(variant)) {
        throw new ExportValidationError(`Single HTML asset URL collision: ${variant}`);
      }
      lookup.set(variant, record);
    }
  }

  const variants = [...lookup.keys()].sort((left, right) => right.length - left.length);
  let output = source;
  if (variants.length > 0) {
    const matcher = new RegExp(variants.map(escapeRegex).join('|'), 'gu');
    output = source.replace(matcher, (matched) => {
      const record = lookup.get(matched);
      record.replacements += 1;
      return record.dataUrl;
    });
  }

  const inlinedAssets = records
    .filter((record) => record.replacements > 0)
    .map(({ dataUrl: _dataUrl, ...record }) => record);
  const unusedAssets = records
    .filter((record) => record.replacements === 0)
    .map(({ dataUrl: _dataUrl, ...record }) => record);

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
