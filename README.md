# HighSpeed：高鐵座位查詢與購票規劃

HighSpeed 是一個以交通部 TDX（運輸資料流通服務）為資料來源的台灣高鐵（THSR）查詢工具。它可以查看指定起訖站、日期與時段的對號座狀態，也能依照座位狀況與轉乘條件，整理較容易購買的直達或分段方案。

本工具只提供資料查詢與購票建議，不會代為訂票、付款、鎖位或保證實際有座位。實際票況與購票結果請以高鐵官方訂票系統為準。

## 功能總覽

### 純查詢

- 查詢一段或多段行程，可快速建立去程、回程等來回條件。
- 起站與迄站可互換。
- 支援「自訂多個日期」與「日期範圍」兩種日期模式。
- 可設定最早及最晚發車時間，過濾各日期的車次。
- 顯示車次、發車時間、抵達時間，以及標準席與商務席狀態。
- 支援依車次或發車時間篩選結果，並將連續的全無座車次收合顯示。
- 可使用 60 秒內的本地快取，或按「強制更新」跳過座位快取。
- 每個日期或行程獨立處理錯誤，不會因單日查詢失敗而隱藏其他結果。

### 購票建議

- 先找直達方案，再嘗試指定中間站的分段方案。
- 可組合同一車次分段、不同車次轉乘，以及劃位與自由座搭配。
- 標準席、商務席、自由座可複選。
- 可設定最早/最晚出發日期時間、最小轉乘時間與最大轉乘時間。
- 每個中間站都可個別勾選，只比較需要的路段。
- 每個日期最多顯示 3 個方案，並附上分段明細、轉乘時間、購票步驟與風險提醒。
- 可儲存、更新、重新命名、刪除查詢條件，也可透過剪貼簿匯出/匯入條件 JSON。

### 系統資訊

- 頁尾顯示瀏覽、純查詢與購票建議次數。
- 頁面會即時顯示後端 TDX 呼叫次數、近一分鐘用量、處理中請求與限流冷卻狀態。

## 系統架構

```text
HighSpeed/
├── client/       React + TypeScript + Vite 前端
├── server/       Node.js + Express + TypeScript 後端代理
├── api.json      TDX OpenAPI 規格文件
└── Makefile      前後端開發環境啟動指令
```

後端負責 OAuth2 token、TDX 代理、座位/時刻表/自由座查詢、快取、限流、購票方案組合、呼叫統計與網站使用統計。前端透過 Vite 開發代理呼叫 `/api/*`，開發時不需要在瀏覽器直接連線 TDX。

## 前置需求

- Node.js `20.19+` 或 `22.12+`（Vite 8 要求）
- npm
- TDX 帳號的 `Client Id` 與 `Client Secret`

## 取得 TDX 金鑰

