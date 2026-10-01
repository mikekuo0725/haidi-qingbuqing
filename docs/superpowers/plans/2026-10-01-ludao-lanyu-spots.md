# 綠島 + 蘭嶼潛點 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 2 dive spots — 綠島 (id `ludao`, 4 zones: 柴口 / 石朗 / 大白沙 / 東岸) and 蘭嶼 (id `lanyu`, 4 zones: 開元港 / 八代灣 / 東清灣 / 朗島) — each with its sea map, its 氣象署 coastal area, and (蘭嶼 only) its 氣象署 buoy.

**Architecture:** Data only, same as the 東北角 plan (`docs/superpowers/plans/2026-09-30-northeast-spot.md`). A spot is one JSON file in `src/data/spots/` listed in `SPOT_LIST`; its sea map is a generated JSON in `src/data/spots/maps/` made by `node scripts/coastline.mjs`. The Worker picks up `cwaArea` and `buoy` from the spot list by itself, so no code in `src/core`, `src/ui`, `src/main.js` or `worker/src` changes. Inside each task the map comes first because `test/data/maps.test.js` requires a map for every spot in `SPOT_LIST`.

**Tech Stack:** JSON data, Node 24 `fetch` (Overpass API), Vitest.

**Spec:** No spec file — bounded change following the 加潛點 flow in `README.md`. Michael asked for 綠島 and 蘭嶼 on 2026-10-01. Values below were researched on 2026-10-01:
- Zone points: OpenStreetMap names (石朗潛水區, 柴口, 大白沙, 哈巴狗岩, 開元港, 八代灣, 東清灣, 朗島灣沙灘), moved ~250 m off the nearest `natural=coastline` on the sea side; all 8 checked to lie in the sea (point-in-polygon against the OSM island rings).
- `facing`: seaward normal of the coastline averaged over ±600 m. Exception: 東清灣 uses 100 (the bay mouth opens east); the raw normal (140) came from the bay's south shore.
- `satBox`: about 4 km boxes centred ~3 km offshore along `facing`. NOAA `noaacwNPPN20S3AkdSCIDINEOF2kmDaily` returned values in every cell of all 8 boxes (median Kd490 0.030–0.039, latest 2026-09-15).
- 氣象署 `F-D0047-095` area names (exact): `綠島鄉_南方沿海`, `蘭嶼鄉_南方沿海` (北方 also exists; 南方 chosen like 小琉球, the busiest sites are on the south/west sides).
- 氣象署 buoys (`O-B0075-001`): 蘭嶼 `C6S94` 蘭嶼資料浮標 has 48/49 hours of wave, period, water temperature and current. 綠島 has no buoy close enough (nearest with data is 46761F 成功, on the Taiwan coast ~40 km away) → 綠島 gets no `buoy`.
- No river on either island. Both use 卑南溪 (mouth ~22.765, 121.165) as `riverName`: 綠島 is 35 km from it (bearing 289), 蘭嶼 89 km (bearing 334, `riverImpact` 0 everywhere, like 七星岩). Known quirk carried over from 七星岩: `currentDirFactor` can still add up to ×1.05 for 蘭嶼.

## Global Constraints

- Repo root: `D:\Users\michael0725\Desktop\2026 海底清不清`. Paths are relative to it. Run commands from the repo root in Git Bash.
- Branch: `feat/ludao-lanyu`, created from `main` by the controller before Task 1. Do not push. Do not merge.
- Commit messages end with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- All user-facing text is Traditional Chinese (繁體中文).
- Code in `src/` (outside `src/data/`) and `worker/src/` must not mention 綠島, 蘭嶼, `ludao`, `lanyu`, a zone id or a buoy id. This plan changes no such code.
- Never hand-write coastline data; it comes from `node scripts/coastline.mjs`. Only pass the new spot id; the other spots' map files must not change (check `git status`).
- If `node scripts/coastline.mjs` throws "Overpass is busy", wait 5 minutes and run it again.
- Deploy is NOT part of any task. Never run `wrangler deploy`, `wrangler triggers deploy` or `wrangler pages deploy`.
- Full test suite must stay green after every task: `npm test` (227 tests before this plan).

## File Structure

