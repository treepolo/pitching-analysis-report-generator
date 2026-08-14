'use strict';

const {
  MediaPathPolicyError,
  normalizeProjectRelativePath,
} = require('./path-policy');

const MEDIA_KINDS = Object.freeze({
  VIDEO: 'video',
  IMAGE: 'image',
  UNKNOWN: 'unknown',
});

const ASSET_LIFECYCLE_STATUS = Object.freeze({
  DISCOVERED: 'discovered',
  METADATA_PENDING: 'metadata-pending',
  PROCESSING: 'processing',
  READY: 'ready',
  FAILED: 'failed',
  DISABLED: 'disabled',
  MISSING: 'missing',
});

const COMPATIBILITY = Object.freeze({
  DIRECT: 'direct',
  NEEDS_NORMALIZATION: 'needs-normalization',
  NORMALIZED: 'normalized',
  UNSUPPORTED: 'unsupported',
  UNPLAYABLE: 'unplayable',
  UNKNOWN: 'unknown',
  MISSING: 'missing',
});

const INSPECTION_STATUS = Object.freeze({
  METADATA_PENDING: 'metadata-pending',
  INSPECTED: 'inspected',
  UNKNOWN: 'unknown',
  UNPLAYABLE: 'unplayable',
});

const PLAYABILITY = Object.freeze({
  PLAYABLE: 'playable',
  UNPLAYABLE: 'unplayable',
  UNKNOWN: 'unknown',
});

const FRAME_TIMING = Object.freeze({
  CFR: 'cfr',
  VFR: 'vfr',
  UNKNOWN: 'unknown',
});

const NORMALIZATION_JOB_PHASES = Object.freeze([
  'inspect',
  'normalize',
  'verify',
  'register',
  'complete',
  'error',
]);

const NORMALIZATION_JOB_STATUS = Object.freeze({
  QUEUED: 'queued',
  RUNNING: 'running',
  CANCEL_REQUESTED: 'cancelRequested',
  CANCELLED: 'cancelled',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  RECOVERABLE: 'recoverable',
});

const ASSET_SCHEMA_VERSION = 1;
const JOB_SCHEMA_VERSION = 1;
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/iu;
const SUPPORTED_FRAME_TIMINGS = new Set(Object.values(FRAME_TIMING));
const SUPPORTED_MEDIA_KINDS = new Set(Object.values(MEDIA_KINDS));
const SUPPORTED_ASSET_STATUSES = new Set(Object.values(ASSET_LIFECYCLE_STATUS));
const SUPPORTED_COMPATIBILITIES = new Set(Object.values(COMPATIBILITY));
const SUPPORTED_INSPECTION_STATUSES = new Set(Object.values(INSPECTION_STATUS));
const SUPPORTED_PLAYABILITIES = new Set(Object.values(PLAYABILITY));
const SUPPORTED_JOB_PHASES = new Set(NORMALIZATION_JOB_PHASES);
const SUPPORTED_JOB_STATUSES = new Set(Object.values(NORMALIZATION_JOB_STATUS));

const SUPPORTED_FORMATS = Object.freeze([
  { extension: '.mp4', mimeType: 'video/mp4', kind: MEDIA_KINDS.VIDEO, format: 'mp4' },
  { extension: '.jpg', mimeType: 'image/jpeg', kind: MEDIA_KINDS.IMAGE, format: 'jpeg' },
  { extension: '.jpeg', mimeType: 'image/jpeg', kind: MEDIA_KINDS.IMAGE, format: 'jpeg' },
  { extension: '.png', mimeType: 'image/png', kind: MEDIA_KINDS.IMAGE, format: 'png' },
  { extension: '.gif', mimeType: 'image/gif', kind: MEDIA_KINDS.IMAGE, format: 'gif' },
  { extension: '.webp', mimeType: 'image/webp', kind: MEDIA_KINDS.IMAGE, format: 'webp' },
  { extension: '.avif', mimeType: 'image/avif', kind: MEDIA_KINDS.IMAGE, format: 'avif' },
  { extension: '.bmp', mimeType: 'image/bmp', kind: MEDIA_KINDS.IMAGE, format: 'bmp' },
  { extension: '.tif', mimeType: 'image/tiff', kind: MEDIA_KINDS.IMAGE, format: 'tiff' },
  { extension: '.tiff', mimeType: 'image/tiff', kind: MEDIA_KINDS.IMAGE, format: 'tiff' },
  { extension: '.svg', mimeType: 'image/svg+xml', kind: MEDIA_KINDS.IMAGE, format: 'svg' },
  { extension: '.ico', mimeType: 'image/x-icon', kind: MEDIA_KINDS.IMAGE, format: 'ico' },
]);

const UNSUPPORTED_FORMATS = Object.freeze([
  { extension: '.mov', mimeType: 'video/quicktime', kind: MEDIA_KINDS.VIDEO, format: 'mov' },
  { extension: '.mkv', mimeType: 'video/x-matroska', kind: MEDIA_KINDS.VIDEO, format: 'mkv' },
  { extension: '.avi', mimeType: 'video/x-msvideo', kind: MEDIA_KINDS.VIDEO, format: 'avi' },
  { extension: '.webm', mimeType: 'video/webm', kind: MEDIA_KINDS.VIDEO, format: 'webm' },
  { extension: '.m4v', mimeType: 'video/x-m4v', kind: MEDIA_KINDS.VIDEO, format: 'm4v' },
  { extension: '.heic', mimeType: 'image/heic', kind: MEDIA_KINDS.IMAGE, format: 'heic' },
  { extension: '.heif', mimeType: 'image/heif', kind: MEDIA_KINDS.IMAGE, format: 'heif' },
]);

