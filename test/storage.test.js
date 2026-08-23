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
  assert.equal(listed[0].lastOpenedAt, created.lastOpenedAt);

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
    timing: { duration: 1.25, fps: 60, precision: 'unknown' },
  }];
  snapshot.sections[1].blocks.push({
    id: 'video-block',
    type: 'singleVideo',
    mediaAssetId: 'asset-1',
    label: 'Future player seam',
    sourceLabel: 'Future player seam',
    playback: { rate: 1 },
  });
  snapshot.exportSettings = {
    lastOutputPath: path.join(testRoot, 'output'),
    outputKind: 'folder',
    includeMedia: true,
    validation: { requirePortablePaths: true, futureFlag: 'preserve-me' },
  };
  snapshot.futureReportExtension = { sourceRevision: 3, owner: 'report-model' };

  const saved = await store.saveProject(snapshot);
  assert.equal(saved.reportTitle, 'Payload contract title');
  assert.deepEqual(saved.recoveryMetadata, { pendingChanges: false, pendingJobIds: [] });
  assert.deepEqual(saved.media, snapshot.media);
  assert.equal(saved.exportSettings.outputKind, 'folder');
  assert.equal(saved.exportSettings.includeMedia, true);
  assert.deepEqual(saved.media[0].timing, { duration: 1.25, fps: 60, precision: 'unknown' });
  assert.deepEqual(saved.exportSettings.validation, { requirePortablePaths: true, futureFlag: 'preserve-me' });
  assert.equal(saved.exportSettings.lastOutputPath, path.resolve(testRoot, 'output'));
  assert.deepEqual(saved.futureReportExtension, { sourceRevision: 3, owner: 'report-model' });
  assert.equal(saved.sections[1].blocks[1].loop.enabled, true);

  const reopened = await store.openProject(created.id);
  assert.equal(reopened.reportTitle, 'Payload contract title');
  assert.deepEqual(reopened.recoveryMetadata, { pendingChanges: false, pendingJobIds: [] });
  assert.deepEqual(reopened.media, snapshot.media);
  assert.deepEqual(reopened.exportSettings, saved.exportSettings);
  assert.equal(reopened.sections[1].blocks[1].loop.enabled, true);
  assert.deepEqual(reopened.futureReportExtension, { sourceRevision: 3, owner: 'report-model' });

  const partialSave = await store.saveProject({ id: created.id, sections: reopened.sections });
  assert.deepEqual(partialSave.media, snapshot.media);
  assert.deepEqual(partialSave.exportSettings, saved.exportSettings);
  assert.deepEqual(partialSave.futureReportExtension, { sourceRevision: 3, owner: 'report-model' });
});

