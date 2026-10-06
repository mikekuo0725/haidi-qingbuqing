# 澎湖北海 + 澎湖南方四島潛點 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 2 dive spots in 澎湖 — 澎湖北海 (id `penghu-north`, 4 zones: 吉貝 / 目斗嶼 / 姑婆嶼 / 險礁) and 澎湖南方四島 (id `penghu-south`, 3 zones: 東吉 / 西吉 / 東西嶼坪) — each with its sea map, its 氣象署 coastal area and its 氣象署 buoy.

**Architecture:** Data only, same as the 綠島 + 蘭嶼 plan (`docs/superpowers/plans/2026-10-01-ludao-lanyu-spots.md`). A spot is one JSON file in `src/data/spots/` listed in `SPOT_LIST`; its sea map is a generated JSON in `src/data/spots/maps/` made by `node scripts/coastline.mjs`. The Worker picks up `cwaArea` and `buoy` from the spot list by itself, so no code in `src/core`, `src/ui`, `src/main.js` or `worker/src` changes. Inside each task the map comes first because `test/data/maps.test.js` requires a map for every spot in `SPOT_LIST`.

**Tech Stack:** JSON data, Node 24 `fetch` (Overpass API), Vitest.

**Spec:** No spec file — bounded change following the 加潛點 flow in `README.md`. Michael asked for 澎湖 on 2026-10-06 and chose **two spots** (north and south are ~55 km apart, and Open-Meteo weather is fetched for one point per spot: `spot.center`, see `src/services/openmeteo.js`). Values below were researched on 2026-10-06:
- Islands: OpenStreetMap `place=island|islet` — 吉貝嶼 (23.742, 119.609), 目斗嶼 (23.786, 119.600), 姑婆嶼 (23.715, 119.556), 險礁嶼 (23.7115, 119.609), 東吉嶼 (23.254, 119.672), 西吉嶼 (23.249, 119.615), 西嶼坪嶼 (23.2695, 119.507), 東嶼坪嶼 (23.259, 119.516). 東/西嶼坪 are ~1 km apart → one zone 東西嶼坪.
- Zone points: the coastline point (OSM `natural=coastline`) furthest along `facing` from the island centre, moved 250 m further out along `facing`. Nearest coastline from every point is 0.22–0.25 km (in the sea).
- `facing` is **my guess** of the usual dive side (Michael can change it): 吉貝 225 (沙尾 sand spit, SW), 目斗嶼 0 (north tip), 姑婆嶼 270 (west), 險礁 180 (south), 東吉 90 (east, open sea), 西吉 180 (south), 東西嶼坪 270 (west).
- `satBox`: about 4 km boxes centred ~3 km offshore along `facing`. NOAA `noaacwNPPN20S3AkdSCIDINEOF2kmDaily` returned values in every cell of all 7 boxes (latest 2026-09-24). Median Kd490 → `1.5 / Kd` meters (`K.kdToMeters`): 吉貝 0.143 → 10.5, 目斗嶼 0.106 → 14, 姑婆嶼 0.119 → 12.6, 險礁 0.174 → 8.6, 東吉 0.067 → 22, 西吉 0.076 → 20, 東西嶼坪 0.114 → 13. `fallbackBase` = these, rounded down, capped at 20.
- 氣象署 `F-D0047-095` area names (exact, from the 2026-10-06 file): `白沙鄉沿海` (北海: 吉貝/目斗嶼/姑婆嶼/險礁 are all in 白沙鄉) and `望安鄉_東吉島_南方沿海` (南方四島). Other 澎湖 names in the file: 湖西鄉沿海, 馬公市沿海, 西嶼鄉沿海, 望安鄉_北方沿海, 望安鄉_南方沿海, 七美鄉_北方沿海, 七美鄉_南方沿海, 望安鄉_東吉島_北方沿海.
- 氣象署 buoys (`O-B0075-001`, names/positions from `https://www.cwa.gov.tw/Data/js/marine/MMC_stations.js`): `46735A` 澎湖資料浮標 (23.727, 119.552; ~1 km NNW of 姑婆嶼) had wave 46/49, current 48/49, water temperature 48/49 hours; `C6W10` 七美資料浮標 (23.194, 119.665; ~7 km south of 東吉嶼) had wave 47/49, current 43/49, water temperature 47/49.
- Open-Meteo marine answers at both centres (2026-10-06: waves 2.4 m — 東北季風 season).
- No river in 澎湖. `riverName`, `riverBearing` and `rainPoints` are required fields, so both spots point at the nearest big river, 濁水溪 (mouth ~23.835, 120.245): 67 km from the north centre (bearing 81), 92 km from the south centre (bearing 46). `riverImpact` is 0 in every zone (same idea as 蘭嶼). Known quirk carried over from 蘭嶼/七星岩: `currentDirFactor` can still add up to ×1.05.
- Map boxes were dry-run on 2026-10-06 with `scripts/coastline-lib.js`: 北海 box → 18 closed land shapes (2 512 characters), 南方四島 box → 10 closed land shapes (1 749 characters), **no open coastline** in either.

