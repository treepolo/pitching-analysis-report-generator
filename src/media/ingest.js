'use strict';

const { constants: fsConstants, createReadStream } = require('node:fs');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const {
  MediaPathPolicyError,
  isPathInside,
  normalizeProjectRelativePath,
  resolveProjectRelativePath,
  toProjectRelativePath,
} = require('./path-policy');
const {
  COMPATIBILITY,
  INSPECTION_STATUS,
  MEDIA_KINDS,
  PLAYABILITY,
  ASSET_LIFECYCLE_STATUS,
  MediaContractError,
  createMediaAsset,
  createSourceReference,
  detectMediaType,
  normalizeMediaMetadata,
  normalizeReference,
  safeOutputFileName,
} = require('./contract');

const INGEST_SCHEMA_VERSION = 1;
const INSPECTION_SCHEMA_VERSION = 1;
const DEFAULT_HEADER_BYTES = 512;
const MAX_HEADER_BYTES = 4096;
const SAFE_IDENTIFIER_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u;

const MP4_BRANDS = new Set([
  'avc1',
  'iso2',
  'iso3',
  'iso4',
  'iso5',
  'iso6',
  'isom',
  'mmp4',
  'mp41',
  'mp42',
  '3gp4',
  '3gp5',
]);
const AVIF_BRANDS = new Set(['avif', 'avis']);
const UNSUPPORTED_VIDEO_BRANDS = new Set(['qt  ', 'm4v ']);
const UNSUPPORTED_IMAGE_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1']);

class MediaIngestError extends Error {
  constructor(message, code = 'MEDIA_INGEST_FAILED') {
    super(message);
    this.name = 'MediaIngestError';
    this.code = code;
  }
}

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireRecord(value, fieldName) {
  if (!isPlainRecord(value)) throw new MediaIngestError(`${fieldName} must be an object`, 'OBJECT_REQUIRED');
  return value;
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeInputText(value, fieldName, { required = false, maxLength = 255 } = {}) {
  if (value === null || value === undefined) {
    if (required) throw new MediaIngestError(`${fieldName} is required`, 'FIELD_REQUIRED');
    return null;
  }
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new MediaIngestError(`${fieldName} is invalid`, 'FIELD_INVALID');
  }
  return value;
}

function normalizeIdentifier(value, fieldName) {
  const identifier = normalizeInputText(value, fieldName, { required: true, maxLength: 128 });
  if (!SAFE_IDENTIFIER_PATTERN.test(identifier)) {
    throw new MediaIngestError(`${fieldName} contains an unsafe identifier`, 'IDENTIFIER_INVALID');
  }
  return identifier;
}

function normalizeProjectRoot(projectRoot) {
  if (typeof projectRoot !== 'string' || projectRoot.trim() === '') {
    throw new MediaIngestError('Project root is required', 'PROJECT_ROOT_REQUIRED');
  }
  return path.resolve(projectRoot);
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('error', reject);
    stream.once('end', () => resolve(hash.digest('hex')));
  });
}

async function assertProjectTargetSafe(projectRoot, targetPath) {
  const root = normalizeProjectRoot(projectRoot);
  let current = path.resolve(targetPath);
  if (!isPathInside(root, current) || current === root) {
    throw new MediaPathPolicyError('Media target is outside the project root', 'PATH_OUTSIDE_PROJECT_ROOT');
  }
  while (true) {
    let stats;
    try {
      stats = await fs.lstat(current);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new MediaPathPolicyError('Media target cannot be inspected', 'TARGET_UNAVAILABLE');
      }
      if (current === root) return;
      const parent = path.dirname(current);
      if (parent === current) return;
      current = parent;
      continue;
    }
    if (stats.isSymbolicLink()) {
      throw new MediaPathPolicyError('Media target must not contain a symbolic link', 'TARGET_SYMLINK_NOT_ALLOWED');
    }
    const realCurrent = await fs.realpath(current).catch(() => null);
    if (!realCurrent || !isPathInside(root, realCurrent)) {
      throw new MediaPathPolicyError('Media target resolves outside the project root', 'REALPATH_OUTSIDE_PROJECT_ROOT');
    }
    if (current === root) return;
    return;
  }
}

