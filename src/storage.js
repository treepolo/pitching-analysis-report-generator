'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  COMPATIBILITY,
  ASSET_LIFECYCLE_STATUS,
  createMediaAsset,
  detectMediaType,
  normalizeProjectRelativePath,
  safeOutputFileName,
} = require('./media');

const PROJECT_ID_PATTERN = /^[a-z0-9-]{1,80}$/u;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;
const TEXT_CONTENT_CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const MAX_SECTIONS = 50;
const MAX_BLOCKS_PER_SECTION = 50;
const MAX_SECTION_TITLE_LENGTH = 160;
const MAX_CONTENT_LENGTH = 500_000;
const MAX_MEDIA_ITEMS = 500;
const MAX_TEXT_IMPORT_BYTES = MAX_CONTENT_LENGTH * 4 + 3;
const TEXT_IMPORT_EXTENSIONS = new Set(['.txt', '.md']);
const SUPPORTED_BLOCK_TYPES = new Set([
  'rich-text',
  'text',
  'image',
  'singleVideo',
  'comparisonVideo',
]);
const PROJECT_FIELDS = new Set([
  'schemaVersion',
  'id',
  'displayName',
  'reportTitle',
  'safeName',
  'filesystemName',
  'createdAt',
  'updatedAt',
  'lastOpenedAt',
  'sections',
  'media',
  'exportSettings',
  'recoveryMetadata',
]);
const MEDIA_REFERENCE_KEYS = new Set([
  'assetId',
  'assetIds',
  'assetRef',
  'assetRefs',
  'mediaAssetId',
  'mediaAssetIds',
  'imageAssetId',
  'videoAssetId',
  'posterAssetId',
  'posterImageAssetId',
  'leftAssetId',
  'rightAssetId',
  'firstAssetId',
  'secondAssetId',
  'leftMediaAssetId',
  'rightMediaAssetId',
  'firstMediaAssetId',
  'secondMediaAssetId',
  'videoAssetIds',
]);

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isPathInside(root, target) {
  const relative = path.relative(root, target);
  return relative === ''
    || (relative !== '..'
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative));
}

function safeProjectId(value) {
  if (typeof value !== 'string' || !PROJECT_ID_PATTERN.test(value)) {
    throw new Error('Invalid project id');
  }
  return value;
}

function safeText(value, fieldName, maximum, { trim = false, allowEmpty = false } = {}) {
  if (typeof value !== 'string') throw new Error(`${fieldName} must be text`);
  if (CONTROL_CHARACTER_PATTERN.test(value)) throw new Error(`${fieldName} contains a control character`);
  const result = trim ? value.trim() : value;
  if (!allowEmpty && result.length === 0) throw new Error(`${fieldName} cannot be empty`);
  if (result.length > maximum) throw new Error(`${fieldName} is too long`);
  return result;
}

function safeDisplayName(value) {
  return safeText(value, 'Display name', 120, { trim: true });
}

function safeOptionalText(value, fieldName, maximum) {
  if (value === null || value === undefined) return null;
  return safeText(value, fieldName, maximum, { trim: true, allowEmpty: true });
}

function safeSectionTitle(value) {
  if (value === null || value === undefined) return '';
  return safeText(value, 'Section title', MAX_SECTION_TITLE_LENGTH, {
    trim: true,
    allowEmpty: true,
  });
}

function safeContent(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') throw new Error('Section content must be text');
  if (TEXT_CONTENT_CONTROL_PATTERN.test(value)) throw new Error('Section content contains a control character');
  if (value.length > MAX_CONTENT_LENGTH) throw new Error('Section content is too long');
  return value;
}

function normalizeOptionalAssetId(value, fieldName) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u.test(value)) {
    throw new Error(`${fieldName} is invalid`);
  }
  return value;
}

