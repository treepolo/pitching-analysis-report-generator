'use strict';

const path = require('node:path');

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[a-z]:/iu;
const URI_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/iu;
const UNSAFE_PORTABLE_FILENAME_CHARACTER_PATTERN = /[<>:"|?*]/u;

class MediaPathPolicyError extends Error {
  constructor(message, code = 'INVALID_MEDIA_PATH') {
    super(message);
    this.name = 'MediaPathPolicyError';
    this.code = code;
  }
}

function isPathInside(root, target) {
  const relative = path.relative(root, target);
  return relative === ''
    || (relative !== '..'
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative));
}

function normalizeProjectRoot(projectRoot) {
  if (typeof projectRoot !== 'string' || projectRoot.trim() === '') {
    throw new MediaPathPolicyError('Project root is required', 'PROJECT_ROOT_REQUIRED');
  }
  return path.resolve(projectRoot);
}

/**
 * Normalize a path that is stored in a project model.
 *
 * References intentionally use POSIX separators regardless of host OS. This
 * keeps persisted project data portable while rejecting absolute paths and
 * traversal segments before they reach a filesystem API.
 */
function normalizeProjectRelativePath(value, fieldName = 'relativePath') {
  if (typeof value !== 'string' || value.length === 0) {
    throw new MediaPathPolicyError(`${fieldName} is required`, 'RELATIVE_PATH_REQUIRED');
  }
  if (CONTROL_CHARACTER_PATTERN.test(value)) {
    throw new MediaPathPolicyError(`${fieldName} contains a control character`, 'RELATIVE_PATH_CONTROL_CHARACTER');
  }

  if (value.includes('\\')) {
    throw new MediaPathPolicyError(`${fieldName} must use forward slashes`, 'PATH_SEPARATOR_NOT_ALLOWED');
  }

  const slashified = value;
  if (slashified.startsWith('/')
    || slashified.startsWith('//')
    || WINDOWS_ABSOLUTE_PATH_PATTERN.test(slashified)
    || URI_SCHEME_PATTERN.test(slashified)) {
    throw new MediaPathPolicyError(`${fieldName} must be project-relative`, 'ABSOLUTE_PATH_NOT_ALLOWED');
  }

  const segments = slashified.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new MediaPathPolicyError(`${fieldName} contains an invalid path segment`, 'PATH_TRAVERSAL_NOT_ALLOWED');
  }
  if (segments.some((segment) => UNSAFE_PORTABLE_FILENAME_CHARACTER_PATTERN.test(segment))) {
    throw new MediaPathPolicyError(`${fieldName} contains an unsafe filename character`, 'UNSAFE_FILENAME_CHARACTER');
  }

  return segments.join('/');
}

function isProjectRelativePath(value) {
  try {
    normalizeProjectRelativePath(value);
    return true;
  } catch {
    return false;
  }
}

function resolveProjectRelativePath(projectRoot, relativePath) {
  const root = normalizeProjectRoot(projectRoot);
  const normalized = normalizeProjectRelativePath(relativePath);
  const target = path.resolve(root, ...normalized.split('/'));
  if (!isPathInside(root, target)) {
    throw new MediaPathPolicyError('Resolved media path escapes the project root', 'PATH_ESCAPES_PROJECT_ROOT');
  }
  return target;
}

function toProjectRelativePath(projectRoot, absolutePath) {
  const root = normalizeProjectRoot(projectRoot);
  if (typeof absolutePath !== 'string' || absolutePath.trim() === '') {
    throw new MediaPathPolicyError('Absolute path is required', 'ABSOLUTE_PATH_REQUIRED');
  }
  if (!path.isAbsolute(absolutePath) && !WINDOWS_ABSOLUTE_PATH_PATTERN.test(absolutePath)) {
    throw new MediaPathPolicyError('Path must be absolute before converting to a reference', 'ABSOLUTE_PATH_REQUIRED');
  }

  const target = path.resolve(absolutePath);
  if (!isPathInside(root, target) || target === root) {
    throw new MediaPathPolicyError('Path is outside the project root', 'PATH_OUTSIDE_PROJECT_ROOT');
  }

  const relative = path.relative(root, target).split(path.sep).join('/');
  return normalizeProjectRelativePath(relative);
}

module.exports = Object.freeze({
  MediaPathPolicyError,
  isPathInside,
  isProjectRelativePath,
  normalizeProjectRelativePath,
  resolveProjectRelativePath,
  toProjectRelativePath,
});
