# Acceptance Tests

## Canonical acceptance additions for the block editor (2026-08-14)

These checks supersede any assumption that the former fixed-form editor is acceptable. Some automated implementation evidence now exists, but the full acceptance set below remains the authority for deciding whether a requirement is actually verified.

- Long-form editor: create many text blocks and many independent video blocks, reorder/remove them, reopen, and confirm focused text editing features without a fixed-form compatibility path.
- Video blocks: independently choose one asset or a pair; single uses one stacked player card, while dual exposes side-by-side/stacked layout (layout is shown only for dual), and preserves per-block and per-side in/out/playback settings.
- Dual-video blocks: verify that both sides expose their independent controls and that the existing shared timeline/sync-point compatibility behavior maps both sides correctly in generator and export runtime. The former anchor, binding, control-side, and relative-offset workflow remains absent from the product contract and must not be reintroduced without a new design and acceptance set.
- Referenced export: a report with unused Media Library assets exports only video-block-referenced copies plus required Tree Polo package assets; originals remain byte-preserved and folder/ZIP contain the same referenced set.
- Manual frame annotations: single-video blocks and each dual-video side own independent manual annotation layers. Point storage is frame-only plus normalized x/y; exported reports reproduce the layers read-only and allow local point/line/layer visibility changes.

目前狀態：已有 automated unit/contract/integration coverage。2026-09-05～09-06 的 R7～R9 已有使用者局部真人 regression validation，但完整 Scenario A–H 仍未完成。R9 最後一次使用者本機完整 `npm test` evidence 為 301 tests、298 pass、2 個已知 stale test failures、1 個 Electron exported `file://` runtime unavailable skip；R10.1 已對齊這兩個 stale assertions，最終 suite 需再次執行後才記錄新的 pass 數。真實媒體、完整 desktop `file://`、responsive/touch、error recovery、security review 與完整真人 Scenario A–H evidence 仍需分層建立。

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
| Unit / contract | model invariants、safe name、relative mapping、annotation frame/coordinate contract、validation | IN_PROGRESS |
| Integration | persistence、media pipeline、renderer/export contract、annotation portable contract | IN_PROGRESS |
| E2E | Projects → Editor → Media → Preview → Export | NOT_STARTED |
| Interaction | keyboard、touch、busy、empty、error、recovery、annotation edit mode | IN_PROGRESS |
| Visual / responsive | desktop wide、narrow、iPhone、Android | IN_PROGRESS；R7～R9 有局部 desktop HTML regression validation，完整跨 viewport 尚未完成 |
| Offline | 解壓 ZIP、斷網、desktop file:// | IN_PROGRESS；最近一次 runtime evidence unavailable skip |
| Security / privacy | secret scan、sensitive data/log review、source safety | IN_PROGRESS |
| Human acceptance | 教練真人使用 Scenario A–H | IN_PROGRESS；已有局部 regression validation，完整 Scenario A–H 尚未完成 |

上述 `IN_PROGRESS` 只表示已有部分 automated 或局部真人 evidence；未列出完整、相稱 evidence 前不得改為 `VERIFIED`。

## 3. Scenario A — 完整報告流程

Acceptance ID：AT-A

1. 建立 report project。
2. 撰寫文字、匯入 Markdown。
3. 匯入多支影片與圖片，查看 metadata。
4. 建立 single video block。
5. 建立 dual block，選兩支影片。
6. 在兩側各自播放、seek、逐幀移動、調整速度與 segment loop。
7. 預覽 desktop、narrow、mobile width，切換並排／堆疊。
8. 修改 block 標題與兩側來源標題，確認左上角與兩側標題立即更新並 autosave。
9. 關閉並重開 project，內容、references、per-side playback settings 與 export settings 仍在。
10. 輸出 folder 與 ZIP。

Pass criteria：source project 可繼續管理；輸出不改壞 source；沒有假成功、missing reference 或 broken relative path。

## 4. Scenario B — 離線報告

Acceptance ID：AT-B

1. 解壓 ZIP 到任意一般資料夾。
2. 斷網。
3. desktop modern browser 以 `file://` 開啟 `<safe-report-name>.html`。
4. 驗證文字、圖片、single video、dual video、playback rate、loop、上一幀／下一幀；確認 side-specific controls 互不連動，並確認 shared controls 能按既有映射共同控制兩側。

Pass criteria：必要資料不依賴 network、CDN、server API、database、Service Worker 或 runtime fetch；支援邊界與實際能力一致。

## 5. Scenario C — 同一 asset 重複使用

Acceptance ID：AT-C

同一 MediaAsset：

- 在一個 section 作 single video。
- 與影片 B 建立 dual。
- 與影片 C 建立另一個 dual。
- 兩個 dual 使用不同 labels、每側播放設定、loops 與 annotation layers。

