# Wave 20｜FFmpeg 影格快取與真正逐幀播放器

## 目標

採用使用者選定的 UI 方案 1：單一主時間軸、單一播放／暫停切換、拖曳時即時顯示影格、左右鍵真正逐幀。這一波只處理影格解碼、快取、編輯器播放器與輸出 HTML 播放器；同步設定冗餘與整體 UI 重整留到後續波次。

核心技術路線是方案三：由 FFmpeg 預先解碼並建立逐幀索引與快取。不得把「轉成另一支 MP4 再交給 HTMLVideoElement.currentTime」當成真正逐幀。

## UI／使用流程決策

使用者已選方案 1：

- 單一主時間軸；拖曳輸入時直接切換對應影格並更新畫面。
- 播放／暫停使用同一個切換按鈕。
- 上一幀／下一幀與鍵盤 ArrowLeft／ArrowRight 直接改變影格索引。
- 比較播放器沿用目前 block-local 關係，但視覺播放表面與輸出 HTML 共用影格模型。
- 不在本波次重設同步模式、錨點、偏移、循環等設定語意。

## 五個平行開發方案與評分

| 方案 | 分工 | 評分 | 採用判斷 |
|---|---|---:|---|
| A | 單線串行完成所有 frame pipeline、renderer、export | 5.2/10 | 風險低但速度不足 |
| B | Media 與 Renderer 兩條線，Export 後接 | 7.5/10 | 有平行性但 export 等待過久 |
| C | Media、Editor、Export 三條線，QA 最後才進場 | 8.7/10 | 速度佳但缺少早期回饋 |
| D | Media/Frame Pipeline、Editor Player、Portable Export Player、QA 四條 bounded lanes | **9.6/10** | **採用；契約固定、寫入範圍分離、最大安全併行** |
| E | 五條線同時修改共享 bridge、renderer、export contract | 7.1/10 | 共享檔案碰撞與假整合風險過高 |

## 採用方案 D 的 ownership

### Lane A｜Frame Pipeline / Media

負責 FFmpeg／ffprobe 影格 metadata、逐幀解碼、cache/index、取消與清理、以及必要的 main/preload bridge。優先新增獨立 `src/media/**` 檔案；若必須修改 `src/main.js` 或 `src/preload.js`，由本 lane 單一 writer 處理並先固定 bridge 介面。

### Lane B｜Editor Frame Player

只負責 `src/renderer.js`、`src/index.html`、`src/styles.css` 與 renderer player tests。使用 Lane A 的 bridge contract，將內部單／比較播放器的視覺影格、拖曳、單一播放切換、左右鍵逐幀接到 frame cache；不得修改 `src/media/**` 或 `src/export/**`。

### Lane C｜Portable Export Player

只負責 `src/export/**` 與 export tests。輸出 HTML 必須攜帶被引用影片的影格資料／索引，使用與 editor 等價的影格模型與控制語意；folder／ZIP 只包含被 block 引用的資料，不包含未使用 Media Library 素材。

### Lane D｜QA / Contract Monitor

只讀檢查，不修改產品 source、test、package 或 canonical docs。平行檢查 ownership、契約一致性、Node syntax、純測試與 fake-success 風險；等待各 lane handoff 後做獨立 gate。

## 明確不在本波次

- 不重做同步模式、同步錨點、相對偏移、循環設定的 UX 語意。
- 不處理整體設定冗餘重構。
- 不把原始影片搬走或覆蓋；來源檔維持不變。
- 不把未引用的 Media Library 影片放入輸出。
- 不把「currentTime 時間跳轉」宣稱為精確逐幀。
- 不把未執行的 Electron／file://／真人測試標成 VERIFIED。

## 進度與驗證檢核表

### Frame Pipeline

- [ ] FFmpeg 逐幀解碼與 frame index／PTS 可保存。
- [ ] cache 位於專案範圍內，取消、重試、清理不留下半成品。
- [ ] 原始影片不被改寫；同一素材可重用 cache。
- [ ] CFR、VFR、不同 FPS 與缺少工具時都有明確狀態。

### 編輯器播放器

- [ ] 拖曳時間軸時持續顯示對應影格，不等待放開才更新。
- [ ] 上一幀／下一幀與 ArrowLeft／ArrowRight 直接切換影格索引。
- [ ] 播放／暫停是同一個 toggle button。
- [ ] 單片與比較片使用同一套 frame surface／index semantics。
- [ ] 儲存、關閉、重開後可恢復必要的 frame-player state。

