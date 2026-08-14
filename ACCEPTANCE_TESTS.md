# Acceptance Tests

## Canonical acceptance additions for the block editor (2026-08-14)

These checks supersede any assumption that the former fixed-form editor is acceptable; they are planned evidence, not executed evidence.

- Long-form editor: create many text blocks and many independent video blocks, reorder/remove them, reopen, and confirm focused text editing features without a fixed-form compatibility path.
- Video blocks: independently choose one asset or a pair, switch single/comparison and side-by-side/stacked layout, and preserve per-block in/out/playback settings.
- Block-local sync: verify time-mode elapsed-time alignment with source-local timebase/FPS, separate explicit frame mode, source-valid frame stepping, and independent anchors across repeated asset use.
- Referenced export: a report with unused Media Library assets exports only video-block-referenced copies; originals remain byte-preserved and folder/ZIP contain the same referenced set.

目前狀態：**Phase 1/2 planning**。本文件定義 automated、interaction、visual、offline、recovery、security 與真人驗收的 exit criteria；目前沒有 implementation、影片 fixture、generated report 或真人 evidence。

## 1. Evidence and status rules

- NOT_STARTED：尚未執行。
- IN_PROGRESS：已有執行但未完成所有 acceptance。
- VERIFIED：有與測試層級相稱、可重現的 evidence；fixture 不可冒充真人驗收。
- AWAITING_USER_SETUP：缺使用者決策、環境或素材。
- BLOCKED_HUMAN：需要高影響人類 checkpoint。
- 沒有 evidence 不得標 VERIFIED。

每個 scenario 要分開記錄：

1. unit／contract evidence
2. integration／E2E evidence
3. visual／responsive／interaction evidence
4. 真人 acceptance evidence

## 2. Test layers

| Layer | 覆蓋 | 目前狀態 |
|---|---|---|
| Unit / contract | model invariants、safe name、relative mapping、validation | NOT_STARTED |
| Integration | persistence、media pipeline、renderer/export contract | NOT_STARTED |
| E2E | Projects → Editor → Media → Sync → Preview → Export | NOT_STARTED |
| Interaction | keyboard、touch、busy、empty、error、recovery | NOT_STARTED |
| Visual / responsive | desktop wide、narrow、iPhone、Android | NOT_STARTED |
| Offline | 解壓 ZIP、斷網、desktop file:// | NOT_STARTED |
| Security / privacy | secret scan、sensitive data/log review、source safety | NOT_STARTED |
| Human acceptance | 教練真人使用 Scenario A–G | AWAITING_USER_SETUP |

## 3. Scenario A — 完整報告流程

Acceptance ID：AT-A

1. 建立 report project。
2. 撰寫文字、匯入 Markdown。
3. 匯入多支影片與圖片，查看 metadata。
4. 建立 single video block。
5. 建立 comparison block，選兩支影片。
6. 在兩側各自 seek／逐幀移動並設定 anchor。
7. 預覽 desktop、narrow、mobile width。
8. 修改內容，確認 autosave。
9. 關閉並重開 project，內容、references、anchors、export settings 仍在。
10. 輸出 folder 與 ZIP。

Pass criteria：source project 可繼續管理；輸出不改壞 source；沒有假成功、missing reference 或 broken relative path。

## 4. Scenario B — 離線報告

Acceptance ID：AT-B

1. 解壓 ZIP 到任意一般資料夾。
2. 斷網。
3. desktop modern browser 以 file:// 開啟 index.html。
4. 驗證文字、圖片、single video、comparison video、playback rate、loop、上一幀／下一幀與同步播放。

Pass criteria：必要資料不依賴 network、CDN、server API、database、Service Worker 或 runtime fetch；支援邊界與實際能力一致。

## 5. Scenario C — 同一 asset 重複使用

Acceptance ID：AT-C

同一 MediaAsset：

- 在一個 section 作 single video。
- 與影片 B 建立 comparison。
- 與影片 C 建立另一個 comparison。
- 兩個 comparison 使用不同 labels、anchors、loops。

Pass criteria：每個 Player Block instance 的設定獨立；修改一個 anchor 不改變其他 block。

## 6. Scenario D — 不同 FPS

Acceptance ID：AT-D

匯入兩支不同 FPS 的可用影片，將共同投球事件設定為 anchor，驗證 relative time alignment、frame/time metadata 與長時間播放 drift。

Pass criteria：以共同事件相對時間對齊，不要求 frame number 相同；允許的誤差與 correction evidence 清楚。

## 7. Scenario E — VFR / incompatible media

Acceptance ID：AT-E

匯入不適合可靠 frame stepping 的來源，驗證偵測、提示、normalized copy、original preservation、真實 phase/progress、cancel/retry 與 reload recovery。

Pass criteria：沒有假裝 frame-aware；normalized copy 經驗證後才可使用；original 不被覆寫。

## 8. Scenario F — Responsive / reachability

Acceptance ID：AT-F

驗收 generator 與輸出報告的 desktop wide、narrow desktop、modern iPhone viewport、modern Android viewport：

- 無 overlap、水平爆版、被遮住的 controls。
- comparison 可左右或上下排列，controls 仍可達。
- keyboard／touch 可執行 playback、frame、loop、sync、export、recovery。
- Projects、Editor、Media Library、Preview、Export、Jobs、Settings 都有入口與返回路徑。

## 9. Scenario G — 錯誤恢復

Acceptance ID：AT-G

至少注入：

- missing media
- corrupt video
- output path unavailable
- insufficient disk space
- cancelled transcode
- cancelled ZIP generation
- invalid anchor／loop
- crash/reload during save or job

Pass criteria：錯誤指出 phase、影響與可行 action；source project 保持安全；取消不標 success；可 retry 或明確終止。

## 10. Security / privacy gate

Acceptance ID：AT-SEC

- source media、personal project data、generated report、ZIP、credentials、.env 不出現在 Git。
- logs 不包含私人影片內容、credential 或未 redacted 的敏感路徑。
- export 不會把 secrets、temporary files、generator database 打包。
- secret/sensitive scan 與 log review 有可保存結果。

## 11. Exit criteria

整體不得因 unit test 綠燈就宣布完成。Final gate 必須逐項回答：Exist、Correct、Usable、Manageable、Observable、Reachable、Recoverable、Versioned、Verified；任何 requirement 缺相稱 evidence 都維持非 VERIFIED。
