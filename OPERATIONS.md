# Operations and Recovery

目前狀態：**Phase 1/2 planning**。本文件是 local-first 產生器與輸出 artifact 的運作邊界；尚未綁定特定 desktop shell、browser storage 或 media tool。

## 1. Operational scope

- 產生器只處理教練在本機提供的 project data 與 media。
- 不自動上傳、不建立 cloud sync、不使用 telemetry、不依賴外部 account。
- generated report folder 與 ZIP 是交付 artifact，不是 source project 的替代品。
- online static report 的部署由教練自行處理，產品不自動部署。

## 2. Startup / shutdown

實作後必須：

- 啟動時驗證 PROJECT_ROOT 與 application data boundary。
- 載入 project list、autosave/recovery marker 與未完成 jobs。
- 顯示 storage、permission、missing media 與 recovery 狀態，不以空白畫面掩蓋錯誤。
- 關閉時 flush pending save；無法完成時保存 recoverable marker 並告知使用者。
- 不在 shutdown 期間刪除 original media 或可信 source project。

目前沒有 runnable startup/shutdown evidence。

## 3. Job operation

Media inspection、normalization、transcode、ZIP/export 依實際耗時分為 short async 或 persisted long job。

Long job 必須有：

- current phase
- processed/total（真正可量化時）
- success/skipped/failed
- cancel/retry
- error detail
- result location
- reload recovery
- append-only history

Worker／UI crash 後不能把未完成 job 顯示為 succeeded。

## 4. Backup / restore

- source project 的可信 snapshot／backup 位於 BACKUP_ROOT，並記錄 schema version、hash/record count 與時間。
- destructive operation、migration、bulk import 或大量 refactor 前建立 rollback point。
- restore drill 要有獨立 evidence；backup file 存在不代表 restore verified。
- export 只讀 source snapshot；不以 export 當 backup 的唯一形式。

## 5. Logging and privacy

允許 log：safe project/job/asset identifiers、phase、非敏感錯誤類型、counts、timing。禁止 log：

- 私人影片內容或影格
- credentials、tokens、private keys
- 未 redacted 的完整 user path
- 不必要的 report text
- 第三方 telemetry payload

每次 release／handoff 前應做 log review 與 sensitive scan。

## 6. Incident handling

| Incident | 保護措施 | 使用者 action |
|---|---|---|
| missing media | source 保留，block 標 missing，export blocker | 重新指向、移除 reference 或恢復 asset |
| corrupt/incompatible video | original 保留，job error，無 fake playable | retry normalization 或停用 |
| output path unavailable | 不覆寫 source，標示 export phase | 選其他位置後 retry |
| insufficient disk | 保留 source，停止 job，清理受控 temp | 釋放空間或換位置 |
| cancelled job | status CANCELLED，不標 success | retry 或保留結果 history |
| crash/reload | recovery marker + job metadata | 確認 resume／revert |

## 7. Release and final gate

Release／handoff 前：

1. canonical docs status 與 evidence 一致。
2. secret/sensitive scan pass。
3. source project、generated output、ZIP 分類正確。
4. unit/integration/E2E/visual/offline/security evidence 齊全。
5. no force push，remote checkpoint 可恢復。
6. 使用者真人 acceptance 只在有相稱 implementation evidence 後進行。
