# Setup Checklist

目前狀態：**Phase 1/2 planning**。本清單區分可以由 repository 直接確認的項目、需要使用者決策的項目與 implementation 後才可驗證的項目。

## 1. Already confirmed

- [x] PROJECT_ROOT：D:\Vibe Coding\投球報告輸出器
- [x] Layer 1、Layer 2 與 Layer 3 attachment 已讀取
- [x] Product scope、NOT_IN_SCOPE 與 status semantics 已 materialize
- [x] UX、data、sync、media、output、acceptance、traceability planning docs 已建立
- [x] Worktree、backup、temporary boundary 已定義
- [x] GitHub remote 尚未建立，沒有假造 remote evidence
- [x] 本輪不啟動 sub-agent／multi-agent，符合使用者明確要求

## 2. Human decisions

- [x] Architecture：Desktop application
- [x] Application data storage：`PROJECT_ROOT\projects\`，backup=`.backups`，temporary=`.tmp`
- [x] GitHub repository visibility：Private
- [ ] 若需外部工具／帳號／credential：逐項確認是否允許；目前預設不建立

## 3. Before implementation

- [x] 更新 ARCHITECTURE.md 為使用者批准的 decision
- [x] 更新 FILESYSTEM_POLICY.md 的正式 storage boundary
- [x] 更新 GIT_GITHUB_POLICY.md 的 Private visibility policy
- [x] 建立 local Git repository、main branch 與合理 ignore
- [ ] secret/sensitive scan pass
- [ ] basic project skeleton 與 smoke validation pass
- [ ] commit baseline；visibility approved 後 push origin
- [ ] 建立 dependency/conflict graph、single writers、唯一 Integrator

## 4. Before real media acceptance

- [ ] 使用者提供或指定可合法使用的非私人 controlled fixtures
- [ ] 需要真人影片時，確認其不進 Git、logs 或第三方服務
- [ ] 明確定義目標 browser/OS matrix
- [ ] 建立 Scenario A–G 的 evidence location
- [ ] 確認 output folder／ZIP 可在測試位置安全清理

## 5. Final gate checklist

- [ ] TRACEABILITY_MATRIX 每一 row 有 evidence 或合理非 VERIFIED status
- [ ] file:// offline evidence
- [ ] responsive/interaction evidence
- [ ] VFR/incompatible/normalization evidence
- [ ] cancel/retry/reload recovery evidence
- [ ] source hash/semantic comparison evidence
- [ ] secret/log review
- [ ] accepted Git commit/remote checkpoint
- [ ] 真人 acceptance 完成後才更新 VERIFIED
