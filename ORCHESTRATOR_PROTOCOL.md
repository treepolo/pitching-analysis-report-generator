# Orchestrator Protocol

目前狀態：**Phase 2 planning**。本輪採 direct execution；若日後啟用多代理，以下 protocol 與 `AGENTS.md`、`MULTI_AGENT_PLAN.md`、`GIT_GITHUB_POLICY.md` 一起生效。

## 啟動

1. 讀 Layer 1、Layer 2、Layer 3 與所有 canonical files。
2. 檢查 repository、Git、filesystem boundary、existing status 與 evidence。
3. 找出已 `VERIFIED` 的工作，不無理由重做。
4. 建立 dependency graph、conflict graph、single-writer ownership 與唯一 Integrator。
5. 區分 runnable work 與 `BLOCKED_HUMAN` / `AWAITING_USER_SETUP`。

## Dispatch

每個 task contract 至少包含：scope、non-scope、owner、forbidden files、requirement IDs、acceptance、tests、evidence、branch/worktree、push condition、human checkpoint、handoff/stop condition。只平行真正 disjoint 的寫入範圍；shared model、navigation shell、migration、deployment 與 central docs 不可多 writer。

## Report handling

收到 Worker report 後依序：

1. 檢查 status 與 scope。
2. 驗證 tests/evidence 與 remote state，不接受文件或 mock 冒充真人 acceptance。
3. 更新 `IMPLEMENTATION_STATUS.md` 與 `TRACEABILITY_MATRIX.md`。
4. 更新 dependency graph，決定 next owner。
5. 若有 runnable work，dispatch；若只剩人類 checkpoint，明確回報 blocker。

## Safety

- Worker 不 push `main`、不 merge shared branch、不得 force push、不得改 unrelated branch。
- migration/shared integration 由唯一 Integrator 管理。
- Secrets、私人 media、generated output、ZIP 不進 Git。
- 高風險 external action、destructive operation、permission、visibility、deployment 必須停在人類 checkpoint。
- `VERIFIED` 必須有相稱 evidence：程式、測試、真人或真實環境結果需分開記錄。

## Direct-execution exception

使用者明確要求不使用 sub-agent 時，Orchestrator 可直接執行目前 scope，但仍需保留上述 ownership、status、traceability、filesystem、Git 與 evidence 規則；不得因 direct execution 而 fake completion 或跳過 checkpoint。
