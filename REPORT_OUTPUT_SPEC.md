# Report Output Specification

目前狀態：**Phase 1/2 planning**。本文件是 editor、preview 與 export 共用的 report renderer/data contract；它不代表已有 implementation 或 file:// evidence。

## 1. Renderer contract

- Preview 與 exported report 必須使用相同 canonical report model、block semantics 與 renderer contract。
- editor-only state、job state、internal ID 與 temporary path 不得直接暴露到輸出。
- 空 optional field 不渲染；空 section/block 不產生誤導性 placeholder。
- text content 必須經安全序列化／escaping；輸出不可執行使用者輸入的 script。
- asset references 在 render 前解析為 export-local relative paths；missing/invalid reference 是 export blocker。

## 2. Output forms

### Folder

最小形式：

    <safe-report-name>/
    ├─ index.html
    ├─ videos/
    └─ images/

可依需求增加其他 self-contained static assets，但不得把必要資料留在 generator runtime、database、server API 或 CDN。

### ZIP

- ZIP 內容是完整可離線使用的 folder，不是 placeholder archive。
- 解壓至任意一般資料夾後，relative paths 必須仍然正確。
- ZIP 內不得包含原始 project database、credentials、logs、temporary files 或不必要的 private source copies。

### Complete package

一次產生：

    output/
    ├─ <safe-report-name>/
    │  ├─ index.html
    │  ├─ videos/
    │  └─ images/
    └─ <safe-report-name>_offline.zip

Result 必須分別回報 folder 與 ZIP 位置、檔案數、warnings、validation outcome。

## 3. file:// and offline contract

輸出 index.html 必須：

- 可由 desktop modern browser 直接以 file:// 開啟。
- 不依賴 internet、CDN、server-side API、database、Service Worker 或 runtime fetch 取得必要 report data。
- 必要 CSS/JavaScript 原則上 inline 或以可靠 relative static asset 提供。
- media 使用 relative paths；影片不以 Base64 內嵌。
- report text、image、single video、comparison video、playback rate、loop、frame controls 在正式支援範圍內可驗證。

Online static report 正式支援 desktop modern browsers、iPhone/iPad Safari、Android Chrome。Offline extracted report 主要正式支援 desktop modern browsers；mobile local-file 僅宣告盡可能相容，不宣稱與 online 等價。

## 4. Export phases

1. snapshot source project
2. validate project/blocks/media/anchors/loops
3. inspect or prepare normalized media
4. stage videos/images
5. render index.html
6. validate relative paths and asset count
7. create ZIP when requested
8. write result manifest/checksums when specified
9. complete job and show result locations

每一 phase 都要有可理解的 state；failure 必須標示 phase、source 是否安全、可否 retry。

## 5. Source safety and determinism

- export 是 source project 的讀取衍生流程。
- export 前後 canonical model 需做 hash 或 semantic comparison evidence。
- export 中斷不得把半成品標成功；temporary artifacts 只能留在 project-local temporary root。
- 相同 fixture 與相同 source revision 應能產生可比較的 output tree；時間戳等非語意欄位可列為例外。

## 6. Output validation checklist

- [ ] index.html 存在且可讀
- [ ] videos/images 目錄與實際 references 一致
- [ ] 沒有 missing asset、broken relative path 或 external runtime dependency
- [ ] safe filename 不穿越目錄、不含不安全字元
- [ ] ZIP 可解壓，解壓後樹狀結構與 folder output 對應
- [ ] source project 未被 export mutation 改變
- [ ] report capability statement 與實際 evidence 一致

## 7. Status

Folder、ZIP、complete package、file://、responsive 與 player output 目前均為 NOT_STARTED；沒有 generated report、實際影片或真人 acceptance evidence，不得標 VERIFIED。
