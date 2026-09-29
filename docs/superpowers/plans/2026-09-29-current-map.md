# 海流地圖 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a small hand-drawn map of the dive spot on the main screen, with zone dots coloured by their light and one big "whole sea flows this way" arrow that follows an hour slider (08–16).

**Architecture:** Coastlines are fetched once from OpenStreetMap (Overpass API) by a Node script and saved as pre-projected SVG path strings in `src/data/spots/maps/<id>.json` (NOT in the spot JSON, which the Worker also imports). `buildForecast` adds a per-hour `currents` list from the weather data we already have. A new `src/ui/seaMap.js` renders the map; `renderMain` shows it in place of the old "🌀 海流" cell; `main.js` moves the arrow in place when the slider moves (no full re-render).

**Tech Stack:** JavaScript ES modules (no framework), Vite 8, Vitest 5, inline SVG, Node 24 `fetch` for the one-off script.

**Spec:** `docs/superpowers/specs/2026-09-29-current-map-design.md`. Read it before starting.

## Global Constraints

- Repo root: `D:\Users\michael0725\Desktop\2026 海底清不清`. Paths below are relative to it. Run commands from the repo root in Git Bash.
- Branch: `feat/current-map`, created from `main` in Task 1. Do not push. Do not merge.
- Commit messages end with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- All user-facing text is Traditional Chinese (繁體中文).
- Phone first: works at 320–480 px with no sideways scroll; tap targets ≥ 44 px; muted text via color (not opacity). Computers: map at most 480 px wide, centered.
- Code in `src/` must not mention 小琉球, 墾丁, 七星岩, a spot id or a zone id (tests and data files may).
- One arrow for the whole spot. Never draw per-zone arrows (Open-Meteo current is a ~10 km grid).
- Slider hours = the forecast hours, which are 08..16 (9 hours, see `parseDay` in `src/services/openmeteo.js`). Do not change `parseDay`.
- Map dots use the attribute `data-mapzone`, never `data-zone` (tests count cards by `data-zone`).
- Deploy is NOT part of any task. Never run `wrangler deploy` or `wrangler pages deploy`.
- Full test suite must stay green: `npm test` (141 tests before this plan).

## File Structure

```
src/core/mapProject.js              NEW  MAP_W, mapHeight(bbox), project(bbox, [lat, lon])
scripts/coastline-lib.js            NEW  pure: chainWays, closeRing, toPath
scripts/coastline-spots.json        NEW  per-spot map box, optional close points, optional note
scripts/coastline.mjs               NEW  fetches Overpass, writes src/data/spots/maps/<id>.json
src/data/spots/maps/*.json          NEW  generated: { bbox, land: [path...], note? }
src/data/spots/maps/index.js        NEW  MAPS = { id: map }
src/core/forecast.js                MOD  + currents: [{ hour, kn, toDeg, level }]
src/ui/format.js                    MOD  + currentSummary(safety)
src/ui/seaMap.js                    NEW  renderSeaMap, currentBadge, defaultHourIndex, updateSeaMap
src/ui/mainView.js                  MOD  map + mapHour params; old 🌀 cell only when no map
src/styles.css                      MOD  .cmap*
src/main.js                         MOD  state.mapHour, slider input, map dot click
README.md                           MOD  加潛點: run the coastline script
test/core/mapProject.test.js        NEW
test/scripts/coastline-lib.test.js  NEW
test/core/forecastCurrents.test.js  NEW
test/data/maps.test.js              NEW
test/ui/seaMap.test.js              NEW
test/ui/format.test.js              MOD
test/ui/mainView.test.js            MOD
```

---

### Task 1: Map geometry helpers (projection + coastline tools)

**Files:**
- Create: `src/core/mapProject.js`, `scripts/coastline-lib.js`
- Test: `test/core/mapProject.test.js`, `test/scripts/coastline-lib.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `MAP_W = 300`
  - `mapHeight(bbox: [[south, west], [north, east]]) → number`
  - `project(bbox, [lat, lon]) → [x, y]` (x east, y south; the box's north-west corner is `[0, 0]`)
  - `chainWays(ways: Array<Array<[lat, lon]>>) → Array<Array<[lat, lon]>>`
  - `closeRing(chain, close?: Array<[lat, lon]>) → Array<[lat, lon]> | null`
  - `toPath(bbox, ring, minStepPx = 1.5) → string | null` (`"M12.3,4.5 L…Z"`, one decimal; `null` if fewer than 3 points remain)

- [ ] **Step 1: Create the branch**

```bash
git switch -c feat/current-map main
```

- [ ] **Step 2: Write the failing tests**

`test/core/mapProject.test.js`:

```js
import { test, expect } from 'vitest';
import { MAP_W, mapHeight, project } from '../../src/core/mapProject.js';

const box = [[22.31, 120.335], [22.37, 120.405]];

test('the north-west corner is 0,0 and the south-east corner is width,height', () => {
  expect(project(box, [22.37, 120.335])).toEqual([0, 0]);
  const [x, y] = project(box, [22.31, 120.405]);
  expect(x).toBeCloseTo(MAP_W, 6);
  expect(y).toBeCloseTo(mapHeight(box), 6);
});