### 輸出 HTML

- [ ] editor 與 exported HTML 共享影格資料模型與 frame mapping。
- [ ] exported folder 與 ZIP 可自足讀取影格資料，不依賴 generator、FFmpeg、網路或 CDN。
- [ ] folder／ZIP 只包含被引用素材與必要影格資料。
- [ ] 輸出播放器支援拖曳、逐幀、左右鍵與單一播放／暫停 toggle。

### Gate

- [ ] 所有新增 JavaScript 通過 `node --check`。
- [ ] frame pipeline、renderer、export 純測試通過。
- [ ] full `npm test` 通過；skip 必須明確列出。
- [ ] artifact、secret、path-containment、source-preservation 檢查通過。
- [ ] Electron editor runtime、export folder／ZIP runtime 與真人驗收分層記錄，不誇大 evidence。
- [ ] Integrator 建立可恢復 Git/GitHub checkpoint，更新 current provenance。

## 當前狀態

- UI 方案：已由使用者選定方案 1。
- 技術方案：FFmpeg 逐幀解碼／索引／快取。
- 平行方案：D，四條 bounded lanes。
- 實作：Wave 20A Media frame-cache pipeline（`79e196c`）與 Wave 20B Bridge/Editor（`5525b49`）、Portable Export（`342d6e1`）、Integrator hardening（`7c2c40c`）已完成 bounded implementation/contract gate。
- 驗證：`npm test` 162 total / 161 pass / 1 explicit Electron `file://` unavailable skip；47 JS syntax checks、focused tests、artifact/credential scans pass。這些不是完整 runtime 或真人驗收。
- Product acceptance：尚未完成；不得標記 requirement VERIFIED。

## Wave 20B｜契約整合與輸出接線計畫

上一階段已產生 Media frame-cache contract/lifecycle 與 Editor frame-player seam，但兩者尚未完成 bridge 接線，Portable Export 尚未實作。下一階段不再等待整條 Media pipeline 完成才動作，而是以已提交 contract 為唯一依據平行接線。

### 五個平行方案與評分

| 方案 | 作法 | 評分 | 判斷 |
|---|---|---:|---|
| A | 主控串行修 bridge、再修 editor、再修 export | 5.4/10 | 太慢，不採用 |
| B | Bridge 與 Export 並行，Editor 最後接線 | 8.1/10 | 可行但 editor 回歸較晚 |
| C | Bridge/Editor、Export、QA 三線並行 | 9.2/10 | **採用；依賴已固定且 ownership 可分離** |
| D | 再拆 Media runtime、Bridge、Editor、Export、QA 五線 | 8.0/10 | Media 已有 owner，重複碰撞風險較高 |
| E | 直接全面重寫播放器與 export | 6.3/10 | 破壞既有成果，不採用 |

### Wave 20B ownership

- Bridge/Editor integration：`src/main.js`、`src/preload.js`、`src/renderer.js` 與 renderer tests；統一 A 的 `prepareFrameCache/readFrameCache/cleanupFrameCache/cancelFrameCache` contract，移除 UI 對不存在方法的依賴；不得改 `src/media/**` 或 `src/export/**`。
- Portable Export：`src/export/**` 與 `test/export/**`；將 ready frame cache 的 index／PNG 影格以 referenced-only 方式帶入 folder／ZIP 與輸出 HTML；不得改 renderer/media/main/preload。
- QA：唯讀重新檢查上述兩線的 ownership、contract、path safety、fake-success 與純測試；不修改產品檔。

### Wave 20B 驗證清單

- [x] Editor bridge 可由 projectId/assetId 取得 ready frame index 與安全 frame source（bounded contract evidence）。
- [x] cache preparing、missing tool、source invalid、cancelled、process failed 都有明確 UI 狀態（bounded contract evidence）。
- [x] Editor drag／ArrowLeft／ArrowRight 不呼叫 `currentTime` 作為逐幀實作。
- [x] Export folder／ZIP 只包含引用影片的 frame cache/index，無未使用資產（focused export evidence）。
- [x] Export HTML 不依賴 generator runtime、FFmpeg executable、網路或 CDN（static contract evidence）。
- [x] Bridge、renderer、export focused tests 通過，之後進 full regression。
- [x] 沒有 runtime/human evidence 時，不標 VERIFIED。