## Global Constraints

- Repo root: `D:\Users\michael0725\Desktop\2026 海底清不清`. Paths are relative to it. Run commands from the repo root in Git Bash.
- Branch: `feat/penghu`, created from `main` by the controller before Task 1. Do not push. Do not merge.
- Commit messages end with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- All user-facing text is Traditional Chinese (繁體中文).
- Spot ids are `penghu-north` and `penghu-south` (with the hyphen). In JS, access them as `SPOTS['penghu-north']` / `MAPS['penghu-north']`.
- Code in `src/` (outside `src/data/`) and `worker/src/` must not mention 澎湖, a spot id, a zone id or a buoy id. This plan changes no such code.
- Never hand-write coastline data; it comes from `node scripts/coastline.mjs`. Only pass the new spot id; the other spots' map files must not change (check `git status`).
- If `node scripts/coastline.mjs` throws "Overpass is busy", wait 5 minutes and run it again.
- Deploy is NOT part of any task. Never run `wrangler deploy`, `wrangler triggers deploy` or `wrangler pages deploy`.
- Full test suite must stay green after every task: `npm test` (234 tests before this plan).

## Review Focus

- A dot hidden under the top-right current badge: both 澎湖 maps are wide and short (about 20×12 km and 25×13 km), so the badge covers a bigger share of the height than on the island maps. The boxes below were chosen so 目斗嶼 sits left of the middle line and 東吉 sits below it; the controller checks it by eye after the plan (no automated test can see the badge). Same check for the longest spot name so far, 澎湖南方四島 (6 characters), in the header button `📍 澎湖南方四島 ▾` and the spot list at 320 px wide: no wrap that pushes the page sideways.
- GPS in 馬公 (23.566, 119.566) is ~19 km from the north centre and ~34 km from the south centre: it must pick **no** spot (keep the saved/default spot and show distances), not jump to 澎湖北海. Pinned by a test in Task 2.
- Buoy request order: the Worker asks for buoy ids in spot order with duplicates removed; adding two buoys must give `46714D,46759A,46694A,C6S94,46735A,C6W10`. Pinned in Task 1 and Task 2.
- A hyphen in a spot id (`penghu-north`) is new. It travels in `?spot=`, in KV keys (`base:penghu-north`, `cwa:penghu-north`) and in localStorage; none of these parse the id. The controller checks it for real with the post-deploy `curl ...?spot=penghu-north`.
- An open coastline (an island cut by the map box) would silently drop land from the map. Each map step expects **no** `skipped an open coastline` warning.

## File Structure

