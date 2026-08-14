# Implementation Status

## Canonical scope/architecture decision (2026-08-14)

- The former fixed-form/editor UI is superseded and is not a compatibility mode. Implementation must converge on a block-based long-form editor with many text blocks and independent single/comparison video blocks.
- Dependencies: Report Model/Editor first defines block persistence and migration; Media Pipeline exposes safe project-local assets; Playback/Sync implements block-local time/frame semantics; Renderer/Export consumes the canonical block document and copies only referenced assets; Shell/QA verifies security, recovery, portability, and human acceptance.
- Existing shell, storage, media, sync, and export seams remain reusable only where they satisfy this canonical contract. This docs update does not claim migration or implementation completion.
- QA status remains conservative: no requirement is `VERIFIED`; real video/FFmpeg, real player/sync, export `file://`/ZIP runtime, responsive human evidence, and AT-A through AT-G remain incomplete.

## Latest current provenance (2026-08-14)

- Current Git state: `5bbd845551c00a31867aa300c2df643481acfeb1` on `worker/desktop-vertical-slice`; origin is configured at `https://github.com/treepolo/pitching-analysis-report-generator.git`, the remote branch SHA matches, and the worktree is clean.
- Startup provenance: `dfef829` normalized the Windows launcher to ASCII/CRLF label/goto syntax; `5bbd845` added opt-in `disable-gpu`/`in-process-gpu` switches and `app.disableHardwareAcceleration()` before app ready.
- Exact launch verification kept `cmd.exe /d /c call start-pitching-report.bat` alive for more than 16 seconds without GPU fatal; `node --check src/main.js` and `git diff --check` passed. This does not establish full product acceptance.
- The existing `65 pass / 1 skip` `npm test`, 29 JavaScript syntax checks, and earlier app Electron smoke remain previous-worker evidence. Fresh read-only QA reproduced only 18 pure tests.
- QA gate: `CONDITIONAL FAIL / IN_PROGRESS`. No requirement may be marked `VERIFIED`.
- Remaining blockers: real video/FFmpeg, real media player/sync, exported `file://`/ZIP runtime, responsive human evidence, and AT-A through AT-G remain incomplete. GitHub Private remote is configured, but requirements remain unverified.

目前狀態：**Implementation in progress**。`bc0e004` 是歷史 Desktop project persistence/editor/preview baseline；Shell/Report Model hardening 在 `35c21a430b5c7a16ea065d542fec71a02c47b81b`，app-facing/player checkpoint 在 `d941b5c`，目前 media/sync/export integration checkpoint 是 `fcaa4a6`。沒有任何完整產品 requirement 可僅因程式存在而標 `VERIFIED`。

## Current gates

| Gate | Status | Evidence |
|---|---|---|
| Layer 1 / Layer 2 retrofit | IN_PROGRESS | 新版 Layer 1/2 已讀取；舊治理檔已在 cleanup checkpoint 後移除/縮減。 |
| Governance cleanup checkpoint | DONE | `checkpoint/pre-governance-retrofit-2026-08-14` 是 `bc0e004`；cleanup retrofit commit 是 `f92516c`。 |
| Desktop vertical slice | IN_PROGRESS | `VERTICAL_SLICE_SCOPE.md`、`src/`、`test/`、`scripts/`；Shell/Report Model hardening `35c21a4`、app-facing/player `d941b5c`、media/export integration checkpoint `fcaa4a6`。 |
| Syntax/contract/storage checks | IN_PROGRESS | `fcaa4a6` 後 65 pass / 1 skip 的 `npm test`、全部 JS `node --check`、media/export/player targeted 23 pass / 1 skip、package/lock metadata、`git diff --check`；export Electron `file://` skip 保留 unavailable，不提升完整 requirement status。 |
| Media/player/sync/export | IN_PROGRESS | `fcaa4a6` 整合 media contract/tool adapter、project-root path/symlink checks、pure sync/player seam、report-contract allowlist parity、export renderer/layout/ZIP/atomic extraction/runtime-smoke seams；尚無 real-media metadata/FFmpeg execution evidence、真人 player/sync、browser/file:// pass 或 human acceptance evidence。 |
| Responsive/offline/human acceptance | NOT_STARTED | 尚無真人或完整 file:// evidence。 |
| GitHub Private remote | AWAITING_USER_SETUP | 需要帳號授權/外部 remote 設定；目前無 origin。 |

`fcaa4a6` 已整合 owner 的 `src/export/`、`src/media/` 與對應 tests，並保留 `d941b5c` 的 app-facing player/sync scope；這些變更不代表 requirement `VERIFIED`。export Electron `file://` runtime 在目前環境明確回報 unavailable/skip，真實 metadata/FFmpeg 與真人 AT-A～G 仍待後續 owner/human checkpoint。

## Current implementation

- Electron shell、隔離 preload/IPC、project list/create/open/save。
- project-root persistence、autosave/explicit save/close flush/reopen。
- 最小 section editor、renderer-only report contract/preview。
- storage/report-contract tests 與 Electron smoke script。
- media contract/path policy、pure sync domain。
- shared report-contract allowlist parity、export renderer/layout validator、project-root realpath/symlink guards、deterministic ZIP seam 與 fixture tests。
- `.txt`/`.md` import persistence、media register/list/remove seam、read-only signature inspection 與 normalization state contract。
- media tool adapter 的 command/exit-code/output verification-pending seam、ZIP atomic extraction 與 exported-folder Electron file URL runtime smoke（unavailable 狀態保留）。

## Remaining work

依 Maximum Safe Useful Concurrency 平行拆分：TXT/MD import、real Media Pipeline、Playback/Sync runtime、Renderer/Export product acceptance、QA。共用 model/contract 仍由 single writer 管理；每個 scope 必須以實際 tests/evidence 回報，不能把 fixture 或程式存在當成 VERIFIED。
