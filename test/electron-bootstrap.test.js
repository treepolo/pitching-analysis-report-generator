'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..');

test('Electron startup uses a single-instance bootstrap without interfering with smoke mode', async () => {
  const [packageJson, bootstrap] = await Promise.all([
    fs.readFile(path.join(repositoryRoot, 'package.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(repositoryRoot, 'src', 'electron-bootstrap.js'), 'utf8'),
  ]);

  assert.equal(packageJson.main, 'src/electron-bootstrap.js');
  assert.match(bootstrap, /const isSmokeMode = process\.env\.PITCHING_SMOKE === '1' \|\| process\.argv\.includes\('--smoke'\)/u);
  assert.match(bootstrap, /if \(isSmokeMode\) \{\s*require\('\.\/main'\);/u);
  assert.match(bootstrap, /app\.requestSingleInstanceLock\(\)/u);
  assert.match(bootstrap, /if \(!hasPrimaryInstanceLock\) \{\s*app\.quit\(\);/u);
  assert.match(bootstrap, /app\.on\('second-instance'/u);
  assert.match(bootstrap, /window\.isMinimized\(\)/u);
  assert.match(bootstrap, /window\.restore\(\)/u);
  assert.match(bootstrap, /window\.show\(\)/u);
  assert.match(bootstrap, /window\.focus\(\)/u);
});
