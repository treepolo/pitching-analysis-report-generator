# Layer 3｜投球動作分析報告產生器

1. 使用者是投球教練本人；產品是 Windows-first Desktop application，內含可重用的 web renderer。學生只讀輸出報告，不登入產生器。
2. 核心工作是建立可重開的報告專案、編輯/匯入文字、管理圖片與影片、建立單影片與兩影片比較、以投球事件設定 block-local sync anchor，最後輸出可部署與可 desktop `file://` 閱讀的 HTML folder/ZIP。
3. 媒體來源要保留；系統吸收 metadata、FPS/VFR、codec/normalization、相對時間與輸出路徑複雜度，不要求使用者手算或修改 HTML。
4. 目前已有 Electron project persistence/editor/preview vertical slice；接續工作不可把它當成完整產品或宣稱已驗證。沿用現有 report contract 與 project-root storage。
5. 尚未完成的核心能力是 TXT/MD import、Media Library、single/comparison player、frame stepping、sync/drift correction、normalization、responsive report、self-contained offline folder、ZIP/export、recovery 與真人驗收。
6. 不做 AI 判讀/寫作、帳號會員、學生互動、雲端 DB/同步/OAuth、CRM/付款、自動部署、Google Drive API、寄送、analytics 或醫療診斷。
7. 所有可信成果留在 `PROJECT_ROOT` 內並保存於 Git；私人素材、產物與 credentials 不進 Git。只有必要的人類授權、真人主觀驗收或重大產品決策才停 Human Checkpoint。
8. 主控使用 Sol Xhigh 只做規劃與調度；Luna MAX Worker 在獨立持久聊天室執行。可安全分離的 Media、Playback/Sync、Renderer/Export、QA 工作應平行；共用核心 contract 採 single writer，完成或受阻時回報。
