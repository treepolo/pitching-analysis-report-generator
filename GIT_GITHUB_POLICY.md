# Git / GitHub Policy

目前狀態：**Phase 2 planning**。使用者已於 2026-08-14 決定 GitHub repository 採 **Private**。目前尚未建立 GitHub remote，也沒有 push evidence。

## 1. Intended repository policy

- Repository name：pitching-analysis-report-generator
- Default branch：main
- Remote name：origin
- Worker branches：worker/<scope>
- Integration branch：由唯一 Integrator 管理（名稱在 implementation kickoff 前確認）
- Force push：禁止
- Worker 不直接 push main、不 merge main、不刪除 unrelated remote branches、不 rewrite shared history。

## 2. Human visibility checkpoint

狀態：**RESOLVED — Private approved by user on 2026-08-14**。

已確認 visibility 不代表 remote 已建立；仍不得以 repository name、未登入 CLI、remote URL 或推送結果假造 remote evidence。

在 remote 尚未完成帳號授權與建立前：

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

截至本輪檢查：工作區已有 local main 與 planning commits，但沒有 GitHub remote／push evidence；對外狀態為 `AWAITING_USER_SETUP`，不是已完成 remote baseline。Private visibility checkpoint 已解除；建立 remote 仍需可用的 GitHub 帳號授權與明確外部操作。
