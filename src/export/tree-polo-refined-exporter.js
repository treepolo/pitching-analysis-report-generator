'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { exportReport: exportLegacyBrandedReport } = require('./tree-polo-branded-exporter');
const { validateExportLayout } = require('./layout-validator');
const { createZipArchive, validateZipParity } = require('./zip-archive');

const LEGACY_BRAND_SUFFIX = '投球分析報告by小樹Polo';
const BRAND_SUFFIX = '報告by小樹Polo';

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function pathExists(candidate) {
  return fs.lstat(candidate).then(() => true, (error) => {
    if (error?.code === 'ENOENT') return false;
    throw error;
  });
}

function shortenBrandSuffix(value) {
  const text = String(value ?? '');
  return text.includes(LEGACY_BRAND_SUFFIX)
    ? text.replace(LEGACY_BRAND_SUFFIX, BRAND_SUFFIX)
    : text;
}

function refinedThemeCss() {
  return `<style data-tree-polo-refined-theme>
/* The report itself and the help content share the green brand family. The
   fixed "使用教學" launcher intentionally keeps its original blue styling. */
body>main .tree-polo-report-header{isolation:isolate;overflow:hidden;min-height:72px;padding-left:88px;background:linear-gradient(180deg,#31aa74 0%,#1b915e 39%,#11794e 49%,#095a3b 100%)}
/* A blurred copy of the actual logo is the molten color source. Screen blend
   makes its black field disappear into the header while the two logo greens
   diffuse outward and fade into the surrounding header glass. */
body>main .tree-polo-report-header::before{display:block!important;content:""!important;position:absolute;z-index:0;left:-34px;top:-34px;width:194px;height:142px;border:0!important;border-radius:50%;background-image:radial-gradient(ellipse at 49% 48%,rgba(215,255,153,.20) 0 14%,rgba(25,190,112,.16) 34%,rgba(9,103,67,.08) 57%,transparent 76%),var(--tree-polo-logo);background-repeat:no-repeat;background-position:center,38px 48%;background-size:100% 100%,92px 92px;mix-blend-mode:screen;opacity:.84;filter:blur(11px) saturate(1.48) contrast(1.08);-webkit-mask-image:radial-gradient(ellipse 72% 78% at 50% 50%,#000 0 46%,rgba(0,0,0,.82) 61%,rgba(0,0,0,.34) 74%,transparent 88%);mask-image:radial-gradient(ellipse 72% 78% at 50% 50%,#000 0 46%,rgba(0,0,0,.82) 61%,rgba(0,0,0,.34) 74%,transparent 88%);pointer-events:none}
/* Thin specular layer: no outline, only refraction/highlight, so the logo area
   reads as slightly raised glass rather than an inserted image tile. */
body>main .tree-polo-report-header::after{content:"";position:absolute;z-index:1;left:-1px;top:4px;width:84px;height:62px;border:0;border-radius:46% 54% 50% 48%;background:linear-gradient(145deg,rgba(244,255,247,.30) 0%,rgba(222,255,181,.10) 27%,transparent 48%),radial-gradient(ellipse at 48% 60%,rgba(0,67,43,.12),transparent 68%);box-shadow:inset 0 2px 2px rgba(246,255,249,.22),inset 0 -4px 7px rgba(0,48,31,.15),0 4px 9px rgba(0,44,28,.12);filter:blur(.25px);opacity:.82;pointer-events:none}
body>main .tree-polo-brand-logo{z-index:2;left:11px;top:7px;width:58px;height:58px;object-fit:contain;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;mix-blend-mode:screen;opacity:.97;transform:translateY(-1.5px) scale(1.055);filter:saturate(1.16) contrast(1.10) drop-shadow(0 2px 1px rgba(0,42,27,.48)) drop-shadow(0 -1px 1px rgba(229,255,217,.25));-webkit-mask-image:radial-gradient(ellipse 76% 82% at 50% 50%,#000 47%,rgba(0,0,0,.98) 61%,rgba(0,0,0,.68) 76%,transparent 100%);mask-image:radial-gradient(ellipse 76% 82% at 50% 50%,#000 47%,rgba(0,0,0,.98) 61%,rgba(0,0,0,.68) 76%,transparent 100%)}
body>main .tree-polo-brand-copy{position:relative;z-index:2}

.report-help-backdrop{background:rgba(10,37,27,.34)}
.report-help-dialog{border-color:#688d79;background:#f5faf7;color:#183126;box-shadow:0 18px 54px rgba(0,44,28,.32),inset 1px 1px 0 #fff}
.report-help-header{top:8px;margin:10px 10px 0;padding:15px 16px 13px;border:1px solid #668d78!important;border-radius:3px;background:linear-gradient(#fbfffc,#e2f1e8);box-shadow:inset 1px 1px 0 rgba(255,255,255,.92),0 2px 5px rgba(21,79,52,.16)}
.report-help-header h2{color:#174e36}.report-help-header p{color:#526b5e}
.report-help-close{border-color:#789686;background:linear-gradient(#fff,#dceae2);color:#294c3b}
.report-help-content h3{color:#214e38}
.report-help-figure{border-color:#91a99c;background:#e4eee8}.report-help-figure figcaption{color:#50675b}
.report-help-live-preview-empty{border-color:#90aa9b;background:#f0f6f2;color:#536a5e}
.report-help-guide li{border-color:#c4d6cc;background:#fff}.report-help-guide p{color:#4a6255}
.report-help-number,.report-help-preview-marker,.report-help-live-marker{background:#23865a}
.report-help-live-marker.is-current{background:#5c8f31}
.report-help-live-target{outline-color:rgba(35,134,90,.72)!important}.report-help-live-target.is-current{outline-color:#5c8f31!important}
.report-help-shortcut{border-color:#bfd1c7;background:#fff}.report-help-shortcut kbd{border-color:#789686;background:#f5faf7}
.report-help-note{border-left-color:#3f8b65;background:#e9f5ee;color:#405d4e}
.report-help-actions{border-top-color:#bfd1c7}.report-help-actions span{color:#536b5f}
.report-help-tutorial-button{border-color:#5e856f;background:linear-gradient(#fff,#e3f1e9 48%,#c7dfd1 52%,#edf7f1);color:#1b4a34}
.report-help-tutorial-panel{border-color:#668d78;background:#f5faf7;color:#173c2b;box-shadow:0 8px 28px rgba(0,46,30,.28),inset 1px 1px 0 #fff}
.report-help-tutorial-panel-header{border-bottom-color:#afc8bb;background:linear-gradient(#fbfffc,#dfeee6)}
.report-help-tutorial-step{color:#4d685a}.report-help-tutorial-copy p{color:#456052}
.report-help-tutorial-stop{border-color:#64846f;background:linear-gradient(#fff,#dcebe2);color:#244b37}
.report-help-tutorial-controls button{border-color:#708e7e;background:linear-gradient(#fff,#dcebe3);color:#234b37}
@media(max-width:700px){body>main .tree-polo-report-header{padding-left:74px}body>main .tree-polo-brand-logo{left:9px;top:8px;width:50px;height:50px}body>main .tree-polo-report-header::before{left:-38px;top:-35px;width:174px;height:128px;background-position:center,36px 48%;background-size:100% 100%,80px 80px}body>main .tree-polo-report-header::after{left:-3px;top:5px;width:75px;height:55px}}
</style>`;
}