function normalizeOptionalNonNegative(value, fieldName) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${fieldName} is invalid`);
  }
  return value;
}

function normalizeSegment(value, fieldName) {
  if (value === null || value === undefined) return { in: 0, out: null };
  if (!isPlainRecord(value)) throw new Error(`${fieldName} is invalid`);
  const start = normalizeOptionalNonNegative(value.in ?? value.start ?? value.startTime, `${fieldName}.in`) ?? 0;
  const end = normalizeOptionalNonNegative(value.out ?? value.end ?? value.endTime, `${fieldName}.out`);
  if (end !== null && end < start) throw new Error(`${fieldName} range is invalid`);
  return { in: start, out: end };
}

function normalizePlayback(value, fieldName) {
  if (value === null || value === undefined) return { rate: 1 };
  if (!isPlainRecord(value)) throw new Error(`${fieldName} is invalid`);
  const playback = cloneJson(value);
  if (playback.rate === undefined) playback.rate = 1;
  if (typeof playback.rate !== 'number' || !Number.isFinite(playback.rate) || playback.rate <= 0 || playback.rate > 8) {
    throw new Error(`${fieldName}.rate is invalid`);
  }
  const legacyLoop = playback.loop ?? playback.loopRange;
  if (legacyLoop !== undefined) playback.loop = normalizeLoopConfig(legacyLoop, `${fieldName}.loop`);
  delete playback.loopRange;
  return playback;
}

function normalizeLoopConfig(value, fieldName) {
  if (value === null) return { enabled: false };
  if (value === true) return { enabled: true };
  if (!isPlainRecord(value)) throw new Error(`${fieldName} is invalid`);
  return { enabled: value.enabled !== false };
}

function legacyLoopSegment(value) {
  const loop = value && typeof value === 'object'
    ? (value.loop ?? value.loopRange ?? value.playback?.loop ?? value.playback?.loopRange)
    : null;
  if (!isPlainRecord(loop)) return null;
  const start = loop.start ?? loop.startTime;
  const end = loop.end ?? loop.endTime;
  if (start === undefined && end === undefined) return null;
  return { in: start ?? 0, out: end ?? null };
}

function normalizeLoopAndSegment(value, fieldName) {
  if (!isPlainRecord(value)) return;
  if (value.segment === undefined) {
    const migratedSegment = legacyLoopSegment(value);
    if (migratedSegment) value.segment = normalizeSegment(migratedSegment, `${fieldName}.segment`);
  }
  const legacyLoop = value.loop ?? value.loopRange;
  if (legacyLoop !== undefined) value.loop = normalizeLoopConfig(legacyLoop, `${fieldName}.loop`);
  delete value.loopRange;
  delete value.offsetSeconds;
  delete value.offset;
  delete value.relativeOffset;
  delete value.relativeTimeOffset;
  delete value.syncOffset;
}

function normalizeVideoSide(value, fieldName) {
  if (value === undefined || value === null) return undefined;
  if (!isPlainRecord(value)) throw new Error(`${fieldName} is invalid`);
  const side = cloneJson(value);
  normalizeLoopAndSegment(side, fieldName);
  if (side.mediaAssetId !== undefined || side.videoAssetId !== undefined || side.assetId !== undefined) {
    side.mediaAssetId = normalizeOptionalAssetId(side.mediaAssetId ?? side.videoAssetId ?? side.assetId, `${fieldName}.mediaAssetId`);
  }
  if (side.label !== undefined) side.label = safeOptionalText(side.label, `${fieldName}.label`, 160);
  if (side.segment !== undefined) side.segment = normalizeSegment(side.segment, `${fieldName}.segment`);
  if (side.playback !== undefined) side.playback = normalizePlayback(side.playback, `${fieldName}.playback`);
  // Anchors belong to the retired comparison synchronisation mechanism.
  delete side.anchor;
  return side;
}

function normalizeVideoBlock(block) {
  const normalized = { ...cloneJson(block) };
  normalizeLoopAndSegment(normalized, 'Video block');
  // The previous comparison synchronisation contract is intentionally not
  // migrated.  Keep only media/playback configuration for the next design.
  delete normalized.sync;
  delete normalized.binding;
  delete normalized.anchor;
  if (normalized.label !== undefined) normalized.label = safeOptionalText(normalized.label, 'Video block label', 160);
  if (normalized.layout !== undefined) normalized.layout = normalized.layout === 'stacked' ? 'stacked' : 'side-by-side';
  if (normalized.playback !== undefined) normalized.playback = normalizePlayback(normalized.playback, 'Video block playback');
  if (normalized.type === 'singleVideo') {
    delete normalized.layout;
    if (normalized.mediaAssetId !== undefined || normalized.videoAssetId !== undefined || normalized.assetId !== undefined) {
      normalized.mediaAssetId = normalizeOptionalAssetId(
        normalized.mediaAssetId ?? normalized.videoAssetId ?? normalized.assetId,
        'Video block mediaAssetId',
      );
    }
    if (normalized.segment !== undefined) normalized.segment = normalizeSegment(normalized.segment, 'Video block segment');
  } else {
    // Dual-video settings live on the two sides.  Do not retain the former
    // shared media/segment/playback fields when an old payload is reopened.
    delete normalized.mediaAssetId;
    delete normalized.videoAssetId;
    delete normalized.assetId;
    delete normalized.segment;
    delete normalized.playback;
    delete normalized.loop;
    const left = normalizeVideoSide(normalized.left, 'Video block left');
    const right = normalizeVideoSide(normalized.right, 'Video block right');
    if (left !== undefined) normalized.left = left;
    if (right !== undefined) normalized.right = right;
  }
  return normalized;
}

function safeTextImportFileName(value) {
  if (typeof value !== 'string' || value.length === 0 || CONTROL_CHARACTER_PATTERN.test(value)) {
    throw new Error('Text import filename is invalid');
  }
  const normalized = value.replaceAll('\\', '/');
  const fileName = normalized.slice(normalized.lastIndexOf('/') + 1);
  if (!fileName || fileName === '.' || fileName === '..' || fileName.length > 255) {
    throw new Error('Text import filename is invalid');
  }
  const extension = path.extname(fileName).toLowerCase();
  if (!TEXT_IMPORT_EXTENSIONS.has(extension)) {
    throw new Error('Only .txt and .md files can be imported');
  }
  return fileName;
}

function normalizeTextImport(fileName, content) {
  const safeFileName = safeTextImportFileName(fileName);
  if (typeof content !== 'string') throw new Error('Text import content is invalid');
  const withoutBom = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  if (withoutBom.length === 0 || withoutBom.trim().length === 0) {
    throw new Error('Text import file is empty');
  }
  return {
    fileName: safeFileName,
    content: safeContent(withoutBom),
  };
}

async function readTextImportFile(filePath) {
  if (typeof filePath !== 'string' || filePath.trim() === '' || CONTROL_CHARACTER_PATTERN.test(filePath)) {
    throw new Error('Text import file is invalid');
  }
  const absolutePath = path.resolve(filePath);
  safeTextImportFileName(path.basename(absolutePath));
  let stats;
  try {
    stats = await fs.lstat(absolutePath);
  } catch {
    throw new Error('Text import file is unavailable');
  }
  if (stats.isSymbolicLink() || !stats.isFile()) throw new Error('Text import file is not a regular file');
  if (stats.size === 0) throw new Error('Text import file is empty');
  if (stats.size > MAX_TEXT_IMPORT_BYTES) throw new Error('Text import file is too large');

  let content;
  try {
    const bytes = await fs.readFile(absolutePath);
    content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    if (error instanceof TypeError || error?.name === 'TypeError') {
      throw new Error('Text import file must be valid UTF-8');
    }
    if (error?.message?.startsWith('Text import')) throw error;
    throw new Error('Text import file could not be read');
  }
  return normalizeTextImport(path.basename(absolutePath), content);
}

function safeBlockId(value) {
  return safeProjectId(value);
}

function safeTimestamp(value, fieldName) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${fieldName} must be an ISO timestamp`);
  }
  return value;
}

