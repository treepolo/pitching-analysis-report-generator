'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const { createTestTemp, repositoryRoot } = require('./project-temp');

function isInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

test('project-owned temporary files stay under the repository root', async () => {
  const created = await createTestTemp('path-policy-');
  try {
    assert.equal(isInside(repositoryRoot, created), true);
  } finally {
    await fs.rm(created, { recursive: true, force: true });
  }

  const runtimeSmoke = await fs.readFile(path.join(repositoryRoot, 'src', 'export', 'runtime-smoke.js'), 'utf8');
  const exporter = await fs.readFile(path.join(repositoryRoot, 'src', 'export', 'exporter.js'), 'utf8');
  assert.doesNotMatch(runtimeSmoke, /os\.tmpdir\(\)/u);
  assert.match(runtimeSmoke, /\.tmp['"], 'export-runtime|\.tmp', 'export-runtime/u);
  assert.match(exporter, /path\.join\(projectRoot, '\.tmp'\)/u);
  assert.doesNotMatch(exporter, /parent:\s*outputRoot[\s\S]*sameDestination:\s*true/u);
});