function addLogoColorSource(html) {
  const source = String(html);
  const logoMatch = source.match(/<img\s+class="tree-polo-brand-logo"\s+src="([^"]+)"/u);
  if (!logoMatch) return source;
  const cssUrl = logoMatch[1].replaceAll("'", '%27');
  return source.replace(
    '<header class="report-header tree-polo-report-header">',
    `<header class="report-header tree-polo-report-header" style="--tree-polo-logo:url('${cssUrl}')">`,
  );
}

function refineHtml(html) {
  let output = shortenBrandSuffix(String(html));
  output = addLogoColorSource(output);
  const css = refinedThemeCss();
  if (output.includes('data-tree-polo-refined-theme')) return output;
  return output.includes('</head>')
    ? output.replace('</head>', `${css}\n</head>`)
    : `${css}\n${output}`;
}

function requestedOutputKind(options) {
  return typeof options?.outputKind === 'string' ? options.outputKind : 'folder';
}

function automaticZipPath(folderParent, safeName) {
  return path.join(folderParent, `${safeName}_offline.zip`);
}

async function availableSafeName(parent, desired, { needsFolder, needsZip }) {
  let suffix = 1;
  while (true) {
    const candidate = suffix === 1 ? desired : `${desired}-${suffix}`;
    const folderBusy = needsFolder && await pathExists(path.join(parent, candidate));
    const zipBusy = needsZip && await pathExists(automaticZipPath(parent, candidate));
    if (!folderBusy && !zipBusy) return candidate;
    suffix += 1;
  }
}

