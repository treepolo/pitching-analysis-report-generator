'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const testTempRoot = path.join(repositoryRoot, '.tmp', 'tests');

async function createTestTemp(prefix) {
  await fs.mkdir(testTempRoot, { recursive: true });
  return fs.mkdtemp(path.join(testTempRoot, prefix));
}

module.exports = Object.freeze({ createTestTemp, repositoryRoot, testTempRoot });
