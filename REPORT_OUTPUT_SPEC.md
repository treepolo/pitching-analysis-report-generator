# Report Output Specification

## Canonical output decision: referenced media only (2026-08-14)

- The canonical source is the block-based long-form report document. `report.html` and its output renderer must preserve text blocks and independent single/dual video blocks without editor-only state.
- A dual-video block has two side-specific single-video players, each retaining its own source filename, source title, segment, playback rate, and loop settings, plus a limited block-level shared timeline/sync-point runtime. The former anchor/binding/relative-offset workflow is not part of the output contract; changes to the existing shared behavior require a future explicit requirement.
- Before staging, export computes the set of MediaAsset IDs referenced by video blocks. The folder and ZIP contain copies of only that set; unused Media Library assets are excluded.
- Originals remain untouched. Output copies live under the self-contained export tree with portable relative paths; the same referenced set and content must be used for folder and ZIP variants.
- A missing/invalid referenced asset blocks export. An unused asset is not included and is not a reason to fail an otherwise valid report.

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
- report text、image、single video、dual video、playback rate、loop、frame controls 在正式支援範圍內可驗證；影片區塊標題與每側來源標題各自只呈現一次，速度控制提供 1/64×–64× 的連續滑桿、數字輸入與 1 倍重設；frame-cache 播放器支援完整範圍，影片 fallback 會選用瀏覽器可接受的鄰近原生速度，避免不支援的 playback rate 造成播放失敗；dual sides remain independent.

Online static report 正式支援 desktop modern browsers、iPhone/iPad Safari、Android Chrome。Offline extracted report 主要正式支援 desktop modern browsers；mobile local-file 僅宣告盡可能相容，不宣稱與 online 等價。

## 4. Export phases

1. snapshot source project
2. validate project/blocks/media/segments/loops
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

## Wave 21 native-video export contract (2026-08-23)

This section supersedes the earlier frame-cache export wording for portable
video blocks:

- Every exported single-video or dual-video side is rendered as a native
  video element with an export-local relative source such as videos/filename.mp4.
- The inline runtime controls exact frame seeking from currentTime, frame
  stepping, keyboard arrows, independent segment loop bounds, playback rate
  input/slider/reset, and the extended-rate requestAnimationFrame clock used
  only when the browser rejects a native rate.
- Export never reads, stages, copies, or references images/frame-cache. The
  images directory is optional and is used only for real image/poster assets.
  Folder and ZIP outputs contain the same referenced source media.
- Electron IPC and frame-cache preparation remain available to the editor's
  media pipeline, but are not an export prerequisite and cannot alter the
  portable report player.
## Wave 22 播放器選定與快捷鍵輸出契約（2026-08-23）

- 產生器與 portable report.html 都必須有明確的播放器選定狀態。點擊某個播放器卡片、影片表面或控制項即選定該卡片；選定的是外層播放器區塊，不是影片邊框，外層以亮色外框提示。
- 左右鍵與空白鍵只作用於目前選定的播放器；沒有選定時不執行動作。雙影片左右兩側各自選定、各自逐幀與播放，快捷鍵不跨側傳遞。可編輯輸入與選單不攔截這些快捷鍵。
- 單影片輸出固定使用堆疊版面；並排／堆疊選項只影響雙影片。影格控制列以播放／暫停圖示、上一幀／下一幀箭頭呈現，當前幀顯示在進度條左側，總幀數顯示在右側。
- 播放速度輸入、連續速度滑桿與重設按鈕維持同步；輸出播放器在瀏覽器不接受要求速度時使用擴充影格時鐘，切換速度不得因載入狀態競態而無聲暫停。精確定位在影格已穩定但未觸發 frame callback 時仍可完成。