```
scripts/coastline-spots.json          MOD  + ludao, lanyu map boxes (islands: no close points)
src/data/spots/maps/ludao.json        NEW  generated (Task 1)
src/data/spots/maps/lanyu.json        NEW  generated (Task 2)
src/data/spots/maps/index.js          MOD  + ludao (Task 1), + lanyu (Task 2)
src/data/spots/ludao.json             NEW  綠島: 4 zones, no buoy (Task 1)
src/data/spots/lanyu.json             NEW  蘭嶼: 4 zones, buoy C6S94 (Task 2)
src/data/spots/index.js               MOD  + ludao, + lanyu at the end of SPOT_LIST
test/data/maps.test.js                MOD  + 綠島 / 蘭嶼 have land
test/data/spots.test.js               MOD  list order, coastal areas, buoys, + 2 spot tests
test/core/spotChoice.test.js          MOD  + GPS at 石朗 → ludao, at 八代灣 → lanyu
test/worker/index.test.js             MOD  buoy URL now ends with C6S94 (Task 2)
README.md                             MOD  one line: an island needs no close points (Task 1)
```

---

### Task 1: 綠島 (map + spot)

**Files:**
- Modify: `scripts/coastline-spots.json`, `src/data/spots/maps/index.js`, `src/data/spots/index.js`, `test/data/maps.test.js`, `test/data/spots.test.js`, `test/core/spotChoice.test.js`, `README.md`
- Create (generated): `src/data/spots/maps/ludao.json`
- Create: `src/data/spots/ludao.json`

**Interfaces:**
- Consumes: `scripts/coastline.mjs` (unchanged; usage `node scripts/coastline.mjs <spotId>`).
- Produces: `MAPS.ludao = { bbox: [[22.625, 121.455], [22.695, 121.53]], land: string[] }`; `SPOTS.ludao`; `SPOT_LIST` ids `['xiaoliuqiu', 'kenting', 'qixing', 'northeast', 'ludao']`. Task 2 appends `lanyu` after `ludao`.

- [ ] **Step 1: Write the failing tests**

In `test/data/maps.test.js`, append:

```js
test('綠島 has land (the whole island)', () => {
  expect(MAPS.ludao.land.length).toBeGreaterThan(0);
  expect(MAPS.ludao.bbox).toEqual([[22.625, 121.455], [22.695, 121.53]]);
});
```

In `test/data/spots.test.js`:

1. In the test `墾丁 has 西岸 / 南灣 / 東岸`, change the last line to:

```js
  expect(SPOT_LIST.map((s) => s.id)).toEqual(['xiaoliuqiu', 'kenting', 'qixing', 'northeast', 'ludao']);
```

2. In the test `Taiwan spots name their 氣象署 coastal area`, add one row after `['northeast', '貢寮區沿海'],`:

```js
    ['ludao', '綠島鄉_南方沿海'],
```

3. In the test `Taiwan spots name their 氣象署 buoy`, add one row after `['northeast', '46694A', '龍洞浮標'],`:

```js
    ['ludao', undefined, undefined],
```

4. Append:

```js
test('綠島 has 柴口 / 石朗 / 大白沙 / 東岸, a small 卑南溪 effect and a 黑潮 notice', () => {
  const g = SPOTS.ludao;
  expect(g.name).toBe('綠島');
  expect(g.zones.map((z) => z.id)).toEqual(['chaikou', 'shilang', 'dabaisha', 'east']);
  expect(g.zones.map((z) => z.name)).toEqual(['柴口', '石朗', '大白沙', '東岸']);
  expect(g.riverName).toBe('卑南溪');
  expect(g.zones.every((z) => z.riverImpact <= 0.1)).toBe(true);
  expect(g.notice).toContain('黑潮');
  expect(g.buoy).toBeUndefined();
});
```

In `test/core/spotChoice.test.js`, append:

```js
test('real data: in the water at 綠島石朗 → ludao', () => {
  expect(nearbySpotId([22.6549, 121.4721], SPOT_LIST)).toBe('ludao');
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/data/maps.test.js test/data/spots.test.js test/core/spotChoice.test.js`
Expected: FAIL — `Cannot read properties of undefined (reading 'land')`, the list has 4 ids, `SPOTS.ludao` is undefined, `nearbySpotId` returns `null`.

- [ ] **Step 3: Add the map box**

Replace `scripts/coastline-spots.json` with (the 4 existing lines unchanged, one line added):

