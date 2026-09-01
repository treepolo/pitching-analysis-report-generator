'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { ExportValidationError } = require('./asset-paths');
const { exportReport: exportLegacyBrandedReport } = require('./tree-polo-branded-exporter');
const { validateExportLayout } = require('./layout-validator');
const { createZipArchive, validateZipParity } = require('./zip-archive');

const LEGACY_BRAND_SUFFIX = '投球分析報告by小樹Polo';
const BRAND_SUFFIX = '報告by小樹Polo';
const REPORT_BACKGROUND_ASSET_ID = '__tree_polo_report_background__';
const REPORT_BACKGROUND_MEDIA_TYPE = 'image/jpeg';
const REPORT_BACKGROUND_RELATIVE_PATH = 'images/tree-polo-report-background.jpg';
const REPORT_BACKGROUND_SOURCE_PATH = path.join(__dirname, 'tree-polo-report-background.jpg');

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
    ? text.replaceAll(LEGACY_BRAND_SUFFIX, BRAND_SUFFIX)
    : text;
}

function stylizeBrandSignature(html) {
  return String(html).replace(
    /(<h1>[^<]*?報告)by小樹Polo(<\/h1>)/u,
    '$1<span class="tree-polo-signature">by<span class="tree-polo-signature-tree">小樹</span><span class="tree-polo-signature-polo">Polo</span></span>$2',
  );
}

function removeRedundantHelpCopy(html) {
  return String(html)
    .replace('<p>以下圖解直接使用這份報告中的實際播放器介面。</p>', '')
    .replace('<h3>實際播放器圖解</h3>', '')
    .replace(
      '<figcaption>這裡會直接複製本報告中的實際播放器介面，因此按鈕排列、標註控制、進度條與速度控制會和你正在看的報告一致。藍色編號與下方說明相同。</figcaption>',
      '',
    );
}

