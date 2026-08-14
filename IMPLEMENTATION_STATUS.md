# Implementation Status

目前狀態：**Implementation in progress**。`bc0e004` 是歷史 Desktop project persistence/editor/preview baseline；Shell/Report Model hardening 在 `35c21a430b5c7a16ea065d542fec71a02c47b81b`，app-facing import/media seam 在 `c67755e`，目前 media/sync/export integration checkpoint 是 `46bd9d0`（前一 checkpoint 為 `00cae62`）。沒有任何完整產品 requirement 可僅因程式存在而標 `VERIFIED`。

## Current gates

| Gate | Status | Evidence |
|---|---|---|
| Layer 1 / Layer 2 retrofit | IN_PROGRESS | 新版 Layer 1/2 已讀取；舊治理檔已在 cleanup checkpoint 後移除/縮減。 |
| Governance cleanup checkpoint | DONE | `checkpoint/pre-governance-retrofit-2026-08-14` 是 `bc0e004`；cleanup retrofit commit 是 `f92516c`。 |
| Desktop vertical slice | IN_PROGRESS | `VERTICAL_SLICE_SCOPE.md`、`src/`、`test/`、`scripts/`；Shell/Report Model hardening `35c21a4`、app-facing seam `c67755e`，slice integration checkpoint `46bd9d0`。 |
| Syntax/contract/storage checks | IN_PROGRESS | `46bd9d0` 後 25 個 JS `node --check`、52 個 `npm test`、media/export/sync targeted tests 39/39、package/lock metadata、`git diff --check`、Electron smoke；這些是 slice evidence，不提升完整 requirement status。 |
| Media/player/sync/export | IN_PROGRESS | `46bd9d0` 整合 media contract/path policy、read-only signature inspection/realpath containment、pure sync domain、report-contract allowlist parity、export renderer/layout/ZIP seams 與 fixture tests；尚無 real-media metadata/FFmpeg、actual player/sync runtime、browser/file:// 或 human acceptance evidence。 |
| Responsive/offline/human acceptance | NOT_STARTED | 尚無真人或完整 file:// evidence。 |
| GitHub Private remote | AWAITING_USER_SETUP | 需要帳號授權/外部 remote 設定；目前無 origin。 |

`46bd9d0` 已整合原先其他 owner 的 `src/export/`、`src/media/`、`src/sync/` 與對應 tests；這些變更不屬於 `35c21a4` 或 `c67755e`，也沒有被本次 evidence 轉為 requirement `VERIFIED`。

## Current implementation

- Electron shell、隔離 preload/IPC、project list/create/open/save。
- project-root persistence、autosave/explicit save/close flush/reopen。
- 最小 section editor、renderer-only report contract/preview。
- storage/report-contract tests 與 Electron smoke script。
- media contract/path policy、pure sync domain。
- shared report-contract allowlist parity、export renderer/layout validator、project-root realpath/symlink guards、deterministic ZIP seam 與 fixture tests。
- `.txt`/`.md` import persistence、media register/list/remove seam、read-only signature inspection 與 normalization state contract。

## Remaining work

依 Maximum Safe Useful Concurrency 平行拆分：TXT/MD import、real Media Pipeline、Playback/Sync runtime、Renderer/Export product acceptance、QA。共用 model/contract 仍由 single writer 管理；每個 scope 必須以實際 tests/evidence 回報，不能把 fixture 或程式存在當成 VERIFIED。