```json
{
  "xiaoliuqiu": { "bbox": [[22.31, 120.335], [22.37, 120.405]] },
  "kenting": { "bbox": [[21.89, 120.68], [22.02, 120.87]], "close": [[22.2, 120.9], [22.2, 120.65]] },
  "qixing": { "bbox": [[21.745, 120.805], [21.773, 120.845]], "note": "鵝鑾鼻在北邊約 16 公里" },
  "northeast": { "bbox": [[25.08, 121.88], [25.145, 121.98]], "close": [[25.10, 121.85], [25.05, 121.85]] },
  "ludao": { "bbox": [[22.625, 121.455], [22.695, 121.53]] }
}
```

The whole island (OSM coast 22.6327–22.6826 N, 121.4639–121.5129 E) is inside the box, so every coastline is a closed ring and no `close` points are needed. The box is shifted north so the 東岸 dot (22.6558) sits just below the middle line, out of the top-right current badge.

- [ ] **Step 4: Generate the map (needs internet)**

```bash
node scripts/coastline.mjs ludao
```

Expected output (numbers may differ a little): `ludao: N land shape(s), M characters` with N ≥ 1 (a 2026-10-01 dry run of the OSM data found 8 closed rings: the island plus 7 rocks) and **no** `skipped an open coastline` warning. The file must stay under 20 000 characters. Run `git status`: only `src/data/spots/maps/ludao.json` is new; no other map file changed.

- [ ] **Step 5: Add the map to the index**

Replace `src/data/spots/maps/index.js` with:

```js
// Sea map shapes, made by `node scripts/coastline.mjs`. Kept out of the spot JSON on purpose:
// the Worker imports the spot list and does not need them.
import xiaoliuqiu from './xiaoliuqiu.json';
import kenting from './kenting.json';
import qixing from './qixing.json';
import northeast from './northeast.json';
import ludao from './ludao.json';

export const MAPS = { xiaoliuqiu, kenting, qixing, northeast, ludao };
```

- [ ] **Step 6: Add the spot**

Create `src/data/spots/ludao.json` (use these values exactly):

```json
{
  "id": "ludao",
  "name": "綠島",
  "cwaArea": "綠島鄉_南方沿海",
  "center": [22.66, 121.49],
  "locateMaxKm": 15,
  "notice": "黑潮經過，海流常常很強，要跟潛店或有經驗的人下水",
  "thresholds": { "purple": 20, "green": 12, "yellow": 6 },
  "riverName": "卑南溪",
  "riverBearing": 289,
  "rainPoints": [
    { "name": "池上", "lat": 23.098, "lon": 121.219 },
    { "name": "鹿野", "lat": 22.912, "lon": 121.137 },
    { "name": "延平", "lat": 22.902, "lon": 121.084 }
  ],
  "safety": { "currentYellowKn": 0.5, "currentRedKn": 1.0, "waveRedM": 1.5 },
  "zones": [
    { "id": "chaikou", "name": "柴口", "location": [22.6789, 121.4818], "facing": 334,
      "shelter": "open", "bottom": "mixed", "riverImpact": 0.1,
      "satBox": [[22.68, 121.45], [22.72, 121.49]], "fallbackBase": 20 },
    { "id": "shilang", "name": "石朗", "location": [22.6549, 121.4721], "facing": 264,
      "shelter": "open", "bottom": "rock", "riverImpact": 0.1,
      "satBox": [[22.63, 121.43], [22.67, 121.46]], "fallbackBase": 20 },
    { "id": "dabaisha", "name": "大白沙", "location": [22.6364, 121.4919], "facing": 238,
      "shelter": "open", "bottom": "mixed", "riverImpact": 0.05,
      "satBox": [[22.60, 121.45], [22.64, 121.49]], "fallbackBase": 20 },
    { "id": "east", "name": "東岸", "location": [22.6558, 121.5125], "facing": 81,
      "shelter": "open", "bottom": "rock", "riverImpact": 0,
      "satBox": [[22.64, 121.52], [22.68, 121.56]], "fallbackBase": 20 }
  ]
}
```

Where the numbers come from (for the reviewer; do not change them):
- `riverBearing` 289 = compass bearing from `center` to the 卑南溪 mouth (22.765, 121.165), 35 km away. `riverImpact` is small (west and north sides face Taiwan; the east side faces the open Pacific → 0).
- `rainPoints` = the 卑南溪 basin upstream (池上, 鹿野, 延平).
- `fallbackBase` 20: the satellite says this water is very clear (Kd490 ≈ 0.035); only used when the satellite has no value. Michael can change it after diving there.
- `thresholds` and `safety` are the same as the other 4 spots.
- No `buoy`: no 氣象署 buoy near 綠島 has data.

