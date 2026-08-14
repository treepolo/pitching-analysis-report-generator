# Multi-Agent Execution Plan

目前狀態：**Phase 1/2 planning**。本文件保留 Layer 1/2 要求的未來協作設計；本輪因使用者明確要求「不要使用 sub-agent 或 multi-agent」，沒有 dispatch 任何 worker，也沒有建立 worker branch。

## 1. Roles

| Role | Default model | Responsibility |
|---|---|---|
| Orchestrator / Control Plane | Sol Xhigh | dependency、conflict graph、ownership、dispatch、human checkpoint、handoff、liveness、integration coordination |
| Worker / Execution Plane | Luna MAX | scoped implementation、debug、tests、evidence、repo changes |
| Integrator | 由主控指定唯一 owner | shared merge、conflict resolution、central docs、integration branch、regression、final gate |

角色不是權限升級；Worker 不可直接改 unrelated shared areas，Orchestrator 不做 routine implementation。

## 2. Dependency / conflict graph

| Workstream | Depends on | Shared files / conflict risk | Ready condition |
|---|---|---|---|
| Canonical product spec | Layer 1/2/3 | central docs | 已完成 planning |
| Architecture/storage | product spec | ARCHITECTURE、FILESYSTEM_POLICY、DATA_MODEL | human approval |
| Git baseline | canonical + architecture + visibility | main、.gitignore、central policy | visibility + scan |
| Report model/editor | model contract | DATA_MODEL、shared renderer types | architecture approved |
| Media pipeline | storage + model | MediaAsset、job contract | native/browser strategy decided |
| Playback/sync | data/sync contract + media | PlayerBlock、SyncAnchor | media timing contract ready |
| Renderer/export | model + media + sync | REPORT_OUTPUT_SPEC、shared renderer | contracts stable |
| Application shell/UX | architecture + model | navigation shell、async state | storage/bridge ready |
| QA/acceptance | all runnable work | fixtures、evidence、status docs | integration candidate |
| Integration/final gate | all worker scopes | central docs、integration branch | worker handoffs pushed |

Shared model、renderer、migration、navigation shell、deployment 與 central docs 均採 single writer；發現 shared defect 時回報 Integrator，不順手修改。

## 3. Logical ownership

- Report Model / Editor：ReportProject、Section、ContentBlock、import、persistence-facing behavior。
- Media Pipeline：MediaAsset、inspection、normalization、frame timing、FFmpeg/native adapter（若核准）。
- Playback / Sync：PlayerBlock、SyncAnchor、frame stepping、sync playback、drift correction。
- Renderer / Export：preview/export contract、index.html、relative assets、folder/ZIP。
- Application Shell / UX：navigation、viewport preview、async states、responsive generator UI。
- QA / Acceptance：fixtures、cross-browser、responsive、offline、interaction、security evidence。
- Integrator：shared merge、central docs reconciliation、regression、final gate。

## 4. Worker task contract

每次 dispatch 必須寫明：

- identity、model、starting branch/commit/worktree
- expected remote branch and push condition
- scope、non-scope、ownership、forbidden areas
- requirement IDs、acceptance、tests、evidence
- human checkpoint、handoff condition、stop condition
- source/media/privacy restrictions

Worker 回報必須包含 status、modified files、branch、commit SHA、remote branch/push status、worktree、tests、evidence、acceptance、blocker、next owner。

## 5. Handoff / integration

Worker 在 DONE 或 HANDOFF_REQUIRED 前，若成果值得恢復：

1. required checks pass
2. commit
3. push own worker branch
4. verify remote visibility
5. report complete state

Integrator 才能 merge、解 conflict、更新 shared docs、跑 regression 與 push integration checkpoint。Force push 禁止。

## 6. Current session override

本輪只由目前 task 直接執行文件 materialization，不啟動 worker。這是本次使用者指示，不等於取消 repository 對未來 multi-agent、single writer、Integrator 與 push governance 的要求。
