# 台灣地圖（B＋全部潛點）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **狀態：先記著（2026-10-22）。** Michael 說「做台灣地圖」才開工。開工前先跟 Michael 確認最下面「開工前要問 Michael」的 3 題。

**Goal:** The app opens on a draggable map of Taiwan: each of the 8 spots is a coloured dot showing today's clearest zone (metres + light) and which way the current flows; zooming in swaps them for the named dive sites coloured by their zone; tapping a spot shows a bottom panel with every zone and a button into today's spot page, which stays exactly as it is.

**Architecture:** The map is only an entrance. A new start view `state.view = 'map'` sits in front of the existing `'main'` (spot page). Loading and forecasting a spot moves out of `main.js` into `src/services/spotData.js` so the spot page and the map share it; `src/services/overview.js` runs it for all 8 spots in parallel and `src/core/overview.js` reduces each spot to one summary per day. Everything that decides colours, labels and HTML is pure and unit-tested; `src/ui/taiwanMap.js` is a thin Leaflet wrapper checked in the browser.

**Tech Stack:** Vanilla JS, Vite, Vitest (environment `node`: no DOM, no Leaflet in tests), Leaflet 1.9.4 from npm (bundled, so the PWA caches it).

**Spec:** No separate spec file. Agreed in chat on 2026-10-22: Michael chose "B＋全部潛點" after the mockups `G:\我的雲端硬碟\2026 海底清不清\.superpowers\brainstorm\台灣地圖三選一.html` and the clickable prototype `台灣地圖B試玩.html` (same folder; also on the Desktop as `台灣地圖示意圖\2_B試玩.html`). The prototype is the visual reference; the decisions are the Global Constraints below.

## Global Constraints

