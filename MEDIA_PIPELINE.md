# Media Pipeline

## Canonical media/export boundary (2026-08-14)

- Media Library assets are reusable project-local source records; video blocks, not the library, decide whether an asset is used in a report.
- Export must traverse the canonical block document and copy only assets referenced by single/comparison video blocks. Unused library assets are never included by default.
- Original/source files are read-only from export's perspective. Export copies are separate self-contained artifacts with project-relative references; normalization and export must not overwrite originals.
- Missing, unsupported, unverified, or unplayable referenced assets remain explicit blockers. Unreferenced assets do not become export blockers merely because they are present in the library.

目前狀態：**Phase 1/2 planning**。本文件定義媒體匯入、檢查、正規化與恢復；FFmpeg、native codec tooling 與 application shell 依 Architecture checkpoint 決定。

## 1. Pipeline stages

1. Select：使用者選擇檔案，先檢查權限、大小、extension 與 project boundary。
2. Preserve：建立 original source reference；不得覆寫來源。
3. Inspect：讀取 media kind、display name、duration、resolution、container、codec、FPS/frame timing、CFR/VFR hints。
4. Classify：判定 direct playable、needs normalization、unsupported 或 unknown。
5. Normalize：必要時在 project-local normalized area 產生 copy，保留 original。
6. Verify：重新讀取 normalized copy metadata 與可播放性。
7. Register：寫入 MediaAsset canonical record 與 job history。
8. Use：Media Library 與 Player Block 只引用 asset record，不直接散落檔案路徑。

## 2. Supported input and output policy

- 正式輸入至少包含 MP4 與常見圖片格式；實際 extension matrix 要在 implementation/fixture 階段定義並測試。
- 目標瀏覽器相容影片格式原則上偏向 MP4/H.264，但不能在未驗證前宣稱所有檔案可播放。
- 不使用 Base64 內嵌影片。
- original、normalized copy 與 export copy 是不同角色；source 不被 export 或 normalization 改寫。

## 3. Metadata contract

Metadata 分成：

- discovered：由工具實際讀取，未知時標示 unknown 與原因。
- normalized：對 normalized copy 重新讀取的實際結果。
- derived：例如 safe output filename、reference count。
- user label：顯示名稱與 block label，可由使用者修改，但不覆蓋 discovered metadata。

不得要求使用者重填系統可可靠讀取的 FPS、duration、resolution 或 codec。

## 4. Compatibility states

| State | 語意 | UI / export 行為 |
|---|---|---|
| direct | 可直接在目標支援範圍播放 | 可建立 player block |
| needs-normalization | metadata 顯示需要轉換 | 建立 long job，完成前不可假裝 ready |
| normalized | normalized copy 已驗證 | block 使用 verified copy，original 保留 |
| unsupported | 已知不能可靠使用 | 顯示原因、禁止成功 export |
| unknown | 檢查尚未完成／能力不足 | 顯示限制，不標成功 |
| missing | source/reference 不可取得 | block 顯示 missing，export blocker |

## 5. Jobs, progress and recovery

Inspection 可為 short async；大型 normalization/transcode 必須是 persisted long job。

Long job 至少保存：

- phase：inspect、normalize、verify、register、complete 或 error
- processed/total（只有實際可量化時）
- success、skipped、failed
- warnings、error detail、cancel state、result location
- original reference、normalized reference、retry count

禁止假百分比。取消後 status 必須是 CANCELLED，不得產生誤導性的 succeeded record；retry 使用新的 job attempt 或 append-only history。

## 6. Failure handling

- corrupt source：保留 original，顯示檢查錯誤，可 retry 或停用。
- incompatible codec：提出 normalization；沒有 verified output 不允許 export 成功。
- insufficient disk：保留 source project，清理可辨識 temporary output 後提示空間需求。
- permission/path error：指出 phase 與可選位置，不把任意外部路徑寫入 project source。
- crash/reload：恢復 job metadata，讓使用者選擇 resume、retry 或保留 original。

## 7. Privacy and logging

- 私人影片內容、影格、完整路徑與 credential 不進一般 log。
- log 只記錄 safe asset id、phase、非敏感錯誤類型與計數；必要時以 redacted path 表示。
- 不上傳第三方、不建立無必要 telemetry。
- generated media 與 output 受 `PROJECT_STATE.md` 的 project-root boundary 管理，不進 Git。

## 8. Required evidence

目前沒有實際影片與 pipeline implementation，因此所有項目均為 NOT_STARTED：

- MP4/image import and metadata fixture
- VFR/incompatible detection
- original preservation
- normalized copy verification
- real progress/cancel/retry
- missing/corrupt/path/disk recovery
- sensitive log review
