# 颱風提醒 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 首頁台灣地圖在氣象署發布颱風警報時，畫出颱風圖示、紅色七級風圈、黃色虛線預計路線；颱風在畫面外時在邊緣畫箭頭＋距離；點圖示出小卡。

**Architecture:** 小幫手新增 `GET /v1/typhoon`：被呼叫時才即時抓氣象署 W-C0034-005，用 Workers Cache API + 記憶體暫存約 5 分鐘（**不加 cron、不寫 KV**），解析成精簡 JSON。網頁在地圖載入時呼叫它，`taiwanMap.js` 多一個 `setTyphoons()` 畫圖層。解析、距離方位、小卡文字都是純函式，放 `src/core/` 好測；任何失敗都回「沒有颱風」，地圖保持現狀。

**Tech Stack:** Vanilla JS、Leaflet、Cloudflare Worker、vitest（`npm test`）。

**Spec:** `docs/superpowers/specs/2026-11-03-typhoon-alert-design.md`

## Global Constraints

- 不新增 Cloudflare 排程（帳號 cron 已滿，`worker/wrangler.toml` 的 `crons` 不准動）。
- 氣象署金鑰只讀 `env.CWA_KEY`，**絕不進 git**（公開倉庫）。
- 沒颱風／失敗／過舊時：地圖與現在完全一樣，不顯示任何文字、不丟錯到畫面。
- 不改潛點預測米數、把握度、潛點面板、詳情頁。
- 畫面要標示「颱風資料：中央氣象署」（Leaflet attribution，比照現有 `潛點資料：BlueTrend 藍色脈動` 那行）。
- 數值單位：風速 m/s（氣象署原樣）、距離 km、氣壓 hPa。小卡文字欄位缺漏就整行不顯示。
- 內建瀏覽器的 rAF 不會跑：任何動畫的測試用 setTimeout。
- 所有 commit 只 commit+push，**上線（小幫手 `cd worker && npx wrangler deploy --config wrangler.toml`、網頁 `npm run build` → `npx wrangler deploy`）等 Michael 說**。

## 資料形狀（全計畫共用，Task 1 產生、後面都吃）

```js
// Typhoon — what /v1/typhoon returns inside { updatedAt, typhoons: Typhoon[] }
{
  id: string,                 // 英文名，沒有就用中文名
  name: string,               // 中文名（例：煙花）
  nameEn: string | null,
  now: { lat, lon, time /*ms*/, windMs, gustMs, pressureHpa, radius7Km, movingKmh, movingDir /*文字，如 "西北"*/ },
  // 以上數值欄位缺的是 null
  track: [{ lat, lon, time /*ms*/, windMs, pressureHpa }]   // 預計路線，不含 now，依時間排序
}
```

氣象署 W-C0034-005 的實際欄位**沒法現在驗證**（沒颱風）。下面是已知的最佳猜測，解析器必須寬鬆：
`records.tropicalCyclones.tropicalCyclone[]`，每個有 `typhoonName`（中文）、`cwaTyphoonName`（英文）、`analysisData.fix[]`（取最後一筆為現況：`fixTime`、`coordinate`＝`"經度,緯度"`、`maxWindSpeed`、`maxGustSpeed`、`pressure`、`movingSpeed`、`movingDirection`、`circleOf15Ms.radius`）、`forecastData.fix[]`（`initTime`＋`tau` 小時，或 `forecastTime`；`coordinate`、`maxWindSpeed`、`pressure`）。`fix` 可能是物件而不是陣列；所有數字可能是字串。

## Review Focus