function toByteBuffer(value) {
  if (value === null || value === undefined) return null;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new MediaIngestError('bytes must be a Buffer or Uint8Array', 'BYTES_INVALID');
}

function ascii(bytes, start, end) {
  if (bytes.length < end) return null;
  return bytes.subarray(start, end).toString('ascii');
}

function hasBytes(bytes, values, offset = 0) {
  if (bytes.length < offset + values.length) return false;
  return values.every((value, index) => bytes[offset + index] === value);
}

function signatureResult({ kind, format, mimeType, container, supported = true, reason = null, ...details }) {
  return {
    matched: true,
    kind,
    format,
    mimeType,
    container,
    supported,
    reason,
    evidence: 'magic-bytes',
    ...details,
  };
}

function readFtypBrands(bytes) {
  if (bytes.length < 12 || ascii(bytes, 4, 8) !== 'ftyp') return null;
  const declaredSize = bytes.readUInt32BE(0);
  const end = Math.min(
    bytes.length,
    declaredSize >= 12 ? declaredSize : bytes.length,
  );
  const compatibleBrands = [];
  for (let index = 16; index + 4 <= end; index += 4) {
    compatibleBrands.push(ascii(bytes, index, index + 4));
  }
  return {
    majorBrand: ascii(bytes, 8, 12),
    compatibleBrands,
  };
}

/**
 * Inspect container signatures only. This identifies a format from a small
 * header and deliberately does not infer duration, dimensions, codec, FPS, or
 * VFR timing from incomplete bytes.
 */
function detectContainerSignature(value) {
  const bytes = toByteBuffer(value);
  if (bytes === null || bytes.length === 0) return null;

  if (hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return signatureResult({
      kind: MEDIA_KINDS.IMAGE,
      format: 'png',
      mimeType: 'image/png',
      container: 'png',
    });
  }
  if (hasBytes(bytes, [0xff, 0xd8, 0xff])) {
    return signatureResult({
      kind: MEDIA_KINDS.IMAGE,
      format: 'jpeg',
      mimeType: 'image/jpeg',
      container: 'jpeg',
    });
  }
  if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') {
    return signatureResult({
      kind: MEDIA_KINDS.IMAGE,
      format: 'gif',
      mimeType: 'image/gif',
      container: 'gif',
    });
  }
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') {
    return signatureResult({
      kind: MEDIA_KINDS.IMAGE,
      format: 'webp',
      mimeType: 'image/webp',
      container: 'webp',
    });
  }
  if (ascii(bytes, 0, 2) === 'BM') {
    return signatureResult({
      kind: MEDIA_KINDS.IMAGE,
      format: 'bmp',
      mimeType: 'image/bmp',
      container: 'bmp',
    });
  }
  if ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00)
    || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a)) {
    return signatureResult({
      kind: MEDIA_KINDS.IMAGE,
      format: 'tiff',
      mimeType: 'image/tiff',
      container: 'tiff',
    });
  }
  if (hasBytes(bytes, [0x00, 0x00, 0x01, 0x00])) {
    return signatureResult({
      kind: MEDIA_KINDS.IMAGE,
      format: 'ico',
      mimeType: 'image/x-icon',
      container: 'ico',
    });
  }

  const ftyp = readFtypBrands(bytes);
  if (ftyp !== null) {
    const allBrands = new Set([ftyp.majorBrand, ...ftyp.compatibleBrands]);
    if ([...allBrands].some((brand) => AVIF_BRANDS.has(brand))) {
      return signatureResult({
        kind: MEDIA_KINDS.IMAGE,
        format: 'avif',
        mimeType: 'image/avif',
        container: 'avif',
        majorBrand: ftyp.majorBrand,
        compatibleBrands: ftyp.compatibleBrands,
      });
    }
    if ([...allBrands].some((brand) => MP4_BRANDS.has(brand))) {
      return signatureResult({
        kind: MEDIA_KINDS.VIDEO,
        format: 'mp4',
        mimeType: 'video/mp4',
        container: 'mp4',
        majorBrand: ftyp.majorBrand,
        compatibleBrands: ftyp.compatibleBrands,
      });
    }
    if ([...allBrands].some((brand) => UNSUPPORTED_VIDEO_BRANDS.has(brand))) {
      return signatureResult({
        kind: MEDIA_KINDS.VIDEO,
        format: ftyp.majorBrand.trim() || 'iso-bmff',
        mimeType: 'video/quicktime',
        container: 'iso-bmff',
        supported: false,
        reason: 'unsupported-container',
        majorBrand: ftyp.majorBrand,
        compatibleBrands: ftyp.compatibleBrands,
      });
    }
    if ([...allBrands].some((brand) => UNSUPPORTED_IMAGE_BRANDS.has(brand))) {
      return signatureResult({
        kind: MEDIA_KINDS.IMAGE,
        format: ftyp.majorBrand.trim() || 'iso-bmff',
        mimeType: 'image/heic',
        container: 'iso-bmff',
        supported: false,
        reason: 'unsupported-container',
        majorBrand: ftyp.majorBrand,
        compatibleBrands: ftyp.compatibleBrands,
      });
    }
    return signatureResult({
      kind: MEDIA_KINDS.UNKNOWN,
      format: 'iso-bmff',
      mimeType: null,
      container: 'iso-bmff',
      supported: false,
      reason: 'unknown-container-brand',
      majorBrand: ftyp.majorBrand,
      compatibleBrands: ftyp.compatibleBrands,
    });
  }

  return {
    matched: false,
    kind: MEDIA_KINDS.UNKNOWN,
    format: null,
    mimeType: null,
    container: null,
    supported: false,
    reason: 'signature-not-recognized',
    evidence: 'magic-bytes',
  };
}

