'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { exportReport } = require('./exporter');
const { ExportValidationError } = require('./asset-paths');

const PROJECT_ID_PATTERN = /^[a-z0-9-]{1,80}$/u;
const OUTPUT_KINDS = new Set(['folder', 'zip', 'both']);
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;
const OUTPUT_NOT_WRITABLE_CODE = 'EXPORT_OUTPUT_NOT_WRITABLE';

function outputNotWritableError(message, cause) {
  const error = new ExportValidationError(message, {
    reasonCode: OUTPUT_NOT_WRITABLE_CODE,
    cause,
  });
  error.reasonCode = OUTPUT_NOT_WRITABLE_CODE;
  error.cause = cause;
  return error;
}

async function probeDirectoryWritable(directory, description) {
  const probePath = path.join(directory, `pitching-report-write-${crypto.randomUUID()}.tmp`);
  try {
    await fs.writeFile(probePath, '', { flag: 'wx' });
  } catch (error) {
    throw outputNotWritableError(`${description} is not writable`, error);
  } finally {
    await fs.rm(probePath, { force: true }).catch(() => {});
  }
}

async function assertOutputDirectoryWritable(outputDirectory, description = 'Export output directory') {
  let targetDirectory = path.resolve(outputDirectory);
  try {
    const stats = await fs.stat(targetDirectory);
    if (!stats.isDirectory()) {
      throw new ExportValidationError(`${description} must be a directory`);
    }
  } catch (error) {
    if (error instanceof ExportValidationError) throw error;
    if (error.code !== 'ENOENT') {
      throw outputNotWritableError(`${description} cannot be inspected`, error);
    }
    targetDirectory = await realpathNearestExisting(targetDirectory).catch((ancestorError) => {
      throw outputNotWritableError(`${description} cannot be inspected`, ancestorError);
    });
  }
  await probeDirectoryWritable(targetDirectory, description);
}

function isPathInsideOrEqual(rootPath, candidatePath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return relative === ''
    || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function realpathNearestExisting(targetPath) {
  let current = path.resolve(targetPath);
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

async function assertNoSymbolicLinkAncestors(targetPath, description) {
  let currentPath = path.resolve(targetPath);
  while (true) {
    const entry = await fs.lstat(currentPath).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw new ExportValidationError(`${description} cannot be inspected: ${currentPath}`, { cause: error });
    });
    if (entry?.isSymbolicLink()) {
      throw new ExportValidationError(`${description} contains a symbolic link: ${currentPath}`);
    }
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) return;
    currentPath = parentPath;
  }
}

async function assertSafeOutputRoot(projectRoot, outputDirectory) {
  if (typeof projectRoot !== 'string' || projectRoot.trim() === '') {
    throw new ExportValidationError('Export projectRoot is required');
  }
  if (typeof outputDirectory !== 'string' || outputDirectory.trim() === '') {
    throw new ExportValidationError('Export outputDirectory is required');
  }
  if (!path.isAbsolute(outputDirectory) || CONTROL_CHARACTER_PATTERN.test(outputDirectory)) {
    throw new ExportValidationError('Export outputDirectory must be an absolute safe path');
  }

  const lexicalProjectRoot = path.resolve(projectRoot);
  const lexicalOutputRoot = path.resolve(outputDirectory);

  try {
    await fs.realpath(lexicalProjectRoot);
  } catch (error) {
    throw new ExportValidationError('Export projectRoot is unavailable', { cause: error });
  }
  await assertNoSymbolicLinkAncestors(lexicalOutputRoot, 'Export outputDirectory');
  let realOutputAncestor;
  try {
    realOutputAncestor = await realpathNearestExisting(lexicalOutputRoot);
  } catch (error) {
    throw new ExportValidationError('Export outputDirectory cannot be resolved safely', { cause: error });
  }
  const ancestorStats = await fs.stat(realOutputAncestor).catch((error) => {
    throw new ExportValidationError('Export outputDirectory cannot be inspected safely', { cause: error });
  });
  if (!ancestorStats.isDirectory()) {
    throw new ExportValidationError('Export outputDirectory parent must be a directory');
  }
  return lexicalOutputRoot;
}

async function validatePickedExportDirectory(projectRoot, selectedDirectory) {
  if (selectedDirectory === null || selectedDirectory === undefined) return null;
  if (typeof selectedDirectory !== 'string' || selectedDirectory.trim() === '') {
    throw new ExportValidationError('Picked export directory is invalid');
  }
  const safeDirectory = await assertSafeOutputRoot(projectRoot, selectedDirectory);
  let stats;
  try {
    stats = await fs.stat(safeDirectory);
  } catch (error) {
    throw new ExportValidationError('Picked export directory is unavailable', { cause: error });
  }
  if (!stats.isDirectory()) {
    throw new ExportValidationError('Picked export path must be a directory');
  }
  await probeDirectoryWritable(safeDirectory, 'Picked export directory');
  return safeDirectory;
}

function assertProjectId(value) {
  if (typeof value !== 'string' || !PROJECT_ID_PATTERN.test(value)) {
    throw new ExportValidationError('Invalid project id');
  }
  return value;
}

function assertReportName(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > 160 || CONTROL_CHARACTER_PATTERN.test(value)) {
    throw new ExportValidationError('Export reportName is invalid');
  }
  return value;
}