- 空資料（`tropicalCyclone` 缺、`[]`、`null`、整包不是 JSON）→ 回 `[]`，不丟錯。
- 座標字串壞掉（`"abc"`、只有一個數字、經緯度顛倒超出範圍）→ 該點丟掉，其他照畫。
- 同時兩個颱風 → 兩個都畫、各自可點，邊緣箭頭各一個且不重疊到看不見。
- 颱風資料過舊（現況時間距現在超過 `K.typhoonStaleHours`）→ 不畫，免得颱風已消失還掛著。
- 颱風正好在畫面邊界上／跨 180 度經線 → 方位與距離仍正確、不出現 NaN。
- 沒有七級風半徑（熱帶性低氣壓）→ 不畫紅圈，圖示和路線照畫，小卡不寫風圈那行。

---

### Task 1: 解析與地理純函式 `src/core/typhoon.js`

**Files:**
- Create: `src/core/typhoon.js`
- Create: `test/fixtures/cwa-typhoon.json`（假資料，兩個颱風，形狀照上面猜測；另含一個壞座標的預報點）
- Test: `test/core/typhoon.test.js`
- Modify: `src/core/constants.js`（K 加 `typhoonStaleHours: 12`、`typhoonRefreshMinutes: 10`）

**Interfaces:**
- Produces:
  - `parseTyphoons(raw: unknown, now: number) -> Typhoon[]`：吃氣象署整包 JSON（物件或已是字串都可，壞就 `[]`）；過舊的丟掉；`track` 只留晚於 `now.time` 的點。
  - `bearingDeg(from: [lat, lon], to: [lat, lon]) -> number`（0~360，0＝北）
  - `compassText(deg: number) -> string`（沿用 `src/core/math.js` 的 `bearingText`，直接 re-export 即可，不要重寫）
  - `typhoonHint(t: Typhoon, view: { center: [lat, lon], bounds: [[s, w], [n, e]] }) -> null | { dirDeg: number, dirText: string, km: number }`：颱風現況點在 `bounds` 內回 `null`；在外面回從 `center` 看過去的方位與距離（`km` 四捨五入到 10）。
  - `typhoonCardLines(t: Typhoon) -> string[]`：小卡內文行，依序：`最大風速 N m/s（陣風 N）`、`中心氣壓 N hPa`、`七級風半徑 N 公里`、`移動 方向 N 公里/小時`、`預計：<月/日 時:分> 到 (lat, lon)` 取路線前 2 點；缺欄位的行不出現。
- Consumes: `distanceKm`、`bearingText` from `src/core/math.js`；`taipeiDate`/時間格式沿用 `src/core/time.js`（若沒有 時:分 格式就自己在此檔寫一個 `hhmm(ms)`，台灣時間）。

- [ ] **Step 1: 寫 failing 測試 `test/core/typhoon.test.js`**，至少這些（名稱照寫）：
  - `parses two typhoons from the fixture, current position from the last analysis fix`
  - `forecast points are sorted by time and only the ones after now are kept`
  - `a forecast point with a broken coordinate is dropped, the rest stay`
  - `empty / null / garbage / string-of-garbage input gives []`
  - `numbers given as strings are read as numbers; a missing radius gives radius7Km null`
  - `a typhoon whose newest fix is older than K.typhoonStaleHours is dropped`
  - `typhoonHint is null inside the view; outside it gives bearing and km rounded to 10`（例：颱風在東南外海約 600 km，`dirText` 為「東南」）
  - `typhoonHint works across 180° longitude without NaN`
  - `typhoonCardLines leaves out lines whose data is missing`
- [ ] **Step 2: 跑測試確認失敗**：`npx vitest run test/core/typhoon.test.js` → FAIL（檔案不存在）
- [ ] **Step 3: 實作** `src/core/typhoon.js`，匯出上面五個函式。`fix` 不是陣列時包成陣列；座標用 `split(',')` 後 `Number`，`Number.isFinite` 且緯度 −90~90、經度 −180~180 才收；預報時間 = `forecastTime` 若可解析，否則 `initTime + tau 小時`；時間字串可能是 ISO（帶 `+08:00`）或 `YYYY-MM-DD HH:mm:ss`（視為台灣時間）。不用任何外部套件。
- [ ] **Step 4: 跑測試確認通過**：`npx vitest run test/core/typhoon.test.js` → PASS
- [ ] **Step 5: Commit** `git add src/core/typhoon.js src/core/constants.js test/core/typhoon.test.js test/fixtures/cwa-typhoon.json && git commit -m "feat(typhoon): parse CWA typhoon data, bearing/distance hint, card lines"`