const FORMAT_BY_EXTENSION = new Map(
  [...SUPPORTED_FORMATS, ...UNSUPPORTED_FORMATS].map((format) => [format.extension, format]),
);
const FORMAT_BY_MIME = new Map(
  [...SUPPORTED_FORMATS, ...UNSUPPORTED_FORMATS].map((format) => [format.mimeType, format]),
);

class MediaContractError extends Error {
  constructor(message, code = 'INVALID_MEDIA_CONTRACT') {
    super(message);
    this.name = 'MediaContractError';
    this.code = code;
  }
}

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function assertPlainRecord(value, fieldName) {
  if (!isPlainRecord(value)) {
    throw new MediaContractError(`${fieldName} must be an object`, 'OBJECT_REQUIRED');
  }
}

function normalizeText(value, fieldName, { maxLength = 255, allowEmpty = false } = {}) {
  if (typeof value !== 'string') {
    throw new MediaContractError(`${fieldName} must be text`, 'TEXT_REQUIRED');
  }
  if (CONTROL_CHARACTER_PATTERN.test(value)) {
    throw new MediaContractError(`${fieldName} contains a control character`, 'CONTROL_CHARACTER_NOT_ALLOWED');
  }
  if (!allowEmpty && value.length === 0) {
    throw new MediaContractError(`${fieldName} cannot be empty`, 'TEXT_EMPTY');
  }
  if (value.length > maxLength) {
    throw new MediaContractError(`${fieldName} is too long`, 'TEXT_TOO_LONG');
  }
  return value;
}

function normalizeOptionalText(value, fieldName, options = {}) {
  if (value === null || value === undefined) return null;
  return normalizeText(value, fieldName, { ...options, allowEmpty: true });
}

function normalizeId(value, fieldName) {
  const id = normalizeText(value, fieldName, { maxLength: 128 });
  if (!ID_PATTERN.test(id)) {
    throw new MediaContractError(`${fieldName} contains an unsafe identifier`, 'UNSAFE_IDENTIFIER');
  }
  return id;
}

function normalizeTimestamp(value, fieldName) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new MediaContractError(`${fieldName} must be an ISO timestamp`, 'TIMESTAMP_REQUIRED');
  }
  return value;
}

function timestampOrNow(value, fieldName) {
  return normalizeTimestamp(value === undefined ? new Date().toISOString() : value, fieldName);
}

function normalizeEnum(value, allowed, fieldName) {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new MediaContractError(`${fieldName} is invalid`, 'ENUM_VALUE_INVALID');
  }
  return value;
}

function normalizeNonNegativeNumber(value, fieldName, { integer = false } = {}) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new MediaContractError(`${fieldName} must be a non-negative number`, 'NUMBER_INVALID');
  }
  if (integer && !Number.isInteger(value)) {
    throw new MediaContractError(`${fieldName} must be an integer`, 'INTEGER_REQUIRED');
  }
  return value;
}

function normalizeChecksum(value, fieldName = 'checksumSha256') {
  if (value === null || value === undefined) return null;
  const checksum = normalizeText(value, fieldName, { maxLength: 64 }).toLowerCase();
  if (!SHA256_PATTERN.test(checksum)) {
    throw new MediaContractError(`${fieldName} must be a SHA-256 hex digest`, 'CHECKSUM_INVALID');
  }
  return checksum;
}

function normalizeMimeType(value) {
  if (value === null || value === undefined || value === '') return null;
  const mimeType = normalizeText(value, 'mimeType', { maxLength: 160 }).trim().toLowerCase();
  return mimeType.split(';', 1)[0].trim();
}

function extensionFromFileName(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const basename = value.replace(/\\/gu, '/').split('/').pop();
  if (!basename || basename === '.' || basename === '..') return null;
  const dotIndex = basename.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === basename.length - 1) return null;
  return basename.slice(dotIndex).toLowerCase();
}

function normalizeExtension(value) {
  if (value === null || value === undefined || value === '') return null;
  const extension = normalizeText(value, 'extension', { maxLength: 16 }).trim().toLowerCase();
  return extension.startsWith('.') ? extension : `.${extension}`;
}

function mediaInputParts(input) {
  if (typeof input === 'string') {
    return { fileName: input, mimeType: null, extension: null };
  }
  assertPlainRecord(input, 'Media input');
  return {
    fileName: input.fileName ?? input.name ?? input.path ?? null,
    mimeType: normalizeMimeType(input.mimeType),
    extension: normalizeExtension(input.extension),
  };
}

function descriptorResult(descriptor, { extension, mimeType, source, supported, reason = null }) {
  return {
    kind: descriptor?.kind ?? MEDIA_KINDS.UNKNOWN,
    format: descriptor?.format ?? null,
    extension: descriptor?.extension ?? extension,
    mimeType: descriptor?.mimeType ?? mimeType,
    supported,
    compatibilityHint: supported
      ? (descriptor.kind === MEDIA_KINDS.IMAGE ? COMPATIBILITY.DIRECT : COMPATIBILITY.UNKNOWN)
      : (reason === 'unsupported-format' ? COMPATIBILITY.UNSUPPORTED : COMPATIBILITY.UNKNOWN),
    source,
    reason,
  };
}

/**
 * Identify an input by extension and/or MIME type. This does not inspect bytes,
 * codecs, frame timing, or container headers; those belong to the inspection
 * stage owned by a future media worker.
 */
