# 投球報告輸出器

供投球教練在本機建立投球動作分析報告的 Desktop application。

## 目前能力

- 長篇文件編輯器：段落、文字、圖片、單影片與雙影片區塊。
- 單／雙影片使用瀏覽器原生影片播放與逐幀控制，雙影片兩側可獨立操作。
- 報告可輸出成自包含 folder 或 ZIP；媒體只複製報告實際引用的檔案。
- 輸出 HTML 可在桌面瀏覽器與 `file://` 離線環境使用。

## 開發指令

```text
npm install
npm start
npm test
```

## 本機資料邊界

專案資料在 `projects/`，生成輸出在 `output/`，暫存資料在 `.tmp/`。真實媒體、生成報告、壓縮檔與本機秘密不進 Git；`測試輸出/` 已列入忽略規則。

## 文件地圖

- `PROJECT_STATE.md`：目前實作、限制、驗證與交接狀態。
- `PRODUCT_REQUIREMENTS.md`、`ARCHITECTURE.md`：產品範圍與高層架構。
- `UI_UX_SPEC.md`、`USER_FLOWS.md`：介面與使用流程。
- `DATA_MODEL.md`、`DATA_AND_SYNC.md`、`MEDIA_PIPELINE.md`：資料與媒體邊界。
- `REPORT_OUTPUT_SPEC.md`、`ACCEPTANCE_TESTS.md`：輸出契約與驗收標準。