1. 前往 [TDX 平台](https://tdx.transportdata.tw) 註冊或登入。
2. 進入【會員中心 → 資料服務 → API 金鑰】。
3. 取得或建立 API 金鑰，記下 `Client Id` 與 `Client Secret`。

本專案使用的 TDX API 規格副本位於根目錄 [`api.json`](api.json)。

## 快速啟動

先安裝前後端依賴並設定後端環境變數：

```bash
cd server
cp .env.example .env
# 編輯 .env，填入 TDX_CLIENT_ID 與 TDX_CLIENT_SECRET
npm install

cd ../client
npm install
```

回到根目錄，同時啟動前後端開發伺服器：

```bash
cd ..
make run
```

開啟 <http://localhost:5173>。也可以分別在 `server/` 執行 `npm run dev`、在 `client/` 執行 `npm run dev`。

| 服務 | 位址 |
| --- | --- |
| 前端 | `http://localhost:5173` |
| 後端 | `http://localhost:4000` |
| 健康檢查 | `http://localhost:4000/api/health` |

## 環境變數

從 [`server/.env.example`](server/.env.example) 複製設定。`TDX_CLIENT_ID` 與 `TDX_CLIENT_SECRET` 必須填入有效金鑰。

| 變數 | 說明 | `.env.example` | 程式內建 fallback |
| --- | --- | ---: | ---: |
| `TDX_CLIENT_ID` | TDX Client Id | — | 必填 |
| `TDX_CLIENT_SECRET` | TDX Client Secret | — | 必填 |
| `PORT` | 後端監聽埠號 | `4000` | `4000` |
| `TDX_MAX_REQUESTS_PER_SECOND` | 每秒最多 TDX 呼叫數 | `1` | `50` |
| `TDX_MAX_REQUESTS_PER_MINUTE` | 每分鐘最多 TDX 呼叫數 | `5` | `20` |
| `TDX_MIN_REQUEST_INTERVAL_MS` | 每次呼叫的最小間隔（毫秒） | `5000` | `5000` |
| `TDX_MAX_429_RETRIES` | HTTP 429 的最多重試次數 | `2` | `2` |
| `TDX_SEAT_CACHE_TTL_MS` | 座位狀態快取時效（毫秒） | `60000` | `60000` |
| `TDX_TIMETABLE_CACHE_TTL_MS` | 時刻表快取時效（毫秒） | `86400000` | `86400000` |
| `TDX_FREE_SEATING_CACHE_TTL_MS` | 自由座資料快取時效（毫秒） | `86400000` | `86400000` |

`.env.example` 採較保守的 TDX 呼叫頻率；若刪除相關設定，才會使用程式內建 fallback。實際可用頻率仍受 TDX 帳號方案限制。

## 使用方式

### 純查詢

1. 選擇起站與迄站，兩者不可相同。
2. 選擇「自訂多個日期」或「日期範圍」。日期範圍會展開為範圍內每一天。
3. 可選填最早與最晚發車時間；只填一個時會形成單邊限制。
4. 如需來回查詢，按「新增行程」；新行程會預填上一段行程的反向起訖站。
5. 按「查詢座位」。已有結果時，可按「強制更新」跳過座位快取。

日期範圍的前端會提醒高鐵通常只提供當日起約 27 天內的座位資料；後端單次請求最多接受 60 個日期。超出 TDX 可查詢範圍時，可能得到空資料。

座位狀態代碼：

| 代碼 | 顯示 | 意義 |
| --- | --- | --- |
| `O` | 尚有座位 | TDX 回報仍有座位 |
| `L` | 座位有限 | TDX 回報座位有限，建議盡快確認 |
| `X` | 已無座位 | TDX 回報沒有對號座 |

TDX 不提供精確剩餘張數，因此本工具顯示的是狀態等級，不是剩餘票數。時刻表會依車次號碼補上發車與抵達時間；若時刻表 API 失敗，座位資料仍會顯示，但時間可能是 `—`。

### 購票建議

1. 選擇起站、迄站與最早/最晚出發日期時間。
2. 設定最小與最大轉乘時間。後端接受的最小值為 3 分鐘，最大轉乘時間上限為 240 分鐘。
3. 選擇要嘗試的中間站；預設會勾選路線上的中間站。勾選越多，會在本機比較更多路段，不增加同日期的座位與時刻表 API 呼叫。
4. 選擇要組合的票種，至少選一種：標準席、商務席或自由座。
5. 按「產生購票建議」，依每個日期查看最多 3 個方案。

方案排序會優先考慮直達，再考慮實際轉乘與其他分段類型，並降低座位有限或自由座方案的優先級。自由座只代表 TDX 回報該車次有自由座車廂，不保證現場一定有座位；每個方案的購票步驟仍需在官方通路重新確認。

查詢與購票建議條件可使用「已儲存條件」管理。條件儲存在瀏覽器的 `localStorage`，剪貼簿功能匯出的內容是 JSON，不會上傳到後端。

## 後端 API

所有 API 預設位於 `http://localhost:4000`。錯誤回應通常為：

```json
{ "error": "錯誤原因" }
```

### `GET /api/health`

確認後端程序是否正常，回應：

```json
{ "status": "ok" }
```

### `GET /api/stations`

取得 TDX 高鐵車站清單：

```json
[
  {
    "StationID": "1000",
    "StationName": { "Zh_tw": "台北", "En": "Taipei" },
    "StationCode": "TPE"
  }
]
```

車站清單會永久儲存在後端快取，通常只有本機沒有資料時才呼叫 TDX。

### `POST /api/seats`

查詢指定起訖站與日期的對號座狀態。`dates` 必須是 `yyyy-MM-dd` 字串陣列，單次最多 60 個日期；`forceRefresh` 選填，預設為 `false`。

Request：

```json
{
  "originStationId": "1000",
  "destinationStationId": "1020",
  "dates": ["2026-09-20", "2026-09-21"],
  "forceRefresh": false
}
```

Response：

```json
{
  "results": [
    {
      "date": "2026-09-20",
      "seats": [
        {
          "TrainNo": "601",
          "Direction": 0,
          "StandardSeatStatus": "O",
          "BusinessSeatStatus": "L",
          "DepartureTime": "08:00:00",
          "ArrivalTime": "09:29:00"
        }
      ],
      "cached": false,
      "stale": false,
      "cachedAt": "2026-09-10T03:00:00.000Z"
    },
    {
      "date": "2026-09-21",
      "seats": [],
      "error": "該日期查詢失敗原因"
    }
  ]
}
```

日期結果會逐日處理；單日失敗會放在該日的 `error`，不會使其他日期整批失敗。若 TDX 更新失敗但已有舊快取，會回傳舊資料並標示 `stale: true`。

### `POST /api/seat-plans`

依日期、出發時間、票種、中間站及轉乘時間產生購票建議。此端點不會訂票或鎖位。

Request：

```json
{
  "originStationId": "1000",
  "destinationStationId": "1020",
  "dates": ["2026-09-20"],
  "departureStart": "2026-09-20T17:30",
  "departureEnd": "2026-09-21T12:00",
  "minTransferMinutes": 15,
  "maxTransferMinutes": 120,
  "selectedIntermediateStationIds": ["1010"],
  "selectedSeatModes": ["reserved-standard", "reserved-business", "free"],
  "forceRefresh": false
}
```

必要欄位與限制：

- `originStationId` 與 `destinationStationId` 必須不同。
- `dates` 必須至少一個 `yyyy-MM-dd` 日期。
- `departureStart`、`departureEnd` 格式為 `yyyy-MM-ddTHH:mm`，且前者不可晚於後者。
- `minTransferMinutes` 為 3–120 分鐘；`maxTransferMinutes` 不可小於最小值，且上限為 240 分鐘。
- `selectedSeatModes` 至少要有一項：`reserved-standard`、`reserved-business`、`free`。

每個日期的回應包含 `plans` 陣列。方案欄位包括 `rank`、整體出發/抵達時間、`transfers`、`transferMinutes`、分段 `segments`、`warnings` 與 `purchaseSteps`。每個 segment 會描述起訖站、車次、時間、票種與座位狀態。

### `GET /api/metrics/tdx`

取得後端程序的 TDX 呼叫統計與限流狀態，包括 `totalCalls`、`successfulCalls`、`failedCalls`、`inFlight`、`callsInLastMinute`、`maxRequestsPerMinute`、`minimumRequestIntervalMs` 與 `cooldownUntil`。

### `GET /api/metrics/tdx/stream?since={version}`

以 Comet long polling 等待 TDX 統計變化；有變化或等待逾時後回傳目前統計。前端使用此端點更新頁面狀態，不採固定頻率輪詢。

### `GET /api/usage`

取得持久化的網站使用統計：

```json
{ "views": 123, "queries": 45, "recommendations": 12 }
```

### `POST /api/usage/events`

記錄一種事件並回傳最新統計。可用事件為 `view`、`query`、`recommendation`：

```json
{ "event": "query" }
```

這些統計不會增加 TDX 呼叫次數。

## 快取、限流與資料檔案

- 座位狀態預設快取 60 秒；時刻表與自由座資料預設快取 24 小時；車站清單永久快取。
- 座位使用整日 OD API，時刻表使用整日所有車次 API；純查詢與購票規劃依日期共用快取，透過本機索引比較起迄站與中間站。
- 每日期冷快取通常只需 1 次座位與 1 次時刻表查詢（不含授權、重試、車站與自由座）；增加中間站不增加這兩類查詢。手動更新每日期各重新取得一次；若整日資料達到每頁 10,000 筆，會讀取後續頁面後才快取。
- 命中新鮮快取的請求不會呼叫 TDX。
- 同一條件的並發請求會共用一次上游呼叫；跨後端程序也使用檔案鎖避免重複請求。
- TDX 呼叫會依每秒、每分鐘及最小間隔限制排隊。收到 HTTP 429 時，會進入約 60 秒冷卻並依設定自動重試。
- 若上游更新失敗但有舊資料，座位與方案 API 會盡量回傳過期資料並標示 `stale`；完全沒有快取時才會回傳錯誤。

執行期間會產生以下資料：

| 路徑 | 用途 |
| --- | --- |
| `server/data/cache/` | 車站、座位、時刻表與自由座快取 |
| `server/data/tdx-rate-limit.json` | 多個後端程序共用的 TDX 限流狀態 |
| `server/data/usage-stats.json` | 瀏覽、查詢與建議次數 |

這些是執行期資料，不應提交到版本控制；專案的 `.gitignore` 已排除本地快取、環境變數與建置產物。

## 建置與正式部署

建置後端：

```bash
cd server
npm run build
npm start
```

建置前端：

```bash
cd client
npm run build
```

前端靜態檔案會輸出到 `client/dist`，可部署至靜態網站主機。正式環境需要將前端的 `/api` 反向代理到後端，例如後端服務所在的 `http://localhost:4000`；同時必須在後端主機設定 TDX 金鑰與環境變數。

前端指令：

```bash
npm run dev       # 開發伺服器
npm run build     # TypeScript 檢查並建置正式版
npm run lint      # Oxlint
npm run preview   # 預覽建置結果
```

後端指令：

```bash
npm run dev       # tsx watch 開發模式
npm run build     # TypeScript 編譯至 dist
npm start         # 執行 dist/index.js
```

## 限制與注意事項

- TDX 的座位狀態不是精確剩餘張數，`O/L/X` 僅代表座位等級狀態。
- 座位資料受高鐵開放查詢天數與 TDX 帳號方案限制；查無資料不一定代表完全沒有班次。
- 時刻表補充資料採 best-effort，可能因 TDX 暫時失敗而缺少時間。
- 自由座方案不能保證現場有座位，請將它視為候選購票方式。
- 購票建議是依查詢當下資料組合出的參考方案，票況可能在產生建議後立即改變。
- `server/.env` 含有 TDX Secret，請勿提交、公開或放入前端程式碼。
- TDX 限流設定越保守，查詢所需時間可能越長；查詢較多日期會增加上游查詢量，中間站比較則使用同日資料。

## 資料來源

資料來源為 [交通部 TDX 運輸資料流通服務](https://tdx.transportdata.tw)。請遵守 TDX 平台的使用規範、API 金鑰與頻率限制。