async function normalizeExportRequest(request) {
  if (request === null || typeof request !== 'object' || Array.isArray(request)) {
    throw new ExportValidationError('Export request must be an object');
  }
  const projectId = assertProjectId(request.projectId);
  if (request.reportDocument === null || typeof request.reportDocument !== 'object'
    || Array.isArray(request.reportDocument)) {
    throw new ExportValidationError('Export reportDocument is required');
  }
  if (!Array.isArray(request.assets)) throw new ExportValidationError('Export assets must be an array');
  const outputKind = request.outputKind === undefined ? 'folder' : request.outputKind;
  if (typeof outputKind !== 'string' || !OUTPUT_KINDS.has(outputKind)) {
    throw new ExportValidationError('Export outputKind is invalid');
  }
  const outputDirectory = await assertSafeOutputRoot(request.projectRoot, request.outputDirectory);
  await assertOutputDirectoryWritable(outputDirectory);
  return Object.freeze({
    projectId,
    projectRoot: path.resolve(request.projectRoot),
    reportDocument: request.reportDocument,
    assets: request.assets,
    outputDirectory,
    reportName: assertReportName(request.reportName),
    outputKind,
  });
}

function serializeError(error) {
  const code = error?.code === 'EXPORT_CANCELLED'
    ? 'EXPORT_CANCELLED'
    : (error?.reasonCode === OUTPUT_NOT_WRITABLE_CODE || error?.details?.reasonCode === OUTPUT_NOT_WRITABLE_CODE
      ? OUTPUT_NOT_WRITABLE_CODE
      : (error?.code === 'EXPORT_VALIDATION_FAILED' ? 'EXPORT_VALIDATION_FAILED' : 'EXPORT_FAILED'));
  const systemCode = typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{1,32}$/u.test(error.code)
    && !error.code.startsWith('EXPORT_')
    ? error.code
    : (typeof (error?.cause?.code || error?.details?.cause?.code) === 'string'
      && /^[A-Z][A-Z0-9_]{1,32}$/u.test(error.cause?.code || error.details.cause.code)
      ? (error.cause?.code || error.details.cause.code)
      : null);
  const phase = typeof error?.exportPhase === 'string' && /^[a-z][a-z0-9-]{1,48}$/u.test(error.exportPhase)
    ? error.exportPhase
    : null;
  return {
    code,
    message: String(error?.message || 'Export failed').slice(0, 500),
    ...(systemCode ? { systemCode } : {}),
    ...(phase ? { phase } : {}),
  };
}

function cancellationError() {
  const error = new ExportValidationError('Export cancelled');
  error.code = 'EXPORT_CANCELLED';
  return error;
}

class ExportJobController {
  constructor({ exporter = exportReport } = {}) {
    if (typeof exporter !== 'function') throw new TypeError('Export job exporter must be a function');
    this.exporter = exporter;
    this.jobs = new Map();
  }

  async start(request) {
    const normalized = await normalizeExportRequest(request);
    const job = {
      jobId: crypto.randomUUID(),
      request: normalized,
      controller: new AbortController(),
      status: 'running',
      result: null,
      error: null,
      createdAt: new Date().toISOString(),
      finishedAt: null,
      resolve: null,
    };
    job.completion = new Promise((resolve) => { job.resolve = resolve; });
    this.jobs.set(job.jobId, job);
    void this.run(job);
    return this.snapshot(job);
  }

  async run(job) {
    try {
      const result = await this.exporter({
        ...job.request,
        createZip: job.request.outputKind !== 'folder',
        signal: job.controller.signal,
      });
      if (job.controller.signal.aborted) throw cancellationError();
      job.status = 'completed';
      job.result = result;
    } catch (error) {
      if (job.controller.signal.aborted || error?.code === 'EXPORT_CANCELLED') {
        job.status = 'cancelled';
        job.error = serializeError(cancellationError());
      } else {
        job.status = 'failed';
        job.error = serializeError(error);
      }
    } finally {
      job.finishedAt = new Date().toISOString();
      job.resolve(this.snapshot(job));
    }
  }

  snapshot(job) {
    if (!job) return null;
    return {
      jobId: job.jobId,
      projectId: job.request.projectId,
      status: job.status,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt,
      result: job.result,
      error: job.error,
    };
  }

  get(jobId) {
    if (typeof jobId !== 'string' || !this.jobs.has(jobId)) {
      throw new ExportValidationError('Export job was not found');
    }
    return this.jobs.get(jobId);
  }

  status(jobId) {
    return this.snapshot(this.get(jobId));
  }

  async wait(jobId) {
    const job = this.get(jobId);
    if (job.status === 'running' || job.status === 'cancelling') return job.completion;
    return this.snapshot(job);
  }

  cancel(jobId) {
    const job = this.get(jobId);
    if (job.status === 'running') {
      job.status = 'cancelling';
      job.controller.abort();
    }
    return this.snapshot(job);
  }

  async retry(jobId) {
    const job = this.get(jobId);
    if (!['failed', 'cancelled'].includes(job.status)) {
      throw new ExportValidationError('Only failed or cancelled export jobs can be retried');
    }
    return this.start(job.request);
  }
}

module.exports = {
  ExportJobController,
  assertSafeOutputRoot,
  assertOutputDirectoryWritable,
  normalizeExportRequest,
  outputNotWritableError,
  probeDirectoryWritable,
  validatePickedExportDirectory,
  serializeError,
};
