# Wave 24 雙影片編輯器同步調整控制

## 已選 UI／流程方案

方案一：雙影片共用控制列維持共同播放；每側影片下方新增獨立播放／暫停、上一幀、下一幀與進度條。側邊控制只供編輯器調整左右同步位置，不綁鍵盤快捷鍵。輸出 HTML 不提供同步設定，只讀取輸出器草稿儲存的同步點。

預設同步點為 { leftFrame: 0, rightFrame: 0 }。若編輯器將某側起點推到同步幀之後，該側同步點自動移到合法起點；若終點排除同步幀，終點自動拉到至少包含同步幀的邊界。

## 平行開發方案評估

1. **依檔案邊界平行**（採用，9.5/10）：renderer/editor、export/native runtime、測試與契約各自 single-writer；主代理負責整合與跨層驗證。衝突最少，能同時完成編輯器與輸出權限差異。
2. **全部由主代理順序修改**（7/10）：整合風險低，但無法充分利用平行時間，且跨層回歸較晚發現。
3. **先抽出全新 dual-sync 共用模組再平行接線**（8/10）：規則集中，但新增抽象層會擴大本輪範圍，可能影響既有 runtime。
4. **一名代理全包 UI、另一名代理全包 export、主代理補測試**（8.5/10）：速度快，但 renderer 與測試契約容易在最後才發現落差。
5. **先測試驅動、再由兩名代理實作**（8/10）：驗收清晰，但需要先預測 DOM/runtime 細節，容易形成過度綁定的靜態測試。

## 開發與驗證清單

- [x] 將雙影片草稿同步預設初始化為左右第 0 幀。
- [x] 編輯器雙影片每側新增獨立播放／暫停、進度條、上一幀、下一幀；不接鍵盤快捷鍵。
- [x] 編輯器側邊控制可獨立調整左右目前幀，共用「同步」按鈕以兩側目前幀寫入同步點。
- [x] 起點／終點改動自動維持同步點合法，並覆蓋 0 代表未設定的規則。
- [x] 輸出 HTML 移除同步設定按鈕與可寫入同步狀態的 runtime，只讀取草稿同步點。
- [x] 輸出 HTML 仍以共用控制列播放，並驗證預設／已儲存同步映射。
- [x] 補齊 renderer、export、native runtime、storage/report contract 測試。
- [x] 執行完整 npm test、JavaScript 語法檢查、產生 inline script 編譯、git diff --check。
- [x] 建立並推送 Git checkpoint；保留無關使用者檔案不提交。



## 驗證結果

- npm test: 147 passed, 0 failed, 1 Electron file:// smoke skipped because the local Electron runtime was unavailable.
- Core JavaScript node --check: renderer, export native player, report renderer, storage, and report contract all passed.
- Generated native-player inline script compiled through the existing report-renderer VM test.
- git diff --check passed for all Wave 24 files; the unrelated pre-existing AGENTS.md change remains unstaged.