Pass criteria：每個 Player Block instance 與每個 dual side 的設定獨立；修改一側或一個 block 不改變其他 side/block，標註也不因共用 MediaAsset 而互相污染。

## 6. Scenario D — 不同 FPS 的獨立播放

Acceptance ID：AT-D

匯入兩支不同 FPS 的可用影片，分別驗證 frame/time metadata、上一幀／下一幀、segment loop 與獨立播放；另驗證既有 shared timeline 在可用 sync point 下能正確映射兩側，不把不同 FPS 當成相同原始 frame index。

Pass criteria：每側以自身媒體時間軸正確運作；side-specific 操作不改變另一側，shared timeline 則按既有 sync-point mapping 正確映射兩側。

## 7. Scenario E — VFR / incompatible media

Acceptance ID：AT-E

匯入不適合可靠 frame stepping 的來源，驗證偵測、提示、normalized copy、original preservation、真實 phase/progress、cancel/retry 與 reload recovery。

Pass criteria：沒有假裝 frame-aware；normalized copy 經驗證後才可使用；original 不被覆寫。逐幀標註的 frame-only 語意不得另存一套 media-time 真值來掩蓋 timing limitation。

## 8. Scenario F — Responsive / reachability

Acceptance ID：AT-F

驗收 generator 與輸出報告的 desktop wide、narrow desktop、modern iPhone viewport、modern Android viewport：

- 無 overlap、水平爆版、被遮住的 controls。
- dual 可左右或上下排列，controls 仍可達。
- keyboard／touch 可執行 playback、frame、loop、export、recovery；雙影片 shared timeline／sync-point 相容控制若出現，需驗收可達性與兩側映射，不驗收未定義的舊 anchor/binding/offset 流程。
- 有標註時，overlay 在播放器縮放與 letterbox/pillarbox 下仍對準實際影片內容；標註控制不遮住必要 playback controls。
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
- invalid segment／loop
- crash/reload during save or job

Pass criteria：錯誤指出 phase、影響與可行 action；source project 保持安全；取消不標 success；可 retry 或明確終止。

## 10. Scenario H — 手動逐幀標註

Acceptance ID：AT-H

1. 在 single-video block 建立兩個以上標註圖層，修改名稱與顏色；在 dual-video block 左右兩側各建立不同圖層。
2. 在指定幀移動滑鼠預覽位置，以左鍵放點；同一圖層同一幀再次放點時應取代原點，而不是產生第二點。
3. 在標註模式以 Space 放點，確認 Space 不觸發播放；左右鍵仍逐幀，Delete 刪除目前幀／目前圖層點，Ctrl/Cmd+Z 可復原，Esc 結束標註模式。
4. 設定任意正整數 N 作為標註步進；放點後只推進目前 side N 幀。儲存、關閉並重開 project 後 N 仍保留。
5. 第一個點在 startFrame 未設定時自動建立開始幀；之後可手動調整 startFrame/endFrame。播放到某幀時只顯示截至該幀的全部歷史點，未來已標點不提前出現；超過 endFrame 後整層不顯示。
6. 開啟線時，只依 frame 順序連接同圖層目前可見的相鄰標註點；不插值、不生成額外點。
7. 產生器可各自切換點、線與個別圖層；這些設定成為輸出報告初始狀態。
8. 匯出 `<safe-report-name>.html` 後，讀者可在本次閱讀自由切換點、線與個別圖層，但不能新增／移動／刪除點，也不回寫 source project。
9. 使用不同播放器尺寸與有黑邊的真實影片驗證 normalized x/y 只對應實際影片內容，不把黑邊納入座標。
10. 驗證同一 MediaAsset 放在不同 block、同一 dual block 的左右 side，其標註資料彼此隔離。

Pass criteria：frame-only point data、one-point-per-frame、side/block isolation、keyboard ownership、persistent N-step、lifetime/history display、reader-only export 與實際影片座標全部符合上述語意。

目前 evidence：annotation model/report contract/export runtime/source-level interaction tests 已有 automated coverage；R7～R9 的人工驗收包含輸出 HTML 基本 regression，但完整 Electron 真人標註互動、真實影片 letterbox 與 exported `file://` overlay 尚待補驗，因此 AT-H 為 `IN_PROGRESS`，不是 `VERIFIED`。

## 11. Security / privacy gate

Acceptance ID：AT-SEC

- source media、personal project data、generated report、ZIP、credentials、.env 不出現在 Git。
- logs 不包含私人影片內容、credential 或未 redacted 的敏感路徑。
- export 不會把 secrets、temporary files、generator database 打包。
- secret/sensitive scan 與 log review 有可保存結果。

## 12. Exit criteria

整體不得因 unit test 綠燈就宣布完成。Final gate 必須逐項回答：Exist、Correct、Usable、Manageable、Observable、Reachable、Recoverable、Versioned、Verified；任何 requirement 缺相稱 evidence 都維持非 VERIFIED。