---

### Task 2: 小幫手 `/v1/typhoon`

**Files:**
- Create: `worker/src/typhoon.js`
- Modify: `worker/src/index.js`（在 `fetch` 裡加 `if (url.pathname === '/v1/typhoon') return handleTyphoon(env);`，緊接在 `/v1/ships` 那行後面；匯入新檔）
- Test: `test/worker/typhoon.test.js`、`test/worker/index.test.js`（加案例）

**Interfaces:**
- Consumes: `parseTyphoons(raw, now)` from Task 1；`env.CWA_KEY`；`K.typhoonRefreshMinutes`
- Produces:
  - `typhoonUrl(key: string) -> string` = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/W-C0034-005?Authorization=${encodeURIComponent(key)}&format=JSON`
  - `loadTyphoons(cache: Cache, key: string | undefined, fetchFn = fetch, now = Date.now(), mem = TY_MEM) -> Promise<{ updatedAt: number, typhoons: Typhoon[] }>`：照 `worker/src/ships.js` 的 `loadShips` 做法（`mem` 記憶體 + `caches.default` 固定假網址 `https://haidi-helper.internal/typhoon/v1`，`Cache-Control: max-age` 用 `K.typhoonRefreshMinutes` 換算；抓失敗也快取一個空答案但只快取 60 秒；沒有 key 回空且不抓）。
  - `/v1/typhoon` 回應：`{ updatedAt, typhoons }`，帶 `CORS` 標頭與 `Cache-Control: public, max-age=300`。永遠 200（失敗就是 `typhoons: []`）。

- [ ] **Step 1: 寫 failing 測試**（`test/worker/typhoon.test.js`，用假 cache（Map 包成 `match`/`put`）與假 fetch，不打真網路）：
  - `typhoonUrl puts the key encoded in the query`
  - `loadTyphoons returns parsed typhoons and caches them: a second call within the window does not fetch`
  - `a failed fetch (throws / not ok / not JSON) gives an empty list and is cached only briefly`
  - `no CWA_KEY gives an empty list and never fetches`
  - index 測試：`/v1/typhoon answers 200 with CORS and { typhoons: [] } when upstream fails`
- [ ] **Step 2: 跑測試確認失敗**：`npx vitest run test/worker/typhoon.test.js` → FAIL
- [ ] **Step 3: 實作** `worker/src/typhoon.js` 與 `handleTyphoon` 接線（`handleTyphoon(env)` 在 `index.js` 內，傳 `caches.default`）。**不要**改 `scheduled`、`wrangler.toml`。
- [ ] **Step 4: 全部 worker 測試**：`npx vitest run test/worker` → PASS
- [ ] **Step 5: Commit** `git commit -m "feat(typhoon): helper /v1/typhoon, live fetch with edge cache, no new cron"`

---

### Task 3: 網頁取資料 `fetchTyphoons` 與載入週期

**Files:**
- Create: `src/services/typhoon.js`
- Modify: `src/main.js`（state 加 `typhoons: []`；`loadMap()` 載完總覽後呼叫一次；地圖畫面可見時每 `K.typhoonRefreshMinutes` 分鐘再抓一次——比照 `K.shipRefreshMinutes` 的計時寫法）
- Test: `test/services/typhoon.test.js`

**Interfaces:**
- Produces: `fetchTyphoons(baseUrl: string, fetchFn = fetch) -> Promise<Typhoon[]>`：`GET ${baseUrl}/v1/typhoon`；任何問題（網路錯、非 2xx、非 JSON、`typhoons` 不是陣列）→ `[]`，永遠不丟。
- Consumes: Task 2 的回應形狀。