function detectMediaType(input) {
  const parts = mediaInputParts(input);
  const extension = parts.extension ?? extensionFromFileName(parts.fileName);
  const mimeType = parts.mimeType;
  const extensionDescriptor = extension ? FORMAT_BY_EXTENSION.get(extension) : null;
  const mimeDescriptor = mimeType ? FORMAT_BY_MIME.get(mimeType) : null;

  if (extensionDescriptor && mimeDescriptor
    && (extensionDescriptor.kind !== mimeDescriptor.kind
      || extensionDescriptor.format !== mimeDescriptor.format)) {
    return descriptorResult(null, {
      extension,
      mimeType,
      source: 'extension+mime',
      supported: false,
      reason: 'metadata-conflict',
    });
  }

  const descriptor = extensionDescriptor ?? mimeDescriptor;
  if (descriptor) {
    const supported = SUPPORTED_FORMATS.includes(descriptor);
    return descriptorResult(descriptor, {
      extension,
      mimeType: mimeType ?? descriptor.mimeType,
      source: extensionDescriptor && mimeDescriptor ? 'extension+mime' : (extensionDescriptor ? 'extension' : 'mime'),
      supported,
      reason: supported ? null : 'unsupported-format',
    });
  }

  const broadKind = mimeType?.startsWith('video/')
    ? MEDIA_KINDS.VIDEO
    : mimeType?.startsWith('image/') ? MEDIA_KINDS.IMAGE : MEDIA_KINDS.UNKNOWN;
  return descriptorResult(null, {
    extension,
    mimeType,
    source: 'unknown',
    supported: false,
    reason: broadKind === MEDIA_KINDS.UNKNOWN ? 'unknown-format' : 'unsupported-format',
  });
}

