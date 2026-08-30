# Data and Sync Contract

> Current status (2026-08-30): the former anchor, binding-mode, control-side, relative-offset, and sync-IPC workflow is not a product contract. The current code still has a narrower block-local `sync`/`commonSegment` compatibility seam used by the generator and shared export runtime. The material below is historical design context and must not be read as authorization to expand that seam; any removal or redesign requires an explicit product decision.

## Historical block-local sync proposal (superseded 2026-08-21)

- Sync configuration belongs to each comparison video block instance, never to a shared form or global MediaAsset record.
- Default time mode uses a shared elapsed-time playhead and maps each source through its own timebase/FPS and anchor time. It must not map 60fps and 30fps sources one-to-one by raw frame index.
- Explicit frame-based mode is a separate capability. Frame stepping uses each source's valid timestamps/frame timebase; when unavailable, the contract remains time-based/unknown and exposes the limitation.
- Start anchors identify an event and are separate from the playback relationship. Per-block in/out and playback settings remain independent across repeated uses of the same asset.

目前狀態：**Phase 1/2 planning**。本文件定義比較影片的同步語意、anchor 邊界、frame/time precision 與 fallback；不可在未有人類架構核准前假定特定 browser API 或 FFmpeg 實作。

## 1. 同步核心語意

- 使用者選擇兩支影片，分別移動到代表同一投球事件的位置，再按「設為同步點」。
- 使用者不手打秒數、不手算 FPS、不手算 offset。
- 每個 comparison block instance 各自保存兩側 anchor；anchor 不存在 MediaAsset 全域。
- primary alignment 是共同事件的 relative time；兩支影片 frame number 可以不同。
- anchor、loop 與 label 皆是 block-local config；同一 asset 可在多個 block 以不同設定使用。

## 2. Anchor evidence

每側 anchor 至少保存：

- block instance id、side id、asset id
- observed media time
- frame index（瀏覽器／pipeline 能可靠提供時）
- precision state：frame-aware、time-based、unknown
- timing metadata snapshot：fps、duration、VFR／CFR 判斷、normalization state
- source position capturedAt

relative t = 0 是比較 block 的語意 anchor；不是把影片檔案的 presentation timestamp 永久改寫。

## 3. Alignment algorithm contract

給定 left anchor L、right anchor R，common relative time r 應映射為：

- left target time = L.observedTime + r
- right target time = R.observedTime + r

每次 seek、play、pause、rate change、frame step 與 loop 都必須通過同一個 mapping contract，再依各自 duration clamp。不同 FPS 不要求 frame number 相同。

播放時：

1. 以一側作為 temporary clock 或依穩定性選擇 clock。
2. 讀取另一側 currentTime 與 target time 的 drift。
3. 小 drift 以微調 playback rate 或 seek correction 修正；大 drift 以明確 seek/rebase 修正。
4. correction 不得造成無限震盪；閾值與 evidence 必須記錄。
5. pause、visibility change、stalled、ended 與 error 都要進入明確 state。

實作可選 frame-aware browser capability；若不可可靠取得 frame position，必須降級為 time-based fallback 並揭露精度限制。

## 4. Frame stepping

- 上一幀／下一幀以 source timing metadata 或可靠 frame-aware API 計算。
- CFR 可使用 frame duration 推導，但仍需驗證 seek precision。
- VFR、codec 不相容或 browser precision 不足時，不得假裝 frame number 精確；顯示 time-based fallback。
- normalized copy 的 timing metadata 必須與 original 分開保存。
- 跨瀏覽器或 file:// 能力差異不可由硬編碼 success 掩蓋。

## 5. Validation

Comparison block export 前至少驗證：

- 兩側 asset reference 存在且屬於同一 project。
- 兩側 media 可播放或有可接受的 normalized copy。
- anchor time 在可播放範圍內。
- loop start/end 有效，且 start < end。
- precision state 與 fallback capability 一致。
- relative mapping 不會把任一側 target 推到非法範圍。

Invalid state 必須指出可修復 action；禁止靜默移動 anchor 或輸出不能工作的 comparison。

## 6. Persistence / recovery

- anchor 設定後立即進入 autosave／save queue，save state 可觀察。
- crash/reload 必須能辨識未完成 anchor mutation 或恢復前一個可信 revision。
- export 前建立 read-only snapshot；export 中的 correction 不寫回 source anchor。
- 同一 asset 在不同 block 的 anchor 修改不得互相污染。

## 7. Required evidence

| Evidence | 內容 | 目前狀態 |
|---|---|---|
| Sync contract tests | 不同 FPS、不同 anchor、不同 duration 的 mapping | NOT_STARTED |
| Frame precision tests | CFR、VFR、incompatible 與 fallback | NOT_STARTED |
| Interaction evidence | seek、prev/next、anchor、loop、keyboard/touch | NOT_STARTED |
| Long-play drift evidence | 真實影片長時間播放後的誤差 | NOT_STARTED |
| Offline evidence | 解壓後 file:// comparison playback | NOT_STARTED |