- [ ] **Step 1: 寫 failing 測試**：`calls /v1/typhoon on the helper`、`returns the typhoons array`、`any failure or odd answer gives [] and never throws`（比照 `test/services/ships.test.js` 寫法）
- [ ] **Step 2: 跑測試確認失敗**：`npx vitest run test/services/typhoon.test.js`
- [ ] **Step 3: 實作** `fetchTyphoons`；`main.js` 接線：結果存 `state.typhoons`，之後呼叫 `taiwan?.setTyphoons(state.typhoons)`（Task 4 提供）。`renderMapView()` 裡 `taiwan.setPins(...)` 旁也補呼叫一次 `taiwan.setTyphoons(state.typhoons)`，因為 Leaflet 元素是重用的。抓失敗不要清掉上一次的颱風（保留舊的直到 `parseTyphoons` 的過舊規則在下次成功時生效——**但**若 `state.typhoons` 最新現況超過 `K.typhoonStaleHours` 就丟掉；這個判斷用 Task 1 的 `parseTyphoons` 同一個規則，不要另寫）。
- [ ] **Step 4: 全測試**：`npm test` → PASS（原有 342 個都要過）
- [ ] **Step 5: Commit** `git commit -m "feat(typhoon): page fetches typhoons with the map and refreshes while visible"`

---

### Task 4: 地圖圖層、邊緣箭頭、小卡

**Files:**
- Modify: `src/ui/taiwanMap.js`（新增 `setTyphoons(list)`；`createTaiwanMap` 多收 `onTyphoon` callback）
- Modify: `src/ui/mapPanel.js`（新增 `renderTyphoonCard({ typhoon })`）
- Modify: `src/main.js`（`state.mapTyphoon: string | null` = 被點的颱風 `id`；`mapPanelHtml()` 優先順序：`mapTyphoon` > `mapSite` > `mapSpotId` > home；`onTyphoon: (id) => ...`；小卡上的「← 全台」沿用 `data-action="map-home"`，並確保 `mapHome()` 也清掉 `mapTyphoon`）
- Modify: `src/styles.css`（`.tty`、`.tty-edge`、`.tty-ring` 樣式；風圈用 Leaflet `L.circle`，半徑單位公尺＝`radius7Km * 1000`）
- Test: `test/ui/mapPanel.test.js`（加 `renderTyphoonCard` 案例）、`test/ui/typhoonLayer.test.js`（圖層邏輯，見下）

**Interfaces:**
- Consumes: `Typhoon`、`typhoonHint`、`typhoonCardLines`（Task 1）
- Produces:
  - `setTyphoons(list: Typhoon[]) -> void`（`taiwanMap` 回傳物件的新方法）：先清掉舊圖層再畫。每個颱風畫：①圖示（紅圓＋白色漩渦，比照設計示意圖 B，`L.marker` + `L.divIcon`，點擊呼叫 `onTyphoon(t.id)`）②`radius7Km` 有值才畫 `L.circle`（紅、`fillOpacity: .18`、虛線）③`track` 至少 1 點才畫 `L.polyline`（黃、`dashArray: '6 5'`）＋每點一個小圓點，旁邊 tooltip 寫「M/D 時點」（用台灣時間）。圖層放在自己的 pane（zIndex 高於潛點圓點，低於 popup），`interactive: false` 除了圖示。
  - 邊緣箭頭：地圖每次 `moveend`/`zoomend`/`setTyphoons` 時，對每個**現況點不在 `map.getBounds()` 內**的颱風，在地圖邊緣（顏色紅）放一個 `L.divIcon` 箭頭＋文字「颱風名 在東南方 600 公里」，位置 = 從地圖中心朝颱風方向射線與（內縮 28px 的）可視範圍矩形的交點；點它呼叫 `onTyphoon(t.id)`。距離與方位只用 `typhoonHint(t, { center, bounds })`。為了可測，把「射線交點」寫成不依賴 Leaflet 的純函式 `edgePoint(center: [x, y], size: [w, h], dirDeg: number, inset = 28) -> [x, y]`，匯出在 `src/ui/taiwanMap.js`，並測它。
  - `renderTyphoonCard({ typhoon: Typhoon }) -> string`（HTML）：標題 `🌀 ${name}`（`esc` 過）＋ `data-action="map-home"` 的「← 全台」按鈕＋ `typhoonCardLines` 每行一個 `<div class="mut">`＋最後一行小字「資料：中央氣象署」。