test('height keeps real proportions (east-west km shrink with latitude)', () => {
  expect(MAP_W).toBe(300);
  expect(mapHeight(box)).toBeCloseTo(278.0, 0);
});

test('east is right, south is down', () => {
  const [x1, y1] = project(box, [22.34, 120.36]);
  const [x2, y2] = project(box, [22.33, 120.38]);
  expect(x2).toBeGreaterThan(x1);
  expect(y2).toBeGreaterThan(y1);
});
```

`test/scripts/coastline-lib.test.js`:

```js
import { test, expect } from 'vitest';
import { chainWays, closeRing, toPath } from '../../scripts/coastline-lib.js';

const A = [0, 0]; const B = [0, 1]; const C = [1, 1]; const D = [1, 0];

test('chainWays joins ways that share an end, in either order', () => {
  expect(chainWays([[A, B], [B, C], [C, D]])).toEqual([[A, B, C, D]]);
  expect(chainWays([[B, C], [A, B]])).toEqual([[A, B, C]]);
});

test('chainWays keeps separate islands separate', () => {
  const island = [[5, 5], [5, 6], [6, 6], [5, 5]];
  expect(chainWays([[A, B], island])).toEqual([[A, B], island]);
});

test('closeRing keeps a closed ring as it is', () => {
  const ring = [A, B, C, A];
  expect(closeRing(ring)).toBe(ring);
});

test('closeRing returns null for an open line with no close points', () => {
  expect(closeRing([A, B, C])).toBeNull();
  expect(closeRing([A, B, C], [])).toBeNull();
});

test('closeRing walks the close points starting from the one nearest the line end', () => {
  const far1 = [9, 1]; const far0 = [9, 0];
  expect(closeRing([A, B, C], [far1, far0])).toEqual([A, B, C, far1, far0, A]);
  expect(closeRing([A, B, C], [far0, far1])).toEqual([A, B, C, far1, far0, A]);
});

test('toPath projects, drops points closer than the step, one decimal, closed', () => {
  const box = [[22.31, 120.335], [22.37, 120.405]];
  const ring = [[22.37, 120.335], [22.37, 120.3350001], [22.34, 120.37], [22.31, 120.405], [22.37, 120.335]];
  const d = toPath(box, ring);
  expect(d.startsWith('M0.0,0.0 L')).toBe(true);
  expect(d.endsWith('Z')).toBe(true);
  expect(d.split(' L')).toHaveLength(4); // the near-duplicate second point is gone
  expect(d).toMatch(/^M-?\d+\.\d,-?\d+\.\d( L-?\d+\.\d,-?\d+\.\d)+Z$/);
});

test('toPath returns null for a speck smaller than 3 points', () => {
  const box = [[22.31, 120.335], [22.37, 120.405]];
  expect(toPath(box, [[22.34, 120.37], [22.34, 120.3700001], [22.34, 120.37]])).toBeNull();
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run test/core/mapProject.test.js test/scripts/coastline-lib.test.js`
Expected: FAIL (cannot find module).

- [ ] **Step 4: Write the implementation**

`src/core/mapProject.js`:

```js
// Flat projection for small maps (a few km across): x grows east, y grows south.
// The width is fixed; the height follows the box so the island keeps its real shape.
export const MAP_W = 300;

const cosMid = ([[s], [n]]) => Math.cos((((s + n) / 2) * Math.PI) / 180);
const scale = (bbox) => MAP_W / ((bbox[1][1] - bbox[0][1]) * cosMid(bbox));

export const mapHeight = (bbox) => (bbox[1][0] - bbox[0][0]) * scale(bbox);

export function project(bbox, [lat, lon]) {
  const k = scale(bbox);
  return [(lon - bbox[0][1]) * cosMid(bbox) * k, (bbox[1][0] - lat) * k];
}
```

`scripts/coastline-lib.js`:

```js
import { project } from '../src/core/mapProject.js';

const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

// OpenStreetMap splits one coastline into many ways; join the ones that share an end point.
export function chainWays(ways) {
  const rest = ways.map((w) => [...w]);
  const chains = [];
  while (rest.length) {
    let c = rest.shift();
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < rest.length; i++) {
        const w = rest[i];
        if (same(w[0], c[c.length - 1])) { c = c.concat(w.slice(1)); rest.splice(i, 1); grew = true; break; }
        if (same(w[w.length - 1], c[0])) { c = w.concat(c.slice(1)); rest.splice(i, 1); grew = true; break; }
      }
    }
    chains.push(c);
  }
  return chains;
}

// A coastline that leaves the map box (a peninsula) is an open line. Close it through
// points outside the box on the land side, so it fills as land; the map crops the rest.
export function closeRing(chain, close) {
  if (same(chain[0], chain[chain.length - 1])) return chain;
  if (!close?.length) return null;
  const last = chain[chain.length - 1];
  const via = d2(last, close[0]) <= d2(last, close[close.length - 1]) ? close : [...close].reverse();
  return [...chain, ...via, chain[0]];
}

