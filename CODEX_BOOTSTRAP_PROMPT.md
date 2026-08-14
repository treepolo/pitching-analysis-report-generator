# Codex Bootstrap Prompt

你是本專案的直接執行 Codex。先讀 `AGENTS.md`、`PRODUCT_REQUIREMENTS.md`、`USER_FLOWS.md`、`UI_UX_SPEC.md`、`ARCHITECTURE.md`、`DATA_MODEL.md`、`DATA_AND_SYNC.md`、`MEDIA_PIPELINE.md`、`REPORT_OUTPUT_SPEC.md`、`ACCEPTANCE_TESTS.md`、`TRACEABILITY_MATRIX.md`、`IMPLEMENTATION_STATUS.md`、`OPERATIONS.md`、`SETUP_CHECKLIST.md`、`FILESYSTEM_POLICY.md`、`GIT_GITHUB_POLICY.md`、`MULTI_AGENT_PLAN.md` 與本文件。

## Current decisions

- Generator architecture：Desktop application shell + portable web renderer，已由使用者確認。
- Project data：`PROJECT_ROOT/projects/<project-id>/`；output=`PROJECT_ROOT/output/`；temporary=`.tmp/`；backup=`.backups/`。
- GitHub visibility：Private，已由使用者確認；目前仍沒有 remote/push evidence。
- 目前進入 implementation kickoff；尚未有功能 requirement 的 `VERIFIED` evidence。

## Rules

1. 不自行改 scope；新增能力先放 `DEFERRED` 或 `NOT_IN_SCOPE`，需要時建立 human checkpoint。
2. 使用穩定 Requirement IDs，持續維護 `Requirement → implementation → test → acceptance → evidence → status`。
3. 不使用 fake data、placeholder export、hard-coded success、mock ZIP 或 dev-only static data 冒充完成。
4. 系統吸收可可靠推導的 filename、metadata、relative time、path validation 與 dependency；不要把 data schema 原樣變成表單。
5. 先建可執行 vertical slice，再逐批加入 media、player/sync、preview、offline/export、recovery；每批都要有相稱 tests/evidence。
6. 遵守 `FILESYSTEM_POLICY.md`；私人影片、project data、generated report、ZIP、credentials、`.env` 不進 Git。
7. 遵守 `GIT_GITHUB_POLICY.md`；不 force push、不改 shared history、不捏造 remote evidence。遠端未設定時標 `AWAITING_USER_SETUP`。
8. 沒有真實 evidence 不得標 `VERIFIED`；fixture test、integration test、真人 acceptance 分開記錄。
9. 長工作必須有 phase、實際 processed/total、success/skipped/failed、cancel/retry/recovery/error detail；禁止假百分比。
10. 每次交接或可恢復 checkpoint 先檢查、commit；若 remote 已可用，再 push 到正確 branch。

## Implementation order

1. Desktop shell、project list/create/open/save、project-root persistence。
2. Editor section/block、TXT/MD import、autosave/reopen。
3. Media library、metadata/normalization adapter、single player。
4. Comparison player、block-local anchors、frame stepping/fallback、drift correction。
5. Shared preview renderer、responsive QA、folder/ZIP/complete package export。
6. Error recovery、offline `file://`、Scenario A–G、traceability/final gate。

每完成一批，更新 `IMPLEMENTATION_STATUS.md`、`TRACEABILITY_MATRIX.md` 與 evidence inventory；不得把「文件已寫好」當成「功能已完成」。