```
scripts/coastline-spots.json             MOD  + penghu-north, penghu-south map boxes (no close points)
src/data/spots/maps/penghu-north.json    NEW  generated (Task 1)
src/data/spots/maps/penghu-south.json    NEW  generated (Task 2)
src/data/spots/maps/index.js             MOD  + penghu-north (Task 1), + penghu-south (Task 2)
src/data/spots/penghu-north.json         NEW  澎湖北海: 4 zones, buoy 46735A (Task 1)
src/data/spots/penghu-south.json         NEW  澎湖南方四島: 3 zones, buoy C6W10 (Task 2)
src/data/spots/index.js                  MOD  + both at the end of SPOT_LIST
test/data/maps.test.js                   MOD  + both have land
test/data/spots.test.js                  MOD  list order, coastal areas, buoys, + 2 spot tests
test/core/spotChoice.test.js             MOD  + GPS at 吉貝 → penghu-north, at 東吉 → penghu-south, 馬公 → none
test/worker/index.test.js                MOD  buoy URL gets 46735A (Task 1), then C6W10 (Task 2)
```

---

### Task 1: 澎湖北海 (map + spot + buoy)

**Files:**
- Modify: `scripts/coastline-spots.json`, `src/data/spots/maps/index.js`, `src/data/spots/index.js`, `test/data/maps.test.js`, `test/data/spots.test.js`, `test/core/spotChoice.test.js`, `test/worker/index.test.js`
- Create (generated): `src/data/spots/maps/penghu-north.json`
- Create: `src/data/spots/penghu-north.json`

**Interfaces:**
- Consumes: `scripts/coastline.mjs` (unchanged; usage `node scripts/coastline.mjs <spotId>`).
- Produces: `MAPS['penghu-north'] = { bbox: [[23.69, 119.52], [23.80, 119.72]], land: string[] }`; `SPOTS['penghu-north']`; `SPOT_LIST` ids `['xiaoliuqiu', 'kenting', 'qixing', 'northeast', 'ludao', 'lanyu', 'penghu-north']`. Task 2 appends `penghu-south` after `penghu-north`.

- [ ] **Step 1: Write the failing tests**

In `test/data/maps.test.js`, append:

```js
test('澎湖北海 has land (吉貝, 目斗嶼, 姑婆嶼, 險礁 and the islets around them)', () => {
  expect(MAPS['penghu-north'].land.length).toBeGreaterThan(0);
  expect(MAPS['penghu-north'].bbox).toEqual([[23.69, 119.52], [23.80, 119.72]]);
});
```

In `test/data/spots.test.js`:

1. In the test `墾丁 has 西岸 / 南灣 / 東岸`, change the last line to:

```js
  expect(SPOT_LIST.map((s) => s.id)).toEqual(['xiaoliuqiu', 'kenting', 'qixing', 'northeast', 'ludao', 'lanyu', 'penghu-north']);
```

2. In the test `Taiwan spots name their 氣象署 coastal area`, add one row after `['lanyu', '蘭嶼鄉_南方沿海'],`:

```js
    ['penghu-north', '白沙鄉沿海'],
```

3. In the test `Taiwan spots name their 氣象署 buoy`, add one row after `['lanyu', 'C6S94', '蘭嶼浮標'],`:

```js
    ['penghu-north', '46735A', '澎湖浮標'],
```

4. Append:

```js
test('澎湖北海 has 吉貝 / 目斗嶼 / 姑婆嶼 / 險礁, no river effect and a 東北季風 notice', () => {
  const p = SPOTS['penghu-north'];
  expect(p.name).toBe('澎湖北海');
  expect(p.zones.map((z) => z.id)).toEqual(['jibei', 'mudou', 'gupo', 'xianjiao']);
  expect(p.zones.map((z) => z.name)).toEqual(['吉貝', '目斗嶼', '姑婆嶼', '險礁']);
  expect(p.zones.every((z) => z.riverImpact === 0)).toBe(true);
  expect(p.notice).toContain('東北季風');
});
```

In `test/core/spotChoice.test.js`, append:

```js
test('real data: in the water off 吉貝 → penghu-north', () => {
  expect(nearbySpotId([23.7265, 119.6001], SPOT_LIST)).toBe('penghu-north');
});
```

In `test/worker/index.test.js`, in the test `refreshBuoys asks once for every buoy and keeps 4 days per buoy`, change

```js
  expect(urls[0]).toContain('StationID=46714D,46759A,46694A,C6S94&');
```

to

```js
  expect(urls[0]).toContain('StationID=46714D,46759A,46694A,C6S94,46735A&');
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/data/maps.test.js test/data/spots.test.js test/core/spotChoice.test.js test/worker/index.test.js`
Expected: FAIL — `Cannot read properties of undefined (reading 'land')`, the list has 6 ids, `SPOTS['penghu-north']` is undefined, `nearbySpotId` returns `null`, the buoy URL has no `46735A`.

- [ ] **Step 3: Add the map box**

Replace `scripts/coastline-spots.json` with (the 6 existing lines unchanged, one line added):

```json
{
  "xiaoliuqiu": { "bbox": [[22.31, 120.335], [22.37, 120.405]] },
  "kenting": { "bbox": [[21.89, 120.68], [22.02, 120.87]], "close": [[22.2, 120.9], [22.2, 120.65]] },
  "qixing": { "bbox": [[21.745, 120.805], [21.773, 120.845]], "note": "鵝鑾鼻在北邊約 16 公里" },
  "northeast": { "bbox": [[25.08, 121.88], [25.145, 121.98]], "close": [[25.10, 121.85], [25.05, 121.85]] },
  "ludao": { "bbox": [[22.625, 121.455], [22.695, 121.53]] },
  "lanyu": { "bbox": [[21.99, 121.48], [22.10, 121.645]] },
  "penghu-north": { "bbox": [[23.69, 119.52], [23.80, 119.72]] }
}
```

Why this box: it holds all 4 zone points with room around them; it reaches 119.72 east so 目斗嶼 (119.6007) sits left of the middle line (119.62), out of the top-right current badge; its south edge 23.69 stays clear of 白沙島, so every coastline inside is a closed ring (dry run: 18 shapes, no open coastline) and no `close` points are needed.

- [ ] **Step 4: Generate the map (needs internet)**

```bash
node scripts/coastline.mjs penghu-north
```

Expected output (numbers may differ a little): `penghu-north: N land shape(s), M characters` with N ≥ 10 (dry run on 2026-10-06: 18 shapes, 2 512 characters) and **no** `skipped an open coastline` warning. The file must stay under 20 000 characters. Run `git status`: only `src/data/spots/maps/penghu-north.json` is new; no other map file changed.

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
import penghuNorth from './penghu-north.json';