export function toPath(bbox, ring, minStepPx = 1.5) {
  const pts = [];
  for (const p of ring) {
    const xy = project(bbox, p);
    const prev = pts[pts.length - 1];
    if (!prev || Math.hypot(xy[0] - prev[0], xy[1] - prev[1]) >= minStepPx) pts.push(xy);
  }
  if (pts.length < 3) return null;
  return `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')}Z`;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/core/mapProject.test.js test/scripts/coastline-lib.test.js`
Expected: PASS (10 tests).

- [ ] **Step 6: Commit**

```bash
git add src/core/mapProject.js scripts/coastline-lib.js test/core/mapProject.test.js test/scripts/coastline-lib.test.js
git commit -m "feat(map): flat map projection and coastline-to-SVG helpers"
```

---

### Task 2: Hourly currents in the forecast

**Files:**
- Modify: `src/core/forecast.js`
- Test: `test/core/forecastCurrents.test.js`

**Interfaces:**
- Consumes: `currentLevel(kn, safety)` from `src/core/safety.js`, `kmhToKnots` from `src/core/math.js`.
- Produces: `buildForecast(...)` result gains `currents: Array<{ hour: number, kn: number, toDeg: number, level: 'green'|'yellow'|'red' }>`, one per `day.hours` entry, same order.

- [ ] **Step 1: Write the failing test**

`test/core/forecastCurrents.test.js`:

```js
import { test, expect } from 'vitest';
import { buildForecast } from '../../src/core/forecast.js';
import { SPOTS } from '../../src/data/spots/index.js';
import { makeDay } from '../helpers/makeDay.js';

const spot = SPOTS.xiaoliuqiu; // current yellow ≥ 0.5 kn, red ≥ 1.0 kn
const NOW = Date.UTC(2024, 0, 18, 4, 0);
const build = (hour) => buildForecast({ spot, day: makeDay({ date: '2024-01-18', hour }), stale: null, helper: null, reports: [], now: NOW, isToday: true });

test('one current per forecast hour, 08 to 16', () => {
  expect(build({}).currents.map((c) => c.hour)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16]);
});

