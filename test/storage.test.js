'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const {
  createProjectStore,
  isPathInside,
  projectDirectory,
  validateProjectRoot,
} = require('../src/storage');

const repositoryRoot = path.resolve(__dirname, '..');
let testRoot;
let store;

test.before(async () => {
  await fs.mkdir(path.join(repositoryRoot, '.tmp'), { recursive: true });
  testRoot = await fs.mkdtemp(path.join(repositoryRoot, '.tmp', 'storage-test-'));
  store = createProjectStore(testRoot);
});

test.after(async () => {
  if (testRoot) await fs.rm(testRoot, { recursive: true, force: true });
});

test('creates, lists, opens and persists a project inside the projects boundary', async () => {
  const created = await store.createProject('王小明｜投球 / 動作分析');
  const projectFile = path.join(store.projectDirectory(created.id), 'project.json');

  assert.equal(created.displayName, '王小明｜投球 / 動作分析');
  assert.match(created.id, /^[a-z0-9-]{1,80}$/u);
  assert.equal(created.filesystemName, created.id);
  assert.equal(isPathInside(store.projectsRoot, projectFile), true);
  assert.deepEqual(JSON.parse(await fs.readFile(projectFile, 'utf8')), created);

  const listed = await store.listProjects();
  assert.deepEqual(listed.map((project) => project.id), [created.id]);

  const opened = await store.openProject(created.id);
  assert.equal(opened.id, created.id);
  assert.ok(opened.lastOpenedAt);
  assert.equal(opened.sections.length, 3);
});

test('allows an intentionally empty section title and reopens saved editor content', async () => {
  const created = await store.createProject('Empty title test');
  const snapshot = await store.openProject(created.id);
  snapshot.sections[0].title = '';
  snapshot.sections[0].blocks[0].content = 'Persistence survives an explicit save';

  const saved = await store.saveProject(snapshot);
  assert.equal(saved.sections[0].title, '');
  assert.equal(saved.sections[0].blocks[0].content, 'Persistence survives an explicit save');

  const reopened = await store.openProject(created.id);
  assert.equal(reopened.sections[0].title, '');
  assert.equal(reopened.sections[0].blocks[0].content, 'Persistence survives an explicit save');
});

test('preserves media metadata and export settings as future vertical-slice seams', async () => {
  const created = await store.createProject('Payload seam test');
  const snapshot = await store.openProject(created.id);
  snapshot.reportTitle = 'Payload contract title';
  snapshot.recoveryMetadata = { pendingChanges: false, pendingJobIds: [] };
  snapshot.media = [{
    id: 'asset-1',
    projectId: created.id,
    displayName: 'pitch.mp4',
    mediaKind: 'video',
    lifecycleStatus: 'missing',
    compatibility: 'unknown',
  }];
  snapshot.sections[1].blocks.push({
    id: 'video-block',
    type: 'singleVideo',
    mediaAssetId: 'asset-1',
    label: 'Future player seam',
    playback: { rate: 1 },
  });
  snapshot.exportSettings = {
    lastOutputPath: path.join(testRoot, 'output'),
    outputKind: 'folder',
    includeMedia: true,
  };

  const saved = await store.saveProject(snapshot);
  assert.equal(saved.reportTitle, 'Payload contract title');
  assert.deepEqual(saved.recoveryMetadata, { pendingChanges: false, pendingJobIds: [] });
  assert.deepEqual(saved.media, snapshot.media);
  assert.equal(saved.exportSettings.outputKind, 'folder');
  assert.equal(saved.exportSettings.includeMedia, true);
  assert.equal(saved.exportSettings.lastOutputPath, path.resolve(testRoot, 'output'));
  assert.deepEqual(saved.sections[1].blocks[1], snapshot.sections[1].blocks[1]);

  const reopened = await store.openProject(created.id);
  assert.equal(reopened.reportTitle, 'Payload contract title');
  assert.deepEqual(reopened.recoveryMetadata, { pendingChanges: false, pendingJobIds: [] });
  assert.deepEqual(reopened.media, snapshot.media);
  assert.deepEqual(reopened.exportSettings, saved.exportSettings);
  assert.deepEqual(reopened.sections[1].blocks[1], snapshot.sections[1].blocks[1]);
});

test('rejects traversal ids before accessing project paths', async () => {
  assert.throws(() => projectDirectory(testRoot, '../outside'), /Invalid project id/);
  assert.equal(isPathInside(store.projectsRoot, path.join(testRoot, 'outside')), false);
  await assert.rejects(store.openProject('../outside'), /Invalid project id/);
});

test('rejects a project root whose realpath escapes its application boundary', async (t) => {
  const outsideRoot = await fs.mkdtemp(path.join(path.dirname(testRoot), 'storage-outside-'));
  const linkedRoot = path.join(testRoot, 'linked-root');
  try {
    try {
      await fs.symlink(outsideRoot, linkedRoot, 'junction');
    } catch (error) {
      if (error.code === 'EPERM' || error.code === 'EACCES') {
        t.skip(`junction creation is unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    await assert.rejects(
      validateProjectRoot(linkedRoot, testRoot),
      /realpath escapes the application project root/,
    );
    assert.deepEqual(await fs.readdir(outsideRoot), []);
  } finally {
    await fs.rm(linkedRoot, { recursive: true, force: true });
    await fs.rm(outsideRoot, { recursive: true, force: true });
  }
});
