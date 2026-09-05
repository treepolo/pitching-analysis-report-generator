# Report Output Specification

## Canonical output decision: referenced media only (2026-08-14)

- The canonical source is the block-based long-form report document. The portable HTML report and its output renderer must preserve text blocks and independent single/dual video blocks without editor-only state.
- A dual-video block has two side-specific single-video players, each retaining its own source filename, source title, segment, playback rate, and loop settings, plus a limited block-level shared timeline/sync-point runtime. The former anchor/binding/relative-offset workflow is not part of the output contract; changes to the existing shared behavior require a future explicit requirement.
- Before staging, export computes the set of MediaAsset IDs referenced by video blocks. The folder and ZIP contain copies of only that set; unused Media Library assets are excluded.
- Originals remain untouched. Output copies live under the self-contained export tree with portable relative paths; the same referenced set and content must be used for folder and ZIP variants.
- A missing/invalid referenced asset blocks export. An unused asset is not included and is not a reason to fail an otherwise valid report.

目前狀態：匯出 folder／ZIP、portable HTML renderer、相對路徑驗證、manifest/checksum 與 native-video portable runtime 已有實作及自動化測試。2026-09-06 export pipeline 已收斂為單一 `src/export/exporter.js` orchestration owner；`tree-polo-package.js` 只負責 naming、semantic branding 與必要品牌資產。真實媒體、完整 desktop `file://`、responsive 與真人驗收仍需各自建立相稱 evidence。最新完成度以 `PROJECT_STATE.md` 與 `ACCEPTANCE_TESTS.md` 為準，本文件本身不把任何 requirement 升為 `VERIFIED`。

## 1. Renderer contract

- Preview 與 exported report 必須使用相同 canonical report model、block semantics 與 renderer contract。
- editor-only state、job state、internal ID 與 temporary path 不得直接暴露到輸出。
- 空 optional field 不渲染；空 section/block 不產生誤導性 placeholder。
- text content 必須經安全序列化／escaping；輸出不可執行使用者輸入的 script。
- asset references 在 render 前解析為 export-local relative paths；missing/invalid reference 是 export blocker。
- product visual theme 由 canonical report theme owner 提供；Tree Polo package helper 不另持有平行 visual theme。

## 2. Output forms

### 品牌命名（adopted 2026-09-01）

- 對外輸出名稱以報告名稱為基礎，固定追加 `報告by小樹Polo`。
- 若原始報告名為 `王小明`，則 folder 為 `王小明報告by小樹Polo`，主 HTML 為 `王小明報告by小樹Polo.html`。
- Windows／portable filename 不安全字元仍必須經既有 safe-name 規則清理；撞名時沿用既有不覆寫策略追加序號。
- 報告左上標頭顯示完整 `投球分析報告by小樹Polo` 語意標題，並使用隨輸出封裝的 Tree Polo logo；document title／folder／HTML／ZIP 使用短版 `報告by小樹Polo` naming。logo 與所有報告資產必須可離線讀取。
- Tree Polo 品牌識別必須存在，但本文件**不固定**報告的主色、教學入口顏色、漸層、陰影、圓角、材質、擬物／扁平程度或年代風格。這些屬於可替換的 visual direction；只有在使用者另以明確、較新的決策提升為 contract 時才具有硬性約束。
- 視覺改版不得破壞文字可讀性、焦點可見性、狀態辨識、控制項可達性、responsive 或 preview/export 一致性。

### Folder

最小形式：

    <safe-report-name>/
    ├─ <safe-report-name>.html
    ├─ videos/
    └─ images/

`images/` 只在存在實際圖片／poster／品牌 logo／品牌背景資產時需要；不得為其他不存在的媒體建立假資產。可依需求增加其他 self-contained static assets，但不得把必要資料留在 generator runtime、database、server API 或 CDN。

### ZIP

- ZIP 內容是完整可離線使用的 folder，不是 placeholder archive。
- 解壓至任意一般資料夾後，relative paths 必須仍然正確。
- ZIP 內不得包含原始 project database、credentials、logs、temporary files 或不必要的 private source copies。

### Complete package

一次產生：

    output/
    ├─ <safe-report-name>/
    │  ├─ <safe-report-name>.html
    │  ├─ videos/
    │  └─ images/
    └─ <safe-report-name>_offline.zip

Result 必須分別回報 folder 與 ZIP 位置、主 HTML 檔名、檔案數、warnings、validation outcome。

## 3. file:// and offline contract

輸出主 HTML 必須：

- 可由 desktop modern browser 直接以 `file://` 開啟。
- 不依賴 internet、CDN、server-side API、database、Service Worker 或 runtime fetch 取得必要 report data。
- 必要 CSS/JavaScript 原則上 inline 或以可靠 relative static asset 提供。
- media 使用 relative paths；影片不以 Base64 內嵌。
- report text、image、single video、dual video、playback rate、loop、frame controls 在正式支援範圍內可驗證；影片區塊標題與每側來源標題各自只呈現一次。
- portable video block 使用原生 `<video>` 與內嵌 runtime。速度控制提供 1/64×–64× 的連續滑桿、數字輸入與 1 倍重設；瀏覽器可接受要求速度時使用原生 playback rate，超出原生可接受範圍時才使用擴充影格時鐘，不依賴 exported frame-cache PNG。
- dual sides 的 side-specific controls 維持獨立；block-level shared controls 只依既有 `sync`／`commonSegment` 相容映射共同控制兩側。