test('current is in knots, keeps the flow-to direction and gets the spot light', () => {
  expect(build({ currentKmh: 1.852, currentDir: 225 }).currents[0]).toEqual({ hour: 8, kn: 1, toDeg: 225, level: 'red' });
  expect(build({ currentKmh: 1.2, currentDir: 90 }).currents[0].level).toBe('yellow');
  expect(build({ currentKmh: 0.5, currentDir: 90 }).currents[0].level).toBe('green');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/core/forecastCurrents.test.js`
Expected: FAIL (`currents` is undefined).

- [ ] **Step 3: Implement**

In `src/core/forecast.js` change the safety import and add a math import:

```js
import { assessSafety, daytimeSst, currentLevel } from './safety.js';
import { kmhToKnots } from './math.js';
```

and in the returned object, after `sst: daytimeSst(day),` add:

```js
    // For the sea map's hour slider: the whole-sea current, hour by hour.
    currents: day.hours.map((h) => {
      const kn = kmhToKnots(h.currentKmh);
      return { hour: h.hour, kn, toDeg: h.currentDir, level: currentLevel(kn, spot.safety) };
    }),
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all pass (141 + 10 + 2 = 153).

- [ ] **Step 5: Commit**

```bash
git add src/core/forecast.js test/core/forecastCurrents.test.js
git commit -m "feat(forecast): hourly whole-sea currents for the map slider"
```

---

### Task 3: Coastline data for the 3 spots

**Files:**
- Create: `scripts/coastline-spots.json`, `scripts/coastline.mjs`, `src/data/spots/maps/xiaoliuqiu.json`, `src/data/spots/maps/kenting.json`, `src/data/spots/maps/qixing.json` (the 3 JSON files are generated), `src/data/spots/maps/index.js`
- Modify: `README.md`
- Test: `test/data/maps.test.js`

**Interfaces:**
- Consumes: `chainWays`, `closeRing`, `toPath` (Task 1).
- Produces: `MAPS` from `src/data/spots/maps/index.js`: `{ [spotId]: { bbox: [[s, w], [n, e]], land: string[], note?: string } }`.

- [ ] **Step 1: Write the failing data test**

`test/data/maps.test.js`:

```js
import { test, expect } from 'vitest';
import { SPOT_LIST } from '../../src/data/spots/index.js';
import { MAPS } from '../../src/data/spots/maps/index.js';

const PATH = /^M-?\d+\.\d,-?\d+\.\d( L-?\d+\.\d,-?\d+\.\d)+Z$/;

test('every spot has a map box that holds all its zones, and valid land paths', () => {
  for (const s of SPOT_LIST) {
    const m = MAPS[s.id];
    expect(m, s.id).toBeDefined();
    const [[south, west], [north, east]] = m.bbox;
    expect(south).toBeLessThan(north);
    expect(west).toBeLessThan(east);
    for (const z of s.zones) {
      expect(z.location[0], `${s.id}/${z.id}`).toBeGreaterThan(south);
      expect(z.location[0], `${s.id}/${z.id}`).toBeLessThan(north);
      expect(z.location[1], `${s.id}/${z.id}`).toBeGreaterThan(west);
      expect(z.location[1], `${s.id}/${z.id}`).toBeLessThan(east);
    }
    expect(Array.isArray(m.land)).toBe(true);
    for (const d of m.land) expect(d).toMatch(PATH);
  }
});

test('小琉球 and 墾丁 have land; 七星岩 says where 鵝鑾鼻 is', () => {
  expect(MAPS.xiaoliuqiu.land.length).toBeGreaterThan(0);
  expect(MAPS.kenting.land.length).toBeGreaterThan(0);
  expect(MAPS.qixing.note).toBe('鵝鑾鼻在北邊約 16 公里');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/data/maps.test.js`
Expected: FAIL (cannot find module `maps/index.js`).

- [ ] **Step 3: Write the config and the script**

`scripts/coastline-spots.json` (use these numbers exactly; they were checked against the zone locations on 2026-09-29):

```json
{
  "xiaoliuqiu": { "bbox": [[22.31, 120.335], [22.37, 120.405]] },
  "kenting": { "bbox": [[21.89, 120.68], [22.02, 120.87]], "close": [[22.2, 120.9], [22.2, 120.65]] },
  "qixing": { "bbox": [[21.745, 120.805], [21.773, 120.845]], "note": "鵝鑾鼻在北邊約 16 公里" }
}
```

`scripts/coastline.mjs`:

```js
// Fetch coastlines from OpenStreetMap once and save them as SVG paths for the sea map.
// Usage: node scripts/coastline.mjs [spotId ...]   (no ids = every spot in coastline-spots.json)
// Map data © OpenStreetMap contributors (ODbL).
import { readFileSync, writeFileSync } from 'node:fs';
import { chainWays, closeRing, toPath } from './coastline-lib.js';

const CONFIG = JSON.parse(readFileSync(new URL('./coastline-spots.json', import.meta.url), 'utf8'));
const OUT = new URL('../src/data/spots/maps/', import.meta.url);
const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Overpass answers with an HTML error page when busy, and with 406 without these headers.
async function fetchCoast([[s, w], [n, e]]) {
  const query = `[out:json][timeout:90];way["natural"="coastline"](${s},${w},${n},${e});out geom;`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const url = MIRRORS[attempt % MIRRORS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': 'haidi-qingbuqing-coastline/1.0', Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      });
      const text = await res.text();
      if (res.ok && text.startsWith('{')) return JSON.parse(text).elements;
      console.warn(`${url}: HTTP ${res.status}, not JSON; retrying`);
    } catch (err) {
      console.warn(`${url}: ${err.message}; retrying`);
    }
    await sleep(15000);
  }
  throw new Error('Overpass is busy; try again later');
}

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CONFIG);
for (const id of ids) {
  const cfg = CONFIG[id];
  if (!cfg) throw new Error(`no entry for "${id}" in scripts/coastline-spots.json`);
  const elements = await fetchCoast(cfg.bbox);
  const ways = elements.filter((el) => el.type === 'way' && el.geometry).map((el) => el.geometry.map((p) => [p.lat, p.lon]));
  const land = [];
  for (const chain of chainWays(ways)) {
    const ring = closeRing(chain, cfg.close);
    if (!ring) { console.warn(`${id}: skipped an open coastline (${chain.length} points); add "close" points`); continue; }
    const d = toPath(cfg.bbox, ring);
    if (d) land.push(d);
  }
  const out = { bbox: cfg.bbox, land, ...(cfg.note ? { note: cfg.note } : {}) };
  writeFileSync(new URL(`${id}.json`, OUT), `${JSON.stringify(out, null, 2)}\n`);
  console.log(`${id}: ${land.length} land shape(s), ${land.join('').length} characters`);
  await sleep(5000); // be polite to the free Overpass servers
}
```

- [ ] **Step 4: Run the script (needs internet)**

```bash
mkdir -p src/data/spots/maps
node scripts/coastline.mjs
```

Expected output (numbers may differ a little):
```
xiaoliuqiu: 1 land shape(s), ~2000–4000 characters
kenting: 1 or more land shape(s), ...
qixing: 0 or more land shape(s), ...
```
- `xiaoliuqiu` must have ≥ 1 shape and no "skipped" warning (the island is a closed ring).
- `kenting` must have ≥ 1 shape (the peninsula, closed through the 2 `close` points).
- `qixing` with 0 shapes is fine (the rocks may not be in OpenStreetMap).
- If it throws "Overpass is busy", wait 5 minutes and run it again. Do not hand-write coastline data.
- Each file must stay under 20 000 characters; if bigger, rerun with a bigger step by changing `toPath(cfg.bbox, ring)` to `toPath(cfg.bbox, ring, 2.5)` and report it.

- [ ] **Step 5: Add the index**

`src/data/spots/maps/index.js`:

```js
// Sea map shapes, made by `node scripts/coastline.mjs`. Kept out of the spot JSON on purpose:
// the Worker imports the spot list and does not need them.
import xiaoliuqiu from './xiaoliuqiu.json';
import kenting from './kenting.json';
import qixing from './qixing.json';

export const MAPS = { xiaoliuqiu, kenting, qixing };
```

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: all pass (155).

- [ ] **Step 7: README**

In `README.md`, in the `加潛點` bullet, after the sentence ending `(順序 = 沒 GPS 時清單的順序)。`, insert:

```
再在 `scripts/coastline-spots.json` 加這個潛點的地圖範圍(要包住所有分區點;半島要加 `close` 兩個陸地那側、範圍外的點),跑 `node scripts/coastline.mjs <新潛點id>` 產生 `src/data/spots/maps/<id>.json`,加進 `src/data/spots/maps/index.js`。沒做的話主畫面會顯示舊的海流文字,不會壞。
```

- [ ] **Step 8: Commit**

```bash
git add scripts/coastline-spots.json scripts/coastline.mjs src/data/spots/maps test/data/maps.test.js README.md
git commit -m "feat(data): OpenStreetMap coastlines for the 3 spots' sea maps"
```

---

### Task 4: The sea map view

**Files:**
- Create: `src/ui/seaMap.js`
- Modify: `src/ui/format.js`
- Test: `test/ui/seaMap.test.js`, `test/ui/format.test.js`

**Interfaces:**
- Consumes: `MAP_W`, `mapHeight`, `project` (Task 1); `forecast.currents` (Task 2); `MAPS` (Task 3, tests only); `LIGHT`, `knots`, `arrow`, `esc`, `SAFETY_TEXT` from `format.js`; `bearingText`, `clamp` from `src/core/math.js`.
- Produces:
  - `currentSummary(safety) → string` in `format.js`, e.g. `"0.81 節 → 往東南 🟡 注意"`
  - `defaultHourIndex(forecast) → number` (index in `forecast.currents` of `forecast.best.start`, or 0)
  - `currentBadge(c) → string` (HTML of the top-right box)
  - `renderSeaMap({ spot, map, forecast, hourIndex = null }) → string`
  - `updateSeaMap(root: Element, c) → void` (DOM only; swaps the badge, the time text and the slider's `aria-valuetext`)

- [ ] **Step 1: Write the failing tests**

Append to `test/ui/format.test.js` (add `currentSummary` to its existing import from `'../../src/ui/format.js'`):

```js
test('currentSummary is the strongest-current line', () => {
  const s = { currentKn: 0.8123, currentToDeg: 135, currentLevel: 'yellow' };
  expect(currentSummary(s)).toBe('0.81 節 → 往東南 🟡 注意');
});
```

`test/ui/seaMap.test.js`:

```js
import { test, expect } from 'vitest';
import { renderSeaMap, currentBadge, defaultHourIndex } from '../../src/ui/seaMap.js';
import { LIGHT } from '../../src/ui/format.js';
import { buildForecast } from '../../src/core/forecast.js';
import { SPOTS } from '../../src/data/spots/index.js';
import { MAPS } from '../../src/data/spots/maps/index.js';
import { makeDay } from '../helpers/makeDay.js';

const spot = SPOTS.xiaoliuqiu;
const map = MAPS.xiaoliuqiu;
const NOW = Date.UTC(2024, 0, 18, 4, 0);
const make = (stale = null) => buildForecast({ spot, day: makeDay({ date: '2024-01-18' }), stale, helper: null, reports: [], now: NOW, isToday: true });
const forecast = make();

test('one dot per zone, in spot order, coloured by that zone light', () => {
  const html = renderSeaMap({ spot, map, forecast });
  expect([...html.matchAll(/data-mapzone="(\w+)"/g)].map((m) => m[1])).toEqual(spot.zones.map((z) => z.id));
  for (const z of forecast.zones) {
    expect(html).toMatch(new RegExp(`data-mapzone="${z.zoneId}"><circle [^>]*class="${LIGHT[z.light].cls}"`));
  }
  expect(html).not.toContain('data-zone=');
});

test('old weather makes every dot gray', () => {
  const html = renderSeaMap({ spot, map, forecast: make(3) });
  expect([...html.matchAll(/<circle [^>]*class="(\w+)"/g)].map((m) => m[1])).toEqual(spot.zones.map(() => 'gy'));
});

test('draws every land shape and the note', () => {
  const html = renderSeaMap({ spot, map, forecast });
  expect(html.match(/class="cmap-land"/g)).toHaveLength(map.land.length);
  expect(renderSeaMap({ spot: SPOTS.qixing, map: MAPS.qixing, forecast })).toContain('鵝鑾鼻在北邊約 16 公里');
});

test('the slider starts at the best dive hour', () => {
  const i = defaultHourIndex(forecast);
  expect(forecast.currents[i].hour).toBe(forecast.best.start);
  const html = renderSeaMap({ spot, map, forecast });
  expect(html).toContain(`type="range" min="0" max="8" step="1" value="${i}"`);
  expect(html).toContain(`<span class="cmap-time">${String(forecast.best.start).padStart(2, '0')}:00</span>`);
});

test('a chosen hour is kept, and clamped to the day', () => {
  expect(renderSeaMap({ spot, map, forecast, hourIndex: 2 })).toContain('value="2"');
  expect(renderSeaMap({ spot, map, forecast, hourIndex: 99 })).toContain('value="8"');
});

test('the badge turns the arrow to where the water flows, coloured by strength', () => {
  const b = currentBadge({ hour: 10, kn: 0.16, toDeg: 225, level: 'green' });
  expect(b).toContain('rotate(225)');
  expect(b).toContain('往西南');
  expect(b).toContain('0.16 節');
  expect(b).toContain('class="cmap-arrow gr"');
  expect(b).toContain('整片海的大概流向');
  expect(currentBadge({ hour: 10, kn: 1.3, toDeg: 0, level: 'red' })).toContain('class="cmap-arrow re"');
});

test('shows the strongest current of the day under the slider', () => {
  expect(renderSeaMap({ spot, map, forecast })).toContain('這天最強');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/ui/seaMap.test.js test/ui/format.test.js`
Expected: FAIL (`seaMap.js` missing, `currentSummary` not exported).

- [ ] **Step 3: Implement**

In `src/ui/format.js`, after the `arrow` line add:

```js
export const currentSummary = (s) => `${knots(s.currentKn)} ${arrow(s.currentToDeg)} ${LIGHT[s.currentLevel].emoji} ${SAFETY_TEXT[s.currentLevel]}`;
```

`src/ui/seaMap.js`:

```js
import { LIGHT, knots, esc, currentSummary } from './format.js';
import { bearingText, clamp } from '../core/math.js';
import { MAP_W, mapHeight, project } from '../core/mapProject.js';

const ARROW = 'M0,-22 L10,-4 L3,-4 L3,20 L-3,20 L-3,-4 L-10,-4Z'; // points north before rotating
const hourText = (h) => `${String(h).padStart(2, '0')}:00`;

export function defaultHourIndex(forecast) {
  const i = forecast.currents.findIndex((c) => c.hour === forecast.best.start);
  return i < 0 ? 0 : i;
}

// One arrow for the whole spot: the current data is a ~10 km grid, it cannot tell zones apart.
export function currentBadge(c) {
  return `<div class="cmap-badge"><svg viewBox="-27 -27 54 54" width="48" height="48" aria-hidden="true"><path class="cmap-arrow ${LIGHT[c.level].cls}" d="${ARROW}" transform="rotate(${Math.round(c.toDeg)})"/></svg><div>往${bearingText(c.toDeg)}<br><b>${knots(c.kn)}</b></div><div class="cmap-cap">整片海的大概流向</div></div>`;
}

function zoneDot(bbox, zone, light) {
  const [x, y] = project(bbox, zone.location);
  const tx = clamp(x, 26, MAP_W - 26); // keep the name inside the map
  const ty = y < 24 ? y + 26 : y - 14; // name above the dot, or below it at the top edge
  return `<g class="cmap-zone" data-mapzone="${esc(zone.id)}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="10" class="${LIGHT[light].cls}"/><text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}">${esc(zone.name)}</text></g>`;
}

export function renderSeaMap({ spot, map, forecast, hourIndex = null }) {
  const n = forecast.currents.length;
  const i = hourIndex == null ? defaultHourIndex(forecast) : clamp(hourIndex, 0, n - 1);
  const c = forecast.currents[i];
  const h = mapHeight(map.bbox).toFixed(1);
  const lights = Object.fromEntries(forecast.zones.map((z) => [z.zoneId, z.light]));
  const land = map.land.map((d) => `<path class="cmap-land" d="${d}"/>`).join('');
  const dots = spot.zones.map((z) => zoneDot(map.bbox, z, lights[z.id] ?? 'gray')).join('');
  return `<div class="cmap">
    <div class="cmap-box">
      <svg viewBox="0 0 ${MAP_W} ${h}" role="img" aria-label="${esc(spot.name)}地圖：分區燈號和海流方向"><rect class="cmap-sea" width="${MAP_W}" height="${h}"/>${land}${dots}</svg>
      ${currentBadge(c)}
      ${map.note ? `<div class="cmap-note">${esc(map.note)}</div>` : ''}
    </div>
    <label class="cmap-slider">⏰ <span class="cmap-time">${hourText(c.hour)}</span> 的海流
      <input type="range" min="0" max="${n - 1}" step="1" value="${i}" aria-valuetext="${c.hour} 點">
    </label>
    <div class="cmap-max">這天最強：<b>${currentSummary(forecast.safety)}</b></div>
  </div>`;
}

// Slider moved: swap only the badge and the time, so the page does not jump or lose focus.
export function updateSeaMap(root, c) {
  root.querySelector('.cmap-badge').outerHTML = currentBadge(c);
  root.querySelector('.cmap-time').textContent = hourText(c.hour);
  root.querySelector('.cmap input[type="range"]').setAttribute('aria-valuetext', `${c.hour} 點`);
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all pass (163).

- [ ] **Step 5: Commit**

```bash
git add src/ui/seaMap.js src/ui/format.js test/ui/seaMap.test.js test/ui/format.test.js
git commit -m "feat(ui): sea map with zone lights and a whole-sea current arrow"
```

---

### Task 5: Put the map on the main screen

**Files:**
- Modify: `src/ui/mainView.js`, `src/styles.css`, `src/main.js`
- Test: `test/ui/mainView.test.js`

**Interfaces:**
- Consumes: `renderSeaMap`, `updateSeaMap` (Task 4); `currentSummary` (Task 4); `MAPS` (Task 3); `forecast.currents` (Task 2).
- Produces: `renderMain({ ..., map = null, mapHour = null })`. With a map: map block above the sea row, sea row without the 🌀 cell. Without a map: exactly the old sea row.

- [ ] **Step 1: Write the failing tests**

In `test/ui/mainView.test.js` add the import:

```js
import { MAPS } from '../../src/data/spots/maps/index.js';
```

and append:

```js
test('with a map: the map replaces the 🌀 cell, cards stay in order', () => {
  const html = renderMain({ ...base, map: MAPS.xiaoliuqiu });
  expect(html).toContain('class="cmap"');
  expect(html).not.toContain('🌀 海流<br>');
  expect(html).toContain('🌡️');
  expect(html).toContain('⏰ 最佳下水');
  expect(html.indexOf('class="cmap"')).toBeLessThan(html.indexOf('class="cards"'));
  const order = [...html.matchAll(/data-zone="(\w+)"/g)].map((m) => m[1]);
  expect(order).toEqual(forecast.zones.map((z) => z.zoneId));
});

test('the chosen slider hour survives a re-render', () => {
  expect(renderMain({ ...base, map: MAPS.xiaoliuqiu, mapHour: 6 })).toContain('value="6"');
});

test('without a map the old current line stays', () => {
  expect(renderMain(base)).toContain('🌀 海流<br>');
  expect(renderMain(base)).not.toContain('class="cmap"');
});

test('no forecast, no map', () => {
  expect(renderMain({ ...base, forecast: null, map: MAPS.xiaoliuqiu })).not.toContain('class="cmap"');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/ui/mainView.test.js`
Expected: the 2 map tests FAIL; the other new tests may already pass.

- [ ] **Step 3: Implement `mainView.js`**

Replace the first import line with:

```js
import { LIGHT, COMPARE_TEXT, CONF_TEXT, hhmm, md, timeAgo, esc, currentSummary } from './format.js';
import { renderSeaMap } from './seaMap.js';
```

Replace `function seaRow(f) { … }` with:

```js
// withCurrent: the old one-line current, only for a spot that has no sea map yet.
function seaRow(f, withCurrent) {
  const s = f.safety;
  const wave = s.waveRed ? `<div class="warn">🔴 浪 ${s.waveMaxM.toFixed(1)} 米，不建議下水</div>` : '';
  const up = s.upwelling ? '<div class="warn">🥶 水溫突降，可能有湧升流，幾天後水可能變綠</div>' : '';
  const best = `${f.best.start}~${f.best.end} 點${f.best.slack ? '（平潮）' : ''}`;
  const sst = f.sst == null ? '—' : `${Math.round(f.sst)}°C`;
  return `<div class="sea">
    ${withCurrent ? `<div class="wide">🌀 海流<br><b>${currentSummary(s)}</b></div>` : ''}
    <div>🌡️ 水溫<br><b>${sst}</b></div>
    <div>⏰ 最佳下水<br><b>${best}</b></div>
    <div>🌊 浪<br><b>${s.waveMaxM.toFixed(1)} 米</b></div>
    ${wave}${up}
  </div>`;
}
```

In `renderMain`, add `map = null, mapHour = null` to the destructured parameters (after `emptyText = '這天沒有資料'`), and replace the line `${forecast ? seaRow(forecast) : ''}` with:

```js
  ${forecast && map ? renderSeaMap({ spot, map, forecast, hourIndex: mapHour }) : ''}
  ${forecast ? seaRow(forecast, !map) : ''}
```

Check that `knots`, `arrow` and `SAFETY_TEXT` are no longer used in `mainView.js` (`grep -n "knots\|arrow(\|SAFETY_TEXT" src/ui/mainView.js` prints nothing); if one still is, keep it in the import.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all pass (167).

- [ ] **Step 5: Styles**

In `src/styles.css`, after the line starting `.sea .warn {`, add:

```css
.cmap { margin:0 14px 10px; }
.cmap-box { position:relative; max-width:480px; margin:0 auto; border-radius:12px; overflow:hidden; }
.cmap svg { display:block; width:100%; height:auto; }
.cmap-sea { fill:#1b4f7a; }
.cmap-land { fill:#d8c79f; stroke:#8f7d52; stroke-width:1; }
.cmap-zone { cursor:pointer; }
.cmap-zone circle { stroke:#fff; stroke-width:2.5; }
.cmap-zone circle.pu{fill:#a45cff}.cmap-zone circle.gr{fill:#2ecc71}.cmap-zone circle.ye{fill:#f5c518}.cmap-zone circle.re{fill:#ff4d4d}.cmap-zone circle.gy{fill:#7a8a99}
.cmap-zone text { fill:#fff; font-size:13px; font-weight:800; text-anchor:middle; paint-order:stroke; stroke:#0b2239; stroke-width:3px; }
.cmap-badge { position:absolute; top:8px; right:8px; padding:6px 8px; border-radius:10px; background:rgba(11,34,57,.92); text-align:center; font-size:13px; line-height:1.3; }
.cmap-badge svg { width:48px; height:48px; margin:0 auto; }
.cmap-arrow.gr{fill:#2ecc71}.cmap-arrow.ye{fill:#f5c518}.cmap-arrow.re{fill:#ff4d4d}
.cmap-cap { font-size:11px; color:var(--mut); }
.cmap-note { position:absolute; left:8px; bottom:8px; padding:2px 8px; border-radius:8px; background:rgba(11,34,57,.92); font-size:12px; }
.cmap-slider { display:block; max-width:480px; margin:8px auto 0; font-size:14px; }
.cmap-slider input { display:block; width:100%; min-height:var(--tap); margin:0; accent-color:var(--acc); }
.cmap-max { max-width:480px; margin:0 auto; font-size:14px; color:var(--mut); }
.cmap-max b { color:var(--fg); }
```

- [ ] **Step 6: Wire `main.js`**

Add imports next to the other imports:

```js
import { MAPS } from './data/spots/maps/index.js';
import { updateSeaMap } from './ui/seaMap.js';
```

In `const state = { … }`, add `mapHour: null, // sea map slider; null = the best dive hour` on its own line after `pos: null, …`.

In the `renderMain({ … })` call inside `render()`, add after `emptyText,`:

```js
    map: MAPS[s.id] ?? null, mapHour: state.mapHour,
```

In `selectSpot`, in the `Object.assign(state, { … })`, add `mapHour: null,` after `loading: true,`.

In the click handler, replace

```js
  if (day) { state.dayIndex = Number(day.dataset.day); return render(); } // keep scroll position; tabs are sticky
```

with

```js
  if (day) { state.dayIndex = Number(day.dataset.day); state.mapHour = null; return render(); } // keep scroll position; tabs are sticky
```

and, just before `const card = e.target.closest('[data-zone]');`, add:

```js
  const dot = e.target.closest('[data-mapzone]');
  if (dot) return go('detail', dot.dataset.mapzone);
```

After the click handler's closing `});`, add:

```js
// Sea map slider: move the arrow in place (a full render would drop the finger's drag).
app.addEventListener('input', (e) => {
  if (!e.target.matches('.cmap input[type="range"]')) return;
  const c = state.forecasts[state.dayIndex]?.currents[Number(e.target.value)];
  if (!c) return;
  state.mapHour = Number(e.target.value);
  updateSeaMap(app, c);
});
```

- [ ] **Step 7: Run tests and build**

```bash
npm test
npm run build
```

Expected: all 167 tests pass; build succeeds with no errors.

- [ ] **Step 8: Look at it in a browser**

```bash
npm run dev
```

Open http://localhost:5173 (the Worker does not need to run; without it the map still draws, dots use fallback lights). Check, and write what you saw in your report:
1. 小琉球: island shape correct, 4 dots with names, arrow box top-right does not cover a dot name. If it covers one, report it; do not add a per-spot special case (code must not name spots).
2. Drag the slider: arrow turns, time text and 節 change, page does not jump.
3. Tap a dot → detail page of that zone; phone back → main list.
4. Switch day tab → slider goes back to the best dive hour.
5. Switch to 墾丁 and 七星岩 from the header: 墾丁 shows the peninsula tip + 3 dots; 七星岩 shows 2 separate dots and the 鵝鑾鼻 note.
6. Width 320 px: no sideways scroll. Width 1280 px: map ≤ 480 px, centered.

Stop the dev server afterwards.

- [ ] **Step 9: Commit**

```bash
git add src/ui/mainView.js src/styles.css src/main.js test/ui/mainView.test.js
git commit -m "feat(app): sea map with an hour slider on the main screen"
```

---

## After the plan (controller only, not an implementer task)

- Final review of the whole branch with the strongest model.
- Show Michael the running page; after his OK, merge `feat/current-map` into `main` (fast-forward) and delete the branch.
- Deploy only when Michael says 上線: web only (`npm run build` then `npx wrangler deploy`). The Worker does not change in this plan.
- Update the Obsidian note `專案筆記/2026 海底清不清/工作筆記.md`.