function classification(status, playability, compatibility, reason) {
  return { inspectionStatus: status, playability, compatibility, reason };
}

function classifyInspection(detection, signature, hasSignatureBytes) {
  if (signature?.matched && signature.kind === MEDIA_KINDS.UNKNOWN) {
    return classification(
      INSPECTION_STATUS.UNKNOWN,
      PLAYABILITY.UNKNOWN,
      COMPATIBILITY.UNKNOWN,
      signature.reason,
    );
  }

  const signatureKnown = signature?.matched && signature.kind !== MEDIA_KINDS.UNKNOWN;
  if (signatureKnown) {
    if (detection.format && detection.format !== signature.format) {
      return classification(
        INSPECTION_STATUS.UNPLAYABLE,
        PLAYABILITY.UNPLAYABLE,
        COMPATIBILITY.UNPLAYABLE,
        'extension-signature-mismatch',
      );
    }
    if (!signature.supported) {
      return classification(
        INSPECTION_STATUS.UNPLAYABLE,
        PLAYABILITY.UNPLAYABLE,
        COMPATIBILITY.UNPLAYABLE,
        signature.reason ?? 'unsupported-container',
      );
    }
    if (signature.kind === MEDIA_KINDS.IMAGE) {
      return classification(
        INSPECTION_STATUS.METADATA_PENDING,
        PLAYABILITY.PLAYABLE,
        COMPATIBILITY.DIRECT,
        'image-signature-known-metadata-pending',
      );
    }
    return classification(
      INSPECTION_STATUS.METADATA_PENDING,
      PLAYABILITY.UNKNOWN,
      COMPATIBILITY.UNKNOWN,
      'video-container-known-codec-and-timing-pending',
    );
  }

  if (hasSignatureBytes) {
    if (detection.reason === 'unsupported-format' || detection.reason === 'metadata-conflict') {
      return classification(
        INSPECTION_STATUS.UNPLAYABLE,
        PLAYABILITY.UNPLAYABLE,
        COMPATIBILITY.UNPLAYABLE,
        detection.reason,
      );
    }
    return classification(
      INSPECTION_STATUS.UNKNOWN,
      PLAYABILITY.UNKNOWN,
      COMPATIBILITY.UNKNOWN,
      'signature-not-recognized',
    );
  }

  if (detection.reason === 'unsupported-format' || detection.reason === 'metadata-conflict') {
    return classification(
      INSPECTION_STATUS.UNPLAYABLE,
      PLAYABILITY.UNPLAYABLE,
      COMPATIBILITY.UNPLAYABLE,
      detection.reason,
    );
  }
  if (detection.supported) {
    return classification(
      INSPECTION_STATUS.METADATA_PENDING,
      PLAYABILITY.UNKNOWN,
      COMPATIBILITY.UNKNOWN,
      'signature-pending',
    );
  }
  return classification(
    INSPECTION_STATUS.UNKNOWN,
    PLAYABILITY.UNKNOWN,
    COMPATIBILITY.UNKNOWN,
    'format-unknown',
  );
}

