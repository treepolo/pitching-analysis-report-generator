# Desktop Vertical Slice Scope

## Canonical scope supersession (2026-08-14)

- The current fixed-form/minimal section editor is a historical implementation slice only. It is not the canonical product UI and must not be preserved as a compatibility mode.
- The next canonical editor target is a block-based long-form canvas with many text blocks and independent single/comparison video blocks. Shared storage/security facts remain valid, but the editor/model/renderer owners must realign their implementation boundaries to this target.
- Export target is `report.html` plus only video-block-referenced copied assets in a portable folder and ZIP; originals and unused Media Library assets remain out of the output.
- This is a scope decision, not implementation evidence. Existing vertical-slice tests and runtime seams do not establish completion of the new target.

這份文件是本輪 implementation handoff note，不改寫 canonical planning files 的 requirement status，也不把任何尚未有相稱 evidence 的需求標成 `VERIFIED`。

目前可驗證的 slice：

- Electron desktop shell，`contextIsolation=true`、`nodeIntegration=false`。
- 受 `PROJECT_ROOT` realpath boundary 保護的 `projects/<project-id>/project.json` persistence。
- 建立、列出、開啟、編輯、renderer autosave、explicit save、close flush 與重新開啟。
- 最小 section editor 與 renderer-only preview；preview 使用可供未來 export consumer 重用的 structural report document contract，但本輪沒有 export consumer。
- project payload 的 `media` metadata 與 `exportSettings` preservation seam；本輪不執行 media processing 或 export。

明確尚未支援：

- `.txt`/`.md` import。
- Media Library、實際圖片/影片匯入與 metadata inspection。
- single video、comparison video、既有 shared timeline／sync-point compatibility、逐幀控制與 playback synchronization；舊式 anchor/binding/offset workflow 不在產品契約。
- FFmpeg、VFR/codec normalization。
- self-contained report folder、完整 export、ZIP、offline `file://` delivery。
- responsive/真人 acceptance、Scenario A–G 全流程與其 requirement-level verification。

Preview 目前只驗證 renderer 內的編輯資料呈現；沒有 export consumer，因此不宣稱 preview/export parity。下一個 owner 可在不改變 canonical model 的前提下，沿用 `src/report-contract.js` 接入 export。

本輪可重現 evidence commands：

- `node --check`：`src/`、`test/`、`scripts/` 下 JavaScript syntax。
- `npm test`：storage boundary/persistence/payload seam 與 report contract tests。
- `npm install --package-lock-only --ignore-scripts --dry-run`：package/lock consistency。
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-electron-smoke.ps1`：Electron UI lifecycle、autosave、explicit save、close flush、reopen、IPC/path rejection 與 project file containment smoke。