- 測試：
  - `renderTyphoonCard shows the name, every available line, and the source; escapes the name`
  - `renderTyphoonCard has no 風圈 line when radius7Km is null`
  - `edgePoint puts a point on the inset rectangle in the asked direction (E, SE, N, W cases)`
  - `main-panel priority: a picked typhoon card wins over site/spot/home`（若 `mapPanelHtml` 在 main.js 不好測，把優先順序抽成 `src/ui/mapPanel.js` 的 `pickPanel(state)` 純函式再測）
  - `setTyphoons([]) leaves no typhoon layer` ——這個用最小 Leaflet 假物件或直接測 `taiwanMap` 的純函式部分；不要為了測它去起真瀏覽器。
- [ ] **Step 1: 寫上述 failing 測試** → **Step 2: 跑 `npx vitest run test/ui` 確認失敗**
- [ ] **Step 3: 實作**（Leaflet 部分只放在 `taiwanMap.js`；`edgePoint`、`pickPanel`、`renderTyphoonCard` 是純的）；`map.attributionControl.addAttribution('颱風資料：中央氣象署')`。
- [ ] **Step 4: 全測試**：`npm test` → PASS；`npm run build` 成功
- [ ] **Step 5: Commit** `git commit -m "feat(typhoon): typhoon icon, wind ring, track, edge arrow and card on the Taiwan map"`

---

### Task 5: 本機畫面驗證與收尾

**Files:**
- Modify: `README.md`（加一小段：`/v1/typhoon`、不用 cron、金鑰在 `CWA_KEY`、颱風來時要核對欄位）
- Create（暫存，驗完刪）：本機假資料——用 `.claude/launch.json` 的 `web-local`（5174）開網頁，瀏覽器 console 或 vite dev 的 `?` 不要加新功能開關；改用 `javascript_tool` 直接呼叫 `window` 上不存在的東西不可行，所以做法是：在 `test/fixtures/cwa-typhoon.json` 解析後的結果，臨時在 `src/main.js` 的 `state.typhoons` 預設塞假值測，**驗完一定移除，commit 前 `git diff` 確認沒有殘留**。

- [ ] **Step 1: 起本機網頁**（`preview_start` 名稱 `web-local`），臨時塞兩個假颱風：一個在畫面內（巴士海峽附近，有風圈和 3 個預報點）、一個在畫面外（東南外海）。
- [ ] **Step 2: 目視確認**：圖示、紅圈、黃虛線、時間標籤、邊緣箭頭文字「在東南方 N 公里」；點圖示和點箭頭都出小卡；「← 全台」回到首頁；拖／縮放時箭頭跟著跑；沒假資料時畫面與修改前一致。截圖給 Michael 看。
- [ ] **Step 3: 移除臨時假值**；`git diff src/main.js` 確認只剩正式接線。
- [ ] **Step 4: 全測試與 build**：`npm test`、`npm run build` 都過。
- [ ] **Step 5: Commit + push**：`git add README.md && git commit -m "docs(typhoon): README notes" && git push`。**不上線**，等 Michael 說。
- [ ] **Step 6: 更新 Obsidian 筆記** `專案筆記/2026 海底清不清/工作筆記.md` 頂端「上次做到哪」：颱風提醒已 commit+push、尚未上線、欄位尚未用真實資料驗證、下次颱風來時要核對 `parseTyphoons`。
