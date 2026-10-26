# LINE AI 記帳機器人狀態

更新日期：2026-10-25

## 部署位置（上線到哪個 n8n）

- n8n 實例：`https://zero-n8n.duckdns.org`（⚠️ 不是全域 CLAUDE.md 預設的 notionton8n.zeabur.app；本專案 key 指向這台）
- 工作流線上**實際名稱**：`Line 記帳機器人`（SPEC.md 舊稱 `LINE 一句話記帳 × Notion`，已被改名，但 ID 相同）
- 工作流 ID：`chSXWYSK2S2unLgz`
- Webhook 路徑：`line-accounting-submit`（method POST）
- Webhook ID：`1ca1ed50-a001-4ea1-8101-000000000102`
- 狀態：啟用中（active），15 個節點

## 目前狀態

- 正式 n8n 工作流 `Line 記帳機器人`（ID `chSXWYSK2S2unLgz`）已更新並啟用。
- 節點數：15
- 正式 Webhook 路徑維持 `line-accounting-submit`，沒有建立重複正式流程。
- 原有 LINE、Notion、Gemini credentials 與 Webhook ID 均保留。

## 已完成

- 2026-10-25：成功卡新增「開啟 Notion」按鈕——記帳成功後可一鍵跳到剛新增那筆的 Notion 頁。網址取自「新增 Notion 帳目」節點回傳的 `url`（Notion API 原生欄位），抓不到或非 notion 網址時按鈕自動隱藏。已以 `scripts/deploy-success-notion-link.mjs` 部署上線並回讀確認（active、15 節點、Webhook ID 不變、節點含「開啟 Notion」按鈕），改前線上版備份於 `backups/Line記帳機器人-before-notion-link-20261025.json`。
- 加入 Gemini 口語記帳解析。
- AI 解析前只即時讀取 Notion 分類與付款方式；2026-10-11 已移除每次查詢最近 30 筆資料的節點，以縮短回覆時間。
- 加入結構化輸出與程式端欄位驗證。
- 保留「確認後才寫入 Notion」的安全流程。
- 更新確認、成功、失敗與說明回覆為 LINE Flex UI。
- 保留確認、取消及手動修正功能。
- 修正 AI 追問後遺失上一筆資料的問題，並加入需二次確認的「重新一筆」。
- 修正 AI 無法辨識時流程直接停止、LINE 沒有任何提示的問題；現在會回覆紅色錯誤 Flex 卡，請使用者重新輸入。
- 建立正式流程更新腳本、單元測試與真實 n8n 煙霧測試腳本。
- 備份 AI 改版前，以及移除最近帳目查詢前的正式工作流。

## 驗證證據

- 本機測試：`node tests/test-ai-workflow.mjs` 通過。
- 所有 Code 節點 JavaScript 語法檢查通過。
- 臨時 n8n 煙霧測試實際讀取 Notion 並呼叫 Gemini；測試句「昨天去中油加了 1350，用玉山卡」成功產生：
  - 金額：NT$1,350
  - 分類：油錢
  - 付款方式：玉山刷卡
  - 回覆：LINE Flex 確認卡
- 臨時測試工作流已停用並永久刪除，未留下重複 Webhook。
- 正式 Webhook 測試執行 ID：`6322190`。AI 與驗證節點皆成功，已產生 Flex 確認卡；最後因測試使用假的 LINE reply token 而在 LINE 回覆節點出現預期錯誤。
- 移除最近 30 筆查詢後，臨時 n8n 煙霧測試再次成功解析 NT$1,350、油錢、玉山刷卡，並產生 Flex 確認卡。
- 優化版已部署到原工作流；線上回讀確認為 15 個節點、不含「讀取最近 30 筆帳目」，且「讀取 Notion 分類設定」直接連到「準備 AI 分析資料」。
- 優化後正式 Webhook 驗證 HTTP 200，執行 ID：`6322242`；因使用假的 LINE reply token，最終 LINE 回覆節點出現預期錯誤。
- 對話接續煙霧測試通過：第一輪缺少消費內容時保存 NT$1,500、日期與玉山刷卡，第二輪回答「加油」後合併為油錢並產生確認卡。
- 「重新一筆」已加入二次確認；只有按下「確認重新一筆」才清除目前資料。
- 對話修正版已部署並回讀確認；正式 Webhook HTTP 200，驗證執行 ID：`6322268`。
- 根因證據：正式執行 `6326213` 因 AI 結構化輸出不合規停止，`6326312` 因 Gemini 服務暫時無法使用停止，兩次都未執行 LINE 回覆節點。
- 錯誤回覆修正的本機測試通過；臨時 n8n 煙霧測試刻意使用不存在的 Gemini 憑證，仍成功回傳 `ai_recognition` 與「這次沒有辨識成功」Flex 卡。
- 修正版已部署回原正式工作流並回讀確認：流程維持啟用、15 個節點、原 Webhook ID 不變，AI 節點錯誤模式為 `continueRegularOutput`。

## 尚待驗證

- 尚未用真實 LINE 用戶端確認 Flex 卡片的最終顯示。
- 尚未由真實 LINE reply token 按下確認，完成一筆實際 Notion 新增並回讀該頁。
- 2026-10-25 的「開啟 Notion」按鈕只用假網址做過煙霧測試；尚未用 Notion 真正回傳的 `url` 在真手機上按過，確認會正確跳轉到該筆頁面。

## 下一步

1. 在記帳 LINE Bot 傳送：「昨天去中油加了 1350，用玉山卡」。
2. 確認畫面顯示金額、分類、付款方式與日期。
3. 按下確認。
4. 到 Notion 檢查是否新增正確帳目。