function inspectMediaSource(input = {}) {
  requireRecord(input, 'Media inspection input');
  const fileName = normalizeInputText(
    input.fileName ?? input.displayName ?? input.name,
    'fileName',
  );
  const mimeType = input.mimeType ?? null;
  const bytes = toByteBuffer(input.bytes);
  const detection = detectMediaType({ fileName, mimeType });
  const signature = bytes === null ? null : detectContainerSignature(bytes);
  const state = classifyInspection(detection, signature, bytes !== null);
  const extension = signature?.matched && signature.extension
    ? signature.extension
    : detection.extension;
  const resolvedMimeType = signature?.matched && signature.supported
    ? signature.mimeType
    : detection.mimeType;
  const mediaKind = signature?.matched && signature.kind !== MEDIA_KINDS.UNKNOWN
    ? signature.kind
    : detection.kind;
  const format = signature?.matched && signature.format !== null
    ? signature.format
    : detection.format;
  const container = signature?.container ?? null;
  const byteSize = input.byteSize ?? (bytes === null ? null : bytes.byteLength);
  const metadata = normalizeMediaMetadata({
    fileName,
    extension,
    mimeType: resolvedMimeType,
    byteSize,
    container,
  }, {
    extension,
    mimeType: resolvedMimeType,
  });
  const warnings = [];
  if (state.inspectionStatus === INSPECTION_STATUS.METADATA_PENDING) {
    warnings.push('Duration, resolution, codec, and frame timing metadata remain pending.');
  }
  if (state.inspectionStatus === INSPECTION_STATUS.UNKNOWN) {
    warnings.push('Media signature was not sufficient to identify a playable format.');
  }

  return {
    schemaVersion: INSPECTION_SCHEMA_VERSION,
    inspectionStatus: state.inspectionStatus,
    playability: state.playability,
    compatibility: state.compatibility,
    reason: state.reason,
    mediaKind,
    format,
    extension,
    mimeType: resolvedMimeType,
    container,
    detection: cloneJson(detection),
    signature: cloneJson(signature),
    metadata,
    warnings,
  };
}

