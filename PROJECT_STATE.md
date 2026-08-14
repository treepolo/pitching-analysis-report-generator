# Current Project State

## Canonical scope/architecture decision (2026-08-14)

- The former fixed-form/editor UI is superseded. It must not remain as an in-product compatibility mode; the canonical UI is a block-based long-form editor.
- The canonical document contains many text blocks and independent video blocks. Each video block owns one/pair asset selection, single/comparison mode, layout, in/out/playback settings, and block-local sync.
- Export copies only assets referenced by video blocks into self-contained folder/ZIP outputs; unused Media Library assets are excluded and originals remain untouched.
- Dependency graph: Report Model/Editor defines block schema and persistence; Media Pipeline supplies project-local asset metadata/status; Playback/Sync consumes block-local video configuration; Renderer/Export derives the referenced set and portable output; Shell/QA owns security, recovery, and acceptance gates.
- This is a planning decision only. Existing implementation evidence does not mark any requirement `VERIFIED`.

## Wave 5 serial integration provenance (current, 2026-08-14)

- Code checkpoint before this docs reconciliation: `d9541b812e9853f2e9b4a08dddad742c293caeb3` on `worker/desktop-vertical-slice`; picker bridge commit `bd9d8ee` is in its ancestry, origin matched, and the worktree was clean.
- Native export-folder contract reviewed: trusted main IPC opens an `openDirectory` dialog, validates the selected directory through project-root realpath containment, preload returns a safe string or `null`, and renderer preserves a project-safe default when no folder is selected.
- Fresh evidence: `npm test` reports 95 tests, 94 pass, 1 explicit Electron exported-folder/extracted-ZIP `file://` runtime skip, and 0 failures; 33 JavaScript files pass `node --check`; package/lock metadata, `git diff --check`, and tracked artifact/security scan pass.
- Fresh Electron smoke passes persistence/import/block-editor/media-list/player-empty/sync-fallback/IPC-security/responsive desktop+narrow/reopen assertions. Native folder-dialog selection/cancel was not exercised by headless smoke, and exported `file://` runtime remains unavailable; neither is treated as pass.
- The renderer now displays only a safe folder label, keeps selected output separate from the project default, and does not start a job on picker cancellation. No requirement is `VERIFIED`.
- Remaining blockers: real video/FFmpeg, actual player/sync/drift, native dialog/human folder-picker evidence, exported folder/ZIP browser `file://`, responsive human evidence, and AT-A through AT-G.

## Latest current provenance (2026-08-14, Wave 4 serial gate)

- Current code checkpoint before this docs reconciliation: `4ba8704421c75d1b57a98afecd2e3340f4e9fc86` on `worker/desktop-vertical-slice`; origin is `https://github.com/treepolo/pitching-analysis-report-generator.git`, the remote branch SHA matched, and the worktree was clean.
- Integrated ancestry includes `93ffb61` block editor, `56f7159` media lifecycle, `646df8a` block-local sync, `121d857` referenced-video-only export, `4f83eb3` parallel governance, `d31244b` player runtime, `dad97d0` media timing/tool seam, `21a1bd4` sync hardening, `2278320` export bridge, and `4ba8704` export UI.
- Fresh evidence: `npm test` reports 94 tests, 93 pass, 1 explicit Electron exported-folder/extracted-ZIP `file://` runtime skip, and 0 failures; 33 JavaScript files pass `node --check`; package/lock metadata, `git diff --check`, and tracked artifact/security scan pass.
- Fresh Electron smoke reports block-editor, persistence/reopen, media-list, player-empty, sync-fallback, IPC-security, payload-schema, close-flush, and responsive desktop/narrow controls including export. This is synthetic/domain smoke evidence, not real-video or human acceptance.
- The export UI uses the project-root-safe `output` directory because no arbitrary output-folder picker bridge exists. This is a follow-up UX limitation, not arbitrary-folder evidence and not fake success.
- QA gate remains `CONDITIONAL FAIL / IN PROGRESS`; no requirement is `VERIFIED`. Real video/FFmpeg, real player/sync, exported folder/ZIP browser `file://`, responsive human evidence, and AT-A through AT-G remain incomplete.

這是本專案跨 Session / Agent 延續所需的最小 current state。治理方向以目前提供的 Layer 1 / Layer 2 為準；不要把本文件擴張成工程 SOP。

## Product

- 產品：供投球教練本人建立投球動作分析報告的 Desktop application。
- 核心結果：可持續編輯的報告專案，包含文字、圖片、單影片與兩影片比較，最後輸出可線上部署與 desktop `file://` 離線閱讀的 HTML folder/ZIP。
- 不做：AI 自動判讀或寫作、登入/會員/CRM/付款、雲端 DB/同步/OAuth、學生互動、醫療診斷、自動部署、Google Drive API、自動寄送與 analytics。

## Decisions and boundaries