function refinedThemeCss() {
  return `<style data-tree-polo-refined-theme>
html{background:#d8e8df!important}
body{background:transparent!important;position:relative;isolation:isolate}
body::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background-color:#d8e8df;background-image:url("${REPORT_BACKGROUND_RELATIVE_PATH}");background-size:cover;background-position:center;background-repeat:no-repeat}
/* Report and help content use the Tree Polo green family. Help buttons keep
   their original styling so interactive affordances remain visually distinct. */
body>main .tree-polo-report-header{position:relative;display:flex;align-items:center;isolation:isolate;overflow:hidden;min-height:70px;margin:0 -8px 8px;padding:8px 12px 8px 76px;border-bottom:1px solid #084a31;background:linear-gradient(180deg,#2aa56e 0%,#188b5b 42%,#10754b 48%,#09593a 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.42),inset 0 -2px 0 rgba(177,255,101,.28),0 1px 2px rgba(0,0,0,.28);color:#fff}
/* Rectangular molten field. A blurred copy of the real logo supplies its own
   black / dark-green / lime colours, while the surrounding rectangular fade
   transitions those colours into the original title-bar green. */
body>main .tree-polo-report-header::before{display:block!important;content:""!important;position:absolute;z-index:0;left:2px;top:3px;width:86px;height:64px;border:0!important;border-radius:11px;background-image:linear-gradient(90deg,rgba(0,0,0,.24) 0 44%,rgba(4,72,46,.16) 63%,rgba(18,133,83,.08) 78%,transparent 100%),var(--tree-polo-logo);background-repeat:no-repeat;background-position:center,10px center;background-size:100% 100%,54px 54px;opacity:.86;filter:blur(7px) saturate(1.32) contrast(1.06);box-shadow:8px 0 16px rgba(8,91,58,.20);pointer-events:none}
/* Slightly raised rectangular glass skin over the logo area. It has no hard
   border; highlights and inset shading provide the elevation instead. */
body>main .tree-polo-report-header::after{content:"";position:absolute;z-index:1;left:7px;top:5px;width:64px;height:58px;border:0;border-radius:8px;background:linear-gradient(145deg,rgba(245,255,248,.23) 0%,rgba(204,255,165,.07) 31%,transparent 52%),linear-gradient(180deg,transparent 58%,rgba(0,43,28,.11) 100%);box-shadow:inset 0 2px 2px rgba(247,255,250,.20),inset 0 -4px 7px rgba(0,44,29,.18),0 3px 7px rgba(0,39,25,.15);opacity:.84;pointer-events:none}
/* Keep the original black logo field intact. The image is not screened,
   masked or made transparent; the surrounding molten field handles fusion. */
body>main .tree-polo-brand-logo{z-index:2;left:10px;top:8px;width:54px;height:54px;object-fit:cover;border:0!important;border-radius:3px;background:#000!important;box-shadow:0 2px 3px rgba(0,0,0,.34),0 -1px 1px rgba(218,255,194,.14);mix-blend-mode:normal!important;opacity:1;transform:translateY(-1px) scale(1.018);filter:saturate(1.06) contrast(1.04)}
body>main .tree-polo-brand-copy{position:relative;z-index:2;min-width:0}
/* Keep the platform font stack but remove the heavy web-banner treatment.
   The title is smaller/lighter, with wider breathing room and only a faint
   one-pixel lower-edge shadow. */
body>main .tree-polo-report-header h1{font-family:Tahoma,"Segoe UI","Microsoft JhengHei","Microsoft YaHei",sans-serif!important;font-size:18px!important;font-weight:500!important;line-height:1.28!important;letter-spacing:.035em!important;color:#f3f8f5!important;text-shadow:0 1px 0 rgba(0,39,25,.24)!important}
/* The byline is deliberately subordinate to the report/person name. */
body>main .tree-polo-signature{display:inline-block;font-size:.86em;font-weight:500;letter-spacing:.025em;margin-left:.08em;vertical-align:.035em}
body>main .tree-polo-signature-tree{color:#42d392!important;font-weight:550;text-shadow:0 1px 0 rgba(0,49,30,.24)}
body>main .tree-polo-signature-polo{color:#b9ff68!important;font-weight:550;text-shadow:0 1px 0 rgba(0,49,30,.22)}

.report-help-backdrop{background:rgba(10,37,27,.34)}
.report-help-dialog{border-color:#688d79;background:#f5faf7;color:#183126;box-shadow:0 18px 54px rgba(0,44,28,.32),inset 1px 1px 0 #fff}
/* Do not pin the help heading while the dialog scrolls. It is a normal framed
   section at the top of the document, not a floating/sticky application bar. */
.report-help-header{position:relative!important;top:auto!important;margin:10px 10px 0;padding:15px 16px 13px;border:1px solid #668d78!important;border-radius:3px;background:linear-gradient(#fbfffc,#e2f1e8);box-shadow:inset 1px 1px 0 rgba(255,255,255,.92),0 2px 5px rgba(21,79,52,.16)}
/* Base report CSS also styles h2 headings; override the help title itself so
   the strip cannot retain the old blue gradient. */
.report-help-header h2{margin:0 0 4px!important;padding:4px 8px!important;border:1px solid #83a994!important;border-bottom-color:#5f8f76!important;border-radius:2px;background:linear-gradient(180deg,#edf8f2 0%,#d7eee1 48%,#c2e2d0 100%)!important;box-shadow:inset 1px 1px 0 rgba(255,255,255,.88);color:#174e36!important}
.report-help-header p{color:#526b5e}
.report-help-content h3{color:#214e38}
.report-help-figure{border-color:#91a99c;background:#e4eee8}.report-help-figure figcaption{color:#50675b}
.report-help-live-preview-empty{border-color:#90aa9b;background:#f0f6f2;color:#536a5e}
.report-help-guide li{border-color:#c4d6cc;background:#fff}.report-help-guide p{color:#4a6255}
.report-help-number,.report-help-preview-marker{background:#23865a}
.report-help-live-target{outline-color:rgba(35,134,90,.72)!important}.report-help-live-target.is-current{outline-color:#5c8f31!important}
.report-help-shortcut{border-color:#bfd1c7;background:#fff}.report-help-shortcut kbd{border-color:#789686;background:#f5faf7}
.report-help-note{border-left-color:#3f8b65;background:#e9f5ee;color:#405d4e}
.report-help-actions{border-top-color:#bfd1c7}.report-help-actions span{color:#536b5f}
.report-help-tutorial-panel{border-color:#668d78;background:#f5faf7;color:#173c2b;box-shadow:0 8px 28px rgba(0,46,30,.28),inset 1px 1px 0 #fff}
.report-help-tutorial-panel-header{border-bottom-color:#afc8bb;background:linear-gradient(#fbfffc,#dfeee6)}
.report-help-tutorial-step{color:#4d685a}.report-help-tutorial-copy p{color:#456052}
@media(max-width:700px){body>main .tree-polo-report-header{min-height:62px;padding-left:66px}body>main .tree-polo-brand-logo{left:9px;top:8px;width:46px;height:46px}body>main .tree-polo-report-header::before{left:2px;top:4px;width:75px;height:54px;border-radius:9px;background-position:center,9px center;background-size:100% 100%,46px 46px;filter:blur(6px) saturate(1.28)}body>main .tree-polo-report-header::after{left:6px;top:6px;width:55px;height:49px;border-radius:7px}body>main .tree-polo-report-header h1{font-size:16px!important;letter-spacing:.025em!important}body>main .tree-polo-signature{font-size:.84em}}

/* Medium-inspired visual layer. This deliberately changes appearance only:
   existing report/player/help geometry, control count and player layouts stay intact. */
:root{--reader-face:#fff;--reader-face-light:#fafafa;--reader-text:#242424;--reader-muted:#6b6b6b;--reader-line:#e6e6e6;--reader-input-line:#d0d0d0;--reader-blue:#1a8917;--reader-blue-dark:#156d12;--reader-green:#1a8917}
body>main{border-color:#e6e6e6!important;background:#fff!important;box-shadow:0 2px 12px rgba(0,0,0,.08)!important;color:#242424!important}
body>main .tree-polo-report-header{border-bottom-color:#e6e6e6!important;background:#fff!important;box-shadow:none!important;color:#242424!important}
body>main .tree-polo-report-header::before,body>main .tree-polo-report-header::after{display:none!important}
body>main .tree-polo-brand-logo{box-shadow:none!important;filter:none!important}
body>main .tree-polo-report-header h1{color:#242424!important;text-shadow:none!important}
body>main .tree-polo-signature{color:#6b6b6b!important}
body>main .tree-polo-signature-tree,body>main .tree-polo-signature-polo{color:#1a8917!important;text-shadow:none!important}
body>main h2{border-bottom-color:#e6e6e6!important;background:#fff!important;box-shadow:none!important;color:#242424!important}
body>main h3{color:#242424!important}
body>main h4{border-bottom-color:#e6e6e6!important;color:#6b6b6b!important}
body>main .report-section{border-color:#e6e6e6!important;background:#fff!important;box-shadow:none!important}
body>main .report-text{color:#242424!important;font-family:Georgia,"Times New Roman","Noto Serif TC","PMingLiU",serif}
body>main figcaption{color:#6b6b6b!important}
body>main .report-media img{border-color:#e6e6e6!important;background:#fff!important}
body>main .portable-player{border-color:#e6e6e6!important;border-radius:8px!important;background:#fafafa!important;box-shadow:none!important}
body>main .portable-player-header{border-bottom-color:#e6e6e6!important}
body>main .portable-player-grid-side-by-side>.portable-player-side+.portable-player-side{border-left-color:#e6e6e6!important}
body>main .portable-player-grid-stacked>.portable-player-side+.portable-player-side{border-top-color:#e6e6e6!important}
body>main .portable-player[data-frame-selected="true"]{border-color:#1a8917!important;background:#f5fbf5!important;box-shadow:0 0 0 1px rgba(26,137,23,.12)!important}
body>main .portable-player-side-heading h3{color:#242424!important}
body>main .portable-frame-loop,body>main .portable-player-loop,body>main .portable-player-side-controls label{color:#6b6b6b!important}
body>main .portable-frame-side-status,body>main .portable-frame-fallback,body>main .portable-frame-player-status{color:#6b6b6b!important}
body>main .portable-frame-controls output,body>main .portable-player-side-controls output{color:#6b6b6b!important}
body>main .portable-frame-rate-row input[type="number"],body>main .portable-player-rate-row input[type="number"]{border-color:#d0d0d0!important;border-radius:4px!important;background:#fff!important;box-shadow:none!important;color:#242424!important}
body>main input[type="range"],body>main input[type="checkbox"]{accent-color:#1a8917!important}
:where(body>main .portable-frame-controls button,body>main .portable-player-rate-row button,body>main .portable-frame-rate-row button,body>main .portable-player-actions button,body>main .report-annotation-controls button){border-color:#d0d0d0!important;border-radius:999px!important;background:#fff!important;box-shadow:none!important;color:#242424!important;text-shadow:none!important}
:where(body>main .portable-frame-controls button,body>main .portable-player-rate-row button,body>main .portable-frame-rate-row button,body>main .portable-player-actions button,body>main .report-annotation-controls button):hover:not(:disabled){border-color:#242424!important;background:#f2f2f2!important;color:#242424!important}
:where(body>main .portable-frame-controls button,body>main .portable-player-rate-row button,body>main .portable-frame-rate-row button,body>main .portable-player-actions button,body>main .report-annotation-controls button):active:not(:disabled){background:#eaeaea!important;box-shadow:none!important}
:where(body>main .portable-frame-controls button,body>main .portable-player-rate-row button,body>main .portable-frame-rate-row button,body>main .portable-player-actions button,body>main .report-annotation-controls button):disabled{border-color:#e6e6e6!important;background:#f2f2f2!important;color:#b3b3b3!important;box-shadow:none!important}
:where(body>main .portable-frame-controls button,body>main .portable-player-actions button,body>main .report-annotation-controls button,body>main input):focus-visible{outline:2px solid #1a8917!important;outline-offset:2px!important}
body>main .portable-frame-navigation>button{display:grid!important;place-items:center!important;padding:0!important;line-height:1!important;text-align:center!important}
body>main .portable-frame-navigation>button[data-frame-action="previous"],body>main .portable-frame-navigation>button[data-frame-action="next"]{font-size:0!important}
body>main .portable-frame-navigation>button[data-frame-action="previous"]::before{content:"←";font-size:14px;line-height:1;transform:translateX(.5px)}
body>main .portable-frame-navigation>button[data-frame-action="next"]::before{content:"→";font-size:14px;line-height:1;transform:translateX(-.5px)}
/* Keep the speed slider visually distinct; only the seek/progress timeline gets
   the quiet Medium-like track and round thumb. */
body>main input[data-frame-timeline][type="range"]{appearance:none!important;-webkit-appearance:none!important;height:20px!important;margin:0!important;padding:0!important;background:transparent!important;cursor:pointer}
body>main input[data-frame-timeline][type="range"]::-webkit-slider-runnable-track{height:3px!important;border:0!important;border-radius:999px!important;background:#d9d9d9!important;box-shadow:none!important}
body>main input[data-frame-timeline][type="range"]::-webkit-slider-thumb{appearance:none!important;-webkit-appearance:none!important;width:12px!important;height:12px!important;margin-top:-4.5px!important;border:0!important;border-radius:50%!important;background:#242424!important;box-shadow:none!important}
body>main input[data-frame-timeline][type="range"]:hover::-webkit-slider-thumb{background:#1a8917!important}
body>main input[data-frame-timeline][type="range"]:focus-visible::-webkit-slider-thumb{outline:2px solid rgba(26,137,23,.28)!important;outline-offset:2px!important}
body>main input[data-frame-timeline][type="range"]:disabled::-webkit-slider-runnable-track{background:#ececec!important}
body>main input[data-frame-timeline][type="range"]:disabled::-webkit-slider-thumb{background:#b3b3b3!important}
body>main input[data-frame-timeline][type="range"]::-moz-range-track{height:3px!important;border:0!important;border-radius:999px!important;background:#d9d9d9!important;box-shadow:none!important}
body>main input[data-frame-timeline][type="range"]::-moz-range-progress{height:3px!important;border:0!important;border-radius:999px!important;background:#6b6b6b!important}
body>main input[data-frame-timeline][type="range"]::-moz-range-thumb{width:12px!important;height:12px!important;border:0!important;border-radius:50%!important;background:#242424!important;box-shadow:none!important}
body>main input[data-frame-timeline][type="range"]:hover::-moz-range-thumb{background:#1a8917!important}
body>main input[data-frame-timeline][type="range"]:disabled::-moz-range-track{background:#ececec!important}
body>main input[data-frame-timeline][type="range"]:disabled::-moz-range-thumb{background:#b3b3b3!important}
body>main .report-annotation-controls{border-color:#e6e6e6!important;background:#fafafa!important;box-shadow:none!important}
body>main .report-annotation-track-toggle{border-color:#e6e6e6!important;background:#fff!important;color:#242424!important}

.report-help-backdrop{background:rgba(0,0,0,.32)!important}
.report-help-dialog{border-color:#e6e6e6!important;border-radius:12px!important;background:#fff!important;box-shadow:0 16px 48px rgba(0,0,0,.18)!important;color:#242424!important}
.report-help-header{border-color:#e6e6e6!important;background:#fff!important;box-shadow:none!important}
.report-help-header h2{border:0!important;background:transparent!important;box-shadow:none!important;color:#242424!important;text-shadow:none!important}
.report-help-header p,.report-help-figure figcaption,.report-help-guide p,.report-help-actions span,.report-help-tutorial-step,.report-help-tutorial-copy p{color:#6b6b6b!important}
.report-help-content h3{color:#242424!important}
.report-help-figure{border:1px solid #e6e6e6!important;border-radius:10px!important;background:#fafafa!important;box-shadow:none!important;overflow:hidden!important}
.report-help-live-preview{border-radius:6px!important;box-shadow:none!important}
.report-help-live-preview-empty{border-color:#d0d0d0!important;background:#fafafa!important;color:#6b6b6b!important}
.report-help-guide li{border-color:#e6e6e6!important;border-radius:8px!important;background:#fff!important;box-shadow:none!important}
.report-help-number,.report-help-preview-marker{background:#1a8917!important}
.report-help-live-target{outline-color:rgba(26,137,23,.68)!important}.report-help-live-target.is-current{outline-color:#156d12!important}
.report-help-shortcut{border-color:#e6e6e6!important;border-radius:8px!important;background:#fff!important}.report-help-shortcut kbd{border-color:#d0d0d0!important;border-radius:4px!important;background:#f7f7f7!important;box-shadow:none!important;color:#242424!important}
.report-help-note{border-left-color:#1a8917!important;background:#f7f7f7!important;color:#525252!important}
.report-help-actions{border-top-color:#e6e6e6!important}
.report-help-tutorial-panel{border-color:#e6e6e6!important;border-radius:12px!important;background:#fff!important;box-shadow:0 10px 30px rgba(0,0,0,.16)!important;color:#242424!important}
.report-help-tutorial-panel-header{border-bottom-color:#e6e6e6!important;background:#fff!important}
.report-help-icon{border-color:#242424!important;background:#242424!important;box-shadow:none!important;color:#fff!important}
:where(.report-help-trigger,.report-help-close,.report-help-tutorial-button,.report-help-tutorial-stop,.report-help-tutorial-controls button){border-color:#d0d0d0!important;border-radius:999px!important;background:#fff!important;box-shadow:none!important;color:#242424!important;text-shadow:none!important}
:where(.report-help-trigger,.report-help-close,.report-help-tutorial-button,.report-help-tutorial-stop,.report-help-tutorial-controls button):hover:not(:disabled){border-color:#242424!important;background:#f2f2f2!important;color:#242424!important}
:where(.report-help-trigger,.report-help-close,.report-help-tutorial-button,.report-help-live-marker,.report-help-tutorial-panel button):focus-visible{outline:2px solid #1a8917!important;outline-offset:2px!important}
.report-help-tutorial-button,.report-help-tutorial-controls [data-report-help-tutorial-full]{border-color:#1a8917!important;background:#1a8917!important;color:#fff!important}
.report-help-tutorial-button:hover,.report-help-tutorial-controls [data-report-help-tutorial-full]:hover{border-color:#156d12!important;background:#156d12!important;color:#fff!important}
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
  output = stylizeBrandSignature(output);
  output = addLogoColorSource(output);
  output = removeRedundantHelpCopy(output);
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

async function createReportBackgroundAsset() {
  return {
    id: REPORT_BACKGROUND_ASSET_ID,
    kind: 'image',
    relativePath: REPORT_BACKGROUND_RELATIVE_PATH,
    label: '小樹Polo 報告背景',
    mediaType: REPORT_BACKGROUND_MEDIA_TYPE,
    data: await fs.readFile(REPORT_BACKGROUND_SOURCE_PATH),
    requiredForExport: true,
  };
}

async function exportReport(options = {}) {
  const outputKind = requestedOutputKind(options);
  const needsZip = options.createZip === true || outputKind === 'zip' || outputKind === 'both';
  const sourceAssets = options.assets ?? [];
  if (!Array.isArray(sourceAssets)) throw new ExportValidationError('Export assets must be an array');
  const backgroundAsset = await createReportBackgroundAsset();
  const legacyResult = await exportLegacyBrandedReport({
    ...options,
    assets: [...sourceAssets, backgroundAsset],
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
  REPORT_BACKGROUND_ASSET_ID,
  REPORT_BACKGROUND_MEDIA_TYPE,
  REPORT_BACKGROUND_RELATIVE_PATH,
  REPORT_BACKGROUND_SOURCE_PATH,
  addLogoColorSource,
  exportReport,
  refineHtml,
  refinedThemeCss,
  shortenBrandSuffix,
  stylizeBrandSignature,
};
