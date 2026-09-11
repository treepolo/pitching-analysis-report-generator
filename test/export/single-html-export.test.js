'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const { createTestTemp } = require('../project-temp');
const { ExportJobController } = require('../../src/export/app-bridge');
const { inlineReportAssets } = require('../../src/export/single-html-packager');

let testRoot;

test.before(async () => {
  testRoot = await createTestTemp('pitch-report-single-html-test-');
});

test.after(async () => {
  if (testRoot) await fs.rm(testRoot, { recursive: true, force: true });
});

test('inlines images directly and stores each video payload once for lazy blob playback', async () => {
  const rootPath = path.join(testRoot, 'packager');
  const videoPath = path.join(rootPath, 'videos', '投 球.mp4');
  const imagePath = path.join(rootPath, 'images', 'background.jpg');
  await fs.mkdir(path.dirname(videoPath), { recursive: true });
  await fs.mkdir(path.dirname(imagePath), { recursive: true });
  await fs.writeFile(videoPath, Buffer.from('video-bytes'));
  await fs.writeFile(imagePath, Buffer.from('image-bytes'));

  const source = '<video src="videos/%E6%8A%95%20%E7%90%83.mp4"></video>'
    + '<video src="videos/%E6%8A%95%20%E7%90%83.mp4"></video>'
    + '<style>body{background:url("images/background.jpg")}</style>';
  const result = await inlineReportAssets({
    html: source,
    rootPath,
    stagedAssets: [
      { id: 'video', kind: 'video', relativePath: 'videos/投 球.mp4', mediaType: '' },
      { id: 'image', kind: 'image', relativePath: 'images/background.jpg', mediaType: 'image/jpeg' },
    ],
  });

  assert.equal((result.html.match(/data-tree-polo-inline-video-src="video-1"/gu) || []).length, 2);
  assert.equal((result.html.match(/dmlkZW8tYnl0ZXM=/gu) || []).length, 1);
  assert.match(result.html, /data-tree-polo-inline-video-payload="video-1"/u);
  assert.match(result.html, /data-tree-polo-inline-video-runtime/u);
  assert.match(result.html, /URL\.createObjectURL\(blob\)/u);
  assert.doesNotMatch(result.html, /data:video\/mp4;base64,/u);
  assert.match(result.html, /url\("data:image\/jpeg;base64,aW1hZ2UtYnl0ZXM="\)/u);
  assert.doesNotMatch(result.html, /videos\//u);
  assert.doesNotMatch(result.html, /images\/background\.jpg/u);
  assert.equal(result.inlinedAssetCount, 2);
  assert.deepEqual(result.unusedAssets, []);
});

test('single-html jobs do not request ZIP creation', async () => {
  let captured = null;
  const controller = new ExportJobController({
    exporter: async (input) => {
      captured = input;
      return { folderPath: input.outputDirectory, zipPath: null };
    },
  });
  const outputDirectory = path.join(testRoot, 'bridge-output');
  const started = await controller.start({
    projectId: 'project-1',
    projectRoot: testRoot,
    reportDocument: {
      schemaVersion: 1,
      title: 'Single HTML bridge',
      sections: [{ blocks: [{ type: 'rich-text', content: 'fixture' }] }],
    },
    assets: [],
    outputDirectory,
    reportName: 'Single HTML bridge',
    outputKind: 'single-html',
  });
  const completed = await controller.wait(started.jobId);

  assert.equal(completed.status, 'completed');
  assert.equal(captured.outputKind, 'single-html');
  assert.equal(captured.createZip, false);
});

test('preload export bridge accepts the single-html output contract', async () => {
  const preload = await fs.readFile(path.join(__dirname, '..', '..', 'src', 'preload.js'), 'utf8');
  assert.match(
    preload,
    /EXPORT_OUTPUT_KINDS\s*=\s*new Set\(\[[^\]]*['"]single-html['"][^\]]*\]\)/u,
  );
  assert.match(
    preload,
    /startExport:\s*\(request\)\s*=>\s*ipcRenderer\.invoke\('export:start',\s*assertExportRequest\(request\)\)/u,
  );
});

test('exports a portable report folder whose only payload is one self-contained HTML file', async () => {
  const sourceVideo = path.join(testRoot, 'single-html-source.mp4');
  const videoBytes = Buffer.from('single-html-video-fixture');
  await fs.writeFile(sourceVideo, videoBytes);
  const outputDirectory = path.join(testRoot, 'single-html-output');
  const controller = new ExportJobController();
  const started = await controller.start({
    projectId: 'project-1',
    projectRoot: testRoot,
    reportDocument: {
      schemaVersion: 1,
      title: '手機單檔測試',
      sections: [{
        id: 'media',
        title: 'Media',
        blocks: [{
          type: 'singleVideo',
          mediaAssetId: 'pitch-video',
          label: 'Pitch',
        }],
      }],
    },
    assets: [{
      id: 'pitch-video',
      kind: 'video',
      sourceReference: {
        relativePath: path.relative(testRoot, sourceVideo).split(path.sep).join('/'),
      },
      displayName: 'single html pitch.mp4',
    }],
    outputDirectory,
    reportName: '手機單檔測試',
    outputKind: 'single-html',
  });
  const completed = await controller.wait(started.jobId);

  assert.equal(completed.status, 'completed', completed.error?.message);
  const result = completed.result;
  assert.equal(result.zipPath, null);
  assert.equal(result.zip, null);
  assert.equal(result.validation.valid, true);
  assert.equal(result.singleHtml.inlinedAssetCount, 3);
  assert.deepEqual(result.singleHtml.unusedAssets, []);
  assert.equal(result.manifest.format, 'pitching-analysis-report-single-html');
  assert.equal(result.manifest.packaging.kind, 'single-html');
  assert.equal(result.manifest.files.length, 1);
  assert.equal(result.manifest.files[0].relativePath, result.reportFileName);
  assert.equal(result.manifest.assets.every((asset) => asset.inlined === true), true);

  const finalEntries = await fs.readdir(result.folderPath);
  assert.deepEqual(finalEntries, [result.reportFileName]);
  const html = await fs.readFile(path.join(result.folderPath, result.reportFileName), 'utf8');
  assert.match(html, new RegExp(videoBytes.toString('base64'), 'u'));
  assert.match(html, /data-tree-polo-inline-video-payload="video-1"/u);
  assert.match(html, /data-tree-polo-inline-video-src="video-1"/u);
  assert.match(html, /URL\.createObjectURL\(blob\)/u);
  assert.doesNotMatch(html, /data:video\/mp4;base64,/u);
  assert.match(html, /data:image\/jpeg;base64,/u);
  assert.match(html, /data:image\/webp;base64,/u);
  assert.doesNotMatch(html, /src="videos\//u);
  assert.doesNotMatch(html, /poster="images\//u);
  assert.doesNotMatch(html, /url\(["']?images\//u);
  assert.equal(await fs.stat(path.join(result.folderPath, result.reportFileName)).then((stats) => stats.isFile()), true);
});