Replace `src/data/spots/index.js` with:

```js
import xiaoliuqiu from './xiaoliuqiu.json';
import kenting from './kenting.json';
import qixing from './qixing.json';
import northeast from './northeast.json';
import ludao from './ludao.json';

// Order = order in the spot list when there is no GPS.
export const SPOT_LIST = [xiaoliuqiu, kenting, qixing, northeast, ludao];
export const SPOTS = Object.fromEntries(SPOT_LIST.map((s) => [s.id, s]));
export const DEFAULT_SPOT_ID = xiaoliuqiu.id;
```

- [ ] **Step 7: README note**

In `README.md`, in the 加潛點 line, change `(要包住所有分區點;半島要加 \`close\` 兩個陸地那側、範圍外的點)` to:

```
(要包住所有分區點;半島要加 `close` 兩個陸地那側、範圍外的點;整座島都在範圍內就不用 `close`)
```

- [ ] **Step 8: Run the tests**

Run: `npm test`
Expected: all pass (230). This includes the existing `every spot has a map box that holds all its zones` test (the 4 zones are inside the box) and `every spot has the fields the code needs`.

- [ ] **Step 9: Build**

Run: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 10: Commit**

```bash
git add scripts/coastline-spots.json src/data/spots/maps/ludao.json src/data/spots/maps/index.js src/data/spots/ludao.json src/data/spots/index.js test/data/maps.test.js test/data/spots.test.js test/core/spotChoice.test.js README.md
git commit -m "feat(data): 綠島 spot with 柴口, 石朗, 大白沙 and 東岸, and its sea map"
```

---

### Task 2: 蘭嶼 (map + spot + buoy)

**Files:**
- Modify: `scripts/coastline-spots.json`, `src/data/spots/maps/index.js`, `src/data/spots/index.js`, `test/data/maps.test.js`, `test/data/spots.test.js`, `test/core/spotChoice.test.js`, `test/worker/index.test.js`
- Create (generated): `src/data/spots/maps/lanyu.json`
- Create: `src/data/spots/lanyu.json`

**Interfaces:**
- Consumes: Task 1's `SPOT_LIST` ending in `ludao`, `MAPS.ludao`, and the Task 1 rows in the coastal-area and buoy tests.
- Produces: `MAPS.lanyu = { bbox: [[21.99, 121.48], [22.10, 121.63]], land: string[] }`; `SPOTS.lanyu`; `SPOT_LIST` ids `['xiaoliuqiu', 'kenting', 'qixing', 'northeast', 'ludao', 'lanyu']`. The Worker's `refreshBuoys` now asks for `StationID=46714D,46759A,46694A,C6S94` (buoy ids in spot order, duplicates removed — `worker/src/index.js` builds this from `SPOTS`, unchanged).

- [ ] **Step 1: Write the failing tests**

In `test/data/maps.test.js`, append:

```js
test('蘭嶼 has land (the whole island)', () => {
  expect(MAPS.lanyu.land.length).toBeGreaterThan(0);
  expect(MAPS.lanyu.bbox).toEqual([[21.99, 121.48], [22.10, 121.63]]);
});
```

In `test/data/spots.test.js`:

1. In the test `墾丁 has 西岸 / 南灣 / 東岸`, change the last line to:

```js
  expect(SPOT_LIST.map((s) => s.id)).toEqual(['xiaoliuqiu', 'kenting', 'qixing', 'northeast', 'ludao', 'lanyu']);
```

2. In the test `Taiwan spots name their 氣象署 coastal area`, add one row after `['ludao', '綠島鄉_南方沿海'],`:

```js
    ['lanyu', '蘭嶼鄉_南方沿海'],
```

3. In the test `Taiwan spots name their 氣象署 buoy`, add one row after `['ludao', undefined, undefined],`:

```js
    ['lanyu', 'C6S94', '蘭嶼浮標'],
```

4. Append:

```js
test('蘭嶼 has 開元港 / 八代灣 / 東清灣 / 朗島, no river effect and a 黑潮 notice', () => {
  const l = SPOTS.lanyu;
  expect(l.name).toBe('蘭嶼');
  expect(l.zones.map((z) => z.id)).toEqual(['kaiyuan', 'badai', 'dongqing', 'langdao']);
  expect(l.zones.map((z) => z.name)).toEqual(['開元港', '八代灣', '東清灣', '朗島']);
  expect(l.zones.every((z) => z.riverImpact === 0)).toBe(true);
  expect(l.notice).toContain('黑潮');
});
```

