# 高鐵剩餘對號座位查詢

透過交通部 TDX（交通資料流通服務）平台提供的高鐵（THSR）API，查詢指定起訖站、指定日期（可一次查詢多天）
的各車次對號座（標準席／商務席）即時剩餘座位狀態。

本專案分為兩個部分：

- `server/`：Node.js + Express + TypeScript 後端代理。負責向 TDX 換取 OAuth2 access token（並快取）、
  代理呼叫 TDX 高鐵相關 API，避免將 Client Secret 暴露在瀏覽器，並解決 CORS 問題。
- `client/`：React + TypeScript（Vite）前端。提供起訖站選擇、日期輸入（支援「自訂多個日期」或
  「日期範圍」兩種模式）與查詢結果呈現。

## 使用的 TDX API（定義於根目錄 `api.json`）

- `GET /v2/Rail/THSR/Station`：取得高鐵所有車站清單。
- `GET /v2/Rail/THSR/AvailableSeatStatus/Train/OD/{OriginStationID}/to/{DestinationStationID}/TrainDate/{TrainDate}`：
  取得指定日期、指定起訖站之各車次對號座即時剩餘座位狀態。
- `GET /v2/Rail/THSR/DailyTimetable/OD/{OriginStationID}/to/{DestinationStationID}/{TrainDate}`：
  取得指定日期、指定起訖站之各車次發車/抵達時刻，後端會以車次號碼將此資料與座位狀態合併，
  讓查詢結果同時顯示發車時間與抵達時間（此為 best-effort 合併，若時刻表查詢失敗，仍會顯示座位狀態，僅時間欄位顯示「—」）。

TDX API 採用 OAuth2 Client Credentials 授權方式，需要 Client Id / Client Secret。

> **關於「剩餘座位數」的重要說明**：高鐵官方系統本身只透過 TDX 提供「座位狀態燈號」，
> 並未提供確切剩餘張數。狀態代碼意義為：`O` = 尚有座位、`L` = 座位有限、`X` = 已無座位。
> 本應用程式會將這些代碼轉換為中文文字燈號顯示，滑鼠移至燈號上可看到原始代碼。

## 1. 申請 TDX 金鑰

