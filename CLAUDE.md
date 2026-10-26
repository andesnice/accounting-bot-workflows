# LINE 記帳機器人 × Notion

## 目前進度

- 2026-08-09：LIFF 記帳改為**開放版**（原白名單版）—— `記帳白名單授權` 節點移除 `allowedUserIds` 比對，改成「只要通過 LINE 登入（有 userId）就 authorized」。任何開啟此 LIFF 的人都能記帳。⚠️ **所有人共用同一個 Notion 帳目 DB `dbe28d…`，彼此看得到、也可刪對方紀錄**（無 per-user 隔離；list/delete 不分使用者）。若要各人只看自己的帳，需在 Notion 加 userId 欄位並讓 list/delete 帶 userId filter。已跑 `n8n-code-test` 17/17 通過。人工收尾：重新匯入 n8n、選憑證、切 Active。
- 2026-08-09：LIFF 白名單版列表變快 —— `讀取 Notion 帳目` 由 `returnAll:true`（翻頁抓全表）改為 `returnAll:false` + `limit:100`，只抓最近 100 筆。Notion 端 `sort by Date descending` **必須保留**（靠它取到最新 N 筆）。舊帳超過 100 筆會看不到，之後要看全部再做前端分頁/日期 filter。改完需重新匯入 n8n、重選 Notion 憑證、切 Active（人工收尾）。白名單仍只有韋銘一個 userId（`Uc98ee0e068ab75b6258bcb90106d1031`）。
- 2026-08-04：一句話 workflow 改為專用記帳 Bot 模式，可直接輸入「昨天中油1350玉山卡」，不必加「記帳」前綴；舊前綴仍相容。
- 2026-08-02：新增 `LINE 一句話記帳 × Notion.json`。
- 新流程不讀取 Notion 歷史資料；規則解析、缺欄位追問、分類群組、確認／修改／取消完成後，才新增一筆 Notion Page。
- 已完成 JSON 解析、Code 節點語法、核心規則測試，並以本機 n8n CLI 2.26.8 成功匯入一份隔離測試資料庫。
- 尚未在正式自架 n8n、LINE Messaging API 與 Notion credential 上實測；匯入後需人工選擇兩組憑證並切換 Active。

LINE Bot 記帳系統，使用者透過 LINE 對話完成記帳，資料寫入 Notion 資料庫。整個流程跑在 n8n workflow 上。

## 檔案

- `LINE 一句話記帳 × Notion.json` — 新版單句輸入 workflow；目前建議優先測試。
- `LINE 記帳機器人 × NotionV3.json` — 舊版多步驟對話 workflow。
- `2.LIFF記帳API-白名單版.json` — LIFF 列表、新增與封存 API workflow。

## 架構

```
LINE（使用者對話）
   │  webhook
   ▼
n8n workflow
   ├─ 狀態機（Code 節點）→ 依步驟產生 action
   ├─ 路由（Switch）→ 依 action 分流到各回覆/處理節點
   └─ HTTP Request → LINE Reply API / Notion API
```

- **前端／互動**：LINE Messaging API（Flex Message 選單 + Quick Reply）
- **流程引擎**：自架 n8n
- **資料庫**：Notion（DB id `dbe28d3510e049428ae29c62045a9769`）

## 記帳流程（多步驟狀態機）

由「狀態機」Code 節點管理，狀態存在 `$getWorkflowStaticData('global')[userId]`，以 `step` 推進：

| step | 等待輸入 | 產生 action | 下一步畫面 |
|------|---------|------------|-----------|
| 0 | 輸入「記帳」啟動 | `show_category` | 動態分類選單（讀 Notion 欄位） |
| 1 | 點「類別:xxx」 | `ask_amount` | 詢問金額 |
| 2 | 輸入金額 | `ask_payment` | 詢問付款方式 |
| 3 | 點「付款:xxx」 | `ask_note` | 詢問備註 |
| 4 | 輸入備註（或「無」） | `save` | 寫入 Notion |

- 任何時候輸入「**取消記帳**」→ `cancel`，狀態歸零。
- 分類選單與付款方式選項是從 Notion DB 的「支出類型」「付款方式」select 欄位**動態讀取**，不是寫死的。

## 金額輸入規則（Step 2）

支援用 `+`、`-` 做加減運算，會忽略空白：

| 輸入 | 結果 |
|------|------|
| `350` | 350 ✅ |
| `100+50+200` | 350 ✅ |
| `200-50` | 150 ✅ |
| `100+50-30` | 120 ✅ |
| `200-300`（≤0） | ⚠️ 擋掉 |
| `abc`、`100++50`（格式錯） | ⚠️ 擋掉 |

格式錯誤或金額 ≤ 0 時回 `invalid_amount`，由「路由」第 7 個輸出接到「LINE 金額格式錯誤」回覆提示。

實作：用正則 `/^[+-]?\d+(\.\d+)?([+-]\d+(\.\d+)?)*$/` 驗證，再用 `expr.match(/[+-]?\d+(\.\d+)?/g)` 拆出帶正負號的數字相加。

## 「路由」Switch 輸出對應

| # | action | 接的節點 |
|---|--------|---------|
| 1 | show_category | 抓 Notion 分類 |
| 2 | ask_amount | LINE 詢問金額 |
| 3 | ask_payment | 抓 Notion 分類1 |
| 4 | ask_note | LINE 詢問備註 |
| 5 | save | 組 Notion 資料 |
| 6 | cancel | LINE 傳送取消 |
| 7 | invalid_amount | LINE 金額格式錯誤 |

## 注意事項

- workflow JSON 內含 **LINE Channel Access Token** 與 **Notion Integration Token**（寫在 HTTP Request 的 Authorization header）。此檔案請勿外流／上 public repo。
- 上述 Token 說明僅適用舊版 `LINE 記帳機器人 × NotionV3.json`；新版一句話 workflow 不內嵌 Token，匯入後需選擇 n8n Credentials。
- 修改邏輯只需改 JSON，再重新匯入 n8n。
