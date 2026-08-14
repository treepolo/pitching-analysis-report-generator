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
- `bc0e004 feat: add desktop project vertical slice` 是本次 hardening 的 implementation baseline；本次 provenance reconciliation 另有 docs-only commit。
- Recoverable pre-retrofit tag：`checkpoint/pre-governance-retrofit-2026-08-14`。
- Tracked implementation files 在上述 commit 後無未提交修改；目前另有其他 owner 尚未整合的 untracked `src/export/`、`src/media/`、`src/sync/` 與對應 tests，本 worker 未修改、未 stage、未 commit。
- 本地 checkpoint 可回復被刪除的舊治理檔案。

## Implemented slice

目前已有 Electron shell、隔離的 preload/IPC、project list/create/open/save、project-root persistence、autosave/explicit save/close flush/reopen、最小 section editor、renderer-only report contract/preview，以及 storage/report-contract tests 與 smoke script。這些是已存在的 implementation，不等於所有 requirement 已驗證。

## Not yet complete or not yet verified

- `.txt`/`.md` import、Media Library、圖片/影片 metadata 與 normalization。
- Single Video、Comparison Video、sync anchor、逐幀、不同 FPS/VFR 與 drift correction。
- self-contained report folder、offline `file://`、ZIP/完整交付包、export consumer。
- responsive 與 Scenario A–G 真人驗收。
- IPC sender/source-frame hardening 與 symlink realpath containment 已在 `35c21a4` 有 focused tests/smoke evidence；完整產品 persistence/recovery acceptance 仍未完成。
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