1. 前往 [TDX 平台](https://tdx.transportdata.tw) 註冊會員帳號。
2. 登入後至【會員中心 -> 資料服務 -> API金鑰】頁面，使用預設金鑰或建立新的金鑰，取得 `Client Id` 與
   `Client Secret`。

## 快速啟動

在根目錄先完成 `server/.env` 設定並安裝前後端依賴後，執行：

```bash
make run
```

這會同時啟動後端與前端開發伺服器；按 `Ctrl+C` 會一起停止兩者。

## 2. 設定並啟動後端 (`server/`)

```bash
cd server
cp .env.example .env
# 編輯 .env，填入你的 TDX_CLIENT_ID 與 TDX_CLIENT_SECRET
npm install
npm run dev
```

後端預設會在 `http://localhost:4000` 提供以下 API：

- `GET /api/health`：健康檢查
- `GET /api/stations`：回傳高鐵車站清單
- `POST /api/seats`：查詢座位，Request Body：
  ```json
  {
    "originStationId": "1000",
    "destinationStationId": "1020",
    "dates": ["2024-06-01", "2024-06-02"],
    "forceRefresh": false
  }
  ```
  Response：
  ```json
  {
    "results": [
      { "date": "2024-06-01", "seats": [ /* AvailableSeat[] */ ], "cached": true, "cachedAt": "2024-06-01T00:00:00.000Z" },
      { "date": "2024-06-02", "seats": [], "error": "查詢失敗原因（若有）" }
    ]
  }
  ```

座位資料會以起訖站與日期為 key 儲存在後端 `server/data/cache/`，有效快取 60 秒；時刻表與車站清單會使用較長期快取。相同資料的並發請求也會共用一次 TDX 呼叫。前端預設使用快取，按「強制更新」才會送出 `forceRefresh: true`。若 TDX 暫時失敗但本地仍有舊資料，回應會標示 `stale: true` 並使用過期資料。

- `POST /api/seat-plans`：產生智慧購票建議。輸入起訖站、日期，以及最早／最晚出發日期時間（`departureStart`、`departureEnd`）、最小／最大轉乘分鐘數、要嘗試的中間站 `selectedIntermediateStationIds` 與票種；系統只查詢勾選的中間站，並回傳最多 3 個不同類型的方案。此端點只提供建議，不會代為訂票或鎖位。

若未設定 `TDX_CLIENT_ID` / `TDX_CLIENT_SECRET`，API 會回傳明確錯誤訊息，提示需先完成 `.env` 設定。

後端對實際送出的 TDX API 呼叫有內建節流：預設每秒最多 50 次、每分鐘最多 20 次，且每次呼叫至少間隔 5 秒；可在 `server/.env` 以 `TDX_MAX_REQUESTS_PER_SECOND`、`TDX_MAX_REQUESTS_PER_MINUTE`、`TDX_MIN_REQUEST_INTERVAL_MS` 與 `TDX_MAX_429_RETRIES` 調整。限流狀態會寫入 `server/data/tdx-rate-limit.json`，讓同一台機器上的多個後端程序共用額度；若收到 429，會暫停送出新請求 60 秒並自動重試，預設最多重試 2 次。命中本地快取的請求不會消耗 TDX 呼叫額度。

`GET /api/metrics/tdx` 可查看後台 TDX 呼叫次數、近一分鐘用量、處理中請求與限流狀態；前端透過 `/api/metrics/tdx/stream` 使用 Comet long polling，在統計有變化時立即更新，沒有固定頻率輪詢。相同條件的快取讀取也有跨程序鎖，避免多個同時請求在快取寫入前重複呼叫 TDX。座位、時刻表與自由座快取時效可分別用 `TDX_SEAT_CACHE_TTL_MS`、`TDX_TIMETABLE_CACHE_TTL_MS`、`TDX_FREE_SEATING_CACHE_TTL_MS` 設定；車站清單為永久快取。

頁尾的瀏覽、純查詢與購票建議次數會持久化儲存於 `server/data/usage-stats.json`，由 `/api/usage` 與 `/api/usage/events` 提供統計資料，不會增加 TDX 呼叫次數。

## 3. 啟動前端 (`client/`)

另開一個終端機視窗：

```bash
cd client
npm install
npm run dev
```

Vite 開發伺服器預設在 `http://localhost:5173`，並已設定將 `/api/*` 的請求代理到後端
`http://localhost:4000`（見 `client/vite.config.ts`），因此開發時前後端需同時啟動。

瀏覽器開啟 `http://localhost:5173` 即可使用：

介面以「行程」為單位，一次可查詢一段或多段行程（例如去程、回程各一段），每段行程都有各自獨立的起訖站、日期與時間條件：

1. 每段行程可各自設定：
   - **起站與迄站**（可用中間的 ⇄ 按鈕互換）。
   - **日期查詢模式**：
     - **自訂多個日期**：可自由新增/刪除多個不連續的查詢日期。
     - **日期範圍**：輸入起始與結束日期，系統自動展開為範圍內每一天。
       （TDX 僅提供當日起 27 天內的座位資料，超出此範圍的日期可能查無資料，介面會顯示提醒。）
   - **最早出發時間／最晚出發時間**（皆為選填）：可只設定其中一個，或同時設定形成一個時間區間；
     此區間會套用於該行程所選的每一個查詢日期，過濾掉不在區間內的車次。
2. 點擊「＋ 新增行程（例如來回車次）」可新增下一段行程；新行程會預設把上一段行程的起訖站對調，
   方便快速輸入來回查詢（例如去程 台北→左營、回程 左營→台北，各自搭配不同日期與時間範圍）。
   若不需要，可用「移除此行程」刪除多餘的行程（至少需保留一段）。
3. 點擊「查詢座位」，各行程會分別呼叫 API 查詢；若有多段行程，結果會以「行程 1」「行程 2」…分區塊顯示，
   每個區塊內的結果再依日期分組並排顯示（寬螢幕時每列可並排 2~3 天，避免長時間往下捲動），
   各車次會顯示**發車時間、抵達時間**與標準席／商務席剩餘狀態
   （狀態以「尚有座位／座位有限／已無座位」文字燈號呈現，並依發車時間排序）；
   若某一天或某一段行程查詢失敗，不會影響其他天／其他行程的結果顯示。

## 4. 建置正式版

```bash
# 後端
cd server && npm run build && npm start

# 前端
cd client && npm run build
# 建置後的靜態檔案在 client/dist，可自行部署至任意靜態網站主機，
# 並將 /api 反向代理至後端伺服器。
```

## 專案結構

```
/HighSpeed
  api.json          # TDX OpenAPI 規格文件
  server/            # Node + Express + TypeScript 後端代理
  client/            # React + TypeScript (Vite) 前端
```
