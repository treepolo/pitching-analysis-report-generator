'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { exportReport } = require('./exporter');
const { ExportValidationError } = require('./asset-paths');

const PROJECT_ID_PATTERN = /^[a-z0-9-]{1,80}$/u;
const OUTPUT_KINDS = new Set(['folder', 'zip', 'both']);
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;

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
  if (!isPathInsideOrEqual(lexicalProjectRoot, lexicalOutputRoot)) {
    throw new ExportValidationError('Export outputDirectory resolves outside the project root');
  }

  let realProjectRoot;
  try {
    realProjectRoot = await fs.realpath(lexicalProjectRoot);
  } catch (error) {
    throw new ExportValidationError('Export projectRoot is unavailable', { cause: error });
  }
  let realOutputAncestor;
  try {
    realOutputAncestor = await realpathNearestExisting(lexicalOutputRoot);
  } catch (error) {
    throw new ExportValidationError('Export outputDirectory cannot be resolved safely', { cause: error });
  }
  if (!isPathInsideOrEqual(realProjectRoot, realOutputAncestor)) {
    throw new ExportValidationError('Export outputDirectory resolves outside the project root');
  }
  return lexicalOutputRoot;
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
    : (error?.code === 'EXPORT_VALIDATION_FAILED' ? 'EXPORT_VALIDATION_FAILED' : 'EXPORT_FAILED');
  return {
    code,
    message: String(error?.message || 'Export failed').slice(0, 500),
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
  normalizeExportRequest,
  serializeError,
};