In `test/core/spotChoice.test.js`, append:

```js
test('real data: in the water at 蘭嶼八代灣 → lanyu', () => {
  expect(nearbySpotId([22.0240, 121.5484], SPOT_LIST)).toBe('lanyu');
});
```

In `test/worker/index.test.js`, in the test `refreshBuoys asks once for every buoy and keeps 4 days per buoy`, change

```js
  expect(urls[0]).toContain('StationID=46714D,46759A,46694A&');
```

to

```js
  expect(urls[0]).toContain('StationID=46714D,46759A,46694A,C6S94&');
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/data/maps.test.js test/data/spots.test.js test/core/spotChoice.test.js test/worker/index.test.js`
Expected: FAIL — `MAPS.lanyu` undefined, the list has 5 ids, `SPOTS.lanyu` undefined, `nearbySpotId` returns `null`, the buoy URL has no `C6S94`.

- [ ] **Step 3: Add the map box**

Replace `scripts/coastline-spots.json` with (the 5 existing lines unchanged, one line added):

```json
{
  "xiaoliuqiu": { "bbox": [[22.31, 120.335], [22.37, 120.405]] },
  "kenting": { "bbox": [[21.89, 120.68], [22.02, 120.87]], "close": [[22.2, 120.9], [22.2, 120.65]] },
  "qixing": { "bbox": [[21.745, 120.805], [21.773, 120.845]], "note": "鵝鑾鼻在北邊約 16 公里" },
  "northeast": { "bbox": [[25.08, 121.88], [25.145, 121.98]], "close": [[25.10, 121.85], [25.05, 121.85]] },
  "ludao": { "bbox": [[22.625, 121.455], [22.695, 121.53]] },
  "lanyu": { "bbox": [[21.99, 121.48], [22.10, 121.63]] }
}
```

The whole island (OSM coast 22.0010–22.0867 N, 121.4995–121.6006 E) is inside the box, so no `close` points. 小蘭嶼 (~21.95 N) is left out on purpose. The box reaches 121.63 east so the 東清灣 dot stays left of the top-right current badge.

- [ ] **Step 4: Generate the map (needs internet)**

```bash
node scripts/coastline.mjs lanyu
```

Expected output (numbers may differ a little): `lanyu: N land shape(s), M characters` with N ≥ 1 (the 2026-10-01 OSM data had 18 closed rings: the island plus rocks) and **no** `skipped an open coastline` warning. The file must stay under 20 000 characters. Run `git status`: only `src/data/spots/maps/lanyu.json` is new among the map files.

- [ ] **Step 5: Add the map to the index**

Replace `src/data/spots/maps/index.js` with:

```js
// Sea map shapes, made by `node scripts/coastline.mjs`. Kept out of the spot JSON on purpose:
// the Worker imports the spot list and does not need them.
import xiaoliuqiu from './xiaoliuqiu.json';
import kenting from './kenting.json';
import qixing from './qixing.json';
import northeast from './northeast.json';
import ludao from './ludao.json';
import lanyu from './lanyu.json';

export const MAPS = { xiaoliuqiu, kenting, qixing, northeast, ludao, lanyu };
```

- [ ] **Step 6: Add the spot**

Create `src/data/spots/lanyu.json` (use these values exactly):

```json
{
  "id": "lanyu",
  "name": "蘭嶼",
  "cwaArea": "蘭嶼鄉_南方沿海",
  "buoy": { "id": "C6S94", "name": "蘭嶼浮標" },
  "center": [22.045, 121.55],
  "locateMaxKm": 15,
  "notice": "黑潮經過，海流常常很強，要跟潛店或有經驗的人下水",
  "thresholds": { "purple": 20, "green": 12, "yellow": 6 },
  "riverName": "卑南溪",
  "riverBearing": 334,
  "rainPoints": [
    { "name": "池上", "lat": 23.098, "lon": 121.219 },
    { "name": "鹿野", "lat": 22.912, "lon": 121.137 },
    { "name": "延平", "lat": 22.902, "lon": 121.084 }
  ],
  "safety": { "currentYellowKn": 0.5, "currentRedKn": 1.0, "waveRedM": 1.5 },
  "zones": [
    { "id": "kaiyuan", "name": "開元港", "location": [22.0584, 121.5053], "facing": 265,
      "shelter": "open", "bottom": "rock", "riverImpact": 0,
      "satBox": [[22.04, 121.46], [22.08, 121.50]], "fallbackBase": 20 },
    { "id": "badai", "name": "八代灣", "location": [22.0240, 121.5484], "facing": 197,
      "shelter": "semi", "bottom": "mixed", "riverImpact": 0,
      "satBox": [[21.98, 121.52], [22.02, 121.56]], "fallbackBase": 20 },
    { "id": "dongqing", "name": "東清灣", "location": [22.0549, 121.5691], "facing": 100,
      "shelter": "bay", "bottom": "mixed", "riverImpact": 0,
      "satBox": [[22.03, 121.58], [22.07, 121.62]], "fallbackBase": 15 },
    { "id": "langdao", "name": "朗島", "location": [22.0807, 121.5316], "facing": 19,
      "shelter": "open", "bottom": "rock", "riverImpact": 0,
      "satBox": [[22.09, 121.52], [22.12, 121.56]], "fallbackBase": 20 }
  ]
}
```

