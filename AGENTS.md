# Agent Entry

先讀 `PROJECT_STATE.md` 與相關產品、資料、輸出、驗收文件；治理方向以目前提供的 Layer 1 / Layer 2 為準。這裡只保留讓新 Session 正確接手所需的入口，不重複工程 SOP。

主控只負責規劃、調度、驗證與交接；開發交給可見的 persistent project Worker threads。可安全分離的工作應平行處理，共用核心檔案維持 single writer。不要使用 fake completion，不要把沒有 evidence 的功能標成完成，不要把私人素材或 credentials 寫進 Git。
