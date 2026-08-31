'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ExportValidationError, normalizeRelativeAssetPath } = require('./asset-paths');

const ELECTRON_HARNESS = String.raw`
'use strict';

const fs = require('node:fs/promises');
const { app, BrowserWindow, session } = require('electron');

const args = process.argv.slice(1);
const fileUrl = args[args.length - 2];
const resultPath = args[args.length - 1];
const externalRequests = [];
const navigationAttempts = [];

async function writeResult(result) {
  await fs.writeFile(resultPath, JSON.stringify(result, null, 2), 'utf8');
}

function protocolOf(value) {
  try {
    return new URL(value).protocol;
  } catch {
    return '';
  }
}

async function finish(result, window) {
  if (window && !window.isDestroyed()) window.destroy();
  await writeResult(result);
  app.quit();
}

app.on('window-all-closed', (event) => event.preventDefault());

app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    if (protocolOf(details.url) !== 'file:') {
      externalRequests.push({ url: details.url, resourceType: details.resourceType });
      callback({ cancel: true });
      return;
    }
    callback({ cancel: false });
  });

  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (protocolOf(url) !== 'file:') navigationAttempts.push({ type: 'window-open', url });
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (protocolOf(url) !== 'file:') {
      navigationAttempts.push({ type: 'navigate', url });
      event.preventDefault();
    }
  });

  let loadError = null;
  window.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (isMainFrame) loadError = { errorCode, errorDescription, validatedURL };
  });

  try {
    await window.loadURL(fileUrl);
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (loadError) {
      throw new Error('file:// load failed: ' + loadError.errorDescription + ' (' + loadError.errorCode + ')');
    }
    const documentState = await window.webContents.executeJavaScript([
      '(() => {',
      '  const media = [...document.querySelectorAll("img,video")].map((element) => {',
      '    const tagName = element.tagName.toLowerCase();',
      '    const sourceAttribute = element.getAttribute("src");',
      '    const posterAttribute = element.getAttribute("poster");',
      '    return {',
      '      kind: tagName === "img" ? "image" : "video",',
      '      tagName,',
      '      sourceAttribute,',
      '      sourceUrl: element.currentSrc || element.src || "",',
      '      posterAttribute,',
      '      posterUrl: element.poster || "",',
      '    };',
      '  });',
      '  return { readyState: document.readyState, title: document.title, media };',
      '})()',
    ].join('\n'), true);
    const nonFileMedia = documentState.media.filter((media) => [media.sourceUrl, media.posterUrl]
      .filter(Boolean)
      .some((url) => protocolOf(url) !== 'file:'));
    const status = externalRequests.length === 0
      && navigationAttempts.length === 0
      && nonFileMedia.length === 0
      ? 'passed'
      : 'failed';
    await finish({
      status,
      runtime: 'electron',
      fileUrl,
      readyState: documentState.readyState,
      title: documentState.title,
      mediaElements: documentState.media,
      nonFileMedia,
      externalRequests,
      navigationAttempts,
    }, window);
  } catch (error) {
    await finish({
      status: 'failed',
      runtime: 'electron',
      fileUrl,
      error: error instanceof Error ? error.message : String(error),
      externalRequests,
      navigationAttempts,
    }, window);
  }
}).catch(async (error) => {
  try {
    await writeResult({
      status: 'failed',
      runtime: 'electron',
      fileUrl,
      error: error instanceof Error ? error.message : String(error),
      externalRequests,
      navigationAttempts,
    });
  } finally {
    app.quit();
  }
});
`;

async function resolveElectronPath(explicitPath) {
  if (typeof explicitPath === 'string' && explicitPath.length > 0) {
    const resolved = path.resolve(explicitPath);
    const stats = await fs.stat(resolved).catch(() => null);
    return stats?.isFile() ? { command: resolved, args: [] } : null;
  }
  try {
    const electron = require('electron');
    if (typeof electron === 'string') {
      const binaryStats = await fs.stat(electron).catch(() => null);
      const cliPath = path.join(path.dirname(require.resolve('electron')), 'cli.js');
      const cliStats = await fs.stat(cliPath).catch(() => null);
      if (binaryStats?.isFile() && cliStats?.isFile()) {
        return { command: process.execPath, args: [cliPath] };
      }
    }
  } catch {
    // Electron is an optional runtime for this seam; report it as unavailable below.
  }
  return null;
}

function readRuntimeResult(resultPath) {
  return fs.readFile(resultPath, 'utf8')
    .then((value) => JSON.parse(value))
    .catch(() => null);
}

async function readTextIfPresent(filePath) {
  return fs.readFile(filePath, 'utf8').catch(() => '');
}