export const MAPS = { xiaoliuqiu, kenting, qixing, northeast, ludao, lanyu, 'penghu-north': penghuNorth };
```

- [ ] **Step 6: Add the spot**

Create `src/data/spots/penghu-north.json` (use these values exactly):

```json
{
  "id": "penghu-north",
  "name": "澎湖北海",
  "cwaArea": "白沙鄉沿海",
  "buoy": { "id": "46735A", "name": "澎湖浮標" },
  "center": [23.74, 119.59],
  "locateMaxKm": 10,
  "notice": "東北季風季（約 10 月到隔年 3 月）浪很大，很多潛店休息；要搭船去，跟潛店下水",
  "thresholds": { "purple": 20, "green": 12, "yellow": 6 },
  "riverName": "濁水溪",
  "riverBearing": 81,
  "rainPoints": [
    { "name": "二水", "lat": 23.806, "lon": 120.618 },
    { "name": "竹山", "lat": 23.757, "lon": 120.689 },
    { "name": "水里", "lat": 23.812, "lon": 120.853 }
  ],
  "safety": { "currentYellowKn": 0.5, "currentRedKn": 1.0, "waveRedM": 1.5 },
  "zones": [
    { "id": "jibei", "name": "吉貝", "location": [23.7265, 119.6001], "facing": 225,
      "shelter": "open", "bottom": "sand", "riverImpact": 0,
      "satBox": [[23.69, 119.56], [23.73, 119.60]], "fallbackBase": 10 },
    { "id": "mudou", "name": "目斗嶼", "location": [23.7899, 119.6007], "facing": 0,
      "shelter": "open", "bottom": "rock", "riverImpact": 0,
      "satBox": [[23.79, 119.58], [23.83, 119.62]], "fallbackBase": 14 },
    { "id": "gupo", "name": "姑婆嶼", "location": [23.7203, 119.5512], "facing": 270,
      "shelter": "open", "bottom": "rock", "riverImpact": 0,
      "satBox": [[23.70, 119.50], [23.74, 119.54]], "fallbackBase": 12 },
    { "id": "xianjiao", "name": "險礁", "location": [23.7077, 119.6085], "facing": 180,
      "shelter": "open", "bottom": "sand", "riverImpact": 0,
      "satBox": [[23.66, 119.59], [23.70, 119.63]], "fallbackBase": 8 }
  ]
}
```

Where the numbers come from (for the reviewer; do not change them):
- `center` = about the middle of the 4 zone points (it lies in the sea between 吉貝 and 姑婆嶼; Open-Meteo answered there). `locateMaxKm` 10 covers 目斗嶼 (5.6 km away) but not 馬公 (~19 km).
- `riverBearing` 81 = bearing from `center` to the 濁水溪 mouth, 67 km away → `riverImpact` 0 everywhere. `rainPoints` = the 濁水溪 basin; they only feed the (zero-weight) river factor.
- `buoy` `46735A` = 氣象署 澎湖資料浮標, ~1 km NNW of 姑婆嶼, inside this spot.
- `fallbackBase` = the satellite value rounded down (see the Spec note at the top); only used when the satellite has no value.
- `bottom` sand for 吉貝 (沙尾 sand spit) and 險礁 (sandy shallows); rock for the others. `thresholds` and `safety` are the same as the other spots.

Replace `src/data/spots/index.js` with:

```js
import xiaoliuqiu from './xiaoliuqiu.json';
import kenting from './kenting.json';
import qixing from './qixing.json';
import northeast from './northeast.json';
import ludao from './ludao.json';
import lanyu from './lanyu.json';
import penghuNorth from './penghu-north.json';

// Order = order in the spot list when there is no GPS.
export const SPOT_LIST = [xiaoliuqiu, kenting, qixing, northeast, ludao, lanyu, penghuNorth];
export const SPOTS = Object.fromEntries(SPOT_LIST.map((s) => [s.id, s]));
export const DEFAULT_SPOT_ID = xiaoliuqiu.id;
```

- [ ] **Step 7: Run the tests**

Run: `npm test`
Expected: all pass (237). This includes the existing `every spot has a map box that holds all its zones, and valid land paths` and `every spot has the fields the code needs`.

- [ ] **Step 8: Build**

Run: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 9: Commit**

```bash
git add scripts/coastline-spots.json src/data/spots/maps/penghu-north.json src/data/spots/maps/index.js src/data/spots/penghu-north.json src/data/spots/index.js test/data/maps.test.js test/data/spots.test.js test/core/spotChoice.test.js test/worker/index.test.js
git commit -m "feat(data): 澎湖北海 spot with 吉貝, 目斗嶼, 姑婆嶼 and 險礁, its sea map and buoy 46735A"
```

---

### Task 2: 澎湖南方四島 (map + spot + buoy)

**Files:**
- Modify: `scripts/coastline-spots.json`, `src/data/spots/maps/index.js`, `src/data/spots/index.js`, `test/data/maps.test.js`, `test/data/spots.test.js`, `test/core/spotChoice.test.js`, `test/worker/index.test.js`
- Create (generated): `src/data/spots/maps/penghu-south.json`
- Create: `src/data/spots/penghu-south.json`

**Interfaces:**
- Consumes: Task 1's `SPOT_LIST` ending in `penghuNorth`, `MAPS['penghu-north']`, and the Task 1 rows in the coastal-area, buoy and buoy-URL tests.
- Produces: `MAPS['penghu-south'] = { bbox: [[23.21, 119.47], [23.33, 119.72]], land: string[] }`; `SPOTS['penghu-south']`; `SPOT_LIST` ids `['xiaoliuqiu', 'kenting', 'qixing', 'northeast', 'ludao', 'lanyu', 'penghu-north', 'penghu-south']`. The Worker's `refreshBuoys` now asks for `StationID=46714D,46759A,46694A,C6S94,46735A,C6W10` (`worker/src/index.js` builds this from `SPOTS`, unchanged).

- [ ] **Step 1: Write the failing tests**

In `test/data/maps.test.js`, append:

```js
test('澎湖南方四島 has land (東吉, 西吉, 東西嶼坪 and the islets around them)', () => {
  expect(MAPS['penghu-south'].land.length).toBeGreaterThan(0);
  expect(MAPS['penghu-south'].bbox).toEqual([[23.21, 119.47], [23.33, 119.72]]);
});
```

In `test/data/spots.test.js`:

1. In the test `墾丁 has 西岸 / 南灣 / 東岸`, change the last line to:

```js
  expect(SPOT_LIST.map((s) => s.id)).toEqual(['xiaoliuqiu', 'kenting', 'qixing', 'northeast', 'ludao', 'lanyu', 'penghu-north', 'penghu-south']);