Where the numbers come from (for the reviewer; do not change them):
- `riverBearing` 334 = bearing from `center` to the 卑南溪 mouth, 89 km away → `riverImpact` 0 everywhere (same idea as 七星岩). `riverName`, `riverBearing` and `rainPoints` are required fields, so they point at the nearest real river.
- `buoy` `C6S94` = 氣象署 蘭嶼資料浮標 (wave, period, water temperature and current all reported).
- 東清灣 `fallbackBase` 15: a sandy bay with a stream; the other zones 20 (satellite Kd490 ≈ 0.031).
- 東清灣 `facing` 100 = the bay mouth opens east (see the Spec note at the top).

Replace `src/data/spots/index.js` with:

```js
import xiaoliuqiu from './xiaoliuqiu.json';
import kenting from './kenting.json';
import qixing from './qixing.json';
import northeast from './northeast.json';
import ludao from './ludao.json';
import lanyu from './lanyu.json';

// Order = order in the spot list when there is no GPS.
export const SPOT_LIST = [xiaoliuqiu, kenting, qixing, northeast, ludao, lanyu];
export const SPOTS = Object.fromEntries(SPOT_LIST.map((s) => [s.id, s]));
export const DEFAULT_SPOT_ID = xiaoliuqiu.id;
```

- [ ] **Step 7: Run the tests**

Run: `npm test`
Expected: all pass (233).

- [ ] **Step 8: Build**

Run: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 9: Worker dry run**

Run: `cd worker && npx wrangler deploy --dry-run --config wrangler.toml; cd ..`
Expected: builds with no errors and lists `env.CACHE`. (Dry run only — nothing is uploaded.)

- [ ] **Step 10: Commit**

```bash
git add scripts/coastline-spots.json src/data/spots/maps/lanyu.json src/data/spots/maps/index.js src/data/spots/lanyu.json src/data/spots/index.js test/data/maps.test.js test/data/spots.test.js test/core/spotChoice.test.js test/worker/index.test.js
git commit -m "feat(data): 蘭嶼 spot with 開元港, 八代灣, 東清灣 and 朗島, its sea map and buoy C6S94"
```

---

## After the plan (controller only, not an implementer task)

- Final review of the branch.
- Look at it locally (`npm run dev`): pick 綠島, then 蘭嶼, from the header. Each map shows the whole island, 4 dots in the sea, no dot or name under the top-right arrow box, and the ⚠️ 黑潮 notice. If a dot sits under the box, move the map box (`scripts/coastline-spots.json`) and regenerate — do not move the zone.
- Show Michael; after his OK, merge `feat/ludao-lanyu` into `main` (fast-forward) and delete the branch.
- Before deploying: confirm the hourly buoy cron really runs (2026-10-01 the `35 * * * *` cron had not fired for 19 h; triggers were re-sent at 10:02 — check `workersInvocationsScheduled` shows `:35` runs).
- Deploy only when Michael says 上線, in this order (see README): `cd worker && npx wrangler deploy --config wrangler.toml`; warm up with `curl "https://haidi-helper.mikekuo0725.workers.dev/v1/base?spot=ludao"` and `...?spot=lanyu`; wait ~30 s and check both answers have `coastal` (33 points) and 蘭嶼 has `buoy.readings`; then `npm run build` and `npx wrangler deploy` from the repo root.
- Update the Obsidian note `專案筆記/2026 海底清不清/工作筆記.md`.
