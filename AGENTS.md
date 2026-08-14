# Agent Governance

目前狀態：**Phase 1/2 planning**；Architecture 與 GitHub visibility 尚未 human-approved。所有執行者必須先閱讀本文件與 `PRODUCT_REQUIREMENTS.md`、`ARCHITECTURE.md`、`MULTI_AGENT_PLAN.md`、`ORCHESTRATOR_PROTOCOL.md`。

## 上位規則

- 本專案受使用者提供的 Layer 1、Layer 2、Layer 3 規則約束；本 repository 的規格不得偷偷降低其要求。
- 產品是教練本人使用的 local-first 投球動作分析報告產生器；不得自行增加帳號、會員、雲端服務、AI 判讀或其他 `NOT_IN_SCOPE` 能力。
- `PRODUCT_REQUIREMENTS.md` 是需求 ID 與 scope 的來源；`TRACEABILITY_MATRIX.md` 是需求到測試/evidence/status 的追蹤來源。
- 文件中的 `NOT_STARTED`、`IN_PROGRESS`、`AWAITING_USER_SETUP`、`VERIFIED`、`DEFERRED`、`NOT_IN_SCOPE` 具有固定語意。沒有實際 evidence 不得標 `VERIFIED`。

## Control Plane / Execution Plane

- Orchestrator（預設 Sol Xhigh）負責 dependency、conflict graph、ownership、dispatch、human checkpoint、handoff、liveness 與 integration coordination。
- Worker（預設 Luna MAX）負責明確 scope 內的 implementation、debug、tests、evidence 與 repo changes。
- Orchestrator 不做 routine implementation；Worker 不得 silent stop。完整規則見 `ORCHESTRATOR_PROTOCOL.md`。
- Shared subsystem 採 single writer；唯一 Integrator 負責 shared merge、central docs reconciliation、regression 與 final gate。

## 變更前檢查

1. 讀相關 canonical files 與 requirement IDs。
2. 確認是否依賴尚未完成的 Architecture 或 Visibility checkpoint。
3. 檢查 working tree、branch 與 remote state；不得假造 remote evidence。
4. 確認 scope、non-scope、owner、forbidden areas、acceptance、tests 與 handoff condition。
5. 只修改自己擁有的檔案；發現 shared defect 時回報 owner，不順手跨界修正。

## 安全與檔案

- 私人學生影片、個人專案資料、generated report、ZIP、credential、`.env` 不進 Git。
- 所有 project-specific data 受 `FILESYSTEM_POLICY.md` 的 `PROJECT_ROOT` boundary 約束。
- 不使用 fake data、placeholder export、hard-coded success、mock ZIP 冒充正式完成。
- 不在沒有 human checkpoint 的情況下建立 GitHub remote、改變 visibility、使用外部帳號、部署或執行破壞性操作。

## 完成回報

Worker 必須回報：狀態、修改檔案、branch、commit SHA、remote branch/push status、worktree、tests、evidence、acceptance、blocker 與 next owner。Handoff 前若成果值得恢復，必須先通過必要 checks、commit、push 到自己的 worker branch；目前尚未有 remote 時只能明確標示 `AWAITING_USER_SETUP`。