test('persists independent video settings and the new dual sync point across reopen', async () => {
  const created = await store.createProject('Block editor video config');
  const snapshot = await store.openProject(created.id);
  snapshot.sections[0].blocks.push({
    id: 'single-block-config',
    type: 'singleVideo',
    mediaAssetId: 'asset-front',
    label: 'Front view',
    sourceLabel: 'Front source',
    playback: { rate: 0.75 },
    segment: { in: 0.25, out: 2.5 },
    relativeOffset: 1.5,
    sync: { mode: 'frame', startAnchor: { observedTime: 0.5, frameIndex: 15 } },
    anchor: { observedTime: 1.25, frameIndex: 38, precision: 'frame-aware' },
  });
  snapshot.sections[0].blocks.push({
    id: 'comparison-block-config',
    type: 'comparisonVideo',
    label: 'Front and side',
    layout: 'side-by-side',
    sync: { leftFrame: 100, rightFrame: 400, editorOnly: 'drop' },
    playback: { rate: 1 },
    left: {
      mediaAssetId: 'asset-front',
      label: 'Front',
      segment: { in: 0, out: 3 },
      playback: { rate: 0.5 },
      anchor: { observedTime: 1.1 },
    },
    right: {
      mediaAssetId: 'asset-side',
      label: 'Side',
      segment: { in: 0.1, out: 2.9 },
      playback: { rate: 0.5 },
      anchor: { observedTime: 1.4 },
    },
  });

  const saved = await store.saveProject(snapshot);
  const reopened = await store.openProject(created.id);
  assert.deepEqual(reopened.sections[0].blocks.slice(-2), saved.sections[0].blocks.slice(-2));
  assert.equal('layout' in reopened.sections[0].blocks.at(-2), false);
  assert.equal('sync' in reopened.sections[0].blocks.at(-2), false);
  assert.equal('anchor' in reopened.sections[0].blocks.at(-2), false);
  assert.equal('relativeOffset' in reopened.sections[0].blocks.at(-2), false);
  assert.equal(reopened.sections[0].blocks.at(-2).label, 'Front view');
  assert.equal(reopened.sections[0].blocks.at(-2).sourceLabel, 'Front source');
  assert.equal(reopened.sections[0].blocks.at(-1).left.segment.out, 89);
  assert.deepEqual(reopened.sections[0].blocks.at(-1).right.segment, { in: 3, out: 86 });
  assert.deepEqual(reopened.sections[0].blocks.at(-2).segment, { in: 8, out: 74 });
  assert.equal('playback' in reopened.sections[0].blocks.at(-2), false);
  assert.deepEqual(reopened.sections[0].blocks.at(-1).sync, { leftFrame: 100, rightFrame: 400 });
  assert.equal('anchor' in reopened.sections[0].blocks.at(-1).left, false);
  assert.equal('anchor' in reopened.sections[0].blocks.at(-1).right, false);
  assert.equal('binding' in reopened.sections[0].blocks.at(-1), false);
  assert.equal('playback' in reopened.sections[0].blocks.at(-1), false);
  assert.equal('segment' in reopened.sections[0].blocks.at(-1), false);
});

test('clears legacy comparison sync and side anchors without creating replacement state', async () => {
  const created = await store.createProject('Legacy binding migration');
  const snapshot = await store.openProject(created.id);
  snapshot.sections[0].blocks.push({
    id: 'legacy-comparison',
    type: 'comparisonVideo',
    sync: { mode: 'frame', startAnchor: { observedTime: 0.5, frameIndex: 15 } },
    left: { anchor: { observedTime: 1.1, frameIndex: 33 } },
    right: { anchor: { observedTime: 1.4, frameIndex: 42 } },
  });

  const saved = await store.saveProject(snapshot);
  assert.equal('binding' in saved.sections[0].blocks.at(-1), false);
  assert.equal('sync' in saved.sections[0].blocks.at(-1), false);
  assert.equal('anchor' in saved.sections[0].blocks.at(-1).left, false);
  assert.equal('anchor' in saved.sections[0].blocks.at(-1).right, false);
  const reopened = await store.openProject(created.id);
  assert.equal('binding' in reopened.sections[0].blocks.at(-1), false);
  assert.deepEqual(reopened.sections[0].blocks.at(-1).sync, { leftFrame: 0, rightFrame: 0 });
});

test('preserves a zero-based 0/0 dual sync point while clearing retired fields', async () => {
  const created = await store.createProject('Zero dual sync');
  const snapshot = await store.openProject(created.id);
  snapshot.sections[0].blocks.push({
    id: 'zero-dual-sync',
    type: 'comparisonVideo',
    sync: { leftFrame: 0, rightFrame: 0 },
    binding: { enabled: true },
    anchor: { frameIndex: 0 },
    left: { anchor: { frameIndex: 0 } },
    right: { anchor: { frameIndex: 0 } },
  });

  const saved = await store.saveProject(snapshot);
  const block = saved.sections[0].blocks.at(-1);
  assert.deepEqual(block.sync, { leftFrame: 0, rightFrame: 0 });
  assert.equal('binding' in block, false);
  assert.equal('anchor' in block, false);
  assert.equal('anchor' in block.left, false);
  assert.equal('anchor' in block.right, false);
});

