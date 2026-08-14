# Current Project State

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
- 目前 code integration checkpoint：`00cae62 chore: integrate media sync export slices`，已整合 `src/media/**`、`src/sync/**`、`src/export/**` 及對應 tests；三個 slice 仍只代表可驗證的 contract/domain/export seam，不代表完整產品驗收。
- Recoverable pre-retrofit tag：`checkpoint/pre-governance-retrofit-2026-08-14`。
- 整合 checkpoint 後 tracked implementation files 無未提交修改，原先三個 owner 的 untracked slice 已納入 `00cae62`；私人素材、generated report、ZIP 與 `.tmp` artifacts 未進 Git。
- 本地 checkpoint 可回復被刪除的舊治理檔案。

## Implemented slice

目前已有 Electron shell、隔離的 preload/IPC、project list/create/open/save、project-root persistence、autosave/explicit save/close flush/reopen、最小 section editor、renderer-only report contract/preview；另已整合 media contract/path policy、pure sync domain，以及帶 allowlist、project-root realpath/symlink boundary、folder/ZIP fixture seam 的 export slice。這些是 implementation 與 automated evidence，不等於所有 requirement 已驗證。

## Not yet complete or not yet verified

- `.txt`/`.md` import、Media Library、圖片/影片 metadata 與 normalization。
- Single Video、Comparison Video、sync anchor、逐幀、不同 FPS/VFR 與 drift correction。
- self-contained report folder、offline `file://`、ZIP/完整交付包與 export consumer 仍未完成產品驗收；目前僅有 fixture-based folder/ZIP seam，沒有 real-media/browser/file:// evidence。
- 真實 media ingest/metadata/normalization、FFmpeg、實際 player/anchor/sync 與長片 drift correction 仍未完成。
- responsive 與 Scenario A–G 真人驗收。
- IPC sender/source-frame hardening 與 symlink realpath containment 已在 `35c21a4` 有 focused tests/smoke evidence；完整產品 persistence/recovery acceptance 仍未完成。
- `00cae62` 的整合 evidence：37 個 `npm test`、24 個 JS `node --check`、package/lock consistency、`git diff --check`，以及 Electron smoke（含 autosave、explicit save、payload schema、close flush、reopen、bridge security、invalid project rejection）。
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
