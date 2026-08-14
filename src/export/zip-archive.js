'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { ExportValidationError, normalizeRelativeAssetPath } = require('./asset-paths');

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
});

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function compareNames(left, right) {
  return left < right ? -1 : (left > right ? 1 : 0);
}

async function collectFiles(rootDirectory, currentDirectory = rootDirectory, result = []) {
  const entries = await fs.readdir(currentDirectory, { withFileTypes: true });
  entries.sort((left, right) => compareNames(left.name, right.name));
  for (const entry of entries) {
    const absolutePath = path.join(currentDirectory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new ExportValidationError(`ZIP source contains a symbolic link: ${absolutePath}`);
    }
    if (entry.isDirectory()) {
      await collectFiles(rootDirectory, absolutePath, result);
    } else if (entry.isFile()) {
      const relativePath = normalizeRelativeAssetPath(
        path.relative(rootDirectory, absolutePath).replaceAll(path.sep, '/'),
        { allowRootFile: true },
      );
      result.push({ absolutePath, relativePath });
    } else {
      throw new ExportValidationError(`ZIP source contains an unsupported entry: ${absolutePath}`);
    }
  }
  return result;
}

async function readZipArchive(zipPath) {
  const archive = await fs.readFile(zipPath).catch((error) => {
    throw new ExportValidationError(`ZIP archive is unavailable: ${zipPath}`, { cause: error });
  });
  const entries = new Map();
  let offset = 0;
  while (offset + 4 <= archive.length && archive.readUInt32LE(offset) === 0x04034b50) {
    if (offset + 30 > archive.length) throw new ExportValidationError('ZIP local header is truncated');
    const flags = archive.readUInt16LE(offset + 6);
    if ((flags & 0x0008) !== 0) throw new ExportValidationError('ZIP data descriptors are not supported for parity validation');
    const method = archive.readUInt16LE(offset + 8);
    const crc = archive.readUInt32LE(offset + 14);
    const compressedSize = archive.readUInt32LE(offset + 18);
    const uncompressedSize = archive.readUInt32LE(offset + 22);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > archive.length) throw new ExportValidationError('ZIP entry payload is truncated');
    const relativePath = normalizeRelativeAssetPath(
      archive.subarray(nameStart, nameStart + nameLength).toString('utf8'),
      { allowRootFile: true },
    );
    if (entries.has(relativePath)) throw new ExportValidationError(`ZIP contains a duplicate entry: ${relativePath}`);
    const payload = archive.subarray(dataStart, dataEnd);
    let data;
    try {
      if (method === 0) data = Buffer.from(payload);
      else if (method === 8) data = zlib.inflateRawSync(payload);
      else throw new ExportValidationError(`ZIP compression method is unsupported: ${method}`);
    } catch (error) {
      if (error instanceof ExportValidationError) throw error;
      throw new ExportValidationError(`ZIP entry cannot be decompressed: ${relativePath}`, { cause: error });
    }
    if (data.length !== uncompressedSize || crc32(data) !== crc) {
      throw new ExportValidationError(`ZIP entry checksum mismatch: ${relativePath}`);
    }
    entries.set(relativePath, {
      relativePath,
      byteLength: data.length,
      sha256: sha256(data),
    });
    offset = dataEnd;
  }
  const signature = offset + 4 <= archive.length ? archive.readUInt32LE(offset) : null;
  if (signature !== 0x02014b50 && signature !== 0x06054b50) {
    throw new ExportValidationError('ZIP central directory is missing or malformed');
  }
  return entries;
}

async function validateZipParity(sourceDirectory, zipPath) {
  const sourceRoot = path.resolve(sourceDirectory);
  const files = await collectFiles(sourceRoot);
  const archiveEntries = await readZipArchive(zipPath);
  const expectedPaths = new Set(files.map((file) => file.relativePath));
  const archivePaths = new Set(archiveEntries.keys());
  const missing = files.filter((file) => !archivePaths.has(file.relativePath)).map((file) => file.relativePath);
  const extra = [...archivePaths].filter((relativePath) => !expectedPaths.has(relativePath));
  if (missing.length > 0 || extra.length > 0) {
    throw new ExportValidationError('ZIP does not have folder parity', { missing, extra });
  }

  for (const file of files) {
    const data = await fs.readFile(file.absolutePath);
    const expected = { byteLength: data.length, sha256: sha256(data) };
    const actual = archiveEntries.get(file.relativePath);
    if (expected.byteLength !== actual.byteLength || expected.sha256 !== actual.sha256) {
      throw new ExportValidationError(`ZIP parity checksum mismatch: ${file.relativePath}`, {
        relativePath: file.relativePath,
        expected,
        actual,
      });
    }
  }
  return {
    valid: true,
    fileCount: files.length,
    entries: [...archiveEntries.values()],
  };
}