function spawnElectron(electronPath, args, timeoutMs, resultPath, logPath) {
  return new Promise((resolve) => {
    const child = spawn(electronPath, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    let timer;
    const finish = async (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const electronLog = await readTextIfPresent(logPath);
      resolve({
        ...(result || {
          status: 'unavailable',
          reason: 'Electron exited without runtime evidence',
        }),
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        electronLog: electronLog.trim(),
        timedOut,
      });
    };
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.once('error', (error) => {
      finish({ status: 'unavailable', reason: `Electron could not be started: ${error.message}` });
    });
    child.once('close', async (code, signal) => {
      const result = await readRuntimeResult(resultPath);
      if (result) {
        finish(result);
        return;
      }
      finish({
        status: 'unavailable',
        reason: `Electron exited without runtime evidence (code=${code}, signal=${signal || 'none'})`,
      });
    });
    timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      setTimeout(() => finish({
        status: 'unavailable',
        reason: `Electron runtime smoke timed out after ${timeoutMs}ms`,
      }), 1000);
    }, timeoutMs);
  });
}

async function manifestHtmlName(folderPath) {
  try {
    const raw = await fs.readFile(path.join(folderPath, 'export-manifest.json'), 'utf8');
    const manifest = JSON.parse(raw);
    const entries = Array.isArray(manifest?.files) ? manifest.files : [];
    const htmlFiles = entries
      .map((entry) => entry?.relativePath)
      .filter((value) => typeof value === 'string' && /\.html$/iu.test(value));
    if (htmlFiles.length !== 1) return null;
    return normalizeRelativeAssetPath(htmlFiles[0], { allowRootFile: true });
  } catch {
    return null;
  }
}

async function resolveRuntimeHtmlPath(folderPath, explicitFileName) {
  const candidates = [];
  if (typeof explicitFileName === 'string' && explicitFileName.trim() !== '') {
    candidates.push(normalizeRelativeAssetPath(explicitFileName, { allowRootFile: true }));
  }
  candidates.push('report.html', 'index.html');
  const discovered = await manifestHtmlName(folderPath);
  if (discovered) candidates.push(discovered);

  for (const relativePath of [...new Set(candidates)]) {
    const candidate = path.resolve(folderPath, ...relativePath.split('/'));
    const relative = path.relative(path.resolve(folderPath), candidate);
    if (relative === '' || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) continue;
    const stats = await fs.stat(candidate).catch(() => null);
    if (stats?.isFile()) return { path: candidate, relativePath };
  }
  return null;
}

async function runLocalFileRuntimeSmoke({
  folderPath,
  reportFileName,
  electronPath,
  timeoutMs = 15000,
  expectedKinds = [],
} = {}) {
  if (typeof folderPath !== 'string' || folderPath.length === 0) {
    throw new ExportValidationError('Runtime smoke folderPath is required');
  }
  const resolvedFolder = path.resolve(folderPath);
  const htmlFile = await resolveRuntimeHtmlPath(resolvedFolder, reportFileName);
  if (!htmlFile) {
    throw new ExportValidationError(`Runtime smoke report HTML is unavailable: ${resolvedFolder}`);
  }
  const fileUrl = pathToFileURL(htmlFile.path).href;
  const resolvedElectron = await resolveElectronPath(electronPath);
  if (!resolvedElectron) {
    return {
      status: 'unavailable',
      runtime: 'electron',
      reason: 'Electron runtime executable is unavailable',
      fileUrl,
    };
  }

  // Keep harness, logs, and the isolated Electron profile inside the project.
  // The exported folder itself may be an intentional user-selected destination;
  // only runtime-smoke's internal files are constrained here.
  const projectRoot = path.resolve(__dirname, '..', '..');
  await fs.mkdir(path.join(projectRoot, '.tmp'), { recursive: true });
  const harnessRoot = await fs.mkdtemp(path.join(projectRoot, '.tmp', 'runtime-smoke-'));
  const harnessPath = path.join(harnessRoot, 'electron-runtime-harness.cjs');
  const resultPath = path.join(harnessRoot, 'result.json');
  const logPath = path.join(harnessRoot, 'electron.log');
  const userDataPath = path.join(harnessRoot, 'electron-user-data');
  await fs.writeFile(harnessPath, ELECTRON_HARNESS, 'utf8');
  const env = { ...process.env, ELECTRON_ENABLE_LOGGING: '1' };
  const args = [
    ...resolvedElectron.args,
    harnessPath,
    '--no-sandbox',
    `--user-data-dir=${userDataPath}`,
    `--log-file=${logPath}`,
    fileUrl,
    resultPath,
  ];
  const result = await spawnElectron(resolvedElectron.command, args, timeoutMs, resultPath, logPath);
  await fs.rm(harnessRoot, { recursive: true, force: true }).catch(() => {});
  if (result.status !== 'passed') return result;
  const mediaKinds = new Set(result.mediaElements.map((media) => media.kind));
  const missingKinds = expectedKinds.filter((kind) => !mediaKinds.has(kind));
  return missingKinds.length === 0
    ? result
    : {
      ...result,
      status: 'failed',
      reason: `Expected rendered media kinds were missing: ${missingKinds.join(', ')}`,
    };
}

module.exports = {
  runLocalFileRuntimeSmoke,
};