Online static report 正式支援 desktop modern browsers、iPhone/iPad Safari、Android Chrome。Offline extracted report 主要正式支援 desktop modern browsers；mobile local-file 僅宣告盡可能相容，不宣稱與 online 等價。

## 4. Export phases

1. snapshot source project
2. validate project/blocks/media/segments/loops
3. inspect or prepare normalized media when required
4. derive referenced media set, final safe name, and required Tree Polo package assets
5. stage referenced media and required package assets once
6. render portable HTML, apply Tree Polo semantic packaging, bundle canonical styles, and write the final `<safe-report-name>.html` once
7. build and validate manifest/checksums and relative paths
8. create ZIP when requested
9. validate folder/ZIP parity when ZIP exists
10. complete job and show result locations

同一次產品匯出只有一個 orchestration lifecycle；不得再以 branded/refined/canonical exporter wrapper 逐層重複 staging、HTML rewrite、manifest rewrite、validation 或 delivery。每一 phase 都要有可理解的 state；failure 必須標示 phase、source 是否安全、可否 retry。

## 5. Source safety and determinism

- export 是 source project 的讀取衍生流程。
- export 前後 canonical model 需做 hash 或 semantic comparison evidence。
- export 中斷不得把半成品標成功；internal staging 只能留在 project-local temporary root，並在失敗／取消後清理。
- 相同 fixture 與相同 source revision 應能產生可比較的 output tree；時間戳等非語意欄位可列為例外。

## 6. Output validation checklist

- [ ] manifest 所指定的主 HTML 存在且可讀
- [ ] folder 與主 HTML 都使用同一 `<safe-report-name>`
- [ ] 對外主名稱固定含 `報告by小樹Polo`，不以舊長 suffix 作為 folder／HTML／ZIP naming
- [ ] visible report header 仍保留完整 `投球分析報告by小樹Polo` 語意
- [ ] Tree Polo logo 與必要品牌背景存在且使用 export-local relative path
- [ ] videos/images 目錄與實際 references 一致
- [ ] 沒有 missing asset、broken relative path 或 external runtime dependency
- [ ] safe filename 不穿越目錄、不含不安全字元
- [ ] ZIP 可解壓，解壓後樹狀結構與 folder output 對應
- [ ] source project 未被 export mutation 改變
- [ ] report capability statement 與實際 evidence 一致

## 7. Current evidence boundary

目前已有 sole folder／ZIP exporter、referenced-only asset staging、required Tree Polo package assets、manifest/checksum、ZIP parity、network-isolation validator、native-video report runtime 與相關 automated tests；R7～R9 亦有使用者局部真人 regression validation。最近一次完整測試結果見 `PROJECT_STATE.md`。仍不可僅憑這些自動化測試或局部 regression 驗收宣稱真實媒體、完整 `file://`、跨裝置 responsive 或完整 Scenario A～H 已 `VERIFIED`。

## Native-video export contract（adopted 2026-08-23）

This section supersedes the earlier frame-cache export wording for portable video blocks:

- Every exported single-video or dual-video side is rendered as a native video element with an export-local relative source such as `videos/filename.mp4`.
- The inline runtime controls exact frame seeking from `currentTime`, frame stepping, keyboard arrows, independent segment loop bounds, playback rate input/slider/reset, and the extended-rate `requestAnimationFrame` clock used only when the browser rejects a native rate.
- Export never reads, stages, copies, or references `images/frame-cache`. The `images` directory is optional and is used only for real image/poster/brand assets. Folder and ZIP outputs contain the same referenced source media.
- Electron IPC and frame-cache preparation remain available to the editor's media pipeline, but are not an export prerequisite and cannot alter the portable report player.

## 播放器選定與快捷鍵輸出契約（adopted 2026-08-23）

- 產生器與 portable HTML 都必須有明確的播放器選定狀態。點擊某個播放器卡片、影片表面或控制項即選定該卡片；選定的是外層播放器區塊，不是影片邊框，外層以亮色外框提示。
- 左右鍵與空白鍵只作用於目前選定的播放器；沒有選定時不執行動作。可編輯輸入與選單不攔截這些快捷鍵。雙影片的 side-specific controls 保持各側獨立；block-level shared controls 依既有相容映射共同控制兩側。
- 單影片輸出固定使用堆疊版面；並排／堆疊選項只影響雙影片。影格控制列以播放／暫停圖示、上一幀／下一幀箭頭呈現，當前幀顯示在進度條左側，總幀數顯示在右側。
- 播放速度輸入、連續速度滑桿與重設按鈕維持同步；輸出播放器在瀏覽器不接受要求速度時使用擴充影格時鐘，切換速度不得因載入狀態競態而無聲暫停。精確定位在影格已穩定但未觸發 frame callback 時仍可完成。