function normalizeInspectionResult(value) {
  requireRecord(value, 'Inspection result');
  if (value.schemaVersion !== INSPECTION_SCHEMA_VERSION) {
    throw new MediaIngestError('Unsupported inspection result schema', 'SCHEMA_VERSION_UNSUPPORTED');
  }
  const inspectionStatus = value.inspectionStatus;
  if (!Object.values(INSPECTION_STATUS).includes(inspectionStatus)) {
    throw new MediaIngestError('Inspection status is invalid', 'INSPECTION_STATUS_INVALID');
  }
  const playability = value.playability;
  if (!Object.values(PLAYABILITY).includes(playability)) {
    throw new MediaIngestError('Playability is invalid', 'PLAYABILITY_INVALID');
  }
  const compatibility = value.compatibility;
  if (!Object.values(COMPATIBILITY).includes(compatibility)) {
    throw new MediaIngestError('Inspection compatibility is invalid', 'COMPATIBILITY_INVALID');
  }
  if (inspectionStatus === INSPECTION_STATUS.UNPLAYABLE && playability !== PLAYABILITY.UNPLAYABLE) {
    throw new MediaIngestError('Unplayable inspection must be marked unplayable', 'INSPECTION_STATE_MISMATCH');
  }
  const mediaKind = Object.values(MEDIA_KINDS).includes(value.mediaKind)
    ? value.mediaKind
    : MEDIA_KINDS.UNKNOWN;
  const extension = value.extension ?? value.metadata?.extension ?? null;
  const mimeType = value.mimeType ?? value.metadata?.mimeType ?? null;
  const metadata = normalizeMediaMetadata(value.metadata ?? {}, { extension, mimeType });
  return {
    schemaVersion: INSPECTION_SCHEMA_VERSION,
    inspectionStatus,
    playability,
    compatibility,
    reason: normalizeInputText(value.reason, 'inspection reason', { maxLength: 120 }),
    mediaKind,
    format: normalizeInputText(value.format, 'inspection format', { maxLength: 40 }),
    extension,
    mimeType,
    container: normalizeInputText(value.container, 'inspection container', { maxLength: 80 }),
    detection: value.detection === undefined ? null : cloneJson(value.detection),
    signature: value.signature === undefined ? null : cloneJson(value.signature),
    metadata,
    warnings: Array.isArray(value.warnings) ? value.warnings.map((warning) => normalizeInputText(warning, 'inspection warning', { maxLength: 500 })) : [],
  };
}

function assetLifecycleForInspection(inspection) {
  if (inspection.inspectionStatus === INSPECTION_STATUS.UNPLAYABLE) return ASSET_LIFECYCLE_STATUS.FAILED;
  if (inspection.inspectionStatus === INSPECTION_STATUS.METADATA_PENDING) return ASSET_LIFECYCLE_STATUS.METADATA_PENDING;
  if (inspection.inspectionStatus === INSPECTION_STATUS.UNKNOWN) return ASSET_LIFECYCLE_STATUS.DISCOVERED;
  return ASSET_LIFECYCLE_STATUS.PROCESSING;
}

function registerMediaAsset(input) {
  requireRecord(input, 'Media registration input');
  const inspection = normalizeInspectionResult(input.inspection ?? inspectMediaSource(input));
  const sourceReference = input.sourceReference ?? input.sourceRelativePath ?? input.relativePath;
  if (sourceReference === undefined || sourceReference === null) {
    throw new MediaIngestError('sourceReference is required for registration', 'SOURCE_REFERENCE_REQUIRED');
  }
  const source = createSourceReference(sourceReference);
  const displayName = input.displayName ?? inspection.metadata.fileName ?? source.relativePath.split('/').pop();
  const asset = createMediaAsset({
    id: input.id ?? input.assetId,
    projectId: input.projectId,
    displayName,
    sourceReference: source,
    normalizedReference: input.normalizedReference ?? null,
    mediaKind: inspection.mediaKind,
    mediaType: inspection.mimeType,
    metadata: input.metadata === undefined
      ? inspection.metadata
      : { ...inspection.metadata, ...cloneJson(input.metadata) },
    compatibility: input.compatibility ?? inspection.compatibility,
    lifecycleStatus: input.lifecycleStatus ?? assetLifecycleForInspection(inspection),
    inspectionStatus: inspection.inspectionStatus,
    playability: inspection.playability,
    userLabel: input.userLabel,
    derived: input.derived,
  });
  return asset;
}

