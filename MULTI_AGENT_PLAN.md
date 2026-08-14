# Multi-Agent Plan

目前狀態：**Phase 2 planning**。本輪依使用者要求採 direct execution，不啟動 sub-agent；本文件保留未來需要平行開發時的 ownership 與 handoff contract，不能被解讀為目前已存在 worker branch 或 remote。

## Ownership

| Subsystem | Single writer | 主要責任 |
|---|---|---|
| Report Model / Editor | Report owner | project lifecycle、section/block、文字匯入、persistence-facing editor |
| Media Pipeline | Media owner | metadata、compatibility、normalization、frame timing、native adapter |
| Playback / Sync | Playback owner | player blocks、anchor、frame stepping、sync、drift correction |
| Renderer / Export | Export owner | preview renderer、offline HTML、folder、ZIP、path validation |
| Application Shell / UX | Shell owner | desktop navigation、editor/preview workflow、jobs、responsive generator UI |
| QA / Acceptance | QA owner | fixtures、unit/integration/E2E、offline/responsive/interaction evidence |
| Shared integration | 唯一 Integrator | merge、conflict resolution、shared docs、regression、final gate |

## Conflict graph

- `Report Model` ↔ `Application Shell`：shared project state contract；Model owner 是唯一 writer，Shell 只使用 public contract。
- `Media Pipeline` ↔ `Playback/Sync`：metadata/frame timing contract；Media owner 先定義 capability，Playback owner 消費結果。
- `Playback/Sync` ↔ `Renderer/Export`：exported player data contract；不得各自發明 anchor schema。
- `Renderer/Export` ↔ `Filesystem`：所有 output/path validation 由 Export owner 遵守 `FILESYSTEM_POLICY.md`。
- `QA` 依賴所有 public contracts，但不得為了修 shared defect 跨界寫 owner subsystem。

## Worker contract

每個未來 Worker 都要收到：Identity、model（預設 Luna MAX）、branch/worktree、starting commit、remote branch、scope、non-scope、ownership、forbidden areas、requirement IDs、acceptance、tests、evidence、push condition、human checkpoint、handoff/stop condition。

完成或 blocker 時不得 silent stop，回報 `DONE`、`HANDOFF_REQUIRED`、`BLOCKED_DEPENDENCY`、`BLOCKED_HUMAN` 或 `NEEDS_ESCALATION`，並附 branch、commit、push、worktree、tests、evidence、next owner。沒有 remote 時使用 `AWAITING_USER_SETUP`，不得捏造 push。

## Liveness / dispatch-and-yield

Orchestrator（預設 Sol Xhigh）只做 dependency、ownership、dispatch、checkpoint、handoff、integration coordination 與 liveness。只要存在不依賴未決 checkpoint 的 runnable work，就派出至少一條線；派出後 yield，不持續 polling。若所有剩餘工作都依賴人類決策，才允許停止。