- The spot page keeps the sea map (zone tint, flow/wind lines, slider; tapping a zone on it opens the detail page), the sea row, the buoy row and share. **Its zone cards are removed** (Michael, 2026-10-22: the site card on the map already gives each zone's forecast) — Task 9. One new header button `← 台灣地圖` (`data-action="map"`). The report form is removed by the remove-reports plan, which runs first.
- Leaflet `1.9.4` from npm (`npm i leaflet@1.9.4`); no other new dependency. Leaflet code lives only in `src/ui/taiwanMap.js`.
- Base tiles: 國土測繪中心 臺灣通用電子地圖 `https://wmts.nlsc.gov.tw/wmts/EMAP5/default/GoogleMapsCompatible/{z}/{y}/{x}` (note `{y}` before `{x}`), attribution `© 內政部國土測繪中心`. Dark look with CSS filter `invert(1) hue-rotate(180deg) brightness(.8) saturate(.5)` on `.leaflet-tile-pane`.
- Tiles are not cached for offline. Under the tiles, always draw our own Taiwan coastline (`src/data/taiwan-coast.json`, Natural Earth 10m land, public domain) so the map still shows Taiwan and every dot with no network.
- Home view: centre `[22.55, 120.75]`, zoom `6.9`. Spot dots below zoom `K.mapSiteZoom = 9.5`; site dots from `9.5`; site names from `K.mapLabelZoom = 11.5`.
- Spot dot label: `<name> <meters>m` of that day's best zone (`forecast.zones[0]`, already sorted), colour from its `light`; a small arrow rotated to the current's `toDeg` at the best hour (`forecast.best.start`). No data that day → grey dot, label `<name>`, no arrow.
- Site dots: our own sites (`SITE_LAYERS[spotId].sites`: `name`, `location`, `zoneId`) plus BlueTrend's Taiwan sites (Task 8; **Michael 2026-10-22: BlueTrend 已放行**), each coloured by its zone's light for the day. BlueTrend sites are used on the Taiwan map only — never added to `sites/*.json`, so the small sea map on the spot page does not change. Show the source: Leaflet attribution adds `潛點資料：BlueTrend 藍色脈動`, and a BlueTrend site's panel line links to its page.
- **Tapping a small site opens that site's own card** (Michael, 2026-10-22): name; `<level>潛點 · 最深 <maxDepthM> 米 · <entry>` when known; a big row `<今天/明天/後天>能見度預測` with its zone's light, `<spot>・<zone>・<reason>` and `<low>～<high> 米` (the zone's `low`/`high` from the same forecast as the spot page); a strip 海流 / 風 / 最佳下水 (`best.start~best.end 點`); buttons `← 看這個潛點各區` and `海流、風動態圖 →`; for a BlueTrend site the line `潛點資料：BlueTrend 藍色脈動` with `介紹 ↗`. A site outside our 8 spots shows `這裡還沒有能見度預測` instead of the forecast rows. Day tabs on the card change its forecast.
- Panel zone rows show the spot's real zone names (北邊、西邊、龍洞灣…) sorted clearest first; never generic words like 「最清那一區」. A tapped site's zone row is outlined and a line above reads `📌 <site> 在「<zone>」這一區`.
- Day tabs 今天/明天/後天 on the map change every dot; the chosen day carries into the spot page (`state.dayIndex`).
- Opening order: `?spot=<id>` link → the map, zoomed to that spot with its panel open (a shared link must still show that spot's forecast); otherwise → the map at home view. The spot page is reached only from the map; back from it → map; back from the map leaves the site.
- **The map and the spot page always show the same numbers** for the same spot, zone and day (Michael found a mismatch in the prototype: 綠島東岸 purple on the map, red on the spot page). **Do the 移除潛伴回報 plan first** (`docs/superpowers/plans/2026-10-22-remove-reports.md`, Michael chose option C on 2026-10-22): then a forecast depends only on weather + the helper, and both views build it with the same `buildDayForecasts`. Whenever the spot page's `load()` finishes, its `state.forecasts` are still written back into `state.overview` for that spot, so a fresher fetch on one side never leaves the other behind.
- Copy (exact): header button `← 台灣地圖`; panel button `看海流、風的動態圖和每小時 →`; home panel hint `點地圖上的圓點看各區`; no-data label `沒有資料`.
- No worker change, no new cron. Commit and `git push`; do not deploy (Michael says 「上線」).

## Review Focus

- Same spot, zone and day on the map panel and on the spot page → same light and same metres (also right after a pull-to-refresh on the spot page, then back to the map).
- Dragging the map down at the top of the page must not trigger pull-to-refresh (`touchstart` handler in `main.js`) → exclude targets inside `.tmap`.
- One spot's Open-Meteo or helper call fails (or is offline with no cache) → only that dot is grey; the others still show.
- `?spot=` link → the map opens on that spot's panel with its zones; phone back → leaves the site (no blank page).
- Day with no forecast for a spot (後天 missing) → grey dot and `沒有資料` in its panel, no crash on `zones[0]`.

---

### Task 1: Share spot loading between the spot page and the map

**Files:**
- Create: `src/services/spotData.js`
- Modify: `src/main.js:87-116` (move `safeParseDay`, `loadWeatherRaw`, the body of `buildForecasts` out; call the new functions)
- Test: `test/services/spotData.test.js`

**Interfaces:**
- Produces:
  - `loadWeatherRaw(spot, { fetchFn = fetch, storage = localStorage, now }): Promise<{ raw, savedAt, stale } | null>` — same behaviour as today (fresh copy saved only if it parses for today; else cached copy with `stale` hours; else `null`).
  - `buildDayForecasts({ spot, weather, helper, now }): Array<Forecast | null>` (length 3, index = day offset) — exactly today's `buildForecasts` logic (applyCoastal → applyBuoy → buildForecast).
  - `loadSpot(spot, { fetchFn, storage, now, helperUrl, fresh = false }): Promise<{ weather, helper }>` — the `Promise.all` from `load()`.

- [ ] **Step 1: Write the failing tests** (reuse the `fakeRaw` shape from `test/services/openmeteo.test.js`; move it to `test/helpers/fakeRaw.js` and import it in both files)
  - `fresh fetch that parses is saved and returned with stale null`
  - `failed fetch falls back to the cache with stale hours` — storage holds a copy saved 3 h before `now` → `stale === 3`
  - `failed fetch and empty cache → null`
  - `buildDayForecasts gives 3 entries, null for a day the weather does not cover`
- [ ] **Step 2: Run** `npx vitest run test/services/spotData.test.js` — Expected: FAIL (module not found)
- [ ] **Step 3: Implement** the three functions in `src/services/spotData.js`; `main.js` imports them (`buildForecasts(now)` becomes `state.forecasts = buildDayForecasts({ spot: spot(), weather: state.weather, helper: state.helper, now })`).
- [ ] **Step 4: Run** `npm test` — Expected: all tests PASS (behaviour unchanged)
- [ ] **Step 5: Commit** `refactor: move spot loading to services/spotData.js`

### Task 2: One summary per spot per day (pure)

**Files:**
- Modify: `src/core/constants.js` (add `K.mapSiteZoom = 9.5`, `K.mapLabelZoom = 11.5`)
- Create: `src/core/overview.js`
- Test: `test/core/overview.test.js`

**Interfaces:**
- Consumes: `Forecast` from `buildForecast` (`zones` sorted best first, `best.start`, `currents[]` with `hour, kn, toDeg, windKmh, windDir`, `sst`).
- Produces:
  - `summarizeDay(forecast | null): DaySummary | null` where `DaySummary = { date, meters, light, zoneId, zoneName, flowKn, flowToDeg, windKmh, windDir, sst, zoneLights: { [zoneId]: light } }`; flow/wind taken from the `currents` entry whose `hour === forecast.best.start` (first entry if none matches).
  - `summarizeSpot(forecasts: Array<Forecast|null>): Array<DaySummary|null>` (length 3).
  - `rankSpots(summaries: { [spotId]: Array<DaySummary|null> }, dayIndex): string[]` — spot ids, best `meters` first, spots without data last.

- [ ] **Step 1: Write the failing tests** (a real forecast from `makeDay` + `buildForecast` for `SPOTS.xiaoliuqiu`; for the best-hour test, a plain object with `best: { start: 11 }` and two `currents` entries)
  - `best zone and its light come from zones[0]` — `summarizeDay(f).zoneId === f.zones[0].zoneId`, `.meters === f.zones[0].meters`
  - `flow and wind come from the best hour` — make hour 11 different (`currentDir: 270`) and force `best.start === 11` → `flowToDeg === 270`
  - `null forecast → null summary`
  - `zoneLights has every zone of the spot`
  - `rankSpots puts the clearest first and no-data spots last`
- [ ] **Step 2: Run** `npx vitest run test/core/overview.test.js` — Expected: FAIL
- [ ] **Step 3: Implement** `src/core/overview.js`
- [ ] **Step 4: Run** `npm test` — Expected: PASS
- [ ] **Step 5: Commit** `feat(map): summarise each spot per day`

### Task 3: Load all 8 spots for the map

**Files:**
- Create: `src/services/overview.js`
- Test: `test/services/overview.test.js`

**Interfaces:**
- Consumes: `loadSpot`, `buildDayForecasts` (Task 1), `summarizeSpot` (Task 2).
- Produces: `loadOverview(spots, { fetchFn, storage, now, helperUrl, fresh = false }): Promise<{ forecasts: { [spotId]: Array<Forecast|null> }, summaries: { [spotId]: Array<DaySummary|null> } }>` — all spots in parallel (`Promise.all`); a spot whose load throws or has no weather gets `[null, null, null]` and never rejects the whole call. `forecasts` is kept for the spot panel's zone rows (`renderMapSpot`, Task 4).

- [ ] **Step 1: Write the failing tests** with a fake `fetchFn` that answers by URL (Open-Meteo → `fakeRaw()` parts, helper → `{ zones: {} }`)
  - `every spot gets 3 summaries`
  - `one spot failing leaves the others intact` — fake rejects every URL containing kenting's `center[0]` → `summaries.kenting` is `[null, null, null]`, `summaries.xiaoliuqiu[0]` not null
  - `weather is cached per spot` — after the call, `storage.getItem('haidi:weather:lanyu')` is set
  - `the overview equals the spot page` — `summaries.xiaoliuqiu[0]` equals `summarizeSpot(buildDayForecasts({ spot, weather, helper, now }))[0]` for the same inputs
- [ ] **Step 2: Run** `npx vitest run test/services/overview.test.js` — Expected: FAIL
- [ ] **Step 3: Implement** `src/services/overview.js`
- [ ] **Step 4: Run** `npm test` — Expected: PASS
- [ ] **Step 5: Commit** `feat(map): load every spot for the Taiwan map`

### Task 4: Pins and panels (pure)

**Files:**
- Create: `src/core/mapPins.js`, `src/ui/mapPanel.js`
- Test: `test/core/mapPins.test.js`, `test/ui/mapPanel.test.js`

**Interfaces:**
- Consumes: `DaySummary`, `rankSpots` (Task 2); `SPOT_LIST`, `SITE_LAYERS`; `LIGHT`, `esc`, `knots`, `arrow` from `src/ui/format.js`.
- Produces:
  - `spotPins(spots, summaries, dayIndex): Array<{ id, lat, lon, light, label, flowToDeg }>` — `light: 'gray'`, `label: name`, `flowToDeg: null` when that day has no summary; else `label: \`${name} ${Math.round(meters)}m\``.
  - `sitePins(siteLayers, summaries, dayIndex): Array<{ spotId, zoneId, name, lat, lon, light }>` — light from `summaries[spotId][dayIndex].zoneLights[zoneId]`, `'gray'` when missing.
  - `layerFor(zoom): { spots: boolean, sites: boolean, labels: boolean }` using `K.mapSiteZoom`, `K.mapLabelZoom`.
  - `renderMapHome({ summaries, spots, dayIndex, dayLabels }): string` — day tabs (`data-day`), the two clearest spots as rows (`data-mapspot="<id>"`), hint `點地圖上的圓點看各區`.
  - `renderSiteCard({ site, spot, forecast, dayIndex, dayLabels }): string` — `site = { name, zoneId | null, level?, maxDepthM?, entry?, url? }`; the zone is `forecast.zones.find(z => z.zoneId === site.zoneId)`; copy and buttons exactly as in Global Constraints (`data-action="map-spot"` for `← 看這個潛點各區`, `data-action="open-spot"` + `data-zone` for `海流、風動態圖 →`); `這裡還沒有能見度預測` when `spot` or `forecast` is null.
  - `renderMapSpot({ spot, summary, forecast, dayIndex, dayLabels }): string` — `📍 <name>` + `← 全台` (`data-action="map-home"`), day tabs, strip (海流 `knots` + `arrow`, 風, 水溫), every zone row (`data-zone="<zoneId>"`, light emoji + name + `meters` 米), button `看海流、風的動態圖和每小時 →` (`data-action="open-spot"`); `沒有資料` when `summary` is null.

- [ ] **Step 1: Write the failing tests**
  - `spot with no data that day is a grey pin without arrow`
  - `pin label rounds metres` — 14.6 → `小琉球 15m`
  - `site light follows its zone` — xiaoliuqiu `花瓶岩` (zone `north`) gets `zoneLights.north`
  - `layerFor switches at 9.5 and labels at 11.5` — `layerFor(9.4).spots === true`, `layerFor(9.5).sites === true`, `layerFor(11.4).labels === false`
  - `home panel lists the two clearest spots and every day tab`
  - `spot panel has every zone, the open button, and 沒有資料 when empty`
  - `names are escaped` — a site named `<b>` renders as `&lt;b&gt;`
  - `site card shows the zone forecast range and reason` — 花瓶岩 (`north`) card contains that zone's `low`～`high` 米 and `reason`, and `小琉球・北邊`
  - `site card without level data has no 最深 line`; `site outside our spots says 這裡還沒有能見度預測 and has no open-spot button`
- [ ] **Step 2: Run** `npx vitest run test/core/mapPins.test.js test/ui/mapPanel.test.js` — Expected: FAIL
- [ ] **Step 3: Implement** both files
- [ ] **Step 4: Run** `npm test` — Expected: PASS
- [ ] **Step 5: Commit** `feat(map): pins and bottom panels for the Taiwan map`

### Task 5: Taiwan coastline data

**Files:**
- Create: `scripts/taiwan-coast.mjs`, `src/data/taiwan-coast.json`
- Test: `test/data/taiwanCoast.test.js`

**Interfaces:**
- Produces: `src/data/taiwan-coast.json` = GeoJSON `FeatureCollection` of `Polygon`s (lon, lat; 4 decimals), property `source: "Natural Earth 10m land (public domain)"`.

- [ ] **Step 1: Write the failing test** `coast covers Taiwan and the dive islands` — the file loads; ≥ 20 polygons; every coordinate inside lon 119.0–122.4, lat 21.5–25.6; one polygon each contains the points of 小琉球 `[120.37, 22.34]`, 綠島 `[121.49, 22.66]`, 蘭嶼 `[121.55, 22.045]` (point-in-polygon in the test); file < 40 KB.
- [ ] **Step 2: Run** `npx vitest run test/data/taiwanCoast.test.js` — Expected: FAIL
- [ ] **Step 3: Write `scripts/taiwan-coast.mjs`** — downloads `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_land.geojson`, keeps every polygon's outer ring whose bounding box lies fully inside lon 118.9–122.3, lat 21.6–25.5, drops rings with min lat > 24.9 and min lon < 120 (Fujian islands), rounds to 4 decimals, writes the JSON. Run `node scripts/taiwan-coast.mjs`.
- [ ] **Step 4: Run** `npm test` — Expected: PASS
- [ ] **Step 5: Commit** `feat(map): Taiwan coastline for the offline map`

### Task 6: Leaflet map wrapper

**Files:**
- Modify: `package.json` (`npm i leaflet@1.9.4`), `src/styles.css` (map styles)
- Create: `src/ui/taiwanMap.js`

**Interfaces:**
- Consumes: `spotPins`, `sitePins`, `layerFor` (Task 4); `taiwan-coast.json` (Task 5).
- Produces: `createTaiwanMap(el, { onSpot(id), onSite(site) }): { show(), setPins(spotPins, sitePins), flyHome(), flyToSpot(spot, zoom), destroy() }` — creates the Leaflet map once; `show()` calls `invalidateSize()`; markers are `L.divIcon` with class `tpin` (spot) / `tsite` (site); coastline is an `L.geoJSON` layer in its own pane `coast` with `zIndex 150` (below Leaflet's tile pane at 200, so tiles cover it online and it shows when tiles fail; fill `#26404c`); `zoomend` applies `layerFor`. Spot zoom per spot: `K.mapSpotZoom = { xiaoliuqiu: 13.2, kenting: 11, qixing: 13.5, northeast: 11.6, ludao: 12.4, lanyu: 12, 'penghu-north': 11.6, 'penghu-south': 11.4 }` (add to `constants.js`).
- CSS: `.tmap` fills the viewport under a fixed bottom panel `.tpanel` (max 45% height, scrolls); pin styles from the prototype (dot 18 px with 2 px white border, label text-shadow); `.tmap .leaflet-tile-pane` dark filter from Global Constraints.

- [ ] **Step 1: Implement** `src/ui/taiwanMap.js` and the CSS (no unit test: Leaflet needs a DOM).
- [ ] **Step 2: Run** `npm test` and `npm run build` — Expected: tests PASS, build succeeds, `dist` contains the Leaflet CSS.
- [ ] **Step 3: Commit** `feat(map): Leaflet wrapper for the Taiwan map`

### Task 7: Wire the map in as the start view

**Files:**
- Modify: `src/main.js`, `src/ui/mainView.js` (header button)
- Test: `test/ui/mainView.test.js`

**Interfaces:**
- Consumes: everything above.
- Produces (in `main.js`): `state.view` gains `'map'`; `state.overview = { forecasts, summaries } | null`; `state.mapSpotId: string | null` (spot open in the map panel); `state.mapSite: site | null` (site card open).

- [ ] **Step 1: Write the failing test** `spot page header has the 台灣地圖 button` — `renderMain(...)` contains `data-action="map"` and `← 台灣地圖`.
- [ ] **Step 2: Run** `npx vitest run test/ui/mainView.test.js` — Expected: FAIL
- [ ] **Step 3: Implement**
  - `mainView.js`: add the button before the spot name.
  - `main.js` start: `history.replaceState({ view: 'map' }, '', '#')` and render the map; when `urlSpotId` is a known spot, open its panel (`state.mapSpotId = urlSpotId`, `flyToSpot`).
  - Map view: `app` gets `<div class="tmap"></div><div class="tpanel">…</div>`; create the Leaflet map once and re-attach its element on later renders; `loadOverview(SPOT_LIST, …)` on start and with `{ fresh: true }` on the same refresh triggers as `load()`.
  - Clicks: `data-mapspot` / `onSpot` → `state.mapSpotId = id`, `flyToSpot`, panel `renderMapSpot`; `map-home` → `flyHome`, panel `renderMapHome`; `open-spot` → `selectSpot(state.mapSpotId, { manual: true })` then `go('main')`; `onSite(site)` → `state.mapSite = site`, panel `renderSiteCard` (flyToSpot when the site belongs to a spot); `map-spot` → panel `renderMapSpot` for the site's spot; `open-spot` from a site card → `selectSpot` then `go('detail', zoneId)`; panel zone row `data-zone` → same; `data-action="map"` on the spot page → `history.back()` when the previous entry is the map, else `go('map')`.
  - Day tabs in the map view set `state.dayIndex` and redraw pins + panel only.
  - End of `load()`: `state.overview.forecasts[id] = state.forecasts` and `state.overview.summaries[id] = summarizeSpot(state.forecasts)`, so the map shows exactly what the spot page shows.
  - Pull-to-refresh `touchstart`: ignore targets inside `.tmap`.
  - `syncFlow` / `syncShips`: unchanged (`mapShown()` is false in the map view).
- [ ] **Step 4: Run** `npm test` and `npm run build` — Expected: PASS, build OK
- [ ] **Step 5: Check in the browser** (`npm run dev`, phone size 375×812): opens on the map; tap 小琉球 → panel + zoom; button → spot page with lines moving; `← 台灣地圖` and phone back → map; `?spot=lanyu` → map zoomed to 蘭嶼 with its panel; drag the map down → no 「更新中…」; 綠島 on the map and on its spot page show the same light and metres for every zone; offline (DevTools) → coastline + dots still drawn. Screenshot each.
- [ ] **Step 6: Commit and push** `feat(map): open on the Taiwan map` → `git push`

---

### Task 8: BlueTrend sites on the Taiwan map

**Files:**
- Create: `scripts/bluetrend-sites.mjs`, `src/data/spots/extraSites.json`
- Modify: `src/core/mapPins.js` (`sitePins`), `src/ui/mapPanel.js` (`renderMapSpot`), `src/ui/taiwanMap.js` (attribution)
- Test: `test/data/extraSites.test.js`, `test/core/mapPins.test.js`, `test/ui/mapPanel.test.js`

**Interfaces:**
- Consumes: `zoneAt(bbox, layer, [lat, lon])` from `src/core/mapRegions.js`; `MAPS[spotId].bbox`; `SITE_LAYERS`; `distanceKm`.
- Produces:
  - `extraSites.json` = `{ sites: { [spotId | 'other']: Array<{ name, location: [lat, lon], zoneId | null, level: '初級'|'中級'|'高級', maxDepthM, entry, url }> }, details: { [spotId]: { [ourSiteName]: { level, maxDepthM, entry, url } } } }` — `other` holds BlueTrend sites outside every spot's map box (grey dots, card says 這裡還沒有能見度預測); `details` gives our own sites the BlueTrend facts of the BlueTrend site within 0.5 km (so 花瓶岩's card shows 中級 · 最深 20 米).
  - `sitePins(siteLayers, extraSites, summaries, dayIndex)` — Task 4's signature gains `extraSites`; extra pins also carry `level, maxDepthM, entry, url`.
  - `renderMapSpot({ …, picked: { name, zoneId, level?, maxDepthM?, entry?, url? } | null })` — the `📌` line, plus `<level> · 最深 <maxDepthM> 米 · <entry>` and a `BlueTrend 介紹 ↗` link (`target="_blank" rel="noopener"`) when `url` is set.

- [ ] **Step 1: Write the failing tests**
  - `every extra site lies inside its spot's map box and has a zone` — for each entry under a spot id (not `other`), `zoneAt(MAPS[id].bbox, SITE_LAYERS[id], location) === zoneId`; every `other` entry has `zoneId: null`
  - `no extra site duplicates one of ours` — every extra site is > 0.5 km from every `SITE_LAYERS[id].sites` entry and its name differs
  - `known bad BlueTrend coordinates are not used` — no extra site named `玉女岩` (its coordinates equal 軍艦岩's)
  - `sitePins includes extra sites with their details, and our own sites carry details when matched`
  - `spot panel shows the BlueTrend link for a picked BlueTrend site`
- [ ] **Step 2: Run** `npx vitest run test/data/extraSites.test.js test/core/mapPins.test.js test/ui/mapPanel.test.js` — Expected: FAIL
- [ ] **Step 3: Write `scripts/bluetrend-sites.mjs`** — reads `G:\我的雲端硬碟\2026 海底清不清\潛點參考資料\bluetrend_台灣潛點.json` (path as the first argument), puts a site under the spot whose `MAPS[id].bbox` contains it (else `other`, `zoneId: null`); a site within 0.5 km of one of our own sites goes into `details` under our site's name instead; skip list `['玉女岩']`; `zoneId = zoneAt(...)`; writes `src/data/spots/extraSites.json`. Run it; list in the commit message how many sites each spot got.
- [ ] **Step 4: Implement** the `sitePins`, `renderMapSpot` and attribution changes.
- [ ] **Step 5: Run** `npm test` — Expected: PASS
- [ ] **Step 6: Check in the browser:** zoom into 墾丁 and 綠島 → the extra sites appear, coloured by zone; tap one → panel shows its level/depth and the BlueTrend link.
- [ ] **Step 7: Commit and push** `feat(map): BlueTrend dive sites on the Taiwan map`

### Task 9: Slim the spot page (zone cards move to the map)

**Files:**
- Modify: `src/ui/mainView.js` (drop `card()` and the `.cards` block), `src/ui/mapPanel.js`, `src/ui/taiwanMap.js`, `src/main.js`, `src/styles.css`
- Test: `test/ui/mainView.test.js`, `test/ui/mapPanel.test.js`

**Interfaces:**
- Consumes: `renderMapSpot`, `renderSiteCard` (Task 4), `createTaiwanMap` (Task 6).
- Produces:
  - `renderMain(...)` no longer renders zone cards; with no forecast it still shows `emptyText`.
  - What the cards showed moves to the map: every zone row in `renderMapSpot` and the forecast row in `renderSiteCard` add the chip `COMPARE_TEXT[zone.compare]` (比平常清 ↑ / 比平常濁 ↓ / 跟平常差不多) and `把握度 <CONF_TEXT[zone.confidence]>`.
  - `createTaiwanMap` gains `setMe([lat, lon] | null)` — a blue dot for the phone's position (memory only, never stored or sent, same rule as today); the zone row of `state.located.zoneId` in `renderMapSpot` gets the tag `你在這裡`.

- [ ] **Step 1: Write the failing tests**
  - `spot page has no zone cards` — `renderMain(base)` has no `data-zone=` outside the sea map and no `class="cards"`; still has the sea map, `data-action="share"`, and `emptyText` when `forecast` is null
  - `map panel rows carry compare and confidence` — a zone with `compare: 'up'`, `confidence: 'high'` renders `比平常清 ↑` and `把握度 高`
  - `map panel marks the zone you are in` — `located: { status: 'near', zoneId: 'west' }` → the `west` row contains `你在這裡`
- [ ] **Step 2: Run** `npx vitest run test/ui/mainView.test.js test/ui/mapPanel.test.js` — Expected: FAIL
- [ ] **Step 3: Implement**; in `main.js`, `getPosition()` also calls `map.setMe(pos)`; `autoSwitchTarget` no longer switches the spot page — when GPS finds a nearby spot and the user is on the map home view, open that spot's panel instead.
- [ ] **Step 4: Run** `npm test` and `npm run build` — Expected: PASS
- [ ] **Step 5: Check in the browser:** spot page shows sea map + sea row + buoy, no cards; tap a zone on the sea map → detail page still opens; `?spot=ludao` → map on 綠島's panel with compare/confidence chips.
- [ ] **Step 6: Commit and push** `feat(map): zone forecasts live on the map; slim the spot page`

### Task 10: Protection line on the site card

Michael, 2026-10-22: each small site gets one hand-written line, no area shapes.

**Files:**
- Create: `src/data/spots/protection.json`
- Modify: `src/ui/mapPanel.js` (`renderSiteCard`)
- Test: `test/data/protection.test.js`, `test/ui/mapPanel.test.js`

**Interfaces:**
- Produces: `protection.json` = `{ [spotId]: { [siteName]: { kind: 'no-take' | 'permit', text, url } } }` — `no-take` renders `🛡️ <text>`, `permit` renders `⚠️ <text>`, both followed by `官方公告 ↗` (`url`, `target="_blank" rel="noopener"`). A site with no entry shows no line.
- Sources (fill by hand, one line per site, wording short and factual, never stronger than the notice): 農業部「臺灣地區漁業資源保育區範圍」`https://data.moa.gov.tw/Service/OpenData/DataFileService.aspx?UnitId=729&IsTransData=1` (琉球、綠島、七美、貢寮 entries: read `限制事項` and match each site to the 分區 it names); 墾丁國家公園、澎湖南方四島國家公園 notices for sites that need an application (西吉藍洞、鐵砧 and any others the notice lists). Put every source URL in the commit message.

- [ ] **Step 1: Write the failing tests**
  - `every protection entry names a real site` — each `siteName` exists in `SITE_LAYERS[spotId].sites` or `extraSites.sites[spotId]`; `kind` is one of the two; `url` starts with `https://`
  - `site card shows the protection line and link`; `site without an entry shows none`
- [ ] **Step 2: Run** `npx vitest run test/data/protection.test.js test/ui/mapPanel.test.js` — Expected: FAIL
- [ ] **Step 3: Write `protection.json`** from the sources, then implement the card line.
- [ ] **Step 4: Run** `npm test` — Expected: PASS
- [ ] **Step 5: Commit and push** `feat(map): protected-area line on dive site cards`

---

## 開工前要問 Michael

1. 打開 App 一律先到台灣地圖？還是「上次看的潛點」直接進潛點頁、按 `← 台灣地圖` 才到地圖？（計畫目前寫：一律先到地圖；分享連結 `?spot=` 例外）
2. 底圖用國土測繪中心的電子地圖（免費、中文、不用金鑰）可以嗎？要衛星照片就要申請 Esri 金鑰。
3. ~~小潛點只放我們自己的 51 個？~~ → ✅ 2026-10-22 Michael：BlueTrend 已放行（Task 8）。