function createMediaIngestRequest(input) {
  requireRecord(input, 'Media ingest input');
  const projectRoot = normalizeProjectRoot(input.projectRoot);
  const projectId = normalizeIdentifier(input.projectId, 'projectId');
  const assetId = normalizeIdentifier(input.assetId ?? input.id, 'assetId');
  let sourcePath = null;
  let sourceReference = null;

  if (input.sourceReference !== undefined || input.sourceRelativePath !== undefined || input.relativePath !== undefined) {
    sourceReference = createSourceReference(
      input.sourceReference ?? input.sourceRelativePath ?? input.relativePath,
    );
    sourcePath = resolveProjectRelativePath(projectRoot, sourceReference.relativePath);
  }
  if (input.sourcePath !== undefined) {
    if (typeof input.sourcePath !== 'string' || input.sourcePath.trim() === '') {
      throw new MediaIngestError('sourcePath is invalid', 'SOURCE_PATH_INVALID');
    }
    const candidate = path.isAbsolute(input.sourcePath)
      ? path.resolve(input.sourcePath)
      : resolveProjectRelativePath(projectRoot, input.sourcePath);
    const relativePath = toProjectRelativePath(projectRoot, candidate);
    if (sourceReference !== null && sourceReference.relativePath !== relativePath) {
      throw new MediaIngestError('sourcePath and sourceReference do not match', 'SOURCE_REFERENCE_MISMATCH');
    }
    sourcePath = candidate;
    sourceReference = createSourceReference(relativePath);
  }
  if (sourcePath === null || sourceReference === null) {
    throw new MediaIngestError('A project-relative source is required', 'SOURCE_REQUIRED');
  }

  const displayName = normalizeInputText(
    input.displayName ?? path.basename(sourcePath),
    'displayName',
    { required: true },
  );
  const normalizedReference = input.normalizedReference === undefined || input.normalizedReference === null
    ? null
    : normalizeReference(input.normalizedReference, 'normalized');
  if (normalizedReference !== null
    && normalizedReference.relativePath === sourceReference.relativePath) {
    throw new MediaIngestError('Source and normalized references must be different', 'REFERENCE_COLLISION');
  }

  return {
    schemaVersion: INGEST_SCHEMA_VERSION,
    projectRoot,
    projectId,
    assetId,
    displayName,
    mimeType: input.mimeType ?? null,
    sourcePath,
    sourceReference,
    normalizedReference,
  };
}

/**
 * Copy an external regular file into the project-local original area. The
 * external source is read only; the returned asset keeps a project-relative
 * source reference plus a checksum, while transient provenance deliberately
 * omits the external absolute path.
 */