```

2. In the test `Taiwan spots name their 氣象署 coastal area`, add one row after `['penghu-north', '白沙鄉沿海'],`:

```js
    ['penghu-south', '望安鄉_東吉島_南方沿海'],
```

3. In the test `Taiwan spots name their 氣象署 buoy`, add one row after `['penghu-north', '46735A', '澎湖浮標'],`:

```js
    ['penghu-south', 'C6W10', '七美浮標'],
```

4. Append:

```js
test('澎湖南方四島 has 東吉 / 西吉 / 東西嶼坪, no river effect and a boat-only notice', () => {
  const p = SPOTS['penghu-south'];
  expect(p.name).toBe('澎湖南方四島');
  expect(p.zones.map((z) => z.id)).toEqual(['dongji', 'xiji', 'yuping']);
  expect(p.zones.map((z) => z.name)).toEqual(['東吉', '西吉', '東西嶼坪']);
  expect(p.zones.every((z) => z.riverImpact === 0)).toBe(true);
  expect(p.notice).toContain('搭船');
  expect(p.notice).toContain('東北季風');
});
```

In `test/core/spotChoice.test.js`, append:

```js
test('real data: in the water off 東吉 → penghu-south', () => {
  expect(nearbySpotId([23.2610, 119.6813], SPOT_LIST)).toBe('penghu-south');
});

test('real data: in 馬公 (between the two 澎湖 spots) → no spot', () => {
  expect(nearbySpotId([23.566, 119.566], SPOT_LIST)).toBe(null);
});
```

In `test/worker/index.test.js`, in the test `refreshBuoys asks once for every buoy and keeps 4 days per buoy`, change

```js
  expect(urls[0]).toContain('StationID=46714D,46759A,46694A,C6S94,46735A&');