async function rewriteManifest(folderPath, manifest) {
  await fs.writeFile(
    path.join(folderPath, 'export-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
}

async function refineFolder(baseResult, options, needsZip) {
  const sourceFolder = baseResult.folderPath;
  if (!sourceFolder) throw new Error('Refined Tree Polo export requires a temporary folder');
  const parent = path.dirname(sourceFolder);
  const desiredName = shortenBrandSuffix(baseResult.safeName);
  const safeName = await availableSafeName(parent, desiredName, {
    needsFolder: true,
    needsZip,
  });

  const sourceHtmlName = baseResult.reportFileName || `${baseResult.safeName}.html`;
  const targetHtmlName = `${safeName}.html`;
  const sourceHtmlPath = path.join(sourceFolder, sourceHtmlName);
  const targetHtmlPath = path.join(sourceFolder, targetHtmlName);
  const sourceHtml = await fs.readFile(sourceHtmlPath, 'utf8');
  const html = refineHtml(sourceHtml);
  await fs.writeFile(targetHtmlPath, html, sourceHtmlName === targetHtmlName ? 'utf8' : { encoding: 'utf8', flag: 'wx' });
  if (sourceHtmlName !== targetHtmlName) await fs.rm(sourceHtmlPath, { force: true });

  const manifestPath = path.join(sourceFolder, 'export-manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (manifest.report && typeof manifest.report === 'object') manifest.report.safeName = safeName;
  const htmlBuffer = Buffer.from(html, 'utf8');
  manifest.files = (manifest.files || []).map((file) => (
    file?.relativePath === sourceHtmlName
      ? { relativePath: targetHtmlName, byteLength: htmlBuffer.length, sha256: sha256(htmlBuffer) }
      : file
  ));
  await rewriteManifest(sourceFolder, manifest);

  const validation = await validateExportLayout(sourceFolder, {
    assetManifest: manifest.assets || [],
    html,
    htmlFileName: targetHtmlName,
    requireAllManifestAssetsUsed: false,
    verifyManifest: true,
  });
  manifest.validation = {
    valid: validation.valid,
    assetCount: validation.assetCount,
    referencedAssetCount: validation.referencedAssetCount,
  };
  await rewriteManifest(sourceFolder, manifest);

  const targetFolder = path.join(parent, safeName);
  await fs.rename(sourceFolder, targetFolder);
  return {
    safeName,
    folderPath: targetFolder,
    reportFileName: targetHtmlName,
    html,
    manifest,
    validation,
  };
}

async function exportReport(options = {}) {
  const outputKind = requestedOutputKind(options);
  const needsZip = options.createZip === true || outputKind === 'zip' || outputKind === 'both';
  const legacyResult = await exportLegacyBrandedReport({
    ...options,
    outputKind: needsZip ? 'both' : 'folder',
    createZip: needsZip,
  });

  let refined = null;
  let finalZipPath = null;
  try {
    refined = await refineFolder(legacyResult, options, needsZip);

    let zip = null;
    if (needsZip) {
      if (legacyResult.zipPath) await fs.rm(legacyResult.zipPath, { force: true });
      finalZipPath = automaticZipPath(path.dirname(refined.folderPath), refined.safeName);
      zip = await createZipArchive(refined.folderPath, finalZipPath);
      zip.parity = await validateZipParity(refined.folderPath, finalZipPath);
    }

    let folderPath = refined.folderPath;
    if (outputKind === 'zip') {
      await fs.rm(folderPath, { recursive: true, force: true });
      folderPath = null;
    }

    return {
      ...legacyResult,
      safeName: refined.safeName,
      folderPath,
      zipPath: finalZipPath,
      reportFileName: refined.reportFileName,
      manifest: refined.manifest,
      validation: refined.validation,
      zip,
    };
  } catch (error) {
    if (legacyResult.zipPath) await fs.rm(legacyResult.zipPath, { force: true }).catch(() => {});
    if (finalZipPath) await fs.rm(finalZipPath, { force: true }).catch(() => {});
    if (refined?.folderPath) await fs.rm(refined.folderPath, { recursive: true, force: true }).catch(() => {});
    else if (legacyResult.folderPath) await fs.rm(legacyResult.folderPath, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

module.exports = {
  BRAND_SUFFIX,
  LEGACY_BRAND_SUFFIX,
  addLogoColorSource,
  exportReport,
  refineHtml,
  refinedThemeCss,
  shortenBrandSuffix,
};