async function copyMediaSourceIntoProject(input) {
  requireRecord(input, 'Media copy input');
  const projectRoot = normalizeProjectRoot(input.projectRoot);
  const projectId = normalizeIdentifier(input.projectId, 'projectId');
  const assetId = normalizeIdentifier(input.assetId ?? input.id, 'assetId');
  if (typeof input.sourcePath !== 'string' || input.sourcePath.trim() === '') {
    throw new MediaIngestError('sourcePath is required', 'SOURCE_PATH_REQUIRED');
  }

  const sourceCandidate = path.resolve(input.sourcePath);
  let sourceStats;
  try {
    sourceStats = await fs.lstat(sourceCandidate);
  } catch {
    throw new MediaIngestError('Media source is unavailable', 'MEDIA_PATH_NOT_FOUND');
  }
  if (sourceStats.isSymbolicLink()) {
    throw new MediaIngestError('Media source symlinks are not allowed', 'MEDIA_SYMLINK_NOT_ALLOWED');
  }
  if (!sourceStats.isFile()) {
    throw new MediaIngestError('Media source must be a regular file', 'MEDIA_FILE_REQUIRED');
  }
  const sourcePath = await fs.realpath(sourceCandidate).catch(() => {
    throw new MediaIngestError('Media source cannot be resolved safely', 'MEDIA_PATH_UNRESOLVED');
  });

  const displayName = normalizeInputText(
    input.displayName ?? path.basename(sourcePath),
    'displayName',
    { required: true },
  );
  const detected = detectMediaType({
    fileName: path.basename(sourcePath),
    mimeType: input.mimeType ?? null,
  });
  const safeFileName = safeOutputFileName(displayName, detected.extension);
  const destinationRelativePath = normalizeProjectRelativePath(
    input.destinationRelativePath ?? `media/original/${assetId}-${safeFileName}`,
    'destinationRelativePath',
  );
  if (!destinationRelativePath.startsWith('media/original/')) {
    throw new MediaIngestError(
      'Copied media must be stored under media/original',
      'MEDIA_DESTINATION_POLICY',
    );
  }
  const destinationPath = resolveProjectRelativePath(projectRoot, destinationRelativePath);
  if (path.resolve(sourcePath) === path.resolve(destinationPath)) {
    throw new MediaIngestError('Source and destination must be different', 'REFERENCE_COLLISION');
  }
  await assertProjectTargetSafe(projectRoot, destinationPath);

  const sourceChecksumBefore = await hashFile(sourcePath).catch(() => {
    throw new MediaIngestError('Media source checksum could not be read', 'SOURCE_CHECKSUM_FAILED');
  });
  let copied = false;
  try {
    await fs.mkdir(path.dirname(destinationPath), { recursive: true });
    await assertProjectTargetSafe(projectRoot, destinationPath);
    await fs.copyFile(sourcePath, destinationPath, fsConstants.COPYFILE_EXCL);
    copied = true;

    const [sourceChecksumAfter, destinationChecksum] = await Promise.all([
      hashFile(sourcePath),
      hashFile(destinationPath),
    ]);
    if (sourceChecksumBefore !== sourceChecksumAfter || sourceChecksumAfter !== destinationChecksum) {
      throw new MediaIngestError(
        'Media source changed during copy; original was not registered',
        'SOURCE_CHANGED_DURING_COPY',
      );
    }

    const destinationStat = await fs.stat(destinationPath);
    const bytes = await readMediaHeader(destinationPath);
    const inspection = inspectMediaSource({
      fileName: displayName,
      mimeType: input.mimeType ?? detected.mimeType,
      bytes,
      byteSize: destinationStat.size,
    });
    const sourceReference = createSourceReference({
      relativePath: destinationRelativePath,
      byteSize: destinationStat.size,
      checksumSha256: destinationChecksum,
      mediaType: inspection.mimeType ?? detected.mimeType,
    });
    const asset = registerMediaAsset({
      id: assetId,
      projectId,
      displayName,
      sourceReference,
      inspection,
      derived: { safeFileName, referenceCount: 0 },
    });
    return {
      asset,
      destinationRelativePath,
      destinationPath,
      inspection,
      provenance: {
        kind: 'copied-original',
        sourceFileName: path.basename(sourcePath),
        sourceByteSize: sourceStats.size,
        sourceChecksumSha256: sourceChecksumAfter,
        copiedAt: new Date().toISOString(),
        originalPreserved: true,
      },
    };
  } catch (error) {
    if (copied) await fs.rm(destinationPath, { force: true }).catch(() => {});
    if (error instanceof MediaIngestError) throw error;
    if (error?.code === 'EEXIST') {
      throw new MediaIngestError('Media destination already exists', 'MEDIA_DESTINATION_EXISTS');
    }
    throw new MediaIngestError('Media source could not be copied', 'MEDIA_COPY_FAILED');
  }
}

async function realpathOrThrow(candidate, fieldName) {
  try {
    return await fs.realpath(candidate);
  } catch (error) {
    const code = error.code === 'ENOENT' ? 'MEDIA_PATH_NOT_FOUND' : 'MEDIA_PATH_UNRESOLVED';
    throw new MediaPathPolicyError(`${fieldName} cannot be resolved`, code);
  }
}

/**
 * Resolve an existing media file through real paths and keep the returned
 * reference relative to the real project root. This is a read-only boundary;
 * it does not copy or mutate the source file.
 */
