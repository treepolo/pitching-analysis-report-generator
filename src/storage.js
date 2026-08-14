'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const PROJECT_ID_PATTERN = /^[a-z0-9-]{1,80}$/u;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;
const MAX_SECTIONS = 50;
const MAX_BLOCKS_PER_SECTION = 50;
const MAX_SECTION_TITLE_LENGTH = 160;
const MAX_CONTENT_LENGTH = 500_000;
const MAX_MEDIA_ITEMS = 500;
const SUPPORTED_BLOCK_TYPES = new Set([
  'rich-text',
  'text',
  'image',
  'singleVideo',
  'comparisonVideo',
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
  return safeText(value, 'Section content', MAX_CONTENT_LENGTH, { allowEmpty: true });
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
          sectionCount: project.sections.length,
        });
      } catch {
        // Ignore incomplete or invalid folders; they are never presented as projects.
      }
    }
    return projects.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
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
    await fs.mkdir(path.join(directory, 'media'), { recursive: false });
    const filePath = await projectFile(projectId, { mustExist: false });
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

  async function saveProject(payload) {
    if (!isPlainRecord(payload)) throw new Error('Invalid project payload');
    const id = safeProjectId(payload.id);
    const current = await readProject(id);
    const now = new Date().toISOString();
    const next = normalizeProjectRecord({
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
  });
}

module.exports = {
  createProjectStore,
  isPathInside,
  normalizeProjectRecord,
  projectDirectory,
  safeDisplayName,
  safeProjectId,
  validateProjectRoot,
};