- Generator architecture：Desktop shell + portable web renderer；已由使用者確認。
- Project data：`PROJECT_ROOT/projects/<project-id>/`；暫存 `.tmp/`；backup `.backups/`；generated output `output/`。私人素材與產物不進 Git。
- GitHub：預定 Private；目前沒有 `origin`、帳號授權或 push evidence。
- Repository root：`D:\Vibe Coding\投球報告輸出器`。

## Current repository

- Branch：`worker/desktop-vertical-slice`。
- Shell/Report Model implementation handoff commit：`35c21a430b5c7a16ea065d542fec71a02c47b81b fix: harden report shell persistence boundaries`。
- `bc0e004 feat: add desktop project vertical slice` 是歷史 implementation baseline；`f678f2e2c1d6601623a08241dc4789b52b426ccc` 是前一個 provenance reconciliation，並非目前整合 HEAD。
- 目前 code integration checkpoint：`fcaa4a6 feat: integrate media tools and export runtime seams`，承接 app-facing/player checkpoint `d941b5c`，已整合 `src/media/**`、`src/sync/**`、`src/export/**` 及對應 tests。這些 slice 仍只代表可驗證的 contract/domain/export/runtime seam，不代表完整產品驗收。
- Recoverable pre-retrofit tag：`checkpoint/pre-governance-retrofit-2026-08-14`。
- `fcaa4a6` 已納入原先三個 owner 的 dirty/untracked media/export slice；目前 code integration commit 為 `fcaa4a6`，本次 provenance 文件變更另行記錄。私人素材、generated report、ZIP 與 `.tmp` artifacts 未進 Git。
- 本地 checkpoint 可回復被刪除的舊治理檔案。

## Implemented slice

目前已有 Electron shell、隔離 preload/IPC、project list/create/open/save、project-root persistence、autosave/explicit save/close flush/reopen、最小 section editor、`.txt`/`.md` import persistence、media register/list/remove seam、renderer-only report contract/preview、app-facing single/comparison player/sync runtime；另已整合 media contract/path policy、read-only signature inspection、realpath/symlink tool boundary、FFprobe/FFmpeg adapter verification-pending seam，以及帶 allowlist、project-root realpath/symlink boundary、folder/ZIP checksum/parity、atomic extraction、file URL runtime smoke 的 export slice。這些是 implementation 與 automated evidence，不等於所有 requirement 已驗證。

## Not yet complete or not yet verified

- 真實圖片/影片 metadata、normalization 與可播放 media pipeline。
- app-facing Single Video、Comparison Video、sync anchor、逐幀 fallback、不同 FPS/VFR relative-time runtime seam 已存在；real video/frame/drift acceptance 仍未完成。
- self-contained report folder、offline `file://`、ZIP/完整交付包與 export consumer 仍未完成產品驗收；目前有 fixture-based folder/ZIP seam、atomic recovery 與 explicit Electron `file://` runtime check，但該 runtime 在本環境 unavailable 而 skip，沒有 real-media/browser/human acceptance evidence。
- 真實 media ingest/metadata/normalization、FFmpeg、實際 player/anchor/sync 與長片 drift correction 仍未完成。
- responsive 與 Scenario A–G 真人驗收。
- IPC sender/source-frame hardening、project/media symlink realpath containment、tool command/path checks 與 ZIP atomic extraction 已有 focused tests/smoke evidence；完整產品 persistence/recovery acceptance 仍未完成。
- `fcaa4a6` 整合 evidence：65 pass / 1 skip 的 `npm test`、全部 JS `node --check`、media/export/player targeted tests 23 pass / 1 skip、package/lock consistency、`git diff --check`，以及 app Electron smoke。export `file://` runtime skip 明確保留為 unavailable，未冒充 pass。
- 沒有 requirement 可只因程式存在而標 `VERIFIED`。

## Execution

- Main control plane 只做規劃、拆分、調度、驗證與交接；開發工作在可見的 persistent project Worker threads 執行。
- 平行化只限於不共寫的 scope；shared model、shell、renderer contract 使用 single writer，QA 可 read-only 平行。
- Subagent 只作短期輔助；不要用它取代可見的 Worker thread。
- 只有帳號授權、外部登入、真人主觀驗收或使用者重大產品決策才建立 Human Checkpoint。

## Source of truth

- Product/spec facts：`PRODUCT_REQUIREMENTS.md`、`USER_FLOWS.md`、`UI_UX_SPEC.md`、`DATA_MODEL.md`、`DATA_AND_SYNC.md`、`MEDIA_PIPELINE.md`、`REPORT_OUTPUT_SPEC.md`。
- Acceptance/evidence：`ACCEPTANCE_TESTS.md`、`TRACEABILITY_MATRIX.md`、`VERTICAL_SLICE_SCOPE.md`。
- Current implementation status：本文件與實際 Git/source/test evidence；過期敘述不得覆蓋實際 repository。
