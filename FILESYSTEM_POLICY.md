# Filesystem Policy

目前狀態：**Phase 1/2 planning**。本政策先固定 project boundary；正式 application data storage 仍依 ARCHITECTURE.md Human Checkpoint 決定。

## 1. Approved roots

| 名稱 | 絕對路徑 | 用途 |
|---|---|---|
| PROJECT_ROOT | D:\Vibe Coding\投球報告輸出器 | repository、canonical docs、implementation |
| WORKTREE_ROOT | D:\Vibe Coding\投球報告輸出器\.worktrees | 受控 worker worktrees；目前未建立 |
| BACKUP_ROOT | D:\Vibe Coding\投球報告輸出器\.backups | rollback/checkpoint backups；目前未建立 |
| TEMP_ROOT | D:\Vibe Coding\投球報告輸出器\.tmp | 可辨識、可清理的暫存 artifacts |

## 2. Containment rules

- project source、worktree、backup、temporary、generated report、ZIP 與 project-specific data 預設不得寫出 PROJECT_ROOT。
- 不在 C:\ 或 D:\ 根目錄、Desktop、Downloads、Documents、未知 AppData 或任意外部 temp path 建立 source copy。
- 不使用未解析的 environment variable、glob 或不受驗證的 path 做 destructive operation。
- 所有 user-supplied filename 必須先做 safe-name validation；禁止 path traversal、path separator、控制字元與保留名稱衝突。
- export、normalization、ZIP 中斷時的未完成檔案只能位於 TEMP_ROOT，且必須標示為暫存／未完成。

## 3. Application data storage checkpoint

正式 application data 位置目前為 **AWAITING_USER_SETUP**：

- Option 1：project folders 位於 PROJECT_ROOT 內，便於 backup／portable handoff。
- Option 2：desktop shell 的受控 application data location，但仍需明確 boundary、backup、restore 與 source copy policy。

在選擇前不得偷偷把正式 project source 寫到不明 AppData；implementation 應使用可替換 storage interface 或維持 planning。

## 4. Data classification

- Git-safe：canonical docs、source code、tests、非私人 deterministic fixtures、policy。
- Git-forbidden：私人學生影片、personal project data、generated reports、ZIP、credentials、.env、private keys、backup data、logs with sensitive content。
- Tool-managed：node_modules、build/cache 等依工具產生，但不得包含 project source copies。

## 5. Backup and cleanup

- 高風險 migration、bulk import、destructive operation 前，在 BACKUP_ROOT 建立可辨識 rollback point。
- backup 是否可 restore 必須另有 evidence；backup 存在不等於 restore verified。
- cleanup 只能針對已解析且位於 intended root 內的特定 temporary artifact；不得遞迴刪除 PROJECT_ROOT 或不明路徑。
- source original 在 normalization/export 期間不可被清理。

## 6. Review status

FS-001 為 NOT_STARTED（尚待 implementation filesystem review）；FS-002 為 AWAITING_USER_SETUP（等待 architecture/storage 決策）。目前沒有 project-specific media、output 或 backup。