function safeOptionalTimestamp(value, fieldName) {
  if (value === null || value === undefined || value === '') return null;
  return safeTimestamp(value, fieldName);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function cloneProjectExtensions(value) {
  const extensions = Object.create(null);
  for (const [key, fieldValue] of Object.entries(value)) {
    if (PROJECT_FIELDS.has(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) continue;
    if (fieldValue === undefined) continue;
    extensions[key] = cloneJson(fieldValue);
  }
  return extensions;
}

function normalizeSections(value) {
  if (!Array.isArray(value) || value.length > MAX_SECTIONS) {
    throw new Error(`Sections must be an array of at most ${MAX_SECTIONS} items`);
  }

  const sectionIds = new Set();
  return value.map((section, sectionIndex) => {
    if (!isPlainRecord(section)) throw new Error(`Section ${sectionIndex + 1} is invalid`);
    const id = safeProjectId(section.id);
    if (sectionIds.has(id)) throw new Error(`Duplicate section id: ${id}`);
    sectionIds.add(id);

    if (!Array.isArray(section.blocks) || section.blocks.length > MAX_BLOCKS_PER_SECTION) {
      throw new Error(`Section ${id} has too many blocks`);
    }

    const blockIds = new Set();
    const blocks = section.blocks.map((block, blockIndex) => {
      if (!isPlainRecord(block)) throw new Error(`Block ${blockIndex + 1} in ${id} is invalid`);
      if (!SUPPORTED_BLOCK_TYPES.has(block.type)) throw new Error(`Unsupported block type in ${id}`);
      const blockId = safeBlockId(block.id);
      if (blockIds.has(blockId)) throw new Error(`Duplicate block id: ${blockId}`);
      blockIds.add(blockId);
      const normalizedBlock = {
        ...cloneJson(block),
        id: blockId,
        type: block.type,
      };
      if (block.type === 'rich-text' || block.type === 'text') {
        normalizedBlock.content = safeContent(block.content);
      }
      if (block.type === 'singleVideo' || block.type === 'comparisonVideo') {
        const normalizedVideo = normalizeVideoBlock(normalizedBlock);
        Object.keys(normalizedBlock).forEach((key) => {
          if (key !== 'id' && key !== 'type') delete normalizedBlock[key];
        });
        Object.assign(normalizedBlock, normalizedVideo, { id: blockId, type: block.type });
      }
      return normalizedBlock;
    });

    return {
      id,
      title: safeSectionTitle(section.title),
      blocks,
    };
  });
}

function normalizeMedia(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_MEDIA_ITEMS) {
    throw new Error('Media metadata is invalid');
  }
  return value.map((item, index) => {
    if (!isPlainRecord(item)) throw new Error(`Media metadata item ${index + 1} is invalid`);
    return cloneJson(item);
  });
}

function mediaReferenceMatches(value, assetId) {
  if (typeof value === 'string') return value === assetId;
  if (Array.isArray(value)) return value.some((entry) => mediaReferenceMatches(entry, assetId));
  if (!isPlainRecord(value)) return false;
  if (typeof value.id === 'string' && value.id === assetId) return true;
  return Object.values(value).some((entry) => mediaReferenceMatches(entry, assetId));
}

function hasMediaReference(value, assetId) {
  if (Array.isArray(value)) return value.some((entry) => hasMediaReference(entry, assetId));
  if (!isPlainRecord(value)) return false;
  return Object.entries(value).some(([key, entry]) => (
    (MEDIA_REFERENCE_KEYS.has(key) && mediaReferenceMatches(entry, assetId))
      || hasMediaReference(entry, assetId)
  ));
}

function resolveStoredMediaPath(projectRoot, projectId, relativePath) {
  let normalized;
  try {
    normalized = normalizeProjectRelativePath(relativePath, 'media source path');
  } catch {
    throw new Error('Media source path is invalid');
  }
  const projectRootPath = path.resolve(projectRoot);
  const mediaRoot = path.join(projectDirectory(projectRootPath, projectId), 'media');
  const target = path.resolve(projectRootPath, ...normalized.split('/'));
  if (!isPathInside(mediaRoot, target) || target === mediaRoot) {
    throw new Error('Media source path escapes the project media directory');
  }
  return target;
}

async function registerMediaSource(projectRoot, projectId, sourcePath) {
  if (typeof sourcePath !== 'string' || sourcePath.trim() === '' || CONTROL_CHARACTER_PATTERN.test(sourcePath)) {
    throw new Error('Media source path is invalid');
  }
  const absoluteSource = path.resolve(sourcePath);
  let sourceStats;
  try {
    sourceStats = await fs.lstat(absoluteSource);
  } catch {
    throw new Error('Media source is unavailable');
  }
  if (sourceStats.isSymbolicLink() || !sourceStats.isFile()) {
    throw new Error('Media source must be a regular file');
  }

  const fileName = path.basename(absoluteSource);
  const detected = detectMediaType({ fileName });
  const assetId = `asset-${crypto.randomUUID()}`;
  const safeFileName = safeOutputFileName(fileName, detected.extension);
  const relativePath = `projects/${projectId}/media/original/${assetId}-${safeFileName}`;
  const destination = resolveStoredMediaPath(projectRoot, projectId, relativePath);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  try {
    await fs.copyFile(absoluteSource, destination);
  } catch (error) {
    throw new Error(error?.code === 'EEXIST' ? 'Media destination already exists' : 'Media source could not be copied');
  }

  try {
    const asset = createMediaAsset({
      id: assetId,
      projectId,
      displayName: fileName,
      fileName,
      mediaKind: detected.kind,
      mediaType: detected.mimeType,
      sourceReference: {
        relativePath,
        byteSize: sourceStats.size,
        checksumSha256: null,
        mediaType: detected.mimeType,
      },
      metadata: {
        fileName,
        extension: detected.extension,
        mimeType: detected.mimeType,
        byteSize: sourceStats.size,
        frameTiming: 'unknown',
      },
      compatibility: detected.compatibilityHint ?? COMPATIBILITY.UNKNOWN,
      lifecycleStatus: ASSET_LIFECYCLE_STATUS.DISCOVERED,
      derived: { safeFileName, referenceCount: 0 },
    });
    return { asset, destination };
  } catch (error) {
    await fs.rm(destination, { force: true }).catch(() => {});
    throw error;
  }
}

function normalizeExportSettings(value, projectRoot) {
  if (value === undefined) return { lastOutputPath: null };
  if (!isPlainRecord(value)) throw new Error('Export settings are invalid');

  const normalized = cloneJson(value);
  const lastOutputPath = value.lastOutputPath;
  if (lastOutputPath === null || lastOutputPath === undefined || lastOutputPath === '') {
    return { ...normalized, lastOutputPath: null };
  }
  if (typeof lastOutputPath !== 'string') throw new Error('Export path is invalid');

  const resolvedPath = path.resolve(lastOutputPath);
  if (!isPathInside(path.resolve(projectRoot), resolvedPath)) {
    throw new Error('Export path escapes the project boundary');
  }
  return { ...normalized, lastOutputPath: resolvedPath };
}

function normalizeOptionalRecord(value, fieldName) {
  if (value === null || value === undefined) return null;
  if (!isPlainRecord(value)) throw new Error(`${fieldName} is invalid`);
  return cloneJson(value);
}

function normalizeProjectRecord(value, projectRoot, expectedId = null) {
  if (!isPlainRecord(value)) throw new Error('Project data is invalid');
  if (value.schemaVersion !== 1) throw new Error('Unsupported project schema');

  const id = safeProjectId(value.id);
  if (expectedId !== null && id !== expectedId) throw new Error('Project id does not match its directory');
  const filesystemName = safeProjectId(value.filesystemName || value.safeName || id);
  if (filesystemName !== id) throw new Error('Filesystem project name does not match project id');

  return {
    ...cloneProjectExtensions(value),
    schemaVersion: 1,
    id,
    displayName: safeDisplayName(value.displayName),
    reportTitle: safeOptionalText(value.reportTitle, 'Report title', 160),
    safeName: id,
    filesystemName: id,
    createdAt: safeTimestamp(value.createdAt, 'createdAt'),
    updatedAt: safeTimestamp(value.updatedAt, 'updatedAt'),
    lastOpenedAt: safeOptionalTimestamp(value.lastOpenedAt, 'lastOpenedAt'),
    sections: normalizeSections(value.sections),
    media: normalizeMedia(value.media),
    exportSettings: normalizeExportSettings(value.exportSettings, projectRoot),
    recoveryMetadata: normalizeOptionalRecord(value.recoveryMetadata, 'Recovery metadata'),
  };
}

function slugFromName(value) {
  const ascii = value.normalize('NFKD').replace(/[^\x00-\x7F]/gu, '');
  const slug = ascii
    .replace(/[^a-zA-Z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .toLowerCase()
    .slice(0, 48);
  return slug || 'report';
}

function projectDirectory(projectRoot, projectId) {
  const root = path.resolve(projectRoot);
  const projectsRoot = path.join(root, 'projects');
  const target = path.resolve(projectsRoot, safeProjectId(projectId));
  if (!isPathInside(projectsRoot, target)) throw new Error('Project path escapes the project boundary');
  return target;
}

async function realpathNearestExisting(target) {
  let current = path.resolve(target);
  while (true) {
    try {
      return await fs.realpath(current);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
}

async function validateProjectRoot(projectRoot, boundaryRoot = null) {
  if (typeof projectRoot !== 'string' || projectRoot.trim() === '') {
    throw new Error('Project root is required');
  }

  const root = path.resolve(projectRoot);
  const boundary = boundaryRoot === null ? null : path.resolve(boundaryRoot);
  if (boundary !== null && !isPathInside(boundary, root)) {
    throw new Error('Project root escapes the application project root');
  }

  const realBoundary = boundary === null ? null : await fs.realpath(boundary);
  const realRootAncestor = await realpathNearestExisting(root);
  if (realBoundary !== null && !isPathInside(realBoundary, realRootAncestor)) {
    throw new Error('Project root realpath escapes the application project root');
  }

  await fs.mkdir(root, { recursive: true });
  const realRoot = await fs.realpath(root);
  if (realBoundary !== null) {
    if (!isPathInside(realBoundary, realRoot)) {
      throw new Error('Project root realpath escapes the application project root');
    }
  }

  const projectsRoot = path.join(root, 'projects');
  const realProjectsAncestor = await realpathNearestExisting(projectsRoot);
  if (!isPathInside(realRoot, realProjectsAncestor)) {
    throw new Error('Projects directory realpath escapes the project boundary');
  }
  await fs.mkdir(projectsRoot, { recursive: true });
  const realProjectsRoot = await fs.realpath(projectsRoot);
  if (!isPathInside(realRoot, realProjectsRoot)) {
    throw new Error('Projects directory escapes the project boundary');
  }

  return { root, realRoot, projectsRoot, realProjectsRoot };
}

async function writeJsonAtomic(filePath, value) {
  const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  let committed = false;
  try {
    const handle = await fs.open(tempPath, 'wx');
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tempPath, filePath);
    committed = true;
  } finally {
    if (!committed) await fs.rm(tempPath, { force: true }).catch(() => {});
  }
}

function createProjectStore(projectRoot, { boundaryRoot = null } = {}) {
  if (typeof projectRoot !== 'string' || projectRoot.trim() === '') {
    throw new Error('Project root is required');
  }
  const root = path.resolve(projectRoot);
  const projectsRoot = path.join(root, 'projects');

  async function ensureProjectsRoot() {
    return validateProjectRoot(root, boundaryRoot);
  }

  async function existingProjectDirectory(projectId) {
    const { realProjectsRoot } = await ensureProjectsRoot();
    const candidate = projectDirectory(root, projectId);
    const directoryStat = await fs.lstat(candidate);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
      throw new Error('Project directory is invalid');
    }
    const realDirectory = await fs.realpath(candidate);
    if (!isPathInside(realProjectsRoot, realDirectory)) {
      throw new Error('Project path escapes the project boundary');
    }
    return realDirectory;
  }

  async function projectFile(projectId, { mustExist = true } = {}) {
    const directory = mustExist
      ? await existingProjectDirectory(projectId)
      : projectDirectory(root, projectId);
    const filePath = path.join(directory, 'project.json');
    if (!mustExist) return filePath;

    const fileStat = await fs.lstat(filePath);
    if (!fileStat.isFile() || fileStat.isSymbolicLink()) throw new Error('Project file is invalid');
    return filePath;
  }

  async function readProject(projectId) {
    const filePath = await projectFile(projectId);
    const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
    return normalizeProjectRecord(raw, root, safeProjectId(projectId));
  }

  async function listProjects() {
    const { realProjectsRoot } = await ensureProjectsRoot();
    const entries = await fs.readdir(realProjectsRoot, { withFileTypes: true });
    const projects = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      try {
        const project = await readProject(entry.name);
        projects.push({
          id: project.id,
          displayName: project.displayName,
          updatedAt: project.updatedAt,
          lastOpenedAt: project.lastOpenedAt,
          sectionCount: project.sections.length,
        });
      } catch {
        // Ignore incomplete or invalid folders; they are never presented as projects.
      }
    }
    return projects.sort((left, right) => {
      const leftTimestamp = left.lastOpenedAt || left.updatedAt;
      const rightTimestamp = right.lastOpenedAt || right.updatedAt;
      return rightTimestamp.localeCompare(leftTimestamp);
    });
  }

  async function createProject(displayName) {
    const cleanName = safeDisplayName(displayName);
    await ensureProjectsRoot();

    const projectId = `${slugFromName(cleanName)}-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const sections = [
      { id: 'basic', title: '基本資料', blocks: [{ id: 'basic-text', type: 'rich-text', content: '' }] },
      { id: 'summary', title: '核心結論摘要', blocks: [{ id: 'summary-text', type: 'rich-text', content: '' }] },
      { id: 'priorities', title: '優先處理項目', blocks: [{ id: 'priorities-text', type: 'rich-text', content: '' }] },
    ];
    const project = normalizeProjectRecord({
      schemaVersion: 1,
      id: projectId,
      displayName: cleanName,
      reportTitle: null,
      safeName: projectId,
      filesystemName: projectId,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      sections,
      media: [],
      exportSettings: { lastOutputPath: null },
      recoveryMetadata: null,
    }, root, projectId);

    const directory = projectDirectory(root, projectId);
    await fs.mkdir(directory, { recursive: false });
    const realDirectory = await existingProjectDirectory(projectId);
    await fs.mkdir(path.join(realDirectory, 'media'), { recursive: false });
    const filePath = path.join(realDirectory, 'project.json');
    await writeJsonAtomic(filePath, project);
    return project;
  }

  async function openProject(projectId) {
    const current = await readProject(projectId);
    const opened = normalizeProjectRecord({
      ...current,
      lastOpenedAt: new Date().toISOString(),
    }, root, current.id);
    const filePath = await projectFile(current.id);
    await writeJsonAtomic(filePath, opened);
    return opened;
  }

  async function insertTextBlock(projectId, importPayload) {
    const id = safeProjectId(projectId);
    if (!isPlainRecord(importPayload)) throw new Error('Text import payload is invalid');
    const imported = normalizeTextImport(importPayload.fileName, importPayload.content);
    const current = await readProject(id);
    const sectionId = safeProjectId(importPayload.sectionId || current.sections[0]?.id);
    if (!current.sections.some((section) => section.id === sectionId)) {
      throw new Error('Text import section does not exist');
    }
    const sections = current.sections.map((section) => {
      if (section.id !== sectionId) return section;
      const existingBlockIndex = section.blocks.findIndex((block) => (
        block.type === 'rich-text' || block.type === 'text'
      ));
      if (existingBlockIndex === -1) {
        return {
          ...section,
          blocks: [...section.blocks, {
            id: `import-${crypto.randomUUID()}`,
            type: 'rich-text',
            content: imported.content,
          }],
        };
      }
      const blocks = section.blocks.map((block, index) => index === existingBlockIndex
        ? {
          ...block,
          content: block.content ? `${block.content}\n\n${imported.content}` : imported.content,
        }
        : block);
      return { ...section, blocks };
    });
    return saveProject({ id, sections });
  }

  async function registerMediaFiles(projectId, sourcePaths) {
    const id = safeProjectId(projectId);
    if (!Array.isArray(sourcePaths) || sourcePaths.length === 0 || sourcePaths.length > 50) {
      throw new Error('Media source selection is invalid');
    }
    const current = await readProject(id);
    const staged = [];
    try {
      for (const sourcePath of sourcePaths) {
        staged.push(await registerMediaSource(root, id, sourcePath));
      }
      const saved = await saveProject({
        id,
        media: [...current.media, ...staged.map(({ asset }) => asset)],
      });
      return saved;
    } catch (error) {
      await Promise.all(staged.map(({ destination }) => fs.rm(destination, { force: true }).catch(() => {})));
      throw error;
    }
  }

  async function removeMediaAsset(projectId, assetId) {
    const id = safeProjectId(projectId);
    if (typeof assetId !== 'string' || assetId.length === 0) throw new Error('Media asset id is invalid');
    const current = await readProject(id);
    const asset = current.media.find((item) => isPlainRecord(item) && item.id === assetId);
    if (!asset) throw new Error('Media asset was not found');
    if (hasMediaReference(current.sections, assetId)) {
      throw new Error('Media asset is referenced by a report block');
    }

    const saved = await saveProject({
      id,
      media: current.media.filter((item) => item.id !== assetId),
    });
    const relativePath = asset.sourceReference?.relativePath;
    if (typeof relativePath === 'string') {
      const sourcePath = resolveStoredMediaPath(root, id, relativePath);
      let stats = null;
      try {
        stats = await fs.lstat(sourcePath);
      } catch (error) {
        if (error.code !== 'ENOENT') throw new Error('Media source cleanup failed');
      }
      if (stats?.isSymbolicLink()) throw new Error('Media source cleanup refused a symlink');
      if (stats?.isFile()) await fs.rm(sourcePath, { force: true });
    }
    return saved;
  }

  async function resolveMediaAssetSource(projectId, assetId) {
    const id = safeProjectId(projectId);
    if (typeof assetId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u.test(assetId)) {
      throw new Error('Media asset id is invalid');
    }
    const current = await readProject(id);
    const asset = current.media.find((item) => isPlainRecord(item) && item.id === assetId);
    if (!asset) throw new Error('Media asset was not found');
    const relativePath = asset.normalizedReference?.relativePath || asset.sourceReference?.relativePath;
    if (typeof relativePath !== 'string' || relativePath.length === 0) {
      throw new Error('Media asset has no project-local source');
    }
    const candidate = resolveStoredMediaPath(root, id, relativePath);
    const projectDirectoryPath = await existingProjectDirectory(id);
    let candidateStat;
    try {
      candidateStat = await fs.lstat(candidate);
    } catch {
      throw new Error('Media source is unavailable');
    }
    if (candidateStat.isSymbolicLink() || !candidateStat.isFile()) {
      throw new Error('Media source is not a regular file');
    }
    let realSource;
    try {
      realSource = await fs.realpath(candidate);
    } catch {
      throw new Error('Media source cannot be resolved safely');
    }
    if (!isPathInside(projectDirectoryPath, realSource)) {
      throw new Error('Media source escapes the project boundary');
    }
    return {
      assetId,
      relativePath,
      sourcePath: realSource,
      sourceRole: asset.normalizedReference?.relativePath ? 'normalized' : 'source',
    };
  }

  async function saveProject(payload) {
    if (!isPlainRecord(payload)) throw new Error('Invalid project payload');
    const id = safeProjectId(payload.id);
    const current = await readProject(id);
    const now = new Date().toISOString();
    const next = normalizeProjectRecord({
      ...current,
      ...payload,
      schemaVersion: current.schemaVersion,
      id: current.id,
      displayName: payload.displayName === undefined ? current.displayName : payload.displayName,
      reportTitle: payload.reportTitle === undefined ? current.reportTitle : payload.reportTitle,
      safeName: current.safeName,
      filesystemName: current.filesystemName,
      createdAt: current.createdAt,
      updatedAt: now,
      lastOpenedAt: current.lastOpenedAt,
      sections: payload.sections === undefined ? current.sections : payload.sections,
      media: payload.media === undefined ? current.media : payload.media,
      exportSettings: payload.exportSettings === undefined
        ? current.exportSettings
        : payload.exportSettings,
      recoveryMetadata: payload.recoveryMetadata === undefined
        ? current.recoveryMetadata
        : payload.recoveryMetadata,
    }, root, id);
    const filePath = await projectFile(id);
    await writeJsonAtomic(filePath, next);
    return next;
  }

  return Object.freeze({
    root,
    projectsRoot,
    projectDirectory: (projectId) => projectDirectory(root, projectId),
    listProjects,
    createProject,
    openProject,
    readProject,
    saveProject,
    insertTextBlock,
    registerMediaFiles,
    removeMediaAsset,
    resolveMediaAssetSource,
    readTextImportFile,
  });
}

module.exports = {
  createProjectStore,
  isPathInside,
  normalizeProjectRecord,
  normalizeTextImport,
  projectDirectory,
  readTextImportFile,
  safeDisplayName,
  safeProjectId,
  validateProjectRoot,
};