function safeOutputFileName(value, extension = null) {
  const candidate = normalizeText(String(value ?? ''), 'displayName', { maxLength: 255 })
    .replace(/[\\/]/gu, '_')
    .replace(/[<>:"|?*]/gu, '_')
    .replace(/[\u0000-\u001f\u007f]/gu, '_')
    .replace(/\s+/gu, ' ')
    .trim();
  const safe = candidate.replace(/^\.+$/u, '').slice(0, 180) || 'media';
  const normalizedExtension = extension ? normalizeExtension(extension) : null;
  if (normalizedExtension && !safe.toLowerCase().endsWith(normalizedExtension)) {
    return `${safe}${normalizedExtension}`.slice(0, 190);
  }
  return safe;
}

function normalizeReference(value, role, { nullable = false } = {}) {
  if (value === null || value === undefined) {
    if (nullable) return null;
    throw new MediaContractError(`${role} reference is required`, 'REFERENCE_REQUIRED');
  }

  const input = typeof value === 'string' ? { relativePath: value } : value;
  assertPlainRecord(input, `${role} reference`);
  if (input.role !== undefined && input.role !== role) {
    throw new MediaContractError(`${role} reference has the wrong role`, 'REFERENCE_ROLE_INVALID');
  }

  let relativePath;
  try {
    relativePath = normalizeProjectRelativePath(input.relativePath ?? input.path, `${role} relativePath`);
  } catch (error) {
    if (error instanceof MediaPathPolicyError) {
      throw new MediaContractError(error.message, error.code);
    }
    throw error;
  }

  return {
    role,
    relativePath,
    byteSize: normalizeNonNegativeNumber(input.byteSize, `${role} byteSize`, { integer: true }),
    checksumSha256: normalizeChecksum(input.checksumSha256, `${role} checksumSha256`),
    mediaType: normalizeMimeType(input.mediaType),
  };
}

function createSourceReference(value, details = {}) {
  const input = typeof value === 'string' ? { ...details, relativePath: value } : value;
  return normalizeReference(input, 'source');
}

function createNormalizedReference(value, details = {}) {
  const input = typeof value === 'string' ? { ...details, relativePath: value } : value;
  return normalizeReference(input, 'normalized');
}

function normalizeFrameRate(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return normalizeNonNegativeNumber(value, 'fps');
  if (isPlainRecord(value)) {
    const numerator = normalizeNonNegativeNumber(value.numerator, 'frameRate numerator', { integer: true });
    const denominator = normalizeNonNegativeNumber(value.denominator, 'frameRate denominator', { integer: true });
    if (numerator === null || denominator === null || denominator === 0) {
      throw new MediaContractError('frameRate must have a non-zero denominator', 'FRAME_RATE_INVALID');
    }
    return numerator / denominator;
  }
  throw new MediaContractError('fps must be a number or rational object', 'FRAME_RATE_INVALID');
}

function normalizeMediaMetadata(value = {}, detected = null) {
  assertPlainRecord(value, 'Media metadata');
  const resolution = isPlainRecord(value.resolution) ? value.resolution : {};
  const frameTimingValue = value.frameTiming ?? value.timing ?? FRAME_TIMING.UNKNOWN;
  const frameTiming = normalizeEnum(
    typeof frameTimingValue === 'string' ? frameTimingValue.toLowerCase() : frameTimingValue,
    SUPPORTED_FRAME_TIMINGS,
    'frameTiming',
  );
  const detectedExtension = detected?.extension ?? null;
  const detectedMimeType = detected?.mimeType ?? null;
  const extension = normalizeExtension(value.extension ?? detectedExtension);
  const mimeType = normalizeMimeType(value.mimeType ?? detectedMimeType);

  return {
    fileName: normalizeOptionalText(value.fileName, 'metadata fileName', { maxLength: 255 }),
    extension,
    mimeType,
    byteSize: normalizeNonNegativeNumber(value.byteSize, 'metadata byteSize', { integer: true }),
    durationSeconds: normalizeNonNegativeNumber(
      value.durationSeconds ?? value.duration,
      'metadata durationSeconds',
    ),
    width: normalizeNonNegativeNumber(value.width ?? resolution.width, 'metadata width', { integer: true }),
    height: normalizeNonNegativeNumber(value.height ?? resolution.height, 'metadata height', { integer: true }),
    fps: normalizeFrameRate(value.fps ?? value.frameRate),
    frameTiming,
    codec: normalizeOptionalText(value.codec, 'metadata codec', { maxLength: 120 }),
    container: normalizeOptionalText(value.container, 'metadata container', { maxLength: 120 }),
  };
}

function normalizeAssetDerived(value, displayName, extension) {
  const input = value === undefined ? {} : value;
  assertPlainRecord(input, 'Asset derived metadata');
  const referenceCount = normalizeNonNegativeNumber(input.referenceCount ?? 0, 'referenceCount', { integer: true });
  return {
    safeFileName: safeOutputFileName(input.safeFileName ?? displayName, extension),
    referenceCount,
  };
}

function normalizeMediaAsset(input) {
  assertPlainRecord(input, 'Media asset');
  if (input.schemaVersion !== ASSET_SCHEMA_VERSION) {
    throw new MediaContractError('Unsupported media asset schema', 'SCHEMA_VERSION_UNSUPPORTED');
  }

  const id = normalizeId(input.id, 'asset id');
  const projectId = normalizeId(input.projectId, 'project id');
  const displayName = normalizeText(input.displayName, 'displayName', { maxLength: 255 });
  const detected = input.detectedType ?? detectMediaType({
    fileName: input.fileName ?? input.metadata?.fileName ?? displayName,
    mimeType: input.mediaType ?? input.metadata?.mimeType,
  });
  const mediaKind = normalizeEnum(input.mediaKind ?? detected.kind, SUPPORTED_MEDIA_KINDS, 'mediaKind');
  const metadata = normalizeMediaMetadata(input.metadata ?? {}, detected);
  const sourceReference = normalizeReference(input.sourceReference, 'source');
  const normalizedReference = normalizeReference(input.normalizedReference, 'normalized', { nullable: true });
  const compatibility = normalizeEnum(
    input.compatibility ?? (
      detected.supported === false && detected.reason === 'unsupported-format'
        ? COMPATIBILITY.UNSUPPORTED
        : COMPATIBILITY.UNKNOWN
    ),
    SUPPORTED_COMPATIBILITIES,
    'compatibility',
  );
  const lifecycleStatus = normalizeEnum(
    input.lifecycleStatus ?? input.status ?? ASSET_LIFECYCLE_STATUS.PROCESSING,
    SUPPORTED_ASSET_STATUSES,
    'lifecycleStatus',
  );
  const inspectionStatus = normalizeEnum(
    input.inspectionStatus ?? (
      lifecycleStatus === ASSET_LIFECYCLE_STATUS.READY
        ? INSPECTION_STATUS.INSPECTED
        : INSPECTION_STATUS.METADATA_PENDING
    ),
    SUPPORTED_INSPECTION_STATUSES,
    'inspectionStatus',
  );
  const playability = normalizeEnum(
    input.playability ?? (
      lifecycleStatus === ASSET_LIFECYCLE_STATUS.READY
        && [COMPATIBILITY.DIRECT, COMPATIBILITY.NORMALIZED].includes(input.compatibility)
        ? PLAYABILITY.PLAYABLE
        : PLAYABILITY.UNKNOWN
    ),
    SUPPORTED_PLAYABILITIES,
    'playability',
  );
  const userLabel = normalizeOptionalText(input.userLabel, 'userLabel', { maxLength: 255 });
  const derived = normalizeAssetDerived(input.derived, displayName, metadata.extension ?? detected.extension);
  const mediaType = normalizeMimeType(input.mediaType ?? metadata.mimeType ?? detected.mimeType);

  if (compatibility === COMPATIBILITY.NORMALIZED && normalizedReference === null) {
    throw new MediaContractError('Normalized compatibility requires a normalized reference', 'NORMALIZED_REFERENCE_REQUIRED');
  }
  if (normalizedReference !== null
    && normalizedReference.relativePath === sourceReference.relativePath) {
    throw new MediaContractError('Source and normalized references must be different', 'REFERENCE_COLLISION');
  }
  if (normalizedReference !== null && compatibility === COMPATIBILITY.DIRECT) {
    throw new MediaContractError('Direct compatibility cannot have a normalized reference', 'DIRECT_REFERENCE_CONFLICT');
  }
  if (lifecycleStatus === ASSET_LIFECYCLE_STATUS.MISSING && compatibility !== COMPATIBILITY.MISSING) {
    throw new MediaContractError('Missing media must use missing compatibility', 'MISSING_COMPATIBILITY_REQUIRED');
  }
  if (lifecycleStatus === ASSET_LIFECYCLE_STATUS.READY
    && inspectionStatus !== INSPECTION_STATUS.INSPECTED) {
    throw new MediaContractError('Ready media must have completed inspection', 'READY_INSPECTION_REQUIRED');
  }
  if (lifecycleStatus === ASSET_LIFECYCLE_STATUS.READY
    && ![COMPATIBILITY.DIRECT, COMPATIBILITY.NORMALIZED].includes(compatibility)) {
    throw new MediaContractError('Ready media must have verified compatibility', 'READY_COMPATIBILITY_REQUIRED');
  }
  if (compatibility === COMPATIBILITY.UNPLAYABLE && playability !== PLAYABILITY.UNPLAYABLE) {
    throw new MediaContractError('Unplayable compatibility requires unplayable playability', 'UNPLAYABLE_STATE_MISMATCH');
  }
  if (inspectionStatus === INSPECTION_STATUS.UNPLAYABLE && playability !== PLAYABILITY.UNPLAYABLE) {
    throw new MediaContractError('Unplayable inspection requires unplayable playability', 'UNPLAYABLE_INSPECTION_MISMATCH');
  }

  return {
    schemaVersion: ASSET_SCHEMA_VERSION,
    id,
    projectId,
    displayName,
    mediaKind,
    mediaType,
    sourceReference,
    normalizedReference,
    metadata,
    compatibility,
    lifecycleStatus,
    inspectionStatus,
    playability,
    userLabel,
    derived,
  };
}

function createMediaAsset(input) {
  assertPlainRecord(input, 'Media asset input');
  return normalizeMediaAsset({
    schemaVersion: ASSET_SCHEMA_VERSION,
    id: input.id,
    projectId: input.projectId,
    displayName: input.displayName ?? input.fileName,
    fileName: input.fileName,
    mediaKind: input.mediaKind,
    mediaType: input.mediaType ?? input.mimeType,
    sourceReference: input.sourceReference ?? input.sourcePath ?? input.relativePath,
    normalizedReference: input.normalizedReference ?? null,
    metadata: input.metadata ?? {},
    compatibility: input.compatibility,
    lifecycleStatus: input.lifecycleStatus ?? input.status,
    inspectionStatus: input.inspectionStatus,
    playability: input.playability,
    userLabel: input.userLabel,
    derived: input.derived,
  });
}

function updateMediaAsset(asset, patch) {
  const current = normalizeMediaAsset(asset);
  assertPlainRecord(patch, 'Media asset patch');
  return normalizeMediaAsset({
    ...current,
    ...cloneJson(patch),
    schemaVersion: ASSET_SCHEMA_VERSION,
    metadata: patch.metadata === undefined ? current.metadata : { ...current.metadata, ...patch.metadata },
    derived: patch.derived === undefined ? current.derived : { ...current.derived, ...patch.derived },
    lifecycleStatus: patch.lifecycleStatus ?? patch.status ?? current.lifecycleStatus,
  });
}

function normalizeVerification(value) {
  assertPlainRecord(value, 'Normalization verification');
  if (value.verified !== true) {
    throw new MediaContractError('Normalization verification must be explicitly verified', 'VERIFICATION_REQUIRED');
  }
  const verifiedAt = normalizeTimestamp(value.verifiedAt, 'verifiedAt');
  assertPlainRecord(value.metadata, 'Normalization verification metadata');
  if (Object.keys(value.metadata).length === 0) {
    throw new MediaContractError('Normalization verification metadata cannot be empty', 'VERIFICATION_METADATA_REQUIRED');
  }
  return {
    verified: true,
    verifiedAt,
    metadata: cloneJson(value.metadata),
    checksumSha256: normalizeChecksum(value.checksumSha256),
  };
}

/**
 * Apply a result produced by a real normalization/verification worker. The
 * domain never creates a normalized reference or success state by itself.
 */
function applyVerifiedNormalization(asset, result) {
  const current = normalizeMediaAsset(asset);
  assertPlainRecord(result, 'Normalization result');
  const verification = normalizeVerification(result.verification);
  const normalizedReference = createNormalizedReference(result.normalizedReference);
  const metadata = normalizeMediaMetadata(result.metadata ?? verification.metadata, {
    extension: normalizedReference.relativePath.includes('.')
      ? extensionFromFileName(normalizedReference.relativePath)
      : current.metadata.extension,
    mimeType: current.mediaType,
  });
  return updateMediaAsset(current, {
    normalizedReference,
    metadata,
    compatibility: COMPATIBILITY.NORMALIZED,
    lifecycleStatus: ASSET_LIFECYCLE_STATUS.READY,
    inspectionStatus: INSPECTION_STATUS.INSPECTED,
    playability: PLAYABILITY.PLAYABLE,
  });
}

function normalizeCounts(value = {}) {
  assertPlainRecord(value, 'Job counts');
  return {
    success: normalizeNonNegativeNumber(value.success ?? 0, 'success count', { integer: true }),
    skipped: normalizeNonNegativeNumber(value.skipped ?? 0, 'skipped count', { integer: true }),
    failed: normalizeNonNegativeNumber(value.failed ?? 0, 'failed count', { integer: true }),
  };
}

function normalizeWarnings(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new MediaContractError('warnings must be an array', 'WARNINGS_INVALID');
  return value.map((warning, index) => normalizeText(warning, `warning ${index + 1}`, { maxLength: 500 }));
}

function normalizeJobError(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    return { code: 'MEDIA_JOB_FAILED', message: normalizeText(value, 'error message', { maxLength: 1000 }) };
  }
  assertPlainRecord(value, 'Job error');
  return {
    code: normalizeOptionalText(value.code, 'error code', { maxLength: 120 }),
    message: normalizeText(value.message, 'error message', { maxLength: 1000 }),
  };
}

function normalizeVerificationOptional(value) {
  if (value === null || value === undefined) return null;
  return normalizeVerification(value);
}

function normalizeAttempts(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new MediaContractError('attempts must be an array', 'ATTEMPTS_INVALID');
  return value.map((attempt, index) => {
    assertPlainRecord(attempt, `attempt ${index + 1}`);
    const number = normalizeNonNegativeNumber(attempt.number, `attempt ${index + 1} number`, { integer: true });
    if (number === null || number < 1) {
      throw new MediaContractError(`attempt ${index + 1} number is invalid`, 'ATTEMPT_NUMBER_INVALID');
    }
    const status = normalizeEnum(
      attempt.status,
      new Set(['running', 'succeeded', 'failed', 'recoverable', 'cancelled']),
      `attempt ${index + 1} status`,
    );
    return {
      number,
      startedAt: normalizeTimestamp(attempt.startedAt, `attempt ${index + 1} startedAt`),
      completedAt: attempt.completedAt === null || attempt.completedAt === undefined
        ? null
        : normalizeTimestamp(attempt.completedAt, `attempt ${index + 1} completedAt`),
      status,
      error: normalizeJobError(attempt.error),
    };
  });
}

function normalizeHistory(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new MediaContractError('history must be an array', 'HISTORY_INVALID');
  return value.map((event, index) => {
    assertPlainRecord(event, `history event ${index + 1}`);
    return {
      action: normalizeText(event.action, `history event ${index + 1} action`, { maxLength: 40 }),
      at: normalizeTimestamp(event.at, `history event ${index + 1} at`),
      fromStatus: normalizeEnum(event.fromStatus, SUPPORTED_JOB_STATUSES, 'history fromStatus'),
      toStatus: normalizeEnum(event.toStatus, SUPPORTED_JOB_STATUSES, 'history toStatus'),
      fromPhase: normalizeEnum(event.fromPhase, SUPPORTED_JOB_PHASES, 'history fromPhase'),
      toPhase: normalizeEnum(event.toPhase, SUPPORTED_JOB_PHASES, 'history toPhase'),
      processed: normalizeNonNegativeNumber(event.processed, 'history processed', { integer: true }),
      total: normalizeNonNegativeNumber(event.total, 'history total', { integer: true }),
    };
  });
}

function normalizeNormalizationJob(input) {
  assertPlainRecord(input, 'Normalization job');
  if (input.schemaVersion !== JOB_SCHEMA_VERSION) {
    throw new MediaContractError('Unsupported normalization job schema', 'SCHEMA_VERSION_UNSUPPORTED');
  }

  const id = normalizeId(input.id, 'job id');
  const projectId = normalizeId(input.projectId, 'project id');
  const assetId = normalizeId(input.assetId, 'asset id');
  const status = normalizeEnum(input.status, SUPPORTED_JOB_STATUSES, 'job status');
  const phase = normalizeEnum(input.phase, SUPPORTED_JOB_PHASES, 'job phase');
  const total = normalizeNonNegativeNumber(input.total, 'job total', { integer: true });
  const processed = normalizeNonNegativeNumber(input.processed ?? 0, 'job processed', { integer: true });
  if (total === null || total < 1 || processed === null || processed > total) {
    throw new MediaContractError('Job progress is invalid', 'JOB_PROGRESS_INVALID');
  }

  const counts = normalizeCounts(input.counts);
  if (counts.success + counts.skipped + counts.failed > processed) {
    throw new MediaContractError('Job counts exceed processed progress', 'JOB_COUNTS_INVALID');
  }
  const sourceReference = normalizeReference(input.sourceReference, 'source');
  const normalizedReference = normalizeReference(input.normalizedReference, 'normalized', { nullable: true });
  const resultLocation = normalizeReference(input.resultLocation, 'result', { nullable: true });
  const createdAt = normalizeTimestamp(input.createdAt, 'createdAt');
  const updatedAt = normalizeTimestamp(input.updatedAt, 'updatedAt');
  const startedAt = input.startedAt === null || input.startedAt === undefined
    ? null : normalizeTimestamp(input.startedAt, 'startedAt');
  const completedAt = input.completedAt === null || input.completedAt === undefined
    ? null : normalizeTimestamp(input.completedAt, 'completedAt');
  const retryCount = normalizeNonNegativeNumber(input.retryCount ?? 0, 'retryCount', { integer: true });
  const verification = normalizeVerificationOptional(input.verification);
  const warnings = normalizeWarnings(input.warnings);
  const error = normalizeJobError(input.error);
  const attempts = normalizeAttempts(input.attempts);
  const history = normalizeHistory(input.history);
  const cancelRequested = input.cancelRequested === true;

  if (status === NORMALIZATION_JOB_STATUS.SUCCEEDED) {
    if (phase !== 'complete' || processed !== total || normalizedReference === null
      || resultLocation === null || verification === null || verification.verified !== true) {
      throw new MediaContractError('Succeeded job is missing verification evidence', 'SUCCESS_EVIDENCE_REQUIRED');
    }
  }
  if (status === NORMALIZATION_JOB_STATUS.CANCELLED && completedAt === null) {
    throw new MediaContractError('Cancelled job must have completedAt', 'CANCELLED_TIMESTAMP_REQUIRED');
  }
  if ([NORMALIZATION_JOB_STATUS.FAILED, NORMALIZATION_JOB_STATUS.RECOVERABLE].includes(status)
    && (phase !== 'error' || error === null)) {
    throw new MediaContractError('Failed job must have an error phase and detail', 'FAILED_ERROR_REQUIRED');
  }
  if (normalizedReference !== null && resultLocation !== null
    && normalizedReference.relativePath !== resultLocation.relativePath) {
    throw new MediaContractError('Result location must match normalized reference', 'RESULT_REFERENCE_MISMATCH');
  }
  if (normalizedReference !== null
    && normalizedReference.relativePath === sourceReference.relativePath) {
    throw new MediaContractError('Source and normalized references must be different', 'REFERENCE_COLLISION');
  }

  return {
    schemaVersion: JOB_SCHEMA_VERSION,
    id,
    projectId,
    assetId,
    status,
    phase,
    processed,
    total,
    counts,
    warnings,
    error,
    cancelRequested,
    sourceReference,
    normalizedReference,
    resultLocation,
    verification,
    retryCount,
    attempts,
    history,
    createdAt,
    startedAt,
    completedAt,
    updatedAt,
  };
}

function createNormalizationJob(input) {
  assertPlainRecord(input, 'Normalization job input');
  const createdAt = timestampOrNow(input.createdAt ?? input.now, 'createdAt');
  const sourceReference = input.sourceReference ?? input.asset?.sourceReference;
  return normalizeNormalizationJob({
    schemaVersion: JOB_SCHEMA_VERSION,
    id: input.id,
    projectId: input.projectId ?? input.asset?.projectId,
    assetId: input.assetId ?? input.asset?.id,
    status: NORMALIZATION_JOB_STATUS.QUEUED,
    phase: 'inspect',
    processed: 0,
    total: input.total ?? 1,
    counts: { success: 0, skipped: 0, failed: 0 },
    warnings: [],
    error: null,
    cancelRequested: false,
    sourceReference,
    normalizedReference: null,
    resultLocation: null,
    verification: null,
    retryCount: 0,
    attempts: [],
    history: [],
    createdAt,
    startedAt: null,
    completedAt: null,
    updatedAt: createdAt,
  });
}

function appendHistory(job, action, at, next) {
  return [
    ...job.history,
    {
      action,
      at,
      fromStatus: job.status,
      toStatus: next.status,
      fromPhase: job.phase,
      toPhase: next.phase,
      processed: next.processed,
      total: next.total,
    },
  ];
}

function finishCurrentAttempt(attempts, at, status, error = null) {
  if (attempts.length === 0) return attempts;
  const next = attempts.map((attempt) => ({ ...attempt }));
  const lastIndex = next.length - 1;
  const last = next[lastIndex];
  if (last.completedAt !== null) return next;
  next[lastIndex] = {
    ...last,
    completedAt: at,
    status,
    error: error === null ? null : normalizeJobError(error),
  };
  return next;
}

function nextPhase(phase) {
  const index = ['inspect', 'normalize', 'verify', 'register'].indexOf(phase);
  return index === -1 ? null : ['inspect', 'normalize', 'verify', 'register'][index + 1] ?? null;
}

function transitionNormalizationJob(job, action, details = {}) {
  const current = normalizeNormalizationJob(job);
  const at = timestampOrNow(details.at ?? details.now, 'job transition timestamp');
  const next = { ...current };

  switch (action) {
    case 'start': {
      if (current.status !== NORMALIZATION_JOB_STATUS.QUEUED) {
        throw new MediaContractError('Only queued jobs can start', 'JOB_TRANSITION_INVALID');
      }
      next.status = NORMALIZATION_JOB_STATUS.RUNNING;
      next.startedAt = at;
      next.completedAt = null;
      next.cancelRequested = false;
      next.attempts = [
        ...current.attempts,
        {
          number: current.retryCount + 1,
          startedAt: at,
          completedAt: null,
          status: 'running',
          error: null,
        },
      ];
      break;
    }
    case 'progress': {
      if (current.status !== NORMALIZATION_JOB_STATUS.RUNNING) {
        throw new MediaContractError('Only running jobs can report progress', 'JOB_TRANSITION_INVALID');
      }
      const processed = details.processed ?? current.processed;
      const counts = details.counts === undefined ? current.counts : normalizeCounts(details.counts);
      const total = details.total ?? current.total;
      if (!Number.isInteger(total) || total < 1 || total !== current.total
        || !Number.isInteger(processed) || processed < current.processed || processed > total
        || counts.success + counts.skipped + counts.failed > processed) {
        throw new MediaContractError('Progress update is invalid', 'JOB_PROGRESS_INVALID');
      }
      next.processed = processed;
      next.counts = counts;
      if (details.warnings !== undefined) {
        next.warnings = [...current.warnings, ...normalizeWarnings(details.warnings)];
      }
      break;
    }
    case 'advance': {
      if (current.status !== NORMALIZATION_JOB_STATUS.RUNNING) {
        throw new MediaContractError('Only running jobs can advance phase', 'JOB_TRANSITION_INVALID');
      }
      const targetPhase = details.phase ?? nextPhase(current.phase);
      if (!['normalize', 'verify', 'register'].includes(targetPhase)
        || targetPhase !== nextPhase(current.phase)) {
        throw new MediaContractError('Normalization phase must advance in order', 'JOB_PHASE_INVALID');
      }
      next.phase = targetPhase;
      break;
    }
    case 'request-cancel': {
      if (![NORMALIZATION_JOB_STATUS.QUEUED, NORMALIZATION_JOB_STATUS.RUNNING].includes(current.status)) {
        throw new MediaContractError('Only queued or running jobs can be cancelled', 'JOB_TRANSITION_INVALID');
      }
      next.status = NORMALIZATION_JOB_STATUS.CANCEL_REQUESTED;
      next.cancelRequested = true;
      break;
    }
    case 'cancel': {
      if (current.status !== NORMALIZATION_JOB_STATUS.CANCEL_REQUESTED) {
        throw new MediaContractError('Cancellation must be requested first', 'JOB_TRANSITION_INVALID');
      }
      next.status = NORMALIZATION_JOB_STATUS.CANCELLED;
      next.cancelRequested = true;
      next.completedAt = at;
      next.attempts = finishCurrentAttempt(current.attempts, at, 'cancelled');
      break;
    }
    case 'fail': {
      if (![NORMALIZATION_JOB_STATUS.RUNNING, NORMALIZATION_JOB_STATUS.CANCEL_REQUESTED].includes(current.status)) {
        throw new MediaContractError('Only active jobs can fail', 'JOB_TRANSITION_INVALID');
      }
      const error = normalizeJobError(details.error);
      if (error === null) throw new MediaContractError('Failure detail is required', 'FAILED_ERROR_REQUIRED');
      next.status = details.recoverable === true
        ? NORMALIZATION_JOB_STATUS.RECOVERABLE
        : NORMALIZATION_JOB_STATUS.FAILED;
      next.phase = 'error';
      next.error = error;
      next.completedAt = at;
      next.attempts = finishCurrentAttempt(current.attempts, at, next.status, error);
      break;
    }
    case 'succeed': {
      if (current.status !== NORMALIZATION_JOB_STATUS.RUNNING || current.phase !== 'register') {
        throw new MediaContractError('A job must reach register before succeeding', 'JOB_TRANSITION_INVALID');
      }
      const normalizedReference = createNormalizedReference(details.normalizedReference);
      const verification = normalizeVerification(details.verification);
      next.status = NORMALIZATION_JOB_STATUS.SUCCEEDED;
      next.phase = 'complete';
      next.processed = current.total;
      next.counts = { success: current.total, skipped: 0, failed: 0 };
      next.normalizedReference = normalizedReference;
      next.resultLocation = {
        ...normalizedReference,
        role: 'result',
      };
      next.verification = verification;
      next.error = null;
      next.cancelRequested = false;
      next.completedAt = at;
      next.attempts = finishCurrentAttempt(current.attempts, at, 'succeeded');
      break;
    }
    case 'retry': {
      if (![NORMALIZATION_JOB_STATUS.FAILED, NORMALIZATION_JOB_STATUS.RECOVERABLE, NORMALIZATION_JOB_STATUS.CANCELLED].includes(current.status)) {
        throw new MediaContractError('Only terminal jobs can be retried', 'JOB_TRANSITION_INVALID');
      }
      next.status = NORMALIZATION_JOB_STATUS.QUEUED;
      next.phase = 'inspect';
      next.processed = 0;
      next.counts = { success: 0, skipped: 0, failed: 0 };
      next.error = null;
      next.cancelRequested = false;
      next.normalizedReference = null;
      next.resultLocation = null;
      next.verification = null;
      next.retryCount = current.retryCount + 1;
      next.startedAt = null;
      next.completedAt = null;
      break;
    }
    default:
      throw new MediaContractError(`Unknown normalization job action: ${action}`, 'JOB_ACTION_INVALID');
  }

  next.updatedAt = at;
  next.history = appendHistory(current, action, at, next);
  return normalizeNormalizationJob(next);
}

function startNormalizationJob(job, details = {}) {
  return transitionNormalizationJob(job, 'start', details);
}

function updateNormalizationJobProgress(job, details = {}) {
  return transitionNormalizationJob(job, 'progress', details);
}

function advanceNormalizationJob(job, details = {}) {
  return transitionNormalizationJob(job, 'advance', details);
}

function requestNormalizationCancellation(job, details = {}) {
  return transitionNormalizationJob(job, 'request-cancel', details);
}

function cancelNormalizationJob(job, details = {}) {
  return transitionNormalizationJob(job, 'cancel', details);
}

function failNormalizationJob(job, details = {}) {
  return transitionNormalizationJob(job, 'fail', details);
}

function retryNormalizationJob(job, details = {}) {
  return transitionNormalizationJob(job, 'retry', details);
}

function completeNormalizationJob(job, details = {}) {
  return transitionNormalizationJob(job, 'succeed', details);
}

module.exports = Object.freeze({
  ASSET_LIFECYCLE_STATUS,
  ASSET_SCHEMA_VERSION,
  COMPATIBILITY,
  FRAME_TIMING,
  INSPECTION_STATUS,
  JOB_SCHEMA_VERSION,
  MEDIA_KINDS,
  NORMALIZATION_JOB_PHASES,
  NORMALIZATION_JOB_STATUS,
  PLAYABILITY,
  SUPPORTED_FORMATS,
  SUPPORTED_IMAGE_FORMATS: SUPPORTED_FORMATS.filter((format) => format.kind === MEDIA_KINDS.IMAGE),
  UNSUPPORTED_FORMATS,
  MediaContractError,
  applyVerifiedNormalization,
  advanceNormalizationJob,
  cancelNormalizationJob,
  completeNormalizationJob,
  createMediaAsset,
  createNormalizedReference,
  createNormalizationJob,
  createSourceReference,
  detectMediaType,
  failNormalizationJob,
  normalizeMediaAsset,
  normalizeMediaMetadata,
  normalizeNormalizationJob,
  normalizeProjectRelativePath,
  normalizeReference,
  retryNormalizationJob,
  safeOutputFileName,
  startNormalizationJob,
  transitionNormalizationJob,
  updateMediaAsset,
  updateNormalizationJobProgress,
  requestNormalizationCancellation,
});