```

to

```js
  expect(urls[0]).toContain('StationID=46714D,46759A,46694A,C6S94,46735A,C6W10&');
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/data/maps.test.js test/data/spots.test.js test/core/spotChoice.test.js test/worker/index.test.js`
Expected: FAIL — `MAPS['penghu-south']` undefined, the list has 7 ids, `SPOTS['penghu-south']` undefined, `nearbySpotId` returns `null` for 東吉, the buoy URL has no `C6W10`. (The 馬公 test already passes; that is fine — it guards against a later `locateMaxKm` change.)

- [ ] **Step 3: Add the map box**

Replace `scripts/coastline-spots.json` with (the 7 existing lines unchanged, one line added):

```json
{
  "xiaoliuqiu": { "bbox": [[22.31, 120.335], [22.37, 120.405]] },
  "kenting": { "bbox": [[21.89, 120.68], [22.02, 120.87]], "close": [[22.2, 120.9], [22.2, 120.65]] },
  "qixing": { "bbox": [[21.745, 120.805], [21.773, 120.845]], "note": "鵝鑾鼻在北邊約 16 公里" },
  "northeast": { "bbox": [[25.08, 121.88], [25.145, 121.98]], "close": [[25.10, 121.85], [25.05, 121.85]] },
  "ludao": { "bbox": [[22.625, 121.455], [22.695, 121.53]] },
  "lanyu": { "bbox": [[21.99, 121.48], [22.10, 121.645]] },
  "penghu-north": { "bbox": [[23.69, 119.52], [23.80, 119.72]] },
  "penghu-south": { "bbox": [[23.21, 119.47], [23.33, 119.72]] }
}
```

Why this box: it holds all 3 zone points; its north edge 23.33 puts the middle line at 23.27 so the 東吉 dot (23.261, far east) sits below it, out of the top-right current badge; 望安島 (north) and 七美嶼 (south-west) stay outside, so every coastline inside is a closed ring (dry run: 10 shapes, no open coastline) and no `close` points are needed.

- [ ] **Step 4: Generate the map (needs internet)**

```bash
node scripts/coastline.mjs penghu-south
```

Expected output (numbers may differ a little): `penghu-south: N land shape(s), M characters` with N ≥ 5 (dry run on 2026-10-06: 10 shapes, 1 749 characters) and **no** `skipped an open coastline` warning. The file must stay under 20 000 characters. Run `git status`: only `src/data/spots/maps/penghu-south.json` is new among the map files.

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
import penghuNorth from './penghu-north.json';
import penghuSouth from './penghu-south.json';

export const MAPS = {
  xiaoliuqiu, kenting, qixing, northeast, ludao, lanyu,
  'penghu-north': penghuNorth, 'penghu-south': penghuSouth,
};
```

- [ ] **Step 6: Add the spot**

Create `src/data/spots/penghu-south.json` (use these values exactly):

```json
{
  "id": "penghu-south",
  "name": "澎湖南方四島",
  "cwaArea": "望安鄉_東吉島_南方沿海",
  "buoy": { "id": "C6W10", "name": "七美浮標" },
  "center": [23.26, 119.60],
  "locateMaxKm": 12,
  "notice": "國家公園海域，只能搭船去；東北季風季（約 10 月到隔年 3 月）浪很大，要跟潛店下水",
  "thresholds": { "purple": 20, "green": 12, "yellow": 6 },
  "riverName": "濁水溪",
  "riverBearing": 46,
  "rainPoints": [
    { "name": "二水", "lat": 23.806, "lon": 120.618 },
    { "name": "竹山", "lat": 23.757, "lon": 120.689 },
    { "name": "水里", "lat": 23.812, "lon": 120.853 }
  ],
  "safety": { "currentYellowKn": 0.5, "currentRedKn": 1.0, "waveRedM": 1.5 },
  "zones": [
    { "id": "dongji", "name": "東吉", "location": [23.2610, 119.6813], "facing": 90,
      "shelter": "open", "bottom": "rock", "riverImpact": 0,
      "satBox": [[23.24, 119.69], [23.28, 119.73]], "fallbackBase": 20 },
    { "id": "xiji", "name": "西吉", "location": [23.2423, 119.6184], "facing": 180,
      "shelter": "open", "bottom": "rock", "riverImpact": 0,
      "satBox": [[23.20, 119.60], [23.24, 119.64]], "fallbackBase": 20 },
    { "id": "yuping", "name": "東西嶼坪", "location": [23.2698, 119.5015], "facing": 270,
      "shelter": "open", "bottom": "rock", "riverImpact": 0,
      "satBox": [[23.25, 119.45], [23.29, 119.49]], "fallbackBase": 13 }
  ]
}
```

