# Orchestrator Protocol

目前狀態：**Phase 1/2 planning**。本文件定義未來主控如何把 Layer 3 規則落地；本輪遵守使用者要求，不使用 sub-agent／multi-agent。

## 1. Phase 0 — Read and recover

主控先讀 AGENTS.md、Layer 3 canonical state、PRODUCT_REQUIREMENTS、相關 owner docs，檢查：

- PROJECT_ROOT 與 filesystem boundary
- existing files、working tree、branch、remote
- status/evidence 與已 VERIFIED 工作
- architecture、visibility、storage checkpoints
- shared files、dependency、conflict graph

不得因新 task 或新 chat 重做已有 VERIFIED subsystem。

## 2. Phase 1/2 — Planning and checkpoints

- 先完成 product、UX、data、media、sync、output、acceptance、traceability planning。
- Architecture 必須比較 local browser 與 desktop，提出 recommendation，等待 BLOCKED_HUMAN decision。
- GitHub visibility 必須等待 Private/Public decision；不得建立 remote。
- Architecture/storage 未核准前，不開始依特定 shell、database、native bridge 的 irreversible implementation。

## 3. Dispatch protocol

主控在 dispatch 前必須提供完整 Worker Task Contract：

1. identity/model
2. starting branch/commit/worktree
3. scope/non-scope/ownership/forbidden areas
4. requirement IDs、acceptance、tests、evidence
5. human checkpoint、handoff、stop conditions
6. Git/push condition

dispatch 成功後 yield；不得持續 polling 或把 Sol Xhigh 當監控程序。

## 4. Worker report protocol

合法 status：

- DONE
- HANDOFF_REQUIRED
- BLOCKED_DEPENDENCY
- BLOCKED_HUMAN
- NEEDS_ESCALATION

Report 至少要有：完成內容、修改檔案、branch、commit、remote push state、worktree、tests、evidence、acceptance、blocker、next owner。

Worker 不得 silent stop。Scope 完成、shared defect、dependency、integration need 或 technical blocker 都要先 report。

## 5. Report handling

主控收到 report 後：

1. 驗證 files、tests、commit、remote/evidence，不接受口頭宣稱。
2. 更新 IMPLEMENTATION_STATUS、TRACEABILITY_MATRIX 與相關 canonical docs。
3. 更新 dependency/conflict graph 與 ownership。
4. 判斷是否有不依賴未完成 human checkpoint 的 runnable work。
5. 有 runnable work 就 dispatch 下一個 owner。
6. 沒有 runnable work 且確實全依賴 user，才允許停止。

## 6. Human checkpoint policy

只有高影響決策或不可逆操作停等：

- architecture/storage
- GitHub visibility／remote creation
- credentials、OAuth、external accounts
- production deployment
- destructive deletion、migration、bulk import
- 使用者畫面與預期重大不符

低風險、可逆、同一 workflow 的 Scenario 可一次完成，不機械切成每個 click 一個 checkpoint。

## 7. Quality and anti-fake gate

每個 scope 在 handoff 前回答：

- Exist
- Correct
- Usable
- Manageable
- Observable
- Reachable
- Recoverable
- Versioned
- Verified

禁止 fake data、placeholder export、hard-coded success、mock ZIP、無 persistence UI 冒充正式完成。Fixture、automated test、真人 acceptance 必須分開記錄。

## 8. Current session state

本輪的直接執行結果是 planning canonical docs，不是 implementation。沒有 worker、branch、commit、remote 或 acceptance evidence；下一步由使用者完成 ARCHITECTURE.md 與 GIT_GITHUB_POLICY.md 指定的人類 checkpoint。