test('drops malformed dual sync points while preserving valid frame pairs only', async () => {
  const created = await store.createProject('Dual sync validation');
  const snapshot = await store.openProject(created.id);
  snapshot.sections[0].blocks.push({
    id: 'invalid-dual-sync',
    type: 'comparisonVideo',
    sync: { leftFrame: 10.5, rightFrame: -1 },
    left: { mediaAssetId: 'asset-front' },
    right: { mediaAssetId: 'asset-side' },
  });

  const saved = await store.saveProject(snapshot);
  const block = saved.sections[0].blocks.at(-1);
  assert.equal('sync' in block, false);
  assert.equal('binding' in block, false);
  assert.equal('anchor' in block, false);
});

test('previews strict UTF-8 txt/md imports and persists imported content across reopen', async () => {
  const created = await store.createProject('Text import test');
  const textPath = path.join(testRoot, 'incoming-notes.md');
  await fs.writeFile(textPath, '\ufeff# 投球摘要\n\n肩線在釋球點略早開。', 'utf8');

  const imported = await store.readTextImportFile(textPath);
  assert.deepEqual(imported, {
    fileName: 'incoming-notes.md',
    content: '# 投球摘要\n\n肩線在釋球點略早開。',
  });
  const saved = await store.insertTextBlock(created.id, {
    sectionId: 'summary',
    ...imported,
  });
  assert.match(saved.sections[1].blocks[0].content, /肩線在釋球點略早開/u);

  const reopened = await store.openProject(created.id);
  assert.match(reopened.sections[1].blocks[0].content, /# 投球摘要/u);
  assert.match(reopened.sections[1].blocks[0].content, /肩線在釋球點略早開/u);
});

test('rejects unsafe, empty, and invalid-UTF-8 text imports without creating a blank block', async () => {
  const created = await store.createProject('Text import errors');
  const emptyPath = path.join(testRoot, 'empty.txt');
  const invalidPath = path.join(testRoot, 'invalid.md');
  await fs.writeFile(emptyPath, Buffer.alloc(0));
  await fs.writeFile(invalidPath, Buffer.from([0xc3, 0x28]));

  await assert.rejects(store.readTextImportFile(path.join(testRoot, 'notes.pdf')), /Only \.txt and \.md/iu);
  await assert.rejects(store.readTextImportFile(emptyPath), /empty/iu);
  await assert.rejects(store.readTextImportFile(invalidPath), /valid UTF-8/iu);
  await assert.rejects(
    store.insertTextBlock(created.id, { sectionId: 'summary', fileName: 'blank.md', content: '   ' }),
    /empty/iu,
  );
  const reopened = await store.openProject(created.id);
  assert.equal(reopened.sections[1].blocks[0].content, '');
});

test('registers project-local media with explicit unknown/discovered status and removes it safely', async () => {
  const created = await store.createProject('Media register test');
  const sourcePath = path.join(testRoot, 'fixture-frame.png');
  await fs.writeFile(sourcePath, Buffer.from('not-a-private-media-fixture'));

  const registered = await store.registerMediaFiles(created.id, [sourcePath]);
  assert.equal(registered.media.length, 1);
  const asset = registered.media[0];
  assert.equal(asset.projectId, created.id);
  assert.equal(asset.lifecycleStatus, 'discovered');
  assert.equal(asset.metadata.frameTiming, 'unknown');
  assert.equal(asset.metadata.width, null);
  assert.equal(asset.metadata.height, null);
  assert.match(asset.sourceReference.relativePath, new RegExp(`^projects/${created.id}/media/original/`, 'u'));
  assert.doesNotMatch(JSON.stringify(asset), new RegExp(testRoot.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.equal(await fs.stat(path.join(testRoot, asset.sourceReference.relativePath)).then((stats) => stats.isFile()), true);

  const reopened = await store.openProject(created.id);
  assert.equal(reopened.media[0].id, asset.id);
  const removed = await store.removeMediaAsset(created.id, asset.id);
  assert.deepEqual(removed.media, []);
  await assert.rejects(fs.stat(path.join(testRoot, asset.sourceReference.relativePath)), /ENOENT/iu);
});

test('resolves player media only through real project-local files', async (t) => {
  const created = await store.createProject('Media source resolver');
  const sourcePath = path.join(testRoot, 'resolver-source.mp4');
  await fs.writeFile(sourcePath, Buffer.from('fixture'));
  const registered = await store.registerMediaFiles(created.id, [sourcePath]);
  const asset = registered.media[0];

  const resolved = await store.resolveMediaAssetSource(created.id, asset.id);
  assert.equal(resolved.relativePath, asset.sourceReference.relativePath);
  assert.equal(await fs.realpath(resolved.sourcePath), resolved.sourcePath);
  assert.equal(isPathInside(store.projectDirectory(created.id), resolved.sourcePath), true);

  const outsidePath = path.join(testRoot, 'resolver-outside.mp4');
  const linkedPath = path.join(store.projectDirectory(created.id), 'media', 'original', 'linked.mp4');
  await fs.writeFile(outsidePath, Buffer.from('outside fixture'));
  try {
    await fs.symlink(outsidePath, linkedPath, 'file');
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') {
      t.skip(`file symlink creation is unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  const snapshot = await store.openProject(created.id);
  snapshot.media[0].sourceReference.relativePath = `projects/${created.id}/media/original/linked.mp4`;
  await store.saveProject(snapshot);
  await assert.rejects(
    store.resolveMediaAssetSource(created.id, asset.id),
    /symlink|realpath|contained|regular file/iu,
  );
  await fs.rm(linkedPath, { force: true });
});

test('protects media assets referenced by report blocks from removal', async () => {
  const created = await store.createProject('Media reference protection');
  const sourcePath = path.join(testRoot, 'referenced-frame.png');
  await fs.writeFile(sourcePath, Buffer.from('fixture'));
  const registered = await store.registerMediaFiles(created.id, [sourcePath]);
  const snapshot = await store.openProject(created.id);
  snapshot.sections[0].blocks.push({
    id: 'image-reference',
    type: 'image',
    mediaAssetId: registered.media[0].id,
  });
  await store.saveProject(snapshot);
  await assert.rejects(
    store.removeMediaAsset(created.id, registered.media[0].id),
    /referenced by a report block/iu,
  );
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

test('rejects a projects directory symlink that escapes the validated project root', async (t) => {
  const root = await fs.mkdtemp(path.join(repositoryRoot, '.tmp', 'storage-projects-root-'));
  const outsideRoot = await fs.mkdtemp(path.join(repositoryRoot, '.tmp', 'storage-projects-outside-'));
  const linkedProjects = path.join(root, 'projects');
  try {
    try {
      await fs.symlink(outsideRoot, linkedProjects, 'junction');
    } catch (error) {
      if (error.code === 'EPERM' || error.code === 'EACCES') {
        t.skip(`junction creation is unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    await assert.rejects(
      validateProjectRoot(root, root),
      /Projects directory realpath escapes the project boundary/,
    );
    assert.deepEqual(await fs.readdir(outsideRoot), []);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outsideRoot, { recursive: true, force: true });
  }
});

test('does not list or open a project directory symlink', async (t) => {
  const outsideRoot = await fs.mkdtemp(path.join(repositoryRoot, '.tmp', 'storage-project-outside-'));
  const linkedProject = path.join(store.projectsRoot, 'linked-project');
  try {
    try {
      await fs.symlink(outsideRoot, linkedProject, 'junction');
    } catch (error) {
      if (error.code === 'EPERM' || error.code === 'EACCES') {
        t.skip(`junction creation is unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    await assert.rejects(store.openProject('linked-project'), /Project directory is invalid/);
    assert.equal((await store.listProjects()).some((project) => project.id === 'linked-project'), false);
  } finally {
    await fs.rm(linkedProject, { recursive: true, force: true });
    await fs.rm(outsideRoot, { recursive: true, force: true });
  }
});
