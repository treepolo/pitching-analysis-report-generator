# Git / GitHub Policy

目前狀態：**Phase 1/2 planning**。本文件定義預期 Git/GitHub governance；目前尚未建立 GitHub remote，也沒有 push evidence。Repository visibility 是 BLOCKED_HUMAN。

## 1. Intended repository policy

- Repository name：pitching-analysis-report-generator
- Default branch：main
- Remote name：origin
- Worker branches：worker/<scope>
- Integration branch：由唯一 Integrator 管理（名稱在 implementation kickoff 前確認）
- Force push：禁止
- Worker 不直接 push main、不 merge main、不刪除 unrelated remote branches、不 rewrite shared history。

## 2. Human visibility checkpoint

狀態：**BLOCKED_HUMAN**。

在建立 remote 前，使用者必須明確選擇 GitHub repository visibility：Private 或 Public。不得以 repository name、未登入 CLI、remote URL 或推送結果假造決策。

未完成 visibility checkpoint 時：

- 可繼續 local planning、canonical docs、tests/fixture design。
- 不建立 GitHub repository。
- 不新增 origin。
- 不 push 任何 branch。

## 3. Baseline gate

Architecture 與 visibility 都核准後，才可建立可信 baseline：

1. canonical docs 與 basic skeleton 完成。
2. FILESYSTEM_POLICY 生效。
3. .gitignore 覆蓋私人資料、generated artifacts、credentials、build output。
4. secret/sensitive scan 通過。
5. basic validation/smoke 通過。
6. commit。
7. 在核准的 origin push。
8. 視需要建立 baseline tag/marker。

baseline 不得宣稱已存在，除非有 commit SHA、remote branch 與可重現檢查結果。

## 4. Checkpoint-based push

重要且值得恢復／交接／整合／驗收的狀態：

- Worker handoff：tests → commit → push worker branch → verify remote → report。
- Worker pause：有效 code/docs/evidence 休止前 commit + push。
- High-risk operation：migration、deployment、destructive import、large refactor 前確認可信狀態已 remote。
- Integration：merge + regression 後由 Integrator push。
- Acceptance：canonical evidence/status 更新後 commit + push。
- Milestone/final gate：push，必要時 tag。

不要求每個小 commit 立即 push，但不得讓可交接成果長期只在本機。

## 5. Secret and sensitive-data gate

Push 前至少檢查：

- .env、private key、credential、personal CSV、private media、generated report、ZIP、backup、sensitive logs 不在 staged files。
- source、Markdown、frontend bundle、source map、generated artifacts 不含 secret。
- log review 不包含私人影片內容與未 redacted path。
- .gitignore 規則與實際 staged file 清單一致。

## 6. Current state

截至本輪檢查：工作區尚無可用 Git repository／branch／commit／remote evidence；因此對外狀態為 AWAITING_USER_SETUP，不是已完成 baseline。Architecture 與 visibility checkpoint 解除後，由 Integrator 執行 local Git baseline、secret scan、commit 與 approved remote setup。
