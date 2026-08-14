# Filesystem Policy

目前狀態：**Phase 2 planning**。Desktop architecture 已由使用者確認；正式 application data 採 project-root 內的受控目錄，避免 source copy 散落未知 AppData。

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

## 3. Application data storage decision

正式 application data 位置採 **PROJECT_ROOT\projects\**：

- 每個 project 使用受控子目錄，例如 `projects/<project-id>/project.json`、`media/` 與必要的 normalized copies。
- 生成中的 output 只寫入 `PROJECT_ROOT\output\`，暫存與中斷產物只寫入 `.tmp`。
- backup/checkpoint 只寫入 `.backups`；不得把 source copy 寫到 Desktop、Downloads、Documents 或未知 AppData。
- storage adapter 仍應可替換；若未來改用 desktop app data location，必須先更新本政策、backup/restore 與驗收 evidence。

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

FS-001 為 NOT_STARTED（尚待 implementation filesystem review）；FS-002 的 human decision 已完成，實作仍須驗證 containment。`projects/`、`output/`、`.tmp/`、`.backups/` 目前不放私人素材或 generated report。