Where the numbers come from (for the reviewer; do not change them):
- `center` = about the middle of the 3 zone points (in the sea between 西吉 and 東西嶼坪; Open-Meteo answered there). `locateMaxKm` 12 covers 東吉 (8.3 km) and 東西嶼坪 (10 km) but not 馬公 (~34 km).
- `riverBearing` 46 = bearing from `center` to the 濁水溪 mouth, 92 km away → `riverImpact` 0 everywhere.
- `buoy` `C6W10` = 氣象署 七美資料浮標, ~7 km south of 東吉嶼 (its name says 七美 but it sits next to 東吉).
- `fallbackBase`: 東吉 22 and 西吉 20 from the satellite, capped at 20; 東西嶼坪 13.
- 東西嶼坪 point is west of 西嶼坪 (one zone for both islands, ~1 km apart).

Replace `src/data/spots/index.js` with:

```js
import xiaoliuqiu from './xiaoliuqiu.json';
import kenting from './kenting.json';
import qixing from './qixing.json';
import northeast from './northeast.json';
import ludao from './ludao.json';
import lanyu from './lanyu.json';
import penghuNorth from './penghu-north.json';
import penghuSouth from './penghu-south.json';

// Order = order in the spot list when there is no GPS.
export const SPOT_LIST = [xiaoliuqiu, kenting, qixing, northeast, ludao, lanyu, penghuNorth, penghuSouth];
export const SPOTS = Object.fromEntries(SPOT_LIST.map((s) => [s.id, s]));
export const DEFAULT_SPOT_ID = xiaoliuqiu.id;
```

- [ ] **Step 7: Run the tests**

Run: `npm test`
Expected: all pass (241).

- [ ] **Step 8: Build**

Run: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 9: Worker dry run**

Run: `cd worker && npx wrangler deploy --dry-run --config wrangler.toml; cd ..`
Expected: builds with no errors and lists `env.CACHE`. (Dry run only — nothing is uploaded.)

- [ ] **Step 10: Commit**

```bash
git add scripts/coastline-spots.json src/data/spots/maps/penghu-south.json src/data/spots/maps/index.js src/data/spots/penghu-south.json src/data/spots/index.js test/data/maps.test.js test/data/spots.test.js test/core/spotChoice.test.js test/worker/index.test.js
git commit -m "feat(data): 澎湖南方四島 spot with 東吉, 西吉 and 東西嶼坪, its sea map and buoy C6W10"
```

---

## After the plan (controller only, not an implementer task)

- Final review of the branch.
- Look at it locally (`npm run dev`) at 360 px wide: pick 澎湖北海, then 澎湖南方四島, from the header. Each map shows the islands, every dot in the sea, no dot or name under the top-right arrow box, and the ⚠️ notice. If a dot sits under the box, move the map box (`scripts/coastline-spots.json`, update the `bbox` in the maps test) and regenerate — do not move the zone.
- Show Michael; ask him to check the `facing` guesses (which side of each island people usually dive). After his OK, merge `feat/penghu` into `main` (fast-forward) and delete the branch.
- Before deploying: confirm the hourly buoy cron still runs (`workersInvocationsScheduled` shows `35 * * * *` runs).
- Deploy only when Michael says 上線, in this order (see README): `cd worker && npx wrangler deploy --config wrangler.toml`; warm up with `curl "https://haidi-helper.mikekuo0725.workers.dev/v1/base?spot=penghu-north"` and `...?spot=penghu-south` (first call can take ~45 s); wait ~30 s and check both answers have `coastal` (33 points), `buoy.readings`, and every zone `source: "sat"`; then `npm run build` and `npx wrangler deploy` from the repo root.
- Update the Obsidian note `專案筆記/2026 海底清不清/工作筆記.md`.