function dosTimestamp() {
  return { time: 0, date: 0x0021 };
}

function createLocalHeader(entry) {
  const name = Buffer.from(entry.relativePath, 'utf8');
  const header = Buffer.alloc(30 + name.length);
  const timestamp = dosTimestamp();
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(entry.method, 8);
  header.writeUInt16LE(timestamp.time, 10);
  header.writeUInt16LE(timestamp.date, 12);
  header.writeUInt32LE(entry.crc, 14);
  header.writeUInt32LE(entry.compressedSize, 18);
  header.writeUInt32LE(entry.uncompressedSize, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(0, 28);
  name.copy(header, 30);
  return header;
}

function createCentralHeader(entry) {
  const name = Buffer.from(entry.relativePath, 'utf8');
  const header = Buffer.alloc(46 + name.length);
  const timestamp = dosTimestamp();
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(entry.method, 10);
  header.writeUInt16LE(timestamp.time, 12);
  header.writeUInt16LE(timestamp.date, 14);
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(entry.compressedSize, 20);
  header.writeUInt32LE(entry.uncompressedSize, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(entry.localOffset, 42);
  name.copy(header, 46);
  return header;
}

function createEndOfCentralDirectory(entryCount, centralSize, centralOffset) {
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50, 0);
  footer.writeUInt16LE(0, 4);
  footer.writeUInt16LE(0, 6);
  footer.writeUInt16LE(entryCount, 8);
  footer.writeUInt16LE(entryCount, 10);
  footer.writeUInt32LE(centralSize, 12);
  footer.writeUInt32LE(centralOffset, 16);
  footer.writeUInt16LE(0, 20);
  return footer;
}

async function createZipArchive(sourceDirectory, zipPath) {
  const sourceRoot = path.resolve(sourceDirectory);
  const targetPath = path.resolve(zipPath);
  const sourceEntry = await fs.lstat(sourceRoot).catch((error) => {
    throw new ExportValidationError(`ZIP source directory is unavailable: ${sourceRoot}`, { cause: error });
  });
  if (sourceEntry.isSymbolicLink()) {
    throw new ExportValidationError(`ZIP source directory must not be a symbolic link: ${sourceRoot}`);
  }
  if (!sourceEntry.isDirectory()) throw new ExportValidationError(`ZIP source is not a directory: ${sourceRoot}`);

  try {
    await fs.lstat(targetPath);
    throw new ExportValidationError(`ZIP target already exists: ${targetPath}`);
  } catch (error) {
    if (error instanceof ExportValidationError) throw error;
    if (error.code !== 'ENOENT') throw error;
  }

  const files = await collectFiles(sourceRoot);
  if (files.length > 0xffff) throw new ExportValidationError('ZIP source contains too many files');

  const entries = [];
  let localOffset = 0;
  for (const file of files) {
    const data = await fs.readFile(file.absolutePath);
    if (data.length > 0xffffffff) throw new ExportValidationError(`ZIP file is too large: ${file.relativePath}`);
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const method = compressed.length < data.length ? 8 : 0;
    const payload = method === 8 ? compressed : data;
    const entry = {
      relativePath: file.relativePath,
      method,
      crc: crc32(data),
      compressedSize: payload.length,
      uncompressedSize: data.length,
      localOffset,
      payload,
    };
    const localHeader = createLocalHeader(entry);
    localOffset += localHeader.length + payload.length;
    if (localOffset > 0xffffffff) throw new ExportValidationError('ZIP archive is too large');
    entries.push(entry);
  }

  const centralOffset = localOffset;
  const centralHeaders = entries.map(createCentralHeader);
  const centralSize = centralHeaders.reduce((total, header) => total + header.length, 0);
  if (centralOffset + centralSize > 0xffffffff) throw new ExportValidationError('ZIP archive is too large');
  const chunks = [];
  entries.forEach((entry) => chunks.push(createLocalHeader(entry), entry.payload));
  chunks.push(...centralHeaders, createEndOfCentralDirectory(entries.length, centralSize, centralOffset));

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const temporaryPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  try {
    await fs.writeFile(temporaryPath, Buffer.concat(chunks), { flag: 'wx' });
    await fs.rename(temporaryPath, targetPath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
  return {
    zipPath: targetPath,
    entries: entries.map((entry) => ({
      relativePath: entry.relativePath,
      compressedSize: entry.compressedSize,
      uncompressedSize: entry.uncompressedSize,
      compressionMethod: entry.method,
      crc32: entry.crc.toString(16).padStart(8, '0'),
    })),
  };
}

module.exports = {
  createZipArchive,
  crc32,
  readZipArchive,
  validateZipParity,
};