async function resolveMediaPathWithinProjectRoot(projectRoot, candidatePath, { allowSymlink = false } = {}) {
  const root = normalizeProjectRoot(projectRoot);
  if (typeof candidatePath !== 'string' || candidatePath.trim() === '') {
    throw new MediaPathPolicyError('Media path is required', 'MEDIA_PATH_REQUIRED');
  }
  const candidate = path.isAbsolute(candidatePath)
    ? path.resolve(candidatePath)
    : resolveProjectRelativePath(root, candidatePath);
  if (!isPathInside(root, candidate) || candidate === root) {
    throw new MediaPathPolicyError('Media path is outside the project root', 'PATH_OUTSIDE_PROJECT_ROOT');
  }

  let candidateStat;
  try {
    candidateStat = await fs.lstat(candidate);
  } catch (error) {
    const code = error.code === 'ENOENT' ? 'MEDIA_PATH_NOT_FOUND' : 'MEDIA_PATH_UNREADABLE';
    throw new MediaPathPolicyError('Media path cannot be read', code);
  }
  if (candidateStat.isSymbolicLink() && !allowSymlink) {
    throw new MediaPathPolicyError('Media symlinks are not allowed by the ingest policy', 'MEDIA_SYMLINK_NOT_ALLOWED');
  }

  const realRoot = await realpathOrThrow(root, 'Project root');
  const realCandidate = await realpathOrThrow(candidate, 'Media path');
  if (!isPathInside(realRoot, realCandidate) || realCandidate === realRoot) {
    throw new MediaPathPolicyError('Media real path is outside the project root', 'REALPATH_OUTSIDE_PROJECT_ROOT');
  }
  let realStat;
  try {
    realStat = await fs.stat(realCandidate);
  } catch {
    throw new MediaPathPolicyError('Media real path cannot be read', 'MEDIA_PATH_UNREADABLE');
  }
  if (!realStat.isFile()) {
    throw new MediaPathPolicyError('Media path must identify a regular file', 'MEDIA_FILE_REQUIRED');
  }

  const relativePath = toProjectRelativePath(realRoot, realCandidate);
  return {
    rootPath: realRoot,
    candidatePath: candidate,
    realPath: realCandidate,
    relativePath,
    sizeBytes: realStat.size,
    isSymlink: candidateStat.isSymbolicLink(),
  };
}

async function readMediaHeader(filePath, maxBytes = DEFAULT_HEADER_BYTES) {
  if (!Number.isInteger(maxBytes) || maxBytes < 16 || maxBytes > MAX_HEADER_BYTES) {
    throw new MediaIngestError('Header size is invalid', 'HEADER_SIZE_INVALID');
  }
  let handle;
  try {
    handle = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(maxBytes);
    const result = await handle.read(buffer, 0, maxBytes, 0);
    return buffer.subarray(0, result.bytesRead);
  } catch {
    throw new MediaIngestError('Media header cannot be read', 'MEDIA_HEADER_UNREADABLE');
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

async function inspectMediaFile(input, options = {}) {
  const request = createMediaIngestRequest(input);
  const containment = await resolveMediaPathWithinProjectRoot(
    request.projectRoot,
    request.sourcePath,
    options,
  );
  const bytes = await readMediaHeader(containment.realPath, options.headerBytes ?? DEFAULT_HEADER_BYTES);
  const inspection = inspectMediaSource({
    fileName: request.displayName,
    mimeType: request.mimeType,
    bytes,
    byteSize: containment.sizeBytes,
  });
  return { request, containment, inspection };
}

/**
 * Register an existing project-local file after read-only inspection. The
 * original remains the source reference; normalizedReference is only carried
 * through when a separate verified normalization result supplies it.
 */
async function ingestMediaSource(input, options = {}) {
  const inspected = await inspectMediaFile(input, options);
  const asset = registerMediaAsset({
    id: inspected.request.assetId,
    projectId: inspected.request.projectId,
    displayName: inspected.request.displayName,
    sourceReference: inspected.containment.relativePath,
    normalizedReference: inspected.request.normalizedReference,
    inspection: inspected.inspection,
  });
  return { ...inspected, asset };
}

module.exports = Object.freeze({
  DEFAULT_HEADER_BYTES,
  copyMediaSourceIntoProject,
  INGEST_SCHEMA_VERSION,
  INSPECTION_SCHEMA_VERSION,
  MAX_HEADER_BYTES,
  MediaIngestError,
  createMediaIngestRequest,
  detectContainerSignature,
  ingestMediaSource,
  inspectMediaFile,
  inspectMediaSource,
  normalizeInspectionResult,
  readMediaHeader,
  registerMediaAsset,
  resolveMediaPathWithinProjectRoot,
});
