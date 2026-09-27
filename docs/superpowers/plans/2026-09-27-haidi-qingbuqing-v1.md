# 海底清不清 v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A phone web page that forecasts underwater visibility (meters + colored light) for 4 zones around 小琉球 for today / tomorrow / the day after, with safety info, diver reports and self-calibration.

**Architecture:** A static Vite web app does all scoring in the browser from Open-Meteo data (browser-readable). A Cloudflare Worker ("衛星小幫手") fetches NOAA Kd490 once a day, turns it into a per-zone base visibility, reads diver reports from Firestore, computes per-zone bias multipliers, and serves one small JSON. Reports go to Firebase Firestore with anonymous auth. All scoring logic lives in pure functions under `src/core/` so it is unit-tested and shared by the web app and the Worker.

**Tech Stack:** JavaScript (ES modules, no framework), Vite, Vitest, Firebase JS SDK (Auth + Firestore), Cloudflare Workers + KV (wrangler), Cloudflare Pages.

**Spec:** `docs/superpowers/specs/2026-09-27-haidi-qingbuqing-design.md` — read it before starting any task.

## Global Constraints

- All user-facing text is Traditional Chinese (繁體中文).
- **Computers too:** some people check at home on a PC. At ≥ 720 px the main list widens to 2 card columns (max 860 px); detail page and report form stay phone-width, centered. Mouse hover gets a highlight. Everything must also work with mouse + keyboard.
- **Offline + install (PWA):** the page must open with no signal (boat) and can be added to the phone home screen (Task 16).
- **Phone first:** almost every user is on a phone. Layout must work at 320–480 px with no sideways scroll; tap targets ≥ 44 px; inputs 16 px; muted text via color (not opacity) for sunlight; respect iPhone safe areas; phone back button must go back inside the app. Check at 320 / 360 / 390 px before calling any UI task done.
- Dive spots are data, not code: every spot-specific number lives in `src/data/spots/<id>.json`. Code must not mention 小琉球 or a zone id.
- Visibility lights: 🟣 `>= thresholds.purple` (20), 🟢 `>= thresholds.green` (12), 🟡 `>= thresholds.yellow` (6), 🔴 below. Stale weather → ⚪ gray.
- Range: `meters × 0.75` to `meters × 1.15`; when confidence is low `× 0.6` to `× 1.3`.
- Current safety (knots): `< 0.5` 🟢, `0.5 – < 1.0` 🟡, `>= 1.0` 🔴. Wave red when daytime max wave height `> 1.5 m`.
- Locate: farther than 15 km from spot center → show distance only.
- Daytime window for scoring = local hours 08–16 inclusive (9 hours), timezone `Asia/Taipei`.
- Open-Meteo conventions (verified 2026-09-27): `wave_direction` = direction waves **come from**; `wind_direction_10m` = direction wind **comes from**; `ocean_current_direction` = direction current **flows toward**; `ocean_current_velocity` in **km/h**. Knots = km/h ÷ 1.852.
- Open-Meteo is free for non-commercial use only. Keep this project non-commercial.
- NOAA dataset: `noaacwNPPN20S3AkdSCIDINEOF2kmDaily` on `https://coastwatch.noaa.gov/erddap` (no CORS → Worker only). Base meters = `1.5 ÷ Kd490`, clamped to 1–40 m.
- Never store or send the user's GPS position. Reports store only `zoneId`.
- Firestore `reports` collection: public read, create only by an anonymous-auth user, no update/delete.
- Every factor is a multiplier between 0 and 1.1. All tuning constants live in `src/core/constants.js`.
- `rawMeters` = base × all factors (no bias, no nowcast). Reports store it in `snapshot.rawMeters`, and zone bias compares against it, so the bias estimates the whole error (spec §6 says "第 1 步修正前"; we also exclude the old bias so it does not chase itself).
- Satellite data older than 45 days counts as "太舊" → fallback base.
- Repo root: `C:\dev\haidi-qingbuqing` (see Task 0 for why it is not on Google Drive). All paths below are relative to the repo root. All commands run from the repo root in Git Bash.

## File Structure

```
package.json            vite + vitest + firebase deps, scripts
vite.config.js          vitest config (node environment)
index.html              page shell
.env.example            VITE_HELPER_URL, VITE_FIREBASE_* keys
firebase.json, firestore.rules, firestore.indexes.json
src/
  main.js               wires everything: fetch → forecast → render → events
  styles.css
  config.js             reads import.meta.env
  core/                 PURE functions, no DOM, no fetch
    constants.js        every tuning number
    math.js             clamp, angles, distance, knots, median
    time.js             Asia/Taipei date helpers
    moon.js             moon age → spring tide
    factors.js          the 8 visibility factors
    score.js            base, lights, range, compare, reason, scoreZone
    safety.js           current/wave safety, upwelling
    bestWindow.js       best 2-hour dive window
    calibration.js      nowcast, outlier weights, zone bias
    locate.js           nearest zone / distance
    forecast.js         builds the full forecast for one day
  data/spots/
    xiaoliuqiu.json     the only spot in v1
    index.js            SPOTS registry
  services/             talk to the outside world
    openmeteo.js        URLs + parse into DayInput
    helper.js           fetch the Worker JSON
    cache.js            localStorage weather cache
    outbox.js           offline report queue
    reports.js          Firebase auth + Firestore read/write
  ui/                   return HTML strings (easy to test)
    format.js
    mainView.js
    detailView.js
    reportForm.js
    share.js
worker/
  wrangler.toml
  src/index.js          fetch + scheduled handlers
  src/erddap.js         NOAA URL + CSV parse
  src/base.js           per-zone Kd median
  src/firestore.js      read reports via Firestore REST
test/                   vitest files, mirroring src/ and worker/
  helpers/makeDay.js    test fixture builder
```

### Shared data shapes (used across tasks)

```js
// Hour — one local hour of weather at the spot
{ hour: 12, waveH: 0.3, waveT: 4, waveDir: 200, windKmh: 5, windDir: 0,
  cloud: 20, currentKmh: 0.5, currentDir: 90, sst: 28, seaLevel: 0.1 }

// DayInput — everything scoring needs for one date
{ date: '2026-09-28',
  hours: Hour[9],                    // local 08..16
  pastWaves: [Wave[24], Wave[24], Wave[24]], // day-1, day-2, day-3; Wave = {waveH, waveT, waveDir}
  rain3dMm: 0,                       // mean over rain points of 72h rain before 08:00
  sstPrev3: 28 }                     // mean SST of the 3 previous days, or null

// HelperData — JSON served by the Worker
{ spotId: 'xiaoliuqiu', updatedAt: 1790000000000, satelliteDate: '2026-09-15',
  zones: { west: { kdMedian: 0.06, source: 'sat', bias: 1, biasN: 0 } } }

// Report (as used by core; ms timestamps)
{ id: 'abc', zoneId: 'west', meters: 20, depth: 10, diveTime: 1790000000000,
  nickname: 'Michael', note: '', rawMeters: 18.2 }
```

---

### Task 0: Project setup

**Files:**
- Create: `package.json`, `vite.config.js`, `.gitignore`, `test/smoke.test.js`
- Copy: `docs/` from `G:\我的雲端硬碟\2026 海底清不清\docs\`

**Why not Google Drive:** `node_modules` holds tens of thousands of small files; Google Drive sync slows down and can corrupt them. Code lives in `C:\dev\haidi-qingbuqing` with git (and later GitHub). The Drive folder keeps the design docs.

- [ ] **Step 1: Create the folder, copy docs, init git**

```bash
mkdir -p /c/dev/haidi-qingbuqing
cp -r "/g/我的雲端硬碟/2026 海底清不清/docs" /c/dev/haidi-qingbuqing/
cd /c/dev/haidi-qingbuqing
git init
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "haidi-qingbuqing",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 3: Install dev deps and firebase**

```bash
npm install -D vite vitest wrangler
npm install firebase
```

- [ ] **Step 4: Write `vite.config.js`**

```js
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
```

- [ ] **Step 5: Write `.gitignore`**

```
node_modules/
dist/
.wrangler/
.superpowers/
.env
.env.local
```

- [ ] **Step 6: Write the smoke test `test/smoke.test.js`**

```js
import { test, expect } from 'vitest';

test('vitest runs', () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 7: Run tests**

Run: `npm test`
Expected: `1 passed`

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: project setup with vite and vitest"
```

---

### Task 1: Math and time helpers

**Files:**
- Create: `src/core/math.js`, `src/core/time.js`
- Test: `test/core/math.test.js`, `test/core/time.test.js`

**Interfaces:**
- Produces:
  - `clamp(x: number, lo: number, hi: number): number`
  - `angleDiff(a: number, b: number): number` — 0..180
  - `alignment(a: number, b: number): number` — cos of angle difference, -1..1
  - `exposure(fromDeg: number, facingDeg: number): number` — `max(0, alignment)`, 0..1
  - `distanceKm(p1: [lat, lon], p2: [lat, lon]): number`
  - `bearingText(deg: number): string` — one of 北 東北 東 東南 南 西南 西 西北
  - `kmhToKnots(kmh: number): number`
  - `median(values: number[]): number | null`
  - `mean(values: number[]): number | null`
  - `taipeiDate(ms: number, offsetDays?: number): string` — `'YYYY-MM-DD'`
  - `addDays(dateStr: string, n: number): string`

- [ ] **Step 1: Write the failing tests**

`test/core/math.test.js`:

```js
import { test, expect } from 'vitest';
import { clamp, angleDiff, alignment, exposure, distanceKm, bearingText, kmhToKnots, median, mean } from '../../src/core/math.js';

test('clamp', () => {
  expect(clamp(5, 0, 1)).toBe(1);
  expect(clamp(-1, 0, 1)).toBe(0);
  expect(clamp(0.5, 0, 1)).toBe(0.5);
});

test('angleDiff wraps around 360', () => {
  expect(angleDiff(350, 10)).toBe(20);
  expect(angleDiff(10, 350)).toBe(20);
  expect(angleDiff(0, 180)).toBe(180);
  expect(angleDiff(270, 270)).toBe(0);
});

test('alignment and exposure', () => {
  expect(alignment(270, 270)).toBeCloseTo(1);
  expect(alignment(90, 270)).toBeCloseTo(-1);
  expect(exposure(270, 270)).toBeCloseTo(1);
  expect(exposure(0, 270)).toBeCloseTo(0);
  expect(exposure(90, 270)).toBe(0);
});

test('distanceKm: 0.1 degree latitude is about 11.1 km', () => {
  expect(distanceKm([22.3, 120.3], [22.4, 120.3])).toBeCloseTo(11.12, 1);
});

test('bearingText', () => {
  expect(bearingText(0)).toBe('北');
  expect(bearingText(44)).toBe('東北');
  expect(bearingText(90)).toBe('東');
  expect(bearingText(200)).toBe('南');
  expect(bearingText(359)).toBe('北');
});

test('kmhToKnots', () => {
  expect(kmhToKnots(1.852)).toBeCloseTo(1);
});

test('median and mean', () => {
  expect(median([3, 1, 2])).toBe(2);
  expect(median([1, 2, 3, 4])).toBe(2.5);
  expect(median([])).toBeNull();
  expect(mean([1, 2, 3])).toBe(2);
  expect(mean([])).toBeNull();
});
```

`test/core/time.test.js`:

```js
import { test, expect } from 'vitest';
import { taipeiDate, addDays } from '../../src/core/time.js';

test('taipeiDate uses UTC+8', () => {
  const ms = Date.UTC(2026, 8, 27, 17, 0); // 2026-09-27 17:00 UTC = 09-28 01:00 Taipei
  expect(taipeiDate(ms)).toBe('2026-09-28');
  expect(taipeiDate(ms, 1)).toBe('2026-09-29');
});

test('addDays crosses month end', () => {
  expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
  expect(addDays('2026-10-01', -3)).toBe('2026-09-28');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find module `src/core/math.js`

- [ ] **Step 3: Write `src/core/math.js`**

```js
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

const norm360 = (d) => ((d % 360) + 360) % 360;

export function angleDiff(a, b) {
  const d = norm360(a - b);
  return d > 180 ? 360 - d : d;
}

export const alignment = (a, b) => Math.cos((angleDiff(a, b) * Math.PI) / 180);

export const exposure = (fromDeg, facingDeg) => Math.max(0, alignment(fromDeg, facingDeg));

export function distanceKm([lat1, lon1], [lat2, lon2]) {
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r;
  const dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

const NAMES = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'];
export const bearingText = (deg) => NAMES[Math.round(norm360(deg) / 45) % 8];

export const kmhToKnots = (kmh) => kmh / 1.852;

export function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
```

- [ ] **Step 4: Write `src/core/time.js`**

```js
const DAY = 86400000;
const TAIPEI_OFFSET = 8 * 3600000;

export const taipeiDate = (ms, offsetDays = 0) =>
  new Date(ms + TAIPEI_OFFSET + offsetDays * DAY).toISOString().slice(0, 10);

export const addDays = (dateStr, n) =>
  new Date(Date.parse(`${dateStr}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add src/core/math.js src/core/time.js test/core
git commit -m "feat(core): math and time helpers"
```

---

### Task 2: Spot data, constants, test fixture

**Files:**
- Create: `src/data/spots/xiaoliuqiu.json`, `src/data/spots/index.js`, `src/core/constants.js`, `test/helpers/makeDay.js`
- Test: `test/data/spots.test.js`

**Interfaces:**
- Produces:
  - `SPOTS: Record<string, Spot>` from `src/data/spots/index.js`
  - `K`, `SHELTER_MUL`, `BOTTOM_MUL`, `STRONG_CURRENT_MUL` from `src/core/constants.js`
  - Test helpers `hour(over)`, `calmWaves()`, `makeDay({ hour, date, pastWaves, rain3dMm, sstPrev3 })`

- [ ] **Step 1: Write `src/data/spots/xiaoliuqiu.json`**

Numbers are first guesses from the spec; reports will tune them. `riverBearing` 23° = direction from the island to the 高屏溪 mouth (~22.47N 120.43E).

```json
{
  "id": "xiaoliuqiu",
  "name": "小琉球",
  "center": [22.34, 120.37],
  "locateMaxKm": 15,
  "thresholds": { "purple": 20, "green": 12, "yellow": 6 },
  "riverName": "高屏溪",
  "riverBearing": 23,
  "rainPoints": [
    { "name": "旗山", "lat": 22.888, "lon": 120.483 },
    { "name": "六龜", "lat": 22.998, "lon": 120.633 },
    { "name": "三地門", "lat": 22.715, "lon": 120.654 }
  ],
  "safety": { "currentYellowKn": 0.5, "currentRedKn": 1.0, "waveRedM": 1.5 },
  "zones": [
    { "id": "north", "name": "北邊", "location": [22.357, 120.372], "facing": 0,
      "shelter": "open", "bottom": "mixed", "riverImpact": 0.7,
      "satBox": [[22.37, 120.35], [22.39, 120.39]], "fallbackBase": 10 },
    { "id": "east", "name": "東邊", "location": [22.338, 120.388], "facing": 90,
      "shelter": "open", "bottom": "mixed", "riverImpact": 0.8,
      "satBox": [[22.32, 120.40], [22.36, 120.42]], "fallbackBase": 8 },
    { "id": "south", "name": "南邊", "location": [22.325, 120.372], "facing": 180,
      "shelter": "open", "bottom": "rock", "riverImpact": 0.3,
      "satBox": [[22.29, 120.35], [22.31, 120.39]], "fallbackBase": 12 },
    { "id": "west", "name": "西邊", "location": [22.340, 120.357], "facing": 270,
      "shelter": "open", "bottom": "rock", "riverImpact": 0.3,
      "satBox": [[22.32, 120.31], [22.36, 120.34]], "fallbackBase": 12 }
  ]
}
```

- [ ] **Step 2: Write `src/data/spots/index.js`**

```js
import xiaoliuqiu from './xiaoliuqiu.json';

export const SPOTS = { [xiaoliuqiu.id]: xiaoliuqiu };
export const DEFAULT_SPOT_ID = xiaoliuqiu.id;
```

- [ ] **Step 3: Write `src/core/constants.js`**

```js
// Every tuning number lives here. Reports will tell us how to change them.
export const SHELTER_MUL = { open: 1, semi: 0.6, bay: 0.3 };
export const BOTTOM_MUL = { rock: 0.8, mixed: 1, sand: 1.3 };
export const STRONG_CURRENT_MUL = { rock: 1, mixed: 0.93, sand: 0.85 };

export const K = {
  kdToMeters: 1.5,          // base meters = kdToMeters / Kd490
  baseMin: 1,
  baseMax: 40,
  wave: 0.04,               // per unit of H²·T·exposure
  waveMin: 0.3,
  pastWave: 0.03,
  pastWaveMin: 0.4,
  pastWeights: [1, 0.5, 0.25], // day-1, day-2, day-3
  windStartKmh: 10,         // onshore wind below this does nothing
  wind: 0.006,              // per km/h above windStartKmh
  windMin: 0.6,
  windOffshoreBonus: 0.03,
  windOffshoreFullKmh: 15,
  cloud: 0.1,               // 100% cloud → ×0.9
  springTide: 0.92,
  springDays: 2,            // within 2 days of new/full moon
  riverFullMm: 200,         // 3-day rain at which river effect is full
  river: 0.6,
  riverMin: 0.3,
  riverCurrentHeavier: 0.5, // current flowing from river toward spot
  riverCurrentLighter: 0.3,
  offshoreCurrentBonus: 0.05,
  currentMidLoKn: 0.3,
  currentMidHiKn: 0.8,
  currentMidBonus: 1.05,
  currentStrongKn: 1.0,
  reasonThreshold: 0.97,    // a factor below this can be the reason
  compareUp: 1.15,
  compareDown: 0.85,
  range: { normal: [0.75, 1.15], low: [0.6, 1.3] },
  maxValid: { waveH: 20, windKmh: 250, currentKmh: 20 },
  upwellingDropC: 2,
  noonHour: 12,
  noonWeight: 0.02,
  slackSeaLevelM: 0.05,
  recentReportDays: 7,
};
```

- [ ] **Step 4: Write `test/helpers/makeDay.js`**

```js
export const hour = (over = {}) => ({
  hour: 12, waveH: 0.3, waveT: 4, waveDir: 200, windKmh: 5, windDir: 0,
  cloud: 20, currentKmh: 0.5, currentDir: 90, sst: 28, seaLevel: 0, ...over,
});

export const calmWaves = () => Array.from({ length: 24 }, () => ({ waveH: 0.3, waveT: 4, waveDir: 200 }));

export function makeDay({ hour: h = {}, date = '2026-09-28', pastWaves, rain3dMm = 0, sstPrev3 = 28 } = {}) {
  return {
    date,
    hours: Array.from({ length: 9 }, (_, i) => hour({ ...h, hour: 8 + i })),
    pastWaves: pastWaves ?? [calmWaves(), calmWaves(), calmWaves()],
    rain3dMm,
    sstPrev3,
  };
}
```

- [ ] **Step 5: Write the spot data test `test/data/spots.test.js`**

```js
import { test, expect } from 'vitest';
import { SPOTS, DEFAULT_SPOT_ID } from '../../src/data/spots/index.js';

test('every spot has the fields the code needs', () => {
  for (const spot of Object.values(SPOTS)) {
    expect(spot.thresholds.purple).toBeGreaterThan(spot.thresholds.green);
    expect(spot.thresholds.green).toBeGreaterThan(spot.thresholds.yellow);
    expect(spot.rainPoints.length).toBeGreaterThan(0);
    expect(spot.zones.length).toBeGreaterThan(0);
    for (const z of spot.zones) {
      expect(['open', 'semi', 'bay']).toContain(z.shelter);
      expect(['sand', 'mixed', 'rock']).toContain(z.bottom);
      expect(z.riverImpact).toBeGreaterThanOrEqual(0);
      expect(z.riverImpact).toBeLessThanOrEqual(1);
      expect(z.satBox[0][0]).toBeLessThan(z.satBox[1][0]);
      expect(z.satBox[0][1]).toBeLessThan(z.satBox[1][1]);
    }
  }
  expect(SPOTS[DEFAULT_SPOT_ID]).toBeDefined();
});
```

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add src/data src/core/constants.js test/helpers test/data
git commit -m "feat(data): xiaoliuqiu spot, tuning constants, test fixtures"
```

---

### Task 3: Wave factors (today's waves, past waves)

**Files:**
- Create: `src/core/factors.js`
- Test: `test/core/factors.waves.test.js`

**Interfaces:**
- Consumes: `exposure`, `clamp` (Task 1); `K`, `SHELTER_MUL`, `BOTTOM_MUL` (Task 2)
- Produces:
  - `waveEnergy(h: {waveH, waveT}): number` — `H² × T`
  - `waveFactor(hours: Hour[], zone): number`
  - `pastWaveFactor(pastWaves: Wave[][], zone): number`

- [ ] **Step 1: Write the failing tests**

```js
import { test, expect } from 'vitest';
import { waveFactor, pastWaveFactor } from '../../src/core/factors.js';
import { makeDay, calmWaves } from '../helpers/makeDay.js';

const zone = (over = {}) => ({ id: 'w', facing: 270, shelter: 'open', bottom: 'mixed', riverImpact: 0.3, ...over });
const big = { waveH: 1.2, waveT: 9, waveDir: 270 };

test('waves hitting a zone head-on hurt that zone most', () => {
  const day = makeDay({ hour: big });
  const west = waveFactor(day.hours, zone({ facing: 270 }));
  const east = waveFactor(day.hours, zone({ facing: 90 }));
  expect(west).toBeLessThan(0.7);
  expect(east).toBe(1);
});

test('longer wave period hurts more', () => {
  const short = waveFactor(makeDay({ hour: { ...big, waveT: 5 } }).hours, zone());
  const long = waveFactor(makeDay({ hour: { ...big, waveT: 12 } }).hours, zone());
  expect(long).toBeLessThan(short);
});

test('a bay loses less than open coast for the same waves', () => {
  const day = makeDay({ hour: big });
  expect(waveFactor(day.hours, zone({ shelter: 'bay' }))).toBeGreaterThan(waveFactor(day.hours, zone({ shelter: 'open' })));
});

test('sand bottom loses more than rock for the same waves', () => {
  const day = makeDay({ hour: { ...big, waveH: 0.8 } });
  expect(waveFactor(day.hours, zone({ bottom: 'sand' }))).toBeLessThan(waveFactor(day.hours, zone({ bottom: 'rock' })));
});

test('factor never goes below 0.3', () => {
  const day = makeDay({ hour: { waveH: 5, waveT: 15, waveDir: 270 } });
  expect(waveFactor(day.hours, zone())).toBe(0.3);
});

test('big waves two days ago still hurt today, more than 3 calm days', () => {
  const storm = Array.from({ length: 24 }, () => big);
  const calm = pastWaveFactor([calmWaves(), calmWaves(), calmWaves()], zone());
  const afterStorm = pastWaveFactor([calmWaves(), storm, calmWaves()], zone());
  expect(afterStorm).toBeLessThan(calm);
});

test('yesterday counts more than 3 days ago', () => {
  const storm = Array.from({ length: 24 }, () => big);
  const yesterday = pastWaveFactor([storm, calmWaves(), calmWaves()], zone());
  const threeAgo = pastWaveFactor([calmWaves(), calmWaves(), storm], zone());
  expect(yesterday).toBeLessThan(threeAgo);
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- factors.waves`
Expected: FAIL — cannot find module `src/core/factors.js`

- [ ] **Step 3: Write `src/core/factors.js` (wave part)**

```js
import { clamp, exposure } from './math.js';
import { K, SHELTER_MUL, BOTTOM_MUL } from './constants.js';

export const waveEnergy = ({ waveH, waveT }) => waveH * waveH * waveT;

const hitEnergy = (w, zone) => waveEnergy(w) * exposure(w.waveDir, zone.facing);

const maxHit = (waves, zone) => waves.reduce((m, w) => Math.max(m, hitEnergy(w, zone)), 0);

const zoneMul = (zone) => SHELTER_MUL[zone.shelter] * BOTTOM_MUL[zone.bottom];

export function waveFactor(hours, zone) {
  return clamp(1 - K.wave * maxHit(hours, zone) * zoneMul(zone), K.waveMin, 1);
}

export function pastWaveFactor(pastWaves, zone) {
  const worst = pastWaves.reduce((m, day, i) => Math.max(m, K.pastWeights[i] * maxHit(day, zone)), 0);
  return clamp(1 - K.pastWave * worst * zoneMul(zone), K.pastWaveMin, 1);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- factors.waves`
Expected: 7 passed

- [ ] **Step 5: Commit**

```bash
git add src/core/factors.js test/core/factors.waves.test.js
git commit -m "feat(core): wave and past-wave factors"
```

---

### Task 4: Other factors (wind, cloud, tide, river, current)

**Files:**
- Create: `src/core/moon.js`
- Modify: `src/core/factors.js` (append)
- Test: `test/core/moon.test.js`, `test/core/factors.other.test.js`

**Interfaces:**
- Consumes: Task 1–3 helpers
- Produces:
  - `moonAgeDays(dateStr): number` — 0..29.53
  - `isSpringTide(dateStr): boolean`
  - `windFactor(hours, zone)`, `cloudFactor(hours)`, `tideFactor(dateStr)`
  - `riverFactor(rain3dMm, hours, zone, spot)`, `currentDirFactor(hours, spot)`, `currentSpeedFactor(hours, zone)`
  - `riverAlignment(hours, spot): number` — -1..1, +1 = current flows from river mouth toward the spot

- [ ] **Step 1: Write failing moon test `test/core/moon.test.js`**

Known dates: new moon 2024-01-11, first quarter 2024-01-18, full moon 2024-01-25.

```js
import { test, expect } from 'vitest';
import { isSpringTide } from '../../src/core/moon.js';

test('spring tide near new and full moon, not at quarter moon', () => {
  expect(isSpringTide('2024-01-11')).toBe(true);
  expect(isSpringTide('2024-01-25')).toBe(true);
  expect(isSpringTide('2024-01-18')).toBe(false);
});
```

- [ ] **Step 2: Write failing factor tests `test/core/factors.other.test.js`**

```js
import { test, expect } from 'vitest';
import { windFactor, cloudFactor, tideFactor, riverFactor, currentDirFactor, currentSpeedFactor } from '../../src/core/factors.js';
import { makeDay } from '../helpers/makeDay.js';

const zone = (over = {}) => ({ id: 'w', facing: 270, shelter: 'open', bottom: 'mixed', riverImpact: 0.3, ...over });
const spot = { riverBearing: 23 };

test('onshore wind hurts, offshore wind helps a little', () => {
  const onshore = windFactor(makeDay({ hour: { windKmh: 30, windDir: 270 } }).hours, zone());
  const offshore = windFactor(makeDay({ hour: { windKmh: 20, windDir: 90 } }).hours, zone());
  expect(onshore).toBeCloseTo(1 - 0.006 * 20, 5);
  expect(offshore).toBeCloseTo(1.03, 5);
});

test('cloudy is a small minus, at most ×0.9', () => {
  expect(cloudFactor(makeDay({ hour: { cloud: 100 } }).hours)).toBeCloseTo(0.9);
  expect(cloudFactor(makeDay({ hour: { cloud: 0 } }).hours)).toBe(1);
});

test('tide factor is 0.92 on spring tide', () => {
  expect(tideFactor('2024-01-11')).toBe(0.92);
  expect(tideFactor('2024-01-18')).toBe(1);
});

test('heavy upstream rain hurts high riverImpact zones most', () => {
  const day = makeDay({ hour: { currentDir: 90 } }); // current flowing east: neutral-ish to river at 23°
  const east = riverFactor(200, day.hours, zone({ riverImpact: 0.8 }), spot);
  const west = riverFactor(200, day.hours, zone({ riverImpact: 0.3 }), spot);
  expect(east).toBeLessThan(west);
  expect(riverFactor(0, day.hours, zone({ riverImpact: 0.8 }), spot)).toBe(1);
});

test('current flowing from the river mouth makes river effect heavier', () => {
  const fromRiver = makeDay({ hour: { currentDir: 203 } }).hours; // heading SSW, i.e. away from mouth at 23°, toward the island
  const toRiver = makeDay({ hour: { currentDir: 23 } }).hours;
  const z = zone({ riverImpact: 0.8 });
  expect(riverFactor(150, fromRiver, z, spot)).toBeLessThan(riverFactor(150, toRiver, z, spot));
});

test('current from offshore is a small plus', () => {
  expect(currentDirFactor(makeDay({ hour: { currentDir: 23 } }).hours, spot)).toBeCloseTo(1.05);
  expect(currentDirFactor(makeDay({ hour: { currentDir: 203 } }).hours, spot)).toBe(1);
});

test('current speed: middle is a plus, strong hurts sand but not rock', () => {
  const mid = makeDay({ hour: { currentKmh: 0.5 * 1.852 } }).hours;
  const strong = makeDay({ hour: { currentKmh: 1.2 * 1.852 } }).hours;
  const slow = makeDay({ hour: { currentKmh: 0.1 * 1.852 } }).hours;
  expect(currentSpeedFactor(mid, zone())).toBe(1.05);
  expect(currentSpeedFactor(strong, zone({ bottom: 'sand' }))).toBe(0.85);
  expect(currentSpeedFactor(strong, zone({ bottom: 'rock' }))).toBe(1);
  expect(currentSpeedFactor(slow, zone())).toBe(1);
});
```

- [ ] **Step 3: Run to verify fail**

Run: `npm test -- moon factors.other`
Expected: FAIL — missing exports

- [ ] **Step 4: Write `src/core/moon.js`**

```js
import { K } from './constants.js';

const SYNODIC = 29.530588853;
const REF_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14); // a known new moon

// Moon age at local noon (04:00 UTC) of the given Taipei date.
export function moonAgeDays(dateStr) {
  const t = Date.parse(`${dateStr}T04:00:00Z`);
  const days = (t - REF_NEW_MOON) / 86400000;
  return ((days % SYNODIC) + SYNODIC) % SYNODIC;
}

export function isSpringTide(dateStr) {
  const age = moonAgeDays(dateStr);
  const toNew = Math.min(age, SYNODIC - age);
  const toFull = Math.abs(age - SYNODIC / 2);
  return toNew <= K.springDays || toFull <= K.springDays;
}
```

- [ ] **Step 5: Append to `src/core/factors.js`**

Replace the import lines at the top of `factors.js` with:

```js
import { clamp, exposure, alignment, kmhToKnots, mean } from './math.js';
import { K, SHELTER_MUL, BOTTOM_MUL, STRONG_CURRENT_MUL } from './constants.js';
import { isSpringTide } from './moon.js';
```

Then append:

```js
export function windFactor(hours, zone) {
  // signed onshore speed: + blowing from sea onto this zone, - blowing off the island
  const s = mean(hours.map((h) => h.windKmh * alignment(h.windDir, zone.facing)));
  if (s > 0) {
    return clamp(1 - K.wind * Math.max(0, s - K.windStartKmh) * SHELTER_MUL[zone.shelter], K.windMin, 1);
  }
  return 1 + K.windOffshoreBonus * Math.min(1, -s / K.windOffshoreFullKmh);
}

export const cloudFactor = (hours) => 1 - K.cloud * (mean(hours.map((h) => h.cloud)) / 100);

export const tideFactor = (dateStr) => (isSpringTide(dateStr) ? K.springTide : 1);

// +1 = current heads away from the river mouth (brings river water to the spot), -1 = heads toward it
export const riverAlignment = (hours, spot) =>
  mean(hours.map((h) => alignment(h.currentDir, (spot.riverBearing + 180) % 360)));

export function riverFactor(rain3dMm, hours, zone, spot) {
  if (rain3dMm <= 0) return 1;
  const a = riverAlignment(hours, spot);
  const curMul = a > 0 ? 1 + K.riverCurrentHeavier * a : 1 - K.riverCurrentLighter * -a;
  const hit = zone.riverImpact * Math.min(1, rain3dMm / K.riverFullMm) * K.river * curMul;
  return clamp(1 - hit, K.riverMin, 1);
}

export function currentDirFactor(hours, spot) {
  const a = riverAlignment(hours, spot);
  return a < 0 ? 1 + K.offshoreCurrentBonus * -a : 1;
}

export function currentSpeedFactor(hours, zone) {
  const kn = kmhToKnots(mean(hours.map((h) => h.currentKmh)));
  if (kn >= K.currentStrongKn) return STRONG_CURRENT_MUL[zone.bottom];
  if (kn >= K.currentMidLoKn && kn <= K.currentMidHiKn) return K.currentMidBonus;
  return 1;
}
```

- [ ] **Step 6: Run to verify pass**

Run: `npm test`
Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add src/core test/core
git commit -m "feat(core): wind, cloud, tide, river and current factors"
```

---

### Task 5: Score one zone (base, lights, range, compare, reason)

**Files:**
- Create: `src/core/score.js`
- Test: `test/core/score.test.js`

**Interfaces:**
- Consumes: all factor functions (Tasks 3–4)
- Produces:
  - `baseFromKd(kd: number): number`
  - `lightFor(meters: number, thresholds): 'purple'|'green'|'yellow'|'red'`
  - `rangeFor(meters: number, confidence: 'high'|'medium'|'low'): { low: number, high: number }`
  - `compareToNormal(meters: number, normal: number): 'up'|'down'|'same'`
  - `scoreZone({ zone, spot, day, base, bias }): ZoneScore` where
    `ZoneScore = { zoneId, base, bias, factors: {wave, pastWave, wind, cloud, tide, river, currentDir, currentSpeed}, rawMeters, meters, reasonKey, compare }`
  - `reasonText(reasonKey, { zone, spot, day }): string`

- [ ] **Step 1: Write the failing tests**

```js
import { test, expect } from 'vitest';
import { baseFromKd, lightFor, rangeFor, compareToNormal, scoreZone, reasonText } from '../../src/core/score.js';
import { SPOTS } from '../../src/data/spots/index.js';
import { makeDay } from '../helpers/makeDay.js';

const spot = SPOTS.xiaoliuqiu;
const west = spot.zones.find((z) => z.id === 'west');
const east = spot.zones.find((z) => z.id === 'east');
const th = spot.thresholds;

test('baseFromKd: 0.1 → 15 m, clamped to 1..40', () => {
  expect(baseFromKd(0.1)).toBeCloseTo(15);
  expect(baseFromKd(0.01)).toBe(40);
  expect(baseFromKd(10)).toBe(1);
});

test('light boundaries', () => {
  expect(lightFor(20, th)).toBe('purple');
  expect(lightFor(19.9, th)).toBe('green');
  expect(lightFor(12, th)).toBe('green');
  expect(lightFor(6, th)).toBe('yellow');
  expect(lightFor(5.9, th)).toBe('red');
});

test('range is wider when confidence is low', () => {
  expect(rangeFor(10, 'high')).toEqual({ low: 8, high: 12 });   // 7.5→8, 11.5→12
  expect(rangeFor(10, 'low')).toEqual({ low: 6, high: 13 });
});

test('compare to normal: ±15%', () => {
  expect(compareToNormal(11.5, 10)).toBe('up');
  expect(compareToNormal(8.5, 10)).toBe('down');
  expect(compareToNormal(10.4, 10)).toBe('same');
});

test('scoreZone multiplies base by all factors and bias', () => {
  const day = makeDay({ date: '2024-01-18' }); // not spring tide
  const s = scoreZone({ zone: west, spot, day, base: 15, bias: 0.9 });
  const product = Object.values(s.factors).reduce((a, b) => a * b, 1);
  expect(s.rawMeters).toBeCloseTo(15 * product);
  expect(s.meters).toBeCloseTo(15 * product * 0.9);
  expect(Object.keys(s.factors).sort()).toEqual(['cloud', 'currentDir', 'currentSpeed', 'pastWave', 'river', 'tide', 'wave', 'wind']);
});

test('waves from the west: west is the worst zone and reason is wave', () => {
  const day = makeDay({ date: '2024-01-18', hour: { waveH: 1.2, waveT: 9, waveDir: 270 } });
  const w = scoreZone({ zone: west, spot, day, base: 15, bias: 1 });
  const e = scoreZone({ zone: east, spot, day, base: 15, bias: 1 });
  expect(w.meters).toBeLessThan(e.meters);
  expect(w.reasonKey).toBe('wave');
  expect(reasonText('wave', { zone: west, spot, day })).toBe('湧浪正對西邊');
});

test('heavy rain: reason mentions the river and the rain amount', () => {
  const day = makeDay({ date: '2024-01-18', rain3dMm: 180 });
  const e = scoreZone({ zone: east, spot, day, base: 15, bias: 1 });
  expect(e.reasonKey).toBe('river');
  expect(reasonText('river', { zone: east, spot, day })).toBe('高屏溪泥水（上游前 3 天 180mm）');
});

test('calm day gives the good reason', () => {
  const day = makeDay({ date: '2024-01-18', hour: { cloud: 0 } });
  const s = scoreZone({ zone: west, spot, day, base: 15, bias: 1 });
  expect(s.reasonKey).toBe('good');
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- score`
Expected: FAIL — cannot find module `src/core/score.js`

- [ ] **Step 3: Write `src/core/score.js`**

```js
import { clamp } from './math.js';
import { K } from './constants.js';
import {
  waveFactor, pastWaveFactor, windFactor, cloudFactor, tideFactor,
  riverFactor, currentDirFactor, currentSpeedFactor,
} from './factors.js';

export const baseFromKd = (kd) => clamp(K.kdToMeters / kd, K.baseMin, K.baseMax);

export function lightFor(meters, th) {
  if (meters >= th.purple) return 'purple';
  if (meters >= th.green) return 'green';
  if (meters >= th.yellow) return 'yellow';
  return 'red';
}

export function rangeFor(meters, confidence) {
  const [lo, hi] = confidence === 'low' ? K.range.low : K.range.normal;
  return { low: Math.round(meters * lo), high: Math.round(meters * hi) };
}

export function compareToNormal(meters, normal) {
  const r = meters / normal;
  if (r >= K.compareUp) return 'up';
  if (r <= K.compareDown) return 'down';
  return 'same';
}

export function scoreZone({ zone, spot, day, base, bias = 1 }) {
  const factors = {
    wave: waveFactor(day.hours, zone),
    pastWave: pastWaveFactor(day.pastWaves, zone),
    wind: windFactor(day.hours, zone),
    cloud: cloudFactor(day.hours),
    tide: tideFactor(day.date),
    river: riverFactor(day.rain3dMm, day.hours, zone, spot),
    currentDir: currentDirFactor(day.hours, spot),
    currentSpeed: currentSpeedFactor(day.hours, zone),
  };
  const product = Object.values(factors).reduce((a, b) => a * b, 1);
  const rawMeters = base * product;
  const meters = rawMeters * bias;
  const [worstKey, worstVal] = Object.entries(factors).reduce((w, e) => (e[1] < w[1] ? e : w));
  return {
    zoneId: zone.id,
    base,
    bias,
    factors,
    rawMeters,
    meters,
    reasonKey: worstVal < K.reasonThreshold ? worstKey : 'good',
    compare: compareToNormal(meters, base * bias),
  };
}

export function reasonText(key, { zone, spot, day }) {
  switch (key) {
    case 'wave': return `湧浪正對${zone.name}`;
    case 'pastWave': return '前幾天的大浪還沒清完';
    case 'wind': return `風吹向${zone.name}`;
    case 'cloud': return '陰天，光線比較暗';
    case 'tide': return '大潮，水流比較強';
    case 'river': return `${spot.riverName}泥水（上游前 3 天 ${Math.round(day.rain3dMm)}mm）`;
    case 'currentDir': return `海流從${spot.riverName}那邊帶水過來`;
    case 'currentSpeed': return '強流攪起海底的沙';
    default: return '浪小、風平，條件不錯';
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- score`
Expected: 8 passed. If "calm day" fails because a factor is slightly below 0.97, check `makeDay` defaults (wind 5 km/h from north is offshore/neutral for west; cloud 0 → 1) and adjust the test's `hour` override, not `K.reasonThreshold`.

- [ ] **Step 5: Commit**

```bash
git add src/core/score.js test/core/score.test.js
git commit -m "feat(core): score a zone with lights, range, compare and reason"
```

---

### Task 6: Safety, upwelling, best dive window

**Files:**
- Create: `src/core/safety.js`, `src/core/bestWindow.js`
- Test: `test/core/safety.test.js`, `test/core/bestWindow.test.js`

**Interfaces:**
- Produces:
  - `currentLevel(kn: number, safety): 'green'|'yellow'|'red'`
  - `assessSafety(day, spot): { currentKn, currentToDeg, currentLevel, waveMaxM, waveRed, level, upwelling }` — `level` = worst of current level and wave (`waveRed` → 'red')
  - `detectUpwelling(day): boolean`
  - `bestWindow(hours): { start: number, end: number, slack: boolean }`

- [ ] **Step 1: Write failing tests**

`test/core/safety.test.js`:

```js
import { test, expect } from 'vitest';
import { currentLevel, assessSafety, detectUpwelling } from '../../src/core/safety.js';
import { makeDay } from '../helpers/makeDay.js';

const safety = { currentYellowKn: 0.5, currentRedKn: 1.0, waveRedM: 1.5 };
const spot = { safety };

test('current level boundaries', () => {
  expect(currentLevel(0.49, safety)).toBe('green');
  expect(currentLevel(0.5, safety)).toBe('yellow');
  expect(currentLevel(0.99, safety)).toBe('yellow');
  expect(currentLevel(1.0, safety)).toBe('red');
});

test('assessSafety uses the strongest daytime current and converts km/h to knots', () => {
  const day = makeDay({ hour: { currentKmh: 1.852 * 0.3 } });
  day.hours[4].currentKmh = 1.852 * 1.1;
  day.hours[4].currentDir = 45;
  const s = assessSafety(day, spot);
  expect(s.currentKn).toBeCloseTo(1.1);
  expect(s.currentToDeg).toBe(45);
  expect(s.currentLevel).toBe('red');
  expect(s.level).toBe('red');
});

test('big waves make the day red even with weak current', () => {
  const day = makeDay({ hour: { waveH: 1.8, currentKmh: 0.2 } });
  const s = assessSafety(day, spot);
  expect(s.waveRed).toBe(true);
  expect(s.level).toBe('red');
});

test('upwelling when SST is 2°C below the previous 3 days', () => {
  expect(detectUpwelling(makeDay({ hour: { sst: 26 }, sstPrev3: 28 }))).toBe(true);
  expect(detectUpwelling(makeDay({ hour: { sst: 27 }, sstPrev3: 28 }))).toBe(false);
  expect(detectUpwelling(makeDay({ sstPrev3: null }))).toBe(false);
});
```

`test/core/bestWindow.test.js`:

```js
import { test, expect } from 'vitest';
import { bestWindow } from '../../src/core/bestWindow.js';
import { makeDay } from '../helpers/makeDay.js';

test('the two hours with the weakest current win', () => {
  const day = makeDay({ hour: { currentKmh: 3 } });
  day.hours[5].currentKmh = 0.5; // 13:00
  day.hours[6].currentKmh = 0.5; // 14:00
  expect(bestWindow(day.hours)).toMatchObject({ start: 13, end: 15 });
});

test('with equal current, the window nearest noon wins', () => {
  const day = makeDay({ hour: { currentKmh: 1 } });
  expect(bestWindow(day.hours)).toMatchObject({ start: 11, end: 13 });
});

test('slack when sea level barely changes in the window', () => {
  const day = makeDay({ hour: { currentKmh: 1 } });
  day.hours.forEach((h, i) => { h.seaLevel = i * 0.2; }); // rising fast everywhere
  day.hours[3].seaLevel = 0.62; day.hours[4].seaLevel = 0.63; // 11:00-12:00 nearly flat
  day.hours[3].currentKmh = 0.2; day.hours[4].currentKmh = 0.2;
  expect(bestWindow(day.hours)).toEqual({ start: 11, end: 13, slack: true });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- safety bestWindow`
Expected: FAIL — missing modules

- [ ] **Step 3: Write `src/core/safety.js`**

```js
import { kmhToKnots, mean } from './math.js';
import { K } from './constants.js';

export function currentLevel(kn, safety) {
  if (kn >= safety.currentRedKn) return 'red';
  if (kn >= safety.currentYellowKn) return 'yellow';
  return 'green';
}

export function detectUpwelling(day) {
  const today = mean(day.hours.map((h) => h.sst).filter((v) => v != null));
  if (today == null || day.sstPrev3 == null) return false;
  return day.sstPrev3 - today >= K.upwellingDropC;
}

export function assessSafety(day, spot) {
  const strongest = day.hours.reduce((a, b) => (b.currentKmh > a.currentKmh ? b : a));
  const currentKn = kmhToKnots(strongest.currentKmh);
  const cLevel = currentLevel(currentKn, spot.safety);
  const waveMaxM = Math.max(...day.hours.map((h) => h.waveH));
  const waveRed = waveMaxM > spot.safety.waveRedM;
  return {
    currentKn,
    currentToDeg: strongest.currentDir,
    currentLevel: cLevel,
    waveMaxM,
    waveRed,
    level: waveRed ? 'red' : cLevel,
    upwelling: detectUpwelling(day),
  };
}
```

- [ ] **Step 4: Write `src/core/bestWindow.js`**

```js
import { kmhToKnots } from './math.js';
import { K } from './constants.js';

// weaker current is better; being close to noon (better light) is a small tie-breaker
const hourScore = (h) => -kmhToKnots(h.currentKmh) - K.noonWeight * Math.abs(h.hour - K.noonHour);

// hours: local 08..16. A window is two consecutive hours [start, start+2).
export function bestWindow(hours) {
  let best = null;
  for (let i = 0; i + 1 < hours.length; i++) {
    const a = hours[i];
    const b = hours[i + 1];
    const score = hourScore(a) + hourScore(b);
    if (!best || score > best.score) best = { i, score };
  }
  const a = hours[best.i];
  const b = hours[best.i + 1];
  const slack = a.seaLevel != null && b.seaLevel != null && Math.abs(b.seaLevel - a.seaLevel) < K.slackSeaLevelM;
  return { start: a.hour, end: b.hour + 1, slack };
}
```

Note: with equal current, windows 11–13 (|11−12|+|12−12| = 1) and 12–14 (0+1 = 1) tie. The loop uses strict `>`, so the earlier one (11–13) wins. Keep strict `>` — the test depends on it.

- [ ] **Step 5: Run to verify pass**

Run: `npm test -- safety bestWindow`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add src/core/safety.js src/core/bestWindow.js test/core
git commit -m "feat(core): safety lights, upwelling alert, best dive window"
```

---

### Task 7: Calibration (nowcast, outliers, zone bias)

**Files:**
- Create: `src/core/calibration.js`
- Test: `test/core/calibration.test.js`

**Interfaces:**
- Consumes: `median` (Task 1), `taipeiDate` (Task 1)
- Produces:
  - `nowcast(predMeters: number, todayReports: Report[], now: number): { meters, n, w, applied }`
  - `outlierWeights(reports: Report[]): number[]` — same order as input, 1 or 0.3
  - `zoneBias(reports: Report[], now: number): Record<zoneId, { bias: number, n: number }>`

Rules (spec §6):
- nowcast weight: 1 report 0.3, 2 → 0.5, 3+ → 0.7; halves every 3 hours since the newest report.
- zone bias: last 90 days; ratio = meters ÷ rawMeters; weight = outlierWeight × 0.5^(ageDays/30); `bias = 1 + (weightedMeanRatio − 1) × n/(n+10)`; n < 5 → 1; clamp 0.5–1.5.
- outlier: same zone + same Taipei date, group size ≥ 3, `|meters − median| > 0.5 × median` → 0.3.

- [ ] **Step 1: Write failing tests**

```js
import { test, expect } from 'vitest';
import { nowcast, outlierWeights, zoneBias } from '../../src/core/calibration.js';

const H = 3600000;
const DAY = 24 * H;
const NOW = Date.UTC(2026, 8, 28, 4, 0); // 12:00 Taipei
const rep = (over) => ({ id: Math.random().toString(36), zoneId: 'west', meters: 20, depth: 10, diveTime: NOW, rawMeters: 20, ...over });

test('nowcast: no reports → unchanged', () => {
  expect(nowcast(10, [], NOW)).toMatchObject({ meters: 10, n: 0, applied: false });
});

test('nowcast: 1 report moves 30% toward it', () => {
  const r = nowcast(10, [rep({ meters: 20 })], NOW);
  expect(r.w).toBeCloseTo(0.3);
  expect(r.meters).toBeCloseTo(13);
});

test('nowcast: 6 hours later only a quarter of the effect is left', () => {
  const r = nowcast(10, [rep({ meters: 20, diveTime: NOW - 6 * H })], NOW);
  expect(r.w).toBeCloseTo(0.075);
});

test('nowcast: 3+ reports use 0.7 and their median', () => {
  const r = nowcast(10, [rep({ meters: 20 }), rep({ meters: 22 }), rep({ meters: 30 })], NOW);
  expect(r.w).toBeCloseTo(0.7);
  expect(r.meters).toBeCloseTo(10 * 0.3 + 22 * 0.7);
});

test('outlier: far from the median of 3+ same-day reports gets 0.3', () => {
  const list = [rep({ meters: 20 }), rep({ meters: 22 }), rep({ meters: 5 })];
  expect(outlierWeights(list)).toEqual([1, 1, 0.3]);
});

test('outlier: fewer than 3 reports → all weight 1', () => {
  expect(outlierWeights([rep({ meters: 20 }), rep({ meters: 5 })])).toEqual([1, 1]);
});

test('zoneBias: 4 reports → no correction', () => {
  const list = Array.from({ length: 4 }, (_, i) => rep({ meters: 8, rawMeters: 10, diveTime: NOW - i * DAY }));
  expect(zoneBias(list, NOW).west).toEqual({ bias: 1, n: 4 });
});

test('zoneBias: 10 reports all 0.8× → bias 0.9', () => {
  const list = Array.from({ length: 10 }, (_, i) => rep({ meters: 8, rawMeters: 10, diveTime: NOW - i * DAY }));
  expect(zoneBias(list, NOW).west.bias).toBeCloseTo(0.9);
});

test('zoneBias: clamped to 0.5..1.5', () => {
  const list = Array.from({ length: 200 }, (_, i) => rep({ meters: 30, rawMeters: 10, diveTime: NOW - (i % 80) * DAY }));
  expect(zoneBias(list, NOW).west.bias).toBe(1.5);
});

test('zoneBias: reports older than 90 days are ignored', () => {
  const list = Array.from({ length: 10 }, () => rep({ meters: 8, rawMeters: 10, diveTime: NOW - 100 * DAY }));
  expect(zoneBias(list, NOW).west).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- calibration`
Expected: FAIL — missing module

- [ ] **Step 3: Write `src/core/calibration.js`**

```js
import { median, clamp } from './math.js';
import { taipeiDate } from './time.js';

const H = 3600000;
const DAY = 24 * H;

const nowcastBase = (n) => (n === 1 ? 0.3 : n === 2 ? 0.5 : 0.7);

export function nowcast(predMeters, todayReports, now) {
  const n = todayReports.length;
  if (!n) return { meters: predMeters, n: 0, w: 0, applied: false };
  const newest = Math.max(...todayReports.map((r) => r.diveTime));
  const hours = Math.max(0, (now - newest) / H);
  const w = nowcastBase(n) * 0.5 ** (hours / 3);
  const med = median(todayReports.map((r) => r.meters));
  return { meters: predMeters * (1 - w) + med * w, n, w, applied: true };
}

export function outlierWeights(reports) {
  const groups = new Map();
  reports.forEach((r, i) => {
    const key = `${r.zoneId}|${taipeiDate(r.diveTime)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  });
  const weights = reports.map(() => 1);
  for (const idx of groups.values()) {
    if (idx.length < 3) continue;
    const med = median(idx.map((i) => reports[i].meters));
    for (const i of idx) {
      if (Math.abs(reports[i].meters - med) > 0.5 * med) weights[i] = 0.3;
    }
  }
  return weights;
}

export function zoneBias(reports, now) {
  const recent = reports.filter((r) => now - r.diveTime <= 90 * DAY && r.rawMeters > 0);
  const weights = outlierWeights(recent);
  const acc = {};
  recent.forEach((r, i) => {
    const w = weights[i] * 0.5 ** ((now - r.diveTime) / DAY / 30);
    const a = (acc[r.zoneId] ??= { sw: 0, swr: 0, n: 0 });
    a.sw += w;
    a.swr += w * (r.meters / r.rawMeters);
    a.n += 1;
  });
  const out = {};
  for (const [zoneId, a] of Object.entries(acc)) {
    if (a.n < 5) { out[zoneId] = { bias: 1, n: a.n }; continue; }
    const ratio = a.swr / a.sw;
    out[zoneId] = { bias: clamp(1 + (ratio - 1) * (a.n / (a.n + 10)), 0.5, 1.5), n: a.n };
  }
  return out;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- calibration`
Expected: 10 passed

- [ ] **Step 5: Commit**

```bash
git add src/core/calibration.js test/core/calibration.test.js
git commit -m "feat(core): nowcast, outlier weights and per-zone bias"
```

---

### Task 8: Locate the user

**Files:**
- Create: `src/core/locate.js`
- Test: `test/core/locate.test.js`

**Interfaces:**
- Produces: `locate(pos: [lat, lon] | null, spot): { status: 'none' } | { status: 'far', km } | { status: 'near', zoneId, km }`

- [ ] **Step 1: Write failing test**

```js
import { test, expect } from 'vitest';
import { locate } from '../../src/core/locate.js';
import { SPOTS } from '../../src/data/spots/index.js';

const spot = SPOTS.xiaoliuqiu;

test('on the west coast → west zone', () => {
  expect(locate([22.341, 120.355], spot)).toMatchObject({ status: 'near', zoneId: 'west' });
});

test('in Tainan → far, with distance', () => {
  const r = locate([22.99, 120.21], spot);
  expect(r.status).toBe('far');
  expect(r.km).toBeGreaterThan(60);
});

test('no position → none', () => {
  expect(locate(null, spot)).toEqual({ status: 'none' });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- locate`
Expected: FAIL

- [ ] **Step 3: Write `src/core/locate.js`**

```js
import { distanceKm } from './math.js';

export function locate(pos, spot) {
  if (!pos) return { status: 'none' };
  const km = distanceKm(pos, spot.center);
  if (km > spot.locateMaxKm) return { status: 'far', km };
  const nearest = spot.zones
    .map((z) => ({ zoneId: z.id, d: distanceKm(pos, z.location) }))
    .reduce((a, b) => (b.d < a.d ? b : a));
  return { status: 'near', zoneId: nearest.zoneId, km };
}
```

- [ ] **Step 4: Run to verify pass, then commit**

Run: `npm test -- locate` → 3 passed

```bash
git add src/core/locate.js test/core/locate.test.js
git commit -m "feat(core): find the nearest zone to the user"
```

---

### Task 9: Open-Meteo client and parser

**Files:**
- Create: `src/services/openmeteo.js`
- Test: `test/services/openmeteo.test.js`

**Interfaces:**
- Consumes: `addDays`, `mean` (Task 1), `K.maxValid` (Task 2)
- Produces:
  - `marineUrl(spot)`, `weatherUrl(spot)`, `rainUrl(spot)` — strings
  - `fetchWeather(spot, fetchFn = fetch): Promise<{ marine, weather, rain }>` — throws on HTTP error
  - `parseDay(raw: { marine, weather, rain }, date: string): DayInput | null` — null if any needed value is missing or invalid

- [ ] **Step 1: Write failing tests**

The test builds a fake Open-Meteo response covering 2026-09-25 .. 2026-09-30 (past_days=3 + 3 forecast days).

```js
import { test, expect } from 'vitest';
import { marineUrl, rainUrl, parseDay } from '../../src/services/openmeteo.js';
import { SPOTS } from '../../src/data/spots/index.js';

const spot = SPOTS.xiaoliuqiu;

function times() {
  const out = [];
  for (let d = 25; d <= 30; d++) for (let h = 0; h < 24; h++) out.push(`2026-09-${d}T${String(h).padStart(2, '0')}:00`);
  return out;
}
const fill = (v) => times().map(() => v);

function fakeRaw(over = {}) {
  const t = times();
  return {
    marine: { hourly: {
      time: t, wave_height: fill(0.4), wave_direction: fill(200), wave_period: fill(5),
      ocean_current_velocity: fill(1.0), ocean_current_direction: fill(90),
      sea_surface_temperature: fill(28), sea_level_height_msl: fill(0.1), ...over.marine } },
    weather: { hourly: { time: t, wind_speed_10m: fill(8), wind_direction_10m: fill(45), cloud_cover: fill(30), ...over.weather } },
    rain: [0, 1, 2].map(() => ({ hourly: { time: t, precipitation: fill(1) } })),
  };
}

test('urls ask for the right variables and 3 past days', () => {
  expect(marineUrl(spot)).toContain('ocean_current_velocity');
  expect(marineUrl(spot)).toContain('past_days=3');
  expect(rainUrl(spot)).toContain('latitude=22.888,22.998,22.715');
});

test('parseDay builds 9 daytime hours and 3 past days', () => {
  const day = parseDay(fakeRaw(), '2026-09-28');
  expect(day.date).toBe('2026-09-28');
  expect(day.hours.map((h) => h.hour)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16]);
  expect(day.hours[0]).toMatchObject({ waveH: 0.4, waveT: 5, waveDir: 200, windKmh: 8, windDir: 45, cloud: 30, currentKmh: 1, currentDir: 90, sst: 28, seaLevel: 0.1 });
  expect(day.pastWaves).toHaveLength(3);
  expect(day.pastWaves[0]).toHaveLength(24);
  expect(day.sstPrev3).toBe(28);
});

test('rain3dMm = mean over rain points of the 72 hours before 08:00', () => {
  expect(parseDay(fakeRaw(), '2026-09-28').rain3dMm).toBe(72);
});

test('an impossible value makes the day invalid', () => {
  const raw = fakeRaw();
  raw.marine.hourly.wave_height[raw.marine.hourly.time.indexOf('2026-09-28T10:00')] = 50;
  expect(parseDay(raw, '2026-09-28')).toBeNull();
});

test('a missing daytime value makes the day invalid', () => {
  const raw = fakeRaw();
  raw.weather.hourly.cloud_cover[raw.weather.hourly.time.indexOf('2026-09-28T12:00')] = null;
  expect(parseDay(raw, '2026-09-28')).toBeNull();
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- openmeteo`
Expected: FAIL

- [ ] **Step 3: Write `src/services/openmeteo.js`**

```js
import { addDays } from '../core/time.js';
import { mean } from '../core/math.js';
import { K } from '../core/constants.js';

const COMMON = 'timezone=Asia%2FTaipei&past_days=3&forecast_days=3';

export const marineUrl = (spot) =>
  `https://marine-api.open-meteo.com/v1/marine?latitude=${spot.center[0]}&longitude=${spot.center[1]}` +
  '&hourly=wave_height,wave_direction,wave_period,ocean_current_velocity,ocean_current_direction,sea_surface_temperature,sea_level_height_msl' +
  `&${COMMON}`;

export const weatherUrl = (spot) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${spot.center[0]}&longitude=${spot.center[1]}` +
  `&hourly=wind_speed_10m,wind_direction_10m,cloud_cover&${COMMON}`;

export const rainUrl = (spot) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${spot.rainPoints.map((p) => p.lat).join(',')}` +
  `&longitude=${spot.rainPoints.map((p) => p.lon).join(',')}&hourly=precipitation&${COMMON}`;

async function getJson(url, fetchFn) {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

export async function fetchWeather(spot, fetchFn = fetch) {
  const [marine, weather, rain] = await Promise.all([
    getJson(marineUrl(spot), fetchFn),
    getJson(weatherUrl(spot), fetchFn),
    getJson(rainUrl(spot), fetchFn),
  ]);
  return { marine, weather, rain: Array.isArray(rain) ? rain : [rain] };
}

const stamp = (date, h) => `${date}T${String(h).padStart(2, '0')}:00`;
const indexer = (hourly) => {
  const m = new Map(hourly.time.map((t, i) => [t, i]));
  return (t) => m.get(t);
};
const ok = (v, max) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && (max == null || v <= max);

export function parseDay(raw, date) {
  const M = raw.marine.hourly;
  const W = raw.weather.hourly;
  const mi = indexer(M);
  const wi = indexer(W);

  const hours = [];
  for (let h = 8; h <= 16; h++) {
    const i = mi(stamp(date, h));
    const j = wi(stamp(date, h));
    if (i == null || j == null) return null;
    const hour = {
      hour: h,
      waveH: M.wave_height[i], waveT: M.wave_period[i], waveDir: M.wave_direction[i],
      currentKmh: M.ocean_current_velocity[i], currentDir: M.ocean_current_direction[i],
      sst: M.sea_surface_temperature[i], seaLevel: M.sea_level_height_msl[i],
      windKmh: W.wind_speed_10m[j], windDir: W.wind_direction_10m[j], cloud: W.cloud_cover[j],
    };
    const valid = ok(hour.waveH, K.maxValid.waveH) && ok(hour.waveT) && ok(hour.waveDir, 360)
      && ok(hour.currentKmh, K.maxValid.currentKmh) && ok(hour.currentDir, 360)
      && ok(hour.windKmh, K.maxValid.windKmh) && ok(hour.windDir, 360) && ok(hour.cloud, 100);
    if (!valid) return null;
    hours.push(hour);
  }

  const pastWaves = [1, 2, 3].map((back) => {
    const d = addDays(date, -back);
    const list = [];
    for (let h = 0; h < 24; h++) {
      const i = mi(stamp(d, h));
      if (i == null) continue;
      const w = { waveH: M.wave_height[i], waveT: M.wave_period[i], waveDir: M.wave_direction[i] };
      if (ok(w.waveH, K.maxValid.waveH) && ok(w.waveT) && ok(w.waveDir, 360)) list.push(w);
    }
    return list;
  });

  const start = `${addDays(date, -3)}T08:00`;
  const end = `${date}T08:00`;
  const sums = raw.rain.map((loc) =>
    loc.hourly.time.reduce((s, t, i) => (t >= start && t < end && ok(loc.hourly.precipitation[i]) ? s + loc.hourly.precipitation[i] : s), 0));
  const rain3dMm = mean(sums) ?? 0;

  const prevSst = [];
  for (let back = 1; back <= 3; back++) {
    const d = addDays(date, -back);
    for (let h = 0; h < 24; h++) {
      const i = mi(stamp(d, h));
      if (i != null && ok(M.sea_surface_temperature[i], 40)) prevSst.push(M.sea_surface_temperature[i]);
    }
  }

  return { date, hours, pastWaves, rain3dMm, sstPrev3: mean(prevSst) };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- openmeteo`
Expected: 5 passed

- [ ] **Step 5: Check against the live API once**

Run:

```bash
node -e "import('./src/services/openmeteo.js').then(async m => { const s = (await import('./src/data/spots/xiaoliuqiu.json', { with: { type: 'json' } })).default; const raw = await m.fetchWeather(s); const d = new Date(Date.now()+8*3600e3).toISOString().slice(0,10); console.log(JSON.stringify(m.parseDay(raw, d)?.hours[4])); })"
```

Expected: one hour object with real numbers (not `undefined`). If `null`, print which field is null and check the variable name in the URL.

- [ ] **Step 6: Commit**

```bash
git add src/services/openmeteo.js test/services/openmeteo.test.js
git commit -m "feat(services): Open-Meteo URLs and DayInput parser"
```

---

### Task 10: Build the full forecast for one day

**Files:**
- Create: `src/core/forecast.js`
- Test: `test/core/forecast.test.js`

**Interfaces:**
- Consumes: `scoreZone`, `lightFor`, `rangeFor`, `reasonText`, `baseFromKd` (Task 5); `assessSafety` (Task 6); `bestWindow` (Task 6); `nowcast` (Task 7); `taipeiDate` (Task 1)
- Produces: `buildForecast({ spot, day, stale, helper, reports, now, isToday }): Forecast`

```js
Forecast = {
  date, stale,                        // stale: hours old (number) or null
  zones: ZoneResult[],                // sorted by meters, best first
  safety,                             // from assessSafety
  best,                               // from bestWindow
  sst,                                // mean daytime SST (°C) or null
}
ZoneResult = ZoneScore & {
  name, baseSource: 'sat'|'fallback', biasN,
  meters,                             // after nowcast
  low, high, light,                   // light is 'gray' when stale
  confidence: 'high'|'medium'|'low',
  reason: string,
  nowcastN: number,
  todayReports: Report[],
}
```

Rules:
- Base: `helper.zones[id].source === 'sat'` → `baseFromKd(kdMedian)`; otherwise `zone.fallbackBase` and `baseSource = 'fallback'`.
- Bias: `helper.zones[id].bias ?? 1`.
- Confidence: `sat && !stale && hasReportInLast7Days` → high; `!sat && stale` → low; else medium.
- Nowcast only when `isToday`; reason becomes `依今天 N 人回報調整` when applied.

- [ ] **Step 1: Write failing tests**

```js
import { test, expect } from 'vitest';
import { buildForecast } from '../../src/core/forecast.js';
import { SPOTS } from '../../src/data/spots/index.js';
import { makeDay } from '../helpers/makeDay.js';

const spot = SPOTS.xiaoliuqiu;
const NOW = Date.UTC(2024, 0, 18, 4, 0); // 2024-01-18 12:00 Taipei, not spring tide
const day = makeDay({ date: '2024-01-18', hour: { cloud: 0 } });
const helper = {
  satelliteDate: '2024-01-10',
  zones: {
    west: { kdMedian: 0.075, source: 'sat', bias: 1, biasN: 0 },
    south: { kdMedian: 0.1, source: 'sat', bias: 1, biasN: 0 },
    north: { kdMedian: null, source: 'fallback', bias: 1, biasN: 0 },
    east: { kdMedian: 0.2, source: 'sat', bias: 0.9, biasN: 12 },
  },
};

test('zones are sorted best first and carry lights and ranges', () => {
  const f = buildForecast({ spot, day, stale: null, helper, reports: [], now: NOW, isToday: false });
  const m = f.zones.map((z) => z.meters);
  expect(m).toEqual([...m].sort((a, b) => b - a));
  expect(f.zones[0].zoneId).toBe('west');
  expect(f.zones[0].light).toBe('purple');
  expect(f.zones[0].low).toBeLessThan(f.zones[0].high);
});

test('satellite missing → fallback base, lower confidence', () => {
  const f = buildForecast({ spot, day, stale: null, helper, reports: [], now: NOW, isToday: false });
  const north = f.zones.find((z) => z.zoneId === 'north');
  expect(north.baseSource).toBe('fallback');
  expect(north.base).toBe(10);
  expect(north.confidence).toBe('medium');
});

test('helper missing entirely → all fallback', () => {
  const f = buildForecast({ spot, day, stale: null, helper: null, reports: [], now: NOW, isToday: false });
  expect(f.zones.every((z) => z.baseSource === 'fallback')).toBe(true);
});

test('stale weather → gray lights', () => {
  const f = buildForecast({ spot, day, stale: 5, helper, reports: [], now: NOW, isToday: false });
  expect(f.zones.every((z) => z.light === 'gray')).toBe(true);
  expect(f.zones.find((z) => z.zoneId === 'north').confidence).toBe('low');
});

test('bias from helper is applied', () => {
  const f = buildForecast({ spot, day, stale: null, helper, reports: [], now: NOW, isToday: false });
  const east = f.zones.find((z) => z.zoneId === 'east');
  expect(east.meters).toBeCloseTo(east.rawMeters * 0.9);
  expect(east.biasN).toBe(12);
});

test('today with a report: nowcast applied and reason rewritten', () => {
  const reports = [{ id: 'a', zoneId: 'south', meters: 30, depth: 10, diveTime: NOW, rawMeters: 15 }];
  const f = buildForecast({ spot, day, stale: null, helper, reports, now: NOW, isToday: true });
  const south = f.zones.find((z) => z.zoneId === 'south');
  expect(south.nowcastN).toBe(1);
  expect(south.reason).toBe('依今天 1 人回報調整');
  expect(south.confidence).toBe('high');
});

test('not today: reports do not change meters', () => {
  const reports = [{ id: 'a', zoneId: 'south', meters: 30, depth: 10, diveTime: NOW, rawMeters: 15 }];
  const a = buildForecast({ spot, day, stale: null, helper, reports, now: NOW, isToday: false });
  const b = buildForecast({ spot, day, stale: null, helper, reports: [], now: NOW, isToday: false });
  expect(a.zones.find((z) => z.zoneId === 'south').meters).toBeCloseTo(b.zones.find((z) => z.zoneId === 'south').meters);
});

test('forecast includes safety, best window and SST', () => {
  const f = buildForecast({ spot, day, stale: null, helper, reports: [], now: NOW, isToday: false });
  expect(f.safety.currentLevel).toBeDefined();
  expect(f.best.end - f.best.start).toBe(2);
  expect(f.sst).toBe(28);
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- forecast`
Expected: FAIL

- [ ] **Step 3: Write `src/core/forecast.js`**

```js
import { scoreZone, lightFor, rangeFor, reasonText, baseFromKd } from './score.js';
import { assessSafety } from './safety.js';
import { bestWindow } from './bestWindow.js';
import { nowcast } from './calibration.js';
import { taipeiDate } from './time.js';
import { mean } from './math.js';
import { K } from './constants.js';

const DAY_MS = 86400000;

export function buildForecast({ spot, day, stale, helper, reports, now, isToday }) {
  const zones = spot.zones.map((zone) => {
    const h = helper?.zones?.[zone.id];
    const sat = h?.source === 'sat' && h.kdMedian > 0;
    const base = sat ? baseFromKd(h.kdMedian) : zone.fallbackBase;
    const score = scoreZone({ zone, spot, day, base, bias: h?.bias ?? 1 });

    const zoneReports = reports.filter((r) => r.zoneId === zone.id);
    const todayReports = zoneReports.filter((r) => taipeiDate(r.diveTime) === day.date);
    const hasRecent = zoneReports.some((r) => now - r.diveTime <= K.recentReportDays * DAY_MS);
    const nc = isToday ? nowcast(score.meters, todayReports, now) : { meters: score.meters, n: 0, applied: false };

    const weatherOk = stale == null;
    const confidence = sat && weatherOk && hasRecent ? 'high' : !sat && !weatherOk ? 'low' : 'medium';
    const { low, high } = rangeFor(nc.meters, confidence);

    return {
      ...score,
      name: zone.name,
      baseSource: sat ? 'sat' : 'fallback',
      biasN: h?.biasN ?? 0,
      meters: nc.meters,
      low,
      high,
      light: weatherOk ? lightFor(nc.meters, spot.thresholds) : 'gray',
      confidence,
      reason: nc.applied ? `依今天 ${nc.n} 人回報調整` : reasonText(score.reasonKey, { zone, spot, day }),
      nowcastN: nc.n,
      todayReports,
    };
  });

  zones.sort((a, b) => b.meters - a.meters);
  return {
    date: day.date,
    stale,
    zones,
    safety: assessSafety(day, spot),
    best: bestWindow(day.hours),
    sst: mean(day.hours.map((h) => h.sst).filter((v) => v != null)),
  };
}
```

- [ ] **Step 4: Run to verify pass, then run the whole suite**

Run: `npm test`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add src/core/forecast.js test/core/forecast.test.js
git commit -m "feat(core): build a full day forecast with confidence, nowcast and fallbacks"
```

---

### Task 11: Worker — satellite base + zone bias

**Files:**
- Create: `worker/wrangler.toml`, `worker/src/erddap.js`, `worker/src/base.js`, `worker/src/firestore.js`, `worker/src/index.js`
- Test: `test/worker/erddap.test.js`, `test/worker/firestore.test.js`, `test/worker/index.test.js`

**Interfaces:**
- Consumes: `SPOTS` (Task 2), `median` (Task 1), `zoneBias` (Task 7)
- Produces (HTTP): `GET /v1/base?spot=<id>` → `HelperData` JSON with header `Access-Control-Allow-Origin: *`. Unknown spot → 404.
- Produces (JS): `kdUrl(satBox)`, `parseKdCsv(text) → { values: number[], latestDate: string|null }`, `computeZones(spot, fetchFn) → { zones, satelliteDate }`, `decodeDoc(doc) → object`, `fetchReports(projectId, spotId, sinceMs, fetchFn) → Report[]`, `buildHelperData(spot, env, fetchFn, now) → HelperData`

- [ ] **Step 1: Write failing tests**

`test/worker/erddap.test.js`:

```js
import { test, expect } from 'vitest';
import { kdUrl, parseKdCsv } from '../../worker/src/erddap.js';

const CSV = `time,altitude,latitude,longitude,kd_490
UTC,m,degrees_north,degrees_east,m^-1
2026-08-12T12:00:00Z,0.0,22.36,120.30,0.0488
2026-08-12T12:00:00Z,0.0,22.36,120.32,NaN
2026-09-15T12:00:00Z,0.0,22.36,120.34,0.0576
`;

test('kdUrl asks for the last 30 days inside the box', () => {
  const u = kdUrl([[22.32, 120.31], [22.36, 120.34]]);
  expect(u).toContain('noaacwNPPN20S3AkdSCIDINEOF2kmDaily.csv');
  expect(decodeURIComponent(u)).toContain('kd_490[last-29:1:last][0][(22.32):1:(22.36)][(120.31):1:(120.34)]');
});

test('parseKdCsv skips headers and NaN, finds latest date', () => {
  expect(parseKdCsv(CSV)).toEqual({ values: [0.0488, 0.0576], latestDate: '2026-09-15' });
});
```

`test/worker/base.test.js`:

```js
import { test, expect } from 'vitest';
import { computeZones } from '../../worker/src/base.js';

const spot = { zones: [{ id: 'w', satBox: [[22.32, 120.31], [22.36, 120.34]] }] };
const csv = (date, n) => 'h\nu\n' + Array.from({ length: n }, () => `${date}T12:00:00Z,0,22.3,120.3,0.1`).join('\n');
const fetchOf = (text, ok = true) => async () => ({ ok, text: async () => text });
const NOW = Date.UTC(2026, 8, 27);

test('enough fresh values → sat with median', async () => {
  const r = await computeZones(spot, fetchOf(csv('2026-09-15', 20)), NOW);
  expect(r.zones.w).toEqual({ kdMedian: 0.1, source: 'sat' });
  expect(r.satelliteDate).toBe('2026-09-15');
});

test('too few values, too old, or NOAA down → fallback', async () => {
  expect((await computeZones(spot, fetchOf(csv('2026-09-15', 5)), NOW)).zones.w.source).toBe('fallback');
  expect((await computeZones(spot, fetchOf(csv('2026-07-01', 20)), NOW)).zones.w.source).toBe('fallback');
  expect((await computeZones(spot, fetchOf('', false), NOW)).zones.w.source).toBe('fallback');
});
```

`test/worker/firestore.test.js`:

```js
import { test, expect } from 'vitest';
import { decodeDoc } from '../../worker/src/firestore.js';

test('decodeDoc turns Firestore REST values into plain JS', () => {
  const doc = { name: 'projects/p/databases/(default)/documents/reports/abc', fields: {
    zoneId: { stringValue: 'west' },
    meters: { integerValue: '20' },
    depth: { doubleValue: 10.5 },
    diveTime: { timestampValue: '2026-09-28T02:30:00Z' },
    snapshot: { mapValue: { fields: { rawMeters: { doubleValue: 18.2 } } } },
  } };
  expect(decodeDoc(doc)).toEqual({
    id: 'abc', zoneId: 'west', meters: 20, depth: 10.5,
    diveTime: Date.parse('2026-09-28T02:30:00Z'), snapshot: { rawMeters: 18.2 },
  });
});
```

`test/worker/index.test.js`:

```js
import { test, expect } from 'vitest';
import worker from '../../worker/src/index.js';

function fakeKV(initial = {}) {
  const store = new Map(Object.entries(initial));
  return { get: async (k) => store.get(k) ?? null, put: async (k, v) => { store.set(k, v); } };
}

test('serves cached helper data with CORS', async () => {
  const data = { spotId: 'xiaoliuqiu', zones: {} };
  const env = { CACHE: fakeKV({ 'base:xiaoliuqiu': JSON.stringify(data) }) };
  const res = await worker.fetch(new Request('https://x/v1/base?spot=xiaoliuqiu'), env);
  expect(res.status).toBe(200);
  expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  expect(await res.json()).toEqual(data);
});

test('unknown spot → 404', async () => {
  const res = await worker.fetch(new Request('https://x/v1/base?spot=nope'), { CACHE: fakeKV() });
  expect(res.status).toBe(404);
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- worker`
Expected: FAIL — missing modules

- [ ] **Step 3: Write `worker/src/erddap.js`**

```js
const BASE = 'https://coastwatch.noaa.gov/erddap/griddap/noaacwNPPN20S3AkdSCIDINEOF2kmDaily.csv';

export function kdUrl([[latMin, lonMin], [latMax, lonMax]]) {
  const q = `kd_490[last-29:1:last][0][(${latMin}):1:(${latMax})][(${lonMin}):1:(${lonMax})]`;
  return `${BASE}?${encodeURIComponent(q)}`;
}

export function parseKdCsv(text) {
  const values = [];
  let latestDate = null;
  for (const line of text.trim().split('\n').slice(2)) {
    const cols = line.split(',');
    const kd = Number(cols[4]);
    if (!Number.isFinite(kd) || kd <= 0) continue;
    values.push(kd);
    const d = cols[0].slice(0, 10);
    if (!latestDate || d > latestDate) latestDate = d;
  }
  return { values, latestDate };
}
```

- [ ] **Step 4: Write `worker/src/base.js`**

```js
import { kdUrl, parseKdCsv } from './erddap.js';
import { median } from '../../src/core/math.js';

const MIN_VALUES = 10;
const MAX_AGE_DAYS = 45; // older satellite data counts as "太舊" → fallback

export async function computeZones(spot, fetchFn = fetch, now = Date.now()) {
  const zones = {};
  let satelliteDate = null;
  for (const z of spot.zones) {
    try {
      const res = await fetchFn(kdUrl(z.satBox));
      if (!res.ok) throw new Error(`NOAA ${res.status}`);
      const { values, latestDate } = parseKdCsv(await res.text());
      const fresh = latestDate && now - Date.parse(`${latestDate}T00:00:00Z`) <= MAX_AGE_DAYS * 86400000;
      const ok = values.length >= MIN_VALUES && fresh;
      zones[z.id] = { kdMedian: ok ? median(values) : null, source: ok ? 'sat' : 'fallback' };
      if (ok && (!satelliteDate || latestDate > satelliteDate)) satelliteDate = latestDate;
    } catch {
      zones[z.id] = { kdMedian: null, source: 'fallback' };
    }
  }
  return { zones, satelliteDate };
}
```

- [ ] **Step 5: Write `worker/src/firestore.js`**

```js
function decodeValue(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return decodeFields(v.mapValue.fields ?? {});
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(decodeValue);
  return undefined;
}

const decodeFields = (fields) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decodeValue(v)]));

export const decodeDoc = (doc) => ({ id: doc.name.split('/').pop(), ...decodeFields(doc.fields ?? {}) });

export async function fetchReports(projectId, spotId, sinceMs, fetchFn = fetch) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const body = { structuredQuery: {
    from: [{ collectionId: 'reports' }],
    where: { compositeFilter: { op: 'AND', filters: [
      { fieldFilter: { field: { fieldPath: 'spotId' }, op: 'EQUAL', value: { stringValue: spotId } } },
      { fieldFilter: { field: { fieldPath: 'diveTime' }, op: 'GREATER_THAN_OR_EQUAL', value: { timestampValue: new Date(sinceMs).toISOString() } } },
    ] } },
    limit: 2000,
  } };
  const res = await fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Firestore ${res.status}`);
  const rows = await res.json();
  return rows.filter((r) => r.document).map((r) => {
    const d = decodeDoc(r.document);
    return { ...d, rawMeters: d.snapshot?.rawMeters };
  });
}
```

- [ ] **Step 6: Write `worker/src/index.js`**

```js
import { SPOTS } from '../../src/data/spots/index.js';
import { zoneBias } from '../../src/core/calibration.js';
import { computeZones } from './base.js';
import { fetchReports } from './firestore.js';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json; charset=utf-8' };
const DAY = 86400000;

export async function buildHelperData(spot, env, fetchFn = fetch, now = Date.now()) {
  const { zones, satelliteDate } = await computeZones(spot, fetchFn, now);
  let bias = {};
  try {
    const reports = await fetchReports(env.FIREBASE_PROJECT_ID, spot.id, now - 90 * DAY, fetchFn);
    bias = zoneBias(reports, now);
  } catch {
    // no reports reachable → no correction
  }
  for (const id of Object.keys(zones)) {
    zones[id].bias = bias[id]?.bias ?? 1;
    zones[id].biasN = bias[id]?.n ?? 0;
  }
  return { spotId: spot.id, updatedAt: now, satelliteDate, zones };
}

async function refresh(spot, env) {
  const data = await buildHelperData(spot, env);
  await env.CACHE.put(`base:${spot.id}`, JSON.stringify(data));
  return data;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (url.pathname !== '/v1/base') return new Response('{"error":"not found"}', { status: 404, headers: CORS });
    const spot = SPOTS[url.searchParams.get('spot')];
    if (!spot) return new Response('{"error":"unknown spot"}', { status: 404, headers: CORS });
    const cached = await env.CACHE.get(`base:${spot.id}`);
    const data = cached ? JSON.parse(cached) : await refresh(spot, env);
    return new Response(JSON.stringify(data), { headers: { ...CORS, 'Cache-Control': 'public, max-age=3600' } });
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(Promise.all(Object.values(SPOTS).map((s) => refresh(s, env))));
  },
};
```

- [ ] **Step 7: Write `worker/wrangler.toml`**

The KV id is filled in during Task 17.

```toml
name = "haidi-helper"
main = "src/index.js"
compatibility_date = "2026-09-01"

[triggers]
crons = ["0 22 * * *"]   # 06:00 Taipei every day

[vars]
FIREBASE_PROJECT_ID = "REPLACE_IN_TASK_17"

[[kv_namespaces]]
binding = "CACHE"
id = "REPLACE_IN_TASK_17"
```

- [ ] **Step 8: Run tests**

Run: `npm test -- worker`
Expected: 7 passed

- [ ] **Step 9: Run the Worker locally against real NOAA**

```bash
cd worker && npx wrangler dev --local --port 8787
```

In a second terminal: `curl -s "http://localhost:8787/v1/base?spot=xiaoliuqiu"`
Expected: JSON with four zones; most have `"source":"sat"` and a `kdMedian` around 0.04–0.2; `satelliteDate` is a real date. The Firestore call fails (project id placeholder) → every `bias` is 1. Stop with Ctrl+C.

- [ ] **Step 10: Commit**

```bash
git add worker test/worker
git commit -m "feat(worker): daily satellite base and per-zone bias helper"
```

---

### Task 12: Firebase — rules, reports service, offline outbox

**Files:**
- Create: `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `.env.example`, `src/config.js`, `src/services/reports.js`, `src/services/outbox.js`
- Test: `test/services/outbox.test.js`, `test/services/reports.test.js`

**Interfaces:**
- Produces:
  - `createOutbox(storage, sendFn): { add(item): Promise<'sent'|'queued'>, flush(): Promise<number>, size(): number }` — `storage` is `localStorage`-like (`getItem`, `setItem`)
  - `buildReportDoc({ spotId, form, snapshot }): object` — plain object, `diveTime` in ms (pure, tested)
  - `sendReport(doc): Promise<void>` — signs in anonymously, converts `diveTime` to `Timestamp`, adds `uid` + `createdAt: serverTimestamp()`
  - `fetchRecentReports(spotId, days = 7): Promise<Report[]>` — `diveTime` as ms, `rawMeters` lifted from snapshot

**Human step (Michael):** create the Firebase project. This needs his Google account.

- [ ] **Step 1: Michael creates the Firebase project**

1. Go to https://console.firebase.google.com → 新增專案 → name `haidi-qingbuqing` → Google Analytics off.
2. Build → Firestore Database → 建立資料庫 → 位置 `asia-east1 (台灣)` → 正式版模式.
3. Build → Authentication → 開始使用 → 登入方式 → 匿名 → 啟用.
4. 專案設定 → 一般 → 你的應用程式 → 網頁 `</>` → 暱稱 `web` → copy the `firebaseConfig` values.
5. Give the values to the implementer (they are public web config, not secrets).

- [ ] **Step 2: Write `.env.example`, then `.env` with real values**

```
VITE_HELPER_URL=http://localhost:8787
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
```

- [ ] **Step 3: Write `src/config.js`**

```js
export const HELPER_URL = import.meta.env.VITE_HELPER_URL;
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
```

- [ ] **Step 4: Write `firestore.rules`**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /reports/{id} {
      allow read: if true;
      allow create: if request.auth != null
        && request.resource.data.keys().hasOnly(['spotId','zoneId','meters','depth','diveTime','nickname','note','uid','createdAt','snapshot'])
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.spotId is string
        && request.resource.data.zoneId is string
        && request.resource.data.meters is number && request.resource.data.meters >= 0 && request.resource.data.meters <= 60
        && request.resource.data.depth is number && request.resource.data.depth >= 0 && request.resource.data.depth <= 60
        && request.resource.data.diveTime is timestamp
        && request.resource.data.nickname is string && request.resource.data.nickname.size() <= 20
        && request.resource.data.note is string && request.resource.data.note.size() <= 200
        && request.resource.data.snapshot is map
        && request.resource.data.createdAt == request.time;
      allow update, delete: if false;
    }
  }
}
```

- [ ] **Step 5: Write `firestore.indexes.json` and `firebase.json`**

`firestore.indexes.json`:

```json
{
  "indexes": [
    { "collectionGroup": "reports", "queryScope": "COLLECTION",
      "fields": [ { "fieldPath": "spotId", "order": "ASCENDING" }, { "fieldPath": "diveTime", "order": "DESCENDING" } ] }
  ],
  "fieldOverrides": []
}
```

`firebase.json`:

```json
{ "firestore": { "rules": "firestore.rules", "indexes": "firestore.indexes.json" } }
```

- [ ] **Step 6: Write failing tests**

`test/services/outbox.test.js`:

```js
import { test, expect } from 'vitest';
import { createOutbox } from '../../src/services/outbox.js';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
}

test('sent immediately when online', async () => {
  const sent = [];
  const box = createOutbox(fakeStorage(), async (d) => { sent.push(d); });
  expect(await box.add({ a: 1 })).toBe('sent');
  expect(sent).toEqual([{ a: 1 }]);
  expect(box.size()).toBe(0);
});

test('queued when sending fails, flushed later', async () => {
  let online = false;
  const sent = [];
  const storage = fakeStorage();
  const box = createOutbox(storage, async (d) => { if (!online) throw new Error('offline'); sent.push(d); });
  expect(await box.add({ a: 1 })).toBe('queued');
  expect(box.size()).toBe(1);
  online = true;
  expect(await box.flush()).toBe(1);
  expect(sent).toEqual([{ a: 1 }]);
  expect(box.size()).toBe(0);
});

test('queue survives a page reload (same storage)', async () => {
  const storage = fakeStorage();
  const box1 = createOutbox(storage, async () => { throw new Error('offline'); });
  await box1.add({ a: 1 });
  const box2 = createOutbox(storage, async () => {});
  expect(box2.size()).toBe(1);
});
```

`test/services/reports.test.js` (only the pure builder; Firebase itself is checked by hand in Task 15):

```js
import { test, expect, vi } from 'vitest';
vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}), signInAnonymously: async () => ({ user: { uid: 'u' } }) }));
vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}), collection: () => ({}), addDoc: async () => ({}), query: () => ({}), where: () => ({}),
  orderBy: () => ({}), getDocs: async () => ({ docs: [] }), serverTimestamp: () => ({}), Timestamp: { fromMillis: (ms) => ({ ms }) },
}));
const { buildReportDoc } = await import('../../src/services/reports.js');

test('buildReportDoc: 30+ becomes 30, trims text, keeps snapshot', () => {
  const doc = buildReportDoc({
    spotId: 'xiaoliuqiu',
    form: { zoneId: 'west', meters: '30+', depth: '10', diveTime: 1790000000000, nickname: '  Michael  ', note: 'x'.repeat(250) },
    snapshot: { rawMeters: 18.2, meters: 17, base: 20, bias: 1, factors: {}, date: '2026-09-28' },
  });
  expect(doc).toMatchObject({ spotId: 'xiaoliuqiu', zoneId: 'west', meters: 30, depth: 10, diveTime: 1790000000000, nickname: 'Michael' });
  expect(doc.note).toHaveLength(200);
  expect(doc.snapshot.rawMeters).toBe(18.2);
});
```

- [ ] **Step 7: Run to verify fail**

Run: `npm test -- outbox reports`
Expected: FAIL

- [ ] **Step 8: Write `src/services/outbox.js`**

```js
const KEY = 'haidi:outbox';

export function createOutbox(storage, sendFn) {
  const read = () => JSON.parse(storage.getItem(KEY) ?? '[]');
  const write = (list) => storage.setItem(KEY, JSON.stringify(list));

  return {
    size: () => read().length,
    async add(item) {
      try {
        await sendFn(item);
        return 'sent';
      } catch {
        write([...read(), item]);
        return 'queued';
      }
    },
    async flush() {
      const list = read();
      const left = [];
      let sent = 0;
      for (const item of list) {
        try { await sendFn(item); sent++; } catch { left.push(item); }
      }
      write(left);
      return sent;
    },
  };
}
```

- [ ] **Step 9: Write `src/services/reports.js`**

```js
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, where, orderBy, getDocs, serverTimestamp, Timestamp } from 'firebase/firestore';
import { firebaseConfig } from '../config.js';

let app;
const init = () => (app ??= initializeApp(firebaseConfig));

const num = (v) => Number(String(v).replace('+', ''));

export function buildReportDoc({ spotId, form, snapshot }) {
  return {
    spotId,
    zoneId: form.zoneId,
    meters: num(form.meters),
    depth: num(form.depth),
    diveTime: form.diveTime,
    nickname: String(form.nickname ?? '').trim().slice(0, 20),
    note: String(form.note ?? '').trim().slice(0, 200),
    snapshot,
  };
}

export async function sendReport(doc) {
  init();
  const auth = getAuth();
  const { user } = auth.currentUser ? { user: auth.currentUser } : await signInAnonymously(auth);
  await addDoc(collection(getFirestore(), 'reports'), {
    ...doc,
    diveTime: Timestamp.fromMillis(doc.diveTime),
    uid: user.uid,
    createdAt: serverTimestamp(),
  });
}

export async function fetchRecentReports(spotId, days = 7) {
  init();
  const since = Timestamp.fromMillis(Date.now() - days * 86400000);
  const q = query(collection(getFirestore(), 'reports'),
    where('spotId', '==', spotId), where('diveTime', '>=', since), orderBy('diveTime', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const x = d.data();
    return { id: d.id, ...x, diveTime: x.diveTime.toMillis(), rawMeters: x.snapshot?.rawMeters };
  });
}
```

Note: `createdAt` is set by `serverTimestamp()` at send time, so reports flushed later from the outbox still pass the `createdAt == request.time` rule; `diveTime` keeps the real dive time.

- [ ] **Step 10: Run tests**

Run: `npm test -- outbox reports`
Expected: 4 passed

- [ ] **Step 11: Deploy rules and index**

```bash
npx firebase login
npx firebase use --add   # pick haidi-qingbuqing
npx firebase deploy --only firestore
```

Expected: `Deploy complete!`

- [ ] **Step 12: Commit (never commit `.env`)**

```bash
git add firebase.json firestore.rules firestore.indexes.json .env.example src/config.js src/services test/services
git commit -m "feat(reports): firestore rules, anonymous reports, offline outbox"
```

---

### Task 13: Weather cache and helper client

**Files:**
- Create: `src/services/cache.js`, `src/services/helper.js`
- Test: `test/services/cache.test.js`, `test/services/helper.test.js`

**Interfaces:**
- Produces:
  - `saveWeather(storage, spotId, raw, now)`, `loadWeather(storage, spotId): { raw, savedAt } | null`
  - `fetchHelper(baseUrl, spotId, fetchFn = fetch): Promise<HelperData | null>` — never throws

- [ ] **Step 1: Write failing tests**

`test/services/cache.test.js`:

```js
import { test, expect } from 'vitest';
import { saveWeather, loadWeather } from '../../src/services/cache.js';

const storage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('save then load', () => {
  const s = storage();
  saveWeather(s, 'xiaoliuqiu', { a: 1 }, 1000);
  expect(loadWeather(s, 'xiaoliuqiu')).toEqual({ raw: { a: 1 }, savedAt: 1000 });
});

test('nothing saved → null; broken JSON → null', () => {
  const s = storage();
  expect(loadWeather(s, 'xiaoliuqiu')).toBeNull();
  s.setItem('haidi:weather:xiaoliuqiu', '{broken');
  expect(loadWeather(s, 'xiaoliuqiu')).toBeNull();
});
```

`test/services/helper.test.js`:

```js
import { test, expect } from 'vitest';
import { fetchHelper } from '../../src/services/helper.js';

test('returns JSON on success', async () => {
  const f = async () => ({ ok: true, json: async () => ({ spotId: 'x' }) });
  expect(await fetchHelper('https://h', 'x', f)).toEqual({ spotId: 'x' });
});

test('returns null on HTTP error or network error', async () => {
  expect(await fetchHelper('https://h', 'x', async () => ({ ok: false }))).toBeNull();
  expect(await fetchHelper('https://h', 'x', async () => { throw new Error('down'); })).toBeNull();
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- cache helper`
Expected: FAIL

- [ ] **Step 3: Write `src/services/cache.js`**

```js
const key = (spotId) => `haidi:weather:${spotId}`;

export function saveWeather(storage, spotId, raw, now) {
  try { storage.setItem(key(spotId), JSON.stringify({ raw, savedAt: now })); } catch { /* storage full or blocked */ }
}

export function loadWeather(storage, spotId) {
  try {
    const v = storage.getItem(key(spotId));
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Write `src/services/helper.js`**

```js
export async function fetchHelper(baseUrl, spotId, fetchFn = fetch) {
  try {
    const res = await fetchFn(`${baseUrl}/v1/base?spot=${encodeURIComponent(spotId)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Run to verify pass, then commit**

Run: `npm test -- cache helper` → 4 passed

```bash
git add src/services/cache.js src/services/helper.js test/services
git commit -m "feat(services): weather cache and helper client"
```

---

### Task 14: Views — main screen and detail page

**Files:**
- Create: `src/ui/format.js`, `src/ui/mainView.js`, `src/ui/detailView.js`
- Test: `test/ui/mainView.test.js`, `test/ui/detailView.test.js`

**Interfaces:**
- Consumes: `Forecast`, `ZoneResult` (Task 10), `bearingText` (Task 1)
- Produces:
  - `format.js`: `LIGHT`, `COMPARE_TEXT`, `CONF_TEXT`, `FACTOR_LABEL`, `knots(kn)`, `arrow(toDeg)`, `timeAgo(ms, now)`, `hhmm(ms)`, `md(dateStr)`, `esc(s)`
  - `renderMain({ spot, forecast, dayIndex, dayLabels, located, freshness, now }): string`
    - `located`: result of `locate()`
    - `freshness`: `{ weatherAt: ms|null, satelliteDate: string|null, lastReportAt: ms|null }`
  - `renderDetail({ spot, zone: ZoneResult, dateLabel, reports: Report[], now }): string`
- DOM hooks used by `main.js` (Task 15): `data-day="0|1|2"`, `data-zone="<id>"`, `data-action="report"`, `data-action="share"`, `data-action="back"`

- [ ] **Step 1: Write failing tests**

`test/ui/mainView.test.js`:

```js
import { test, expect } from 'vitest';
import { renderMain } from '../../src/ui/mainView.js';
import { buildForecast } from '../../src/core/forecast.js';
import { SPOTS } from '../../src/data/spots/index.js';
import { makeDay } from '../helpers/makeDay.js';

const spot = SPOTS.xiaoliuqiu;
const NOW = Date.UTC(2024, 0, 18, 4, 0);
const forecast = buildForecast({ spot, day: makeDay({ date: '2024-01-18' }), stale: null, helper: null, reports: [], now: NOW, isToday: true });
const base = { spot, forecast, dayIndex: 0, dayLabels: ['今天', '明天', '後天'], located: { status: 'none' }, freshness: { weatherAt: NOW, satelliteDate: '2024-01-10', lastReportAt: null }, now: NOW };

test('shows 4 cards in forecast order with ranges', () => {
  const html = renderMain(base);
  const order = [...html.matchAll(/data-zone="(\w+)"/g)].map((m) => m[1]);
  expect(order).toEqual(forecast.zones.map((z) => z.zoneId));
  expect(html).toContain(`${forecast.zones[0].low}~${forecast.zones[0].high}m`);
});

test('marks the zone you are in', () => {
  const html = renderMain({ ...base, located: { status: 'near', zoneId: 'west', km: 0.5 } });
  expect(html).toContain('📍 你現在在小琉球<b>西邊</b>');
  expect(html).toMatch(/data-zone="west"[^>]*>\s*<span class="tag">你在這裡<\/span>/);
});

test('far away shows the distance', () => {
  expect(renderMain({ ...base, located: { status: 'far', km: 65.4 } })).toContain('📍 你離小琉球 65 公里');
});

test('stale weather shows how old it is', () => {
  const stale = buildForecast({ spot, day: makeDay({ date: '2024-01-18' }), stale: 3, helper: null, reports: [], now: NOW, isToday: true });
  expect(renderMain({ ...base, forecast: stale })).toContain('這是 3 小時前的預測');
});

test('sea info row and footer freshness', () => {
  const html = renderMain(base);
  expect(html).toContain('🌀');
  expect(html).toContain('🌡️');
  expect(html).toContain('⏰');
  expect(html).toContain('衛星 1/10');
  expect(html).toContain('分不出島的四邊');
});
```

`test/ui/detailView.test.js`:

```js
import { test, expect } from 'vitest';
import { renderDetail } from '../../src/ui/detailView.js';
import { buildForecast } from '../../src/core/forecast.js';
import { SPOTS } from '../../src/data/spots/index.js';
import { makeDay } from '../helpers/makeDay.js';

const spot = SPOTS.xiaoliuqiu;
const NOW = Date.UTC(2024, 0, 18, 4, 0);
const f = buildForecast({ spot, day: makeDay({ date: '2024-01-18', hour: { waveH: 1.2, waveT: 9, waveDir: 270 } }), stale: null,
  helper: { zones: { west: { kdMedian: 0.1, source: 'sat', bias: 0.88, biasN: 23 } } }, reports: [], now: NOW, isToday: false });
const west = f.zones.find((z) => z.zoneId === 'west');

test('shows base, every factor with its multiplier, and bias line', () => {
  const html = renderDetail({ spot, zone: west, dateLabel: '明天 1/18', reports: [], now: NOW });
  expect(html).toContain('平常底分：<b>15 米</b>');
  for (const label of ['今天的浪', '前幾天的浪', '風', '雲量', '潮汐', '河口', '海流方向', '海流速度']) expect(html).toContain(label);
  expect(html).toContain(`×${west.factors.wave.toFixed(2)}`);
  expect(html).toContain('依過去 23 筆回報，這區 ×0.88');
  expect(html).toContain('面向西 ・ 開放海岸 ・ 礁岩');
});

test('no reports message; reports list escapes html', () => {
  expect(renderDetail({ spot, zone: west, dateLabel: 'x', reports: [], now: NOW })).toContain('還沒有人回報這一區');
  const r = [{ id: 'a', zoneId: 'west', meters: 20, depth: 10, diveTime: NOW, nickname: '<b>x</b>', note: '海龜' }];
  const html = renderDetail({ spot, zone: west, dateLabel: 'x', reports: r, now: NOW });
  expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  expect(html).toContain('海龜');
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- ui`
Expected: FAIL

- [ ] **Step 3: Write `src/ui/format.js`**

```js
import { bearingText } from '../core/math.js';

export const LIGHT = {
  purple: { emoji: '🟣', cls: 'pu' }, green: { emoji: '🟢', cls: 'gr' },
  yellow: { emoji: '🟡', cls: 'ye' }, red: { emoji: '🔴', cls: 're' }, gray: { emoji: '⚪', cls: 'gy' },
};
export const COMPARE_TEXT = { up: '比平常清 ↑', down: '比平常濁 ↓', same: '跟平常差不多' };
export const CONF_TEXT = { high: '高', medium: '中', low: '低' };
export const SAFETY_TEXT = { green: '輕鬆', yellow: '注意', red: '⚠️ 流強，建議放流潛或換時段' };
export const FACTOR_LABEL = {
  wave: '🌊 今天的浪', pastWave: '🌊 前幾天的浪', wind: '🌬️ 風', cloud: '☁️ 雲量',
  tide: '🌙 潮汐', river: '🌧️ 河口', currentDir: '🌀 海流方向', currentSpeed: '🌀 海流速度',
};
export const SHELTER_TEXT = { open: '開放海岸', semi: '半開放', bay: '灣內' };
export const BOTTOM_TEXT = { rock: '礁岩', mixed: '混合', sand: '沙底' };

export const knots = (kn) => `${kn.toFixed(1)} 節`;
export const arrow = (toDeg) => `→ 往${bearingText(toDeg)}`;
export const hhmm = (ms) => new Date(ms + 8 * 3600000).toISOString().slice(11, 16);
export const md = (dateStr) => `${Number(dateStr.slice(5, 7))}/${Number(dateStr.slice(8, 10))}`;

export function timeAgo(ms, now) {
  const min = Math.max(0, Math.round((now - ms) / 60000));
  if (min < 60) return `${min} 分鐘前`;
  if (min < 1440) return `${Math.round(min / 60)} 小時前`;
  return `${Math.round(min / 1440)} 天前`;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
```

- [ ] **Step 4: Write `src/ui/mainView.js`**

```js
import { LIGHT, COMPARE_TEXT, CONF_TEXT, SAFETY_TEXT, knots, arrow, hhmm, md, timeAgo, esc } from './format.js';

function locationRow(spot, located) {
  if (located.status === 'near') {
    const z = spot.zones.find((x) => x.id === located.zoneId);
    return `<div class="loc">📍 你現在在${esc(spot.name)}<b>${esc(z.name)}</b></div>`;
  }
  if (located.status === 'far') return `<div class="loc">📍 你離${esc(spot.name)} ${Math.round(located.km)} 公里</div>`;
  return '';
}

function seaRow(f) {
  const s = f.safety;
  const cur = `${knots(s.currentKn)} ${arrow(s.currentToDeg)} ${LIGHT[s.currentLevel].emoji} ${SAFETY_TEXT[s.currentLevel]}`;
  const wave = s.waveRed ? `<div class="warn">🔴 浪 ${s.waveMaxM.toFixed(1)} 米，不建議下水</div>` : '';
  const up = s.upwelling ? '<div class="warn">🥶 水溫突降，可能有湧升流，幾天後水可能變綠</div>' : '';
  const best = `${f.best.start}~${f.best.end} 點${f.best.slack ? '（平潮）' : ''}`;
  const sst = f.sst == null ? '—' : `${Math.round(f.sst)}°C`;
  return `<div class="sea">
    <div class="wide">🌀 海流<br><b>${cur}</b></div>
    <div>🌡️ 水溫<br><b>${sst}</b></div>
    <div>⏰ 最佳下水<br><b>${best}</b></div>
    <div>🌊 浪<br><b>${s.waveMaxM.toFixed(1)} 米</b></div>
    ${wave}${up}
  </div>`;
}

function card(z, located) {
  const me = located.status === 'near' && located.zoneId === z.zoneId;
  const reports = z.todayReports.length
    ? `<span class="chip">今天 ${z.todayReports.length} 人回報：${Math.round(z.todayReports.reduce((a, r) => a + r.meters, 0) / z.todayReports.length)}m</span>`
    : '';
  return `<div class="card${me ? ' me' : ''}" data-zone="${z.zoneId}">${me ? '<span class="tag">你在這裡</span>' : ''}
    <div class="top"><div class="dot ${LIGHT[z.light].cls}"></div><div class="zn">${esc(z.name)}</div><div class="m">${z.low}~${z.high}m</div></div>
    <div class="sub">${esc(z.reason)}</div>
    <div class="chips"><span class="chip ${z.compare}">${COMPARE_TEXT[z.compare]}</span><span class="chip">把握度 ${CONF_TEXT[z.confidence]}</span>${reports}</div>
  </div>`;
}

export function renderMain({ spot, forecast, dayIndex, dayLabels, located, freshness, now }) {
  const days = dayLabels.map((l, i) => `<span data-day="${i}" class="${i === dayIndex ? 'on' : ''}">${l}</span>`).join('');
  const stale = forecast.stale != null ? `<div class="warn">⚪ 抓不到最新天氣，這是 ${Math.round(forecast.stale)} 小時前的預測</div>` : '';
  const foot = [
    freshness.weatherAt ? `天氣 ${hhmm(freshness.weatherAt)}` : '天氣 —',
    freshness.satelliteDate ? `衛星 ${md(freshness.satelliteDate)}` : '衛星資料暫缺，準度較低',
    freshness.lastReportAt ? `回報 ${timeAgo(freshness.lastReportAt, now)}` : '還沒有回報',
  ].join(' ・ ');
  return `<header class="pad"><div class="t1">${esc(spot.name)} 海底清不清</div><div class="mut">預測，不是保證</div></header>
  <nav class="days">${days}</nav>
  ${locationRow(spot, located)}
  ${stale}
  ${seaRow(forecast)}
  <div class="cards">${forecast.zones.map((z) => card(z, located)).join('')}</div>
  <button class="btn" data-action="report">🤿 我下水了，回報能見度</button>
  <button class="btn btn2" data-action="share">📤 分享給潛伴</button>
  <footer class="foot">${foot}<br>海流是整片海的預測，分不出島的四邊</footer>`;
}
```

- [ ] **Step 5: Write `src/ui/detailView.js`**

```js
import { LIGHT, CONF_TEXT, FACTOR_LABEL, SHELTER_TEXT, BOTTOM_TEXT, hhmm, esc } from './format.js';
import { bearingText } from '../core/math.js';

const ORDER = ['wave', 'pastWave', 'wind', 'cloud', 'tide', 'river', 'currentDir', 'currentSpeed'];

function bar(key, v) {
  const loss = Math.round(Math.max(0, 1 - v) * 100); // bar length = how much it takes away
  return `<div class="bar"><span class="l">${FACTOR_LABEL[key]}</span><span class="v"><i style="width:${loss}%"></i></span><span class="n">×${v.toFixed(2)}</span></div>`;
}

function reportRow(r) {
  const note = r.note ? ` ・ ${esc(r.note)}` : '';
  return `<div class="rep">${r.meters}m ・ ${r.depth}m 深 ・ ${hhmm(r.diveTime)} ・ ${esc(r.nickname)}${note}</div>`;
}

export function renderDetail({ spot, zone, dateLabel, reports }) {
  const z = spot.zones.find((x) => x.id === zone.zoneId);
  const baseLine = zone.baseSource === 'sat' ? '（衛星最近 30 天）' : '（衛星資料暫缺，用保守數字）';
  const biasLine = zone.biasN >= 5 ? `<div>依過去 ${zone.biasN} 筆回報，這區 ×${zone.bias.toFixed(2)}</div>` : '';
  const list = reports.filter((r) => r.zoneId === zone.zoneId);
  return `<header class="pad"><button class="link" data-action="back">← 返回</button>
    <div class="t1">${esc(zone.name)} ${LIGHT[zone.light].emoji} ${zone.low}~${zone.high} 米</div>
    <div class="mut">${esc(dateLabel)} ・ 把握度 ${CONF_TEXT[zone.confidence]}</div></header>
  <section class="card"><div class="h">怎麼算出來的</div>
    <div>🛰️ 平常底分：<b>${Math.round(zone.base)} 米</b>${baseLine}</div>
    ${ORDER.map((k) => bar(k, zone.factors[k])).join('')}
    ${biasLine}
    <div class="res">= 約 <b>${Math.round(zone.meters)} 米</b>（黃條越長，扣越多）</div>
  </section>
  <section class="card"><div class="h">最近回報</div>
    ${list.length ? list.map(reportRow).join('') : '<div class="mut">還沒有人回報這一區</div>'}
  </section>
  <section class="card"><div class="h">這一區</div>
    <div>面向${bearingText(z.facing)} ・ ${SHELTER_TEXT[z.shelter]} ・ ${BOTTOM_TEXT[z.bottom]}</div>
  </section>`;
}
```

- [ ] **Step 6: Run to verify pass**

Run: `npm test -- ui`
Expected: 7 passed

- [ ] **Step 7: Commit**

```bash
git add src/ui test/ui
git commit -m "feat(ui): main screen and zone detail views"
```

---

### Task 15: Report form, share, page wiring

**Files:**
- Create: `src/ui/reportForm.js`, `src/ui/share.js`, `src/main.js`, `src/styles.css`, `index.html`
- Test: `test/ui/reportForm.test.js`, `test/ui/share.test.js`

**Interfaces:**
- Produces:
  - `renderReportForm({ spot, defaultZoneId, nickname, now }): string`
  - `parseReportForm(values: Record<string,string>, now): { zoneId, meters, depth, diveTime, nickname, note } | { error: string }`
  - `buildShareText({ spot, dayLabel, forecast, url }): string`
  - `shareOrCopy(text, nav = navigator): Promise<'shared'|'copied'|'failed'>`

- [ ] **Step 1: Write failing tests**

`test/ui/reportForm.test.js`:

```js
import { test, expect } from 'vitest';
import { renderReportForm, parseReportForm } from '../../src/ui/reportForm.js';
import { SPOTS } from '../../src/data/spots/index.js';

const spot = SPOTS.xiaoliuqiu;
const NOW = Date.UTC(2026, 8, 28, 2, 30); // 10:30 Taipei

test('form preselects your zone and remembers nickname', () => {
  const html = renderReportForm({ spot, defaultZoneId: 'west', nickname: 'Michael', now: NOW });
  expect(html).toMatch(/value="west" checked/);
  expect(html).toContain('value="Michael"');
  for (const m of ['3', '5', '8', '10', '15', '20', '25', '30+']) expect(html).toContain(`value="${m}"`);
  expect(html).toContain('value="10:30"');
  expect(html).toContain('只存「哪一區」');
});

test('parse: valid form', () => {
  const r = parseReportForm({ zoneId: 'west', meters: '20', depth: '10', time: '09:15', nickname: 'M', note: '' }, NOW);
  expect(r).toMatchObject({ zoneId: 'west', meters: '20', depth: '10', nickname: 'M' });
  expect(r.diveTime).toBe(Date.UTC(2026, 8, 28, 1, 15));
});

test('parse: missing meters or nickname → error', () => {
  expect(parseReportForm({ zoneId: 'west', depth: '10', time: '09:15', nickname: 'M' }, NOW)).toEqual({ error: '請選看到幾米' });
  expect(parseReportForm({ zoneId: 'west', meters: '20', depth: '10', time: '09:15', nickname: ' ' }, NOW)).toEqual({ error: '請輸入暱稱' });
});

test('parse: a dive time later than now → error', () => {
  expect(parseReportForm({ zoneId: 'west', meters: '20', depth: '10', time: '23:00', nickname: 'M' }, NOW)).toEqual({ error: '下水時間不能比現在晚' });
});
```

`test/ui/share.test.js`:

```js
import { test, expect } from 'vitest';
import { buildShareText, shareOrCopy } from '../../src/ui/share.js';
import { buildForecast } from '../../src/core/forecast.js';
import { SPOTS } from '../../src/data/spots/index.js';
import { makeDay } from '../helpers/makeDay.js';

const spot = SPOTS.xiaoliuqiu;
const f = buildForecast({ spot, day: makeDay({ date: '2024-01-18' }), stale: null, helper: null, reports: [], now: Date.UTC(2024, 0, 18, 4), isToday: false });

test('share text lists zones best first, current, SST, best window and url', () => {
  const t = buildShareText({ spot, dayLabel: '明天', forecast: f, url: 'https://x' });
  expect(t.startsWith('明天小琉球：')).toBe(true);
  expect(t).toContain(`${f.zones[0].name} `);
  expect(t).toContain('節');
  expect(t).toContain('水溫 28°C');
  expect(t).toContain('最佳');
  expect(t.endsWith('👉 https://x')).toBe(true);
});

test('shareOrCopy uses Web Share, then clipboard', async () => {
  expect(await shareOrCopy('t', { share: async () => {} })).toBe('shared');
  expect(await shareOrCopy('t', { clipboard: { writeText: async () => {} } })).toBe('copied');
  expect(await shareOrCopy('t', {})).toBe('failed');
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- reportForm share`
Expected: FAIL

- [ ] **Step 3: Write `src/ui/reportForm.js`**

```js
import { esc, hhmm } from './format.js';
import { taipeiDate } from '../core/time.js';

const METERS = ['3', '5', '8', '10', '15', '20', '25', '30+'];
const DEPTHS = ['5', '10', '15', '20', '30+'];

const radios = (name, values, checked) => values.map((v) =>
  `<label class="opt"><input type="radio" name="${name}" value="${esc(v.value ?? v)}"${(v.value ?? v) === checked ? ' checked' : ''}><span>${esc(v.label ?? v)}</span></label>`).join('');

export function renderReportForm({ spot, defaultZoneId, nickname, now }) {
  const zones = spot.zones.map((z) => ({ value: z.id, label: z.name }));
  return `<header class="pad"><button class="link" data-action="back">← 返回</button>
    <div class="t1">回報能見度</div><div class="mut">10 秒就好，謝謝你 🙏</div></header>
  <form id="report" class="form">
    <div class="q">哪一區？</div><div class="opts">${radios('zoneId', zones, defaultZoneId ?? spot.zones[0].id)}</div>
    <div class="q">看到幾米？</div><div class="opts">${radios('meters', METERS, null)}</div>
    <div class="q">大概幾米深？</div><div class="opts">${radios('depth', DEPTHS, '10')}</div>
    <div class="q">什麼時候下水？（今天）</div><input class="inp" type="time" name="time" value="${hhmm(now)}">
    <div class="q">暱稱</div><input class="inp" name="nickname" maxlength="20" value="${esc(nickname ?? '')}">
    <div class="q">想說的話（可以不填）</div><input class="inp" name="note" maxlength="200">
    <div class="err" id="report-error"></div>
    <button class="btn" type="submit">送出</button>
    <div class="foot">只存「哪一區」，不存你的精準位置</div>
  </form>`;
}

export function parseReportForm(v, now) {
  if (!v.meters) return { error: '請選看到幾米' };
  if (!String(v.nickname ?? '').trim()) return { error: '請輸入暱稱' };
  const date = taipeiDate(now);
  const diveTime = Date.parse(`${date}T${v.time}:00+08:00`);
  if (!Number.isFinite(diveTime)) return { error: '請輸入下水時間' };
  if (diveTime > now) return { error: '下水時間不能比現在晚' };
  return { zoneId: v.zoneId, meters: v.meters, depth: v.depth ?? '10', diveTime, nickname: v.nickname, note: v.note ?? '' };
}
```

- [ ] **Step 4: Write `src/ui/share.js`**

```js
import { LIGHT, knots } from './format.js';

export function buildShareText({ spot, dayLabel, forecast, url }) {
  const zones = forecast.zones.map((z) => `${z.name} ${LIGHT[z.light].emoji} ${z.low}~${z.high} 米`).join('、');
  const s = forecast.safety;
  const sst = forecast.sst == null ? '' : `｜水溫 ${Math.round(forecast.sst)}°C`;
  return `${dayLabel}${spot.name}：${zones}｜流 ${knots(s.currentKn)} ${LIGHT[s.currentLevel].emoji}${sst}｜最佳 ${forecast.best.start}~${forecast.best.end} 點 👉 ${url}`;
}

export async function shareOrCopy(text, nav = navigator) {
  try {
    if (nav.share) { await nav.share({ text }); return 'shared'; }
    if (nav.clipboard?.writeText) { await nav.clipboard.writeText(text); return 'copied'; }
  } catch { /* user cancelled or blocked */ }
  return 'failed';
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npm test -- reportForm share`
Expected: 6 passed

- [ ] **Step 6: Write `index.html`**

```html
<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#0b2239">
  <title>海底清不清</title>
  <link rel="stylesheet" href="/src/styles.css">
</head>
<body>
  <main id="app"><div class="pad mut">載入中…</div></main>
  <div id="toast" class="toast" hidden></div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

- [ ] **Step 7: Write `src/styles.css`**

Colors and layout follow `.superpowers/brainstorm/.../full-preview.html`.

**Phone-only rules (every user is on a phone):**
- Designed for widths 320–480 px (iPhone SE → big Android). No horizontal scrolling at 320 px.
- Every tappable thing is at least 44 px tall (wet or cold fingers on a boat).
- Form inputs use 16 px text — below 16 px, iPhone Safari zooms the page when you tap an input.
- Muted text uses a real color, not `opacity`, so it stays readable in bright sun at the harbor.
- Respect the iPhone notch and home bar (`env(safe-area-inset-*)`).
- The day tabs stick to the top while scrolling, so you can switch days from anywhere.

```css
:root {
  --bg:#0b2239; --card:#12314f; --chip:#1d4a73; --acc:#3aa0ff; --fg:#fff;
  --mut:#b9c8da;   /* muted text: contrast ≥ 7:1 on --bg, readable in sunlight */
  --tap:44px;
}
* { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
html { -webkit-text-size-adjust:100%; }
body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.5 system-ui, -apple-system, "PingFang TC", "Noto Sans TC", sans-serif; }
#app { max-width:480px; margin:0 auto; padding:env(safe-area-inset-top) 0 calc(24px + env(safe-area-inset-bottom)); overflow-x:clip; } /* clip, not hidden: hidden breaks the sticky day tabs */
button { font:inherit; color:inherit; }
.pad { padding:14px 16px 6px; }
.t1 { font-size:19px; font-weight:800; }
.mut { color:var(--mut); font-size:13px; }
.days { position:sticky; top:0; z-index:5; display:flex; gap:6px; padding:8px 14px 10px; background:var(--bg); }
.days span { flex:1; display:flex; align-items:center; justify-content:center; min-height:var(--tap); border-radius:22px; background:#17385a; cursor:pointer; }
.days span.on { background:var(--acc); font-weight:700; }
.loc { margin:0 14px 8px; padding:10px 12px; border-radius:10px; background:#123f2e; }
.warn { margin:0 14px 8px; padding:10px 12px; border-radius:10px; background:#5a2b2b; }
.sea { margin:0 14px 10px; padding:12px; border-radius:12px; background:var(--card); display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:14px; }
.sea .wide, .sea .warn { grid-column:1 / -1; }
.sea .warn { margin:0; }
.card { margin:0 14px 10px; padding:14px 12px; border-radius:12px; background:var(--card); position:relative; cursor:pointer; }
.card:active, .btn:active, .days span:active { filter:brightness(1.2); }
.card.me { outline:2px solid var(--acc); }
.tag { position:absolute; top:-10px; right:12px; background:var(--acc); font-size:12px; padding:1px 8px; border-radius:8px; font-weight:700; }
.top { display:flex; align-items:center; gap:10px; }
.dot { width:30px; height:30px; border-radius:50%; flex:none; }
.pu{background:#a45cff}.gr{background:#2ecc71}.ye{background:#f5c518}.re{background:#ff4d4d}.gy{background:#7a8a99}
.zn { font-weight:800; font-size:16px; white-space:nowrap; }
.m { margin-left:auto; font-weight:800; font-size:20px; white-space:nowrap; }
.sub { margin:6px 0 0 40px; font-size:14px; color:var(--mut); }
.chips { margin:6px 0 0 40px; display:flex; flex-wrap:wrap; gap:6px; }
.chip { font-size:12.5px; padding:2px 8px; border-radius:8px; background:var(--chip); }
.chip.up { background:#1f5a39; } .chip.down { background:#5a2b2b; }
.btn { display:block; width:calc(100% - 28px); min-height:52px; margin:10px 14px; padding:12px; border:0; border-radius:14px; background:var(--acc); color:#fff; font-weight:800; font-size:16px; cursor:pointer; }
.btn2 { background:var(--chip); }
.link { display:inline-flex; align-items:center; min-height:var(--tap); padding:0 12px 0 0; background:none; border:0; color:var(--acc); font-size:16px; cursor:pointer; }
.foot { padding:8px 16px; font-size:12px; color:var(--mut); text-align:center; }
.h { font-weight:700; margin-bottom:6px; }
.bar { display:flex; align-items:center; gap:8px; margin:8px 0; }
.bar .l { flex:0 0 7.5em; font-size:13px; }
.bar .v { flex:1; min-width:40px; height:10px; border-radius:5px; background:#17385a; overflow:hidden; }
.bar .v i { display:block; height:100%; background:#f5c518; }
.bar .n { flex:0 0 3.2em; text-align:right; font-size:13px; }
.res { margin-top:8px; }
.rep { padding:8px 0; border-bottom:1px solid #1d4a73; font-size:14px; overflow-wrap:anywhere; }
.q { margin:14px 14px 6px; font-weight:700; }
.opts { display:flex; flex-wrap:wrap; gap:8px; margin:0 14px; }
/* hide the radio dot but keep it usable */
.opt input { position:absolute; opacity:0; width:1px; height:1px; }
.opt span { display:inline-flex; align-items:center; justify-content:center; min-width:var(--tap); min-height:var(--tap); padding:0 14px; border-radius:12px; background:#17385a; cursor:pointer; }
.opt input:checked + span { background:var(--acc); font-weight:700; }
.opt input:focus-visible + span { outline:2px solid #fff; }
.inp { display:block; width:calc(100% - 28px); min-height:var(--tap); margin:0 14px; padding:10px 12px; border:0; border-radius:10px; background:#17385a; color:#fff; font-size:16px; }
.err { margin:8px 14px 0; color:#ff9a9a; min-height:1.2em; }
.toast { position:fixed; left:50%; bottom:calc(24px + env(safe-area-inset-bottom)); transform:translateX(-50%); max-width:calc(100% - 32px); background:#000d; padding:12px 16px; border-radius:12px; z-index:10; }

/* Computers (sometimes people check at home): main list gets wider with 2 card columns.
   Detail page and report form stay phone-width, centered — easier to read. */
@media (min-width:720px) {
  #app[data-view="main"] { max-width:860px; }
  #app[data-view="main"] .cards { display:grid; grid-template-columns:1fr 1fr; }
  #app[data-view="main"] .sea { grid-template-columns:repeat(4, 1fr); }
  #app[data-view="main"] .btn { display:inline-block; width:calc(50% - 21px); margin:10px 0 10px 14px; }
}
@media (hover:hover) {
  .card:hover, .btn:hover, .days span:hover, .opt span:hover { filter:brightness(1.15); }
}
```

- [ ] **Step 8: Write `src/main.js`**

```js
import { SPOTS, DEFAULT_SPOT_ID } from './data/spots/index.js';
import { HELPER_URL } from './config.js';
import { fetchWeather, parseDay } from './services/openmeteo.js';
import { fetchHelper } from './services/helper.js';
import { saveWeather, loadWeather } from './services/cache.js';
import { createOutbox } from './services/outbox.js';
import { sendReport, fetchRecentReports, buildReportDoc } from './services/reports.js';
import { buildForecast } from './core/forecast.js';
import { locate } from './core/locate.js';
import { taipeiDate } from './core/time.js';
import { renderMain } from './ui/mainView.js';
import { renderDetail } from './ui/detailView.js';
import { renderReportForm, parseReportForm } from './ui/reportForm.js';
import { buildShareText, shareOrCopy } from './ui/share.js';
import { md } from './ui/format.js';

const spot = SPOTS[DEFAULT_SPOT_ID];
const app = document.getElementById('app');
const outbox = createOutbox(localStorage, sendReport);
const DAY_LABELS = ['今天', '明天', '後天'];

const state = { dayIndex: 1, view: 'main', zoneId: null, located: { status: 'none' }, forecasts: [], helper: null, reports: [], weatherAt: null };

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 3000);
}

function getPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve([p.coords.latitude, p.coords.longitude]), // used only here, never stored or sent
      () => resolve(null),
      { timeout: 8000, maximumAge: 600000 },
    );
  });
}

async function loadWeatherRaw(now) {
  try {
    const raw = await fetchWeather(spot);
    saveWeather(localStorage, spot.id, raw, now);
    return { raw, savedAt: now, stale: null };
  } catch {
    const cached = loadWeather(localStorage, spot.id);
    return cached ? { ...cached, stale: (now - cached.savedAt) / 3600000 } : null;
  }
}

function dateLabel(i) {
  const f = state.forecasts[i];
  return f ? `${DAY_LABELS[i]} ${md(f.date)}` : DAY_LABELS[i];
}

function render() {
  const now = Date.now();
  app.dataset.view = state.view; // CSS widens only the main list on computers
  const forecast = state.forecasts[state.dayIndex];
  if (!forecast) {
    app.innerHTML = '<div class="pad">抓不到天氣資料，也沒有之前存的預測。請確認網路後重新整理。</div>';
    return;
  }
  if (state.view === 'detail') {
    const zone = forecast.zones.find((z) => z.zoneId === state.zoneId);
    app.innerHTML = renderDetail({ spot, zone, dateLabel: dateLabel(state.dayIndex), reports: state.reports, now });
  } else if (state.view === 'report') {
    const defaultZoneId = state.located.status === 'near' ? state.located.zoneId : null;
    app.innerHTML = renderReportForm({ spot, defaultZoneId, nickname: localStorage.getItem('haidi:nickname'), now });
  } else {
    const lastReportAt = state.reports.length ? Math.max(...state.reports.map((r) => r.diveTime)) : null;
    app.innerHTML = renderMain({
      spot, forecast, dayIndex: state.dayIndex, dayLabels: DAY_LABELS, located: state.located,
      freshness: { weatherAt: state.weatherAt, satelliteDate: state.helper?.satelliteDate ?? null, lastReportAt }, now,
    });
  }
}

// Phone back button: every view change is a history entry, so "back" returns to the list instead of leaving the site.
let mainScrollY = 0;
function go(view, zoneId = null) {
  if (state.view === 'main') mainScrollY = window.scrollY;
  state.view = view;
  state.zoneId = zoneId;
  history.pushState({ view, zoneId }, '', view === 'main' ? '#' : `#${view}${zoneId ? `/${zoneId}` : ''}`);
  render();
  window.scrollTo(0, 0);
}
window.addEventListener('popstate', (e) => {
  state.view = e.state?.view ?? 'main';
  state.zoneId = e.state?.zoneId ?? null;
  render();
  window.scrollTo(0, state.view === 'main' ? mainScrollY : 0);
});

async function load() {
  const now = Date.now();
  // Do not wait for the location prompt: show the forecast first, add "你在哪一區" when (if) it arrives.
  getPosition().then((pos) => {
    state.located = locate(pos, spot);
    if (pos && state.forecasts.length) render();
  });
  const [weather, helper, reports] = await Promise.all([
    loadWeatherRaw(now),
    fetchHelper(HELPER_URL, spot.id),
    fetchRecentReports(spot.id).catch(() => []),
  ]);
  state.helper = helper;
  state.reports = reports;
  state.weatherAt = weather?.savedAt ?? null;
  const today = taipeiDate(now);
  state.forecasts = [0, 1, 2].map((i) => {
    const day = weather ? parseDay(weather.raw, taipeiDate(now, i)) : null;
    if (!day) return null;
    return buildForecast({ spot, day, stale: weather.stale, helper, reports, now, isToday: day.date === today });
  });
  if (!state.forecasts[state.dayIndex]) state.dayIndex = state.forecasts.findIndex(Boolean);
  if (state.dayIndex < 0) state.dayIndex = 0;
  render();
}

function currentSnapshot(zoneId) {
  const f = state.forecasts[0] ?? state.forecasts[state.dayIndex];
  const z = f?.zones.find((x) => x.zoneId === zoneId);
  if (!z) return { date: f?.date ?? null, base: null, bias: 1, factors: {}, rawMeters: null, meters: null };
  return { date: f.date, base: z.base, bias: z.bias, factors: z.factors, rawMeters: z.rawMeters, meters: z.meters };
}

app.addEventListener('click', async (e) => {
  const day = e.target.closest('[data-day]');
  if (day) { state.dayIndex = Number(day.dataset.day); return render(); } // keep scroll position; tabs are sticky
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'back') return history.back();
  if (action === 'report') return go('report');
  if (action === 'share') {
    const r = await shareOrCopy(buildShareText({ spot, dayLabel: DAY_LABELS[state.dayIndex], forecast: state.forecasts[state.dayIndex], url: location.href }));
    if (r === 'copied') toast('已複製，貼到 LINE 就可以了');
    if (r === 'failed') toast('這支手機不能分享，請手動複製網址');
    return;
  }
  const card = e.target.closest('[data-zone]');
  if (card) go('detail', card.dataset.zone);
});

app.addEventListener('submit', async (e) => {
  e.preventDefault();
  const values = Object.fromEntries(new FormData(e.target).entries());
  const form = parseReportForm(values, Date.now());
  if (form.error) { document.getElementById('report-error').textContent = form.error; return; }
  localStorage.setItem('haidi:nickname', form.nickname.trim());
  const doc = buildReportDoc({ spotId: spot.id, form, snapshot: currentSnapshot(form.zoneId) });
  const result = await outbox.add(doc);
  toast(result === 'sent' ? '謝謝回報！' : '已存好，有網路會自動送出');
  history.back(); // back to the list; popstate renders it
  await load();
});

window.addEventListener('online', () => outbox.flush().then((n) => n && toast(`補送了 ${n} 筆回報`)));
history.replaceState({ view: 'main' }, '', '#');
outbox.flush();
load();
```

- [ ] **Step 9: Run the full test suite**

Run: `npm test`
Expected: all pass

- [ ] **Step 10: Run the app locally and check by hand**

Terminal 1: `cd worker && npx wrangler dev --local --port 8787`
Terminal 2: `npm run dev`
Open the Vite URL in the browser with phone emulation (devtools device toolbar). Check:
1. Default tab is 明天; tabs switch; 4 cards sorted best first.
2. The 🌀 / 🌡️ / ⏰ / 🌊 row shows real numbers.
3. Click a card → detail page with 8 bars → 返回 works.
4. Allow location (browser devtools → Sensors → set 22.341, 120.355) → 「你現在在小琉球西邊」 and 「你在這裡」 tag.
5. 回報 → submit without meters → 「請選看到幾米」; submit a real test report → 「謝謝回報！」; card shows 「今天 1 人回報」 on 今天.
6. Devtools → Network → Offline → submit → 「已存好…」; back Online → 「補送了 1 筆回報」.
7. Stop the Worker → reload → zones show 「衛星資料暫缺，準度較低」 in footer, app still works.
8. Devtools → Network → block `*open-meteo.com*` → reload → 「這是 N 小時前的預測」 and gray lights.
9. Share → text copied (desktop) and looks like the spec example.

**Phone layout checks** — repeat at widths **320**, **360** and **390** px:
10. No sideways scrolling on any page (main, detail, report). The 海流 line with 「⚠️ 流強…」 wraps inside the box.
11. Card title, range (e.g. `20~26m`) and light stay on one line at 320 px.
12. Scroll down, then switch 今天/明天 — tabs stay at the top and the page does not jump.
13. Open a card, press the **browser back button** → back to the list at the same scroll position. Same from the report form.
14. Block location for 10 s (devtools → Sensors → location unavailable) → the forecast still appears right away.
15. Every button, day tab and meter button is at least 44 px tall (devtools → hover shows size).

**Real phone checks** (after `npm run dev -- --host`, open `http://<PC IP>:5173` on a phone on the same Wi-Fi; location needs https, so test location in Task 17):
16. iPhone Safari: tap the 暱稱 box — the page must **not** zoom in.
17. Readable outdoors: set phone brightness to max, stand in the sun, grey text is still readable.
18. Open the link inside **LINE** (send it to yourself, tap it): page works; share falls back to 「已複製」 if LINE blocks sharing.

**Computer checks** (normal desktop browser window, 1280 px wide):
19. Main list shows cards in **2 columns**, the sea info row in 4 columns, report + share buttons side by side.
20. Card detail and report form stay a narrow, centered column.
21. Mouse hover highlights cards and buttons; everything works with mouse only; Tab key reaches the meter buttons.
22. Location on a PC is usually rough (Wi-Fi/IP based) → it shows 「你離小琉球 N 公里」, which is fine.

Delete the test reports afterwards in the Firebase console (Firestore → reports).

- [ ] **Step 11: Commit**

```bash
git add index.html src test
git commit -m "feat(app): report form, share, and page wiring"
```

---

### Task 16: Offline + add to home screen (PWA)

**Why:** on the boat there is often no signal. Without this, the page does not even open, so the saved forecast (Task 13) and the report outbox (Task 12) never get a chance. A service worker (a small script the browser keeps on the phone) stores the page files. The manifest lets people put the page on their home screen like an app.

**Files:**
- Create: `public/icon.svg`, `src/ui/installHint.js`
- Modify: `package.json` (dev deps), `vite.config.js`, `index.html`, `src/ui/mainView.js` (footer hint), `src/main.js` (pass hint)
- Test: `test/ui/installHint.test.js`

**Interfaces:**
- Produces: `installHint(userAgent: string, standalone: boolean): string | null` — text for the footer, or null
- Modifies: `renderMain({ ..., hint })` — optional `hint` string shown in the footer

- [ ] **Step 1: Install the PWA plugin and icon generator**

```bash
npm install -D vite-plugin-pwa @vite-pwa/assets-generator
```

- [ ] **Step 2: Write `public/icon.svg`** (a light dot in water; replace with a real logo later)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0b2239"/>
  <circle cx="256" cy="230" r="120" fill="#a45cff"/>
  <path d="M60 360c60-40 120-40 196 0s136 40 196 0v92H60z" fill="#3aa0ff"/>
</svg>
```

- [ ] **Step 3: Generate PNG icons**

```bash
npx pwa-assets-generator --preset minimal-2023 public/icon.svg
```

Expected: files like `public/pwa-192x192.png`, `public/pwa-512x512.png`, `public/apple-touch-icon-180x180.png`, `public/favicon.ico`.

- [ ] **Step 4: Replace `vite.config.js`**

```js
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: '海底清不清',
        short_name: '海底清不清',
        description: '潛點海底能見度預測',
        lang: 'zh-Hant',
        start_url: '/',
        display: 'standalone',
        background_color: '#0b2239',
        theme_color: '#0b2239',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Only the page files are cached here. Weather is cached by our own code (Task 13),
        // so we never show old weather without the "N 小時前" warning.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallback: '/index.html',
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
```

- [ ] **Step 5: Add the iPhone home-screen tags to `index.html`** (inside `<head>`)

```html
  <link rel="icon" href="/favicon.ico">
  <link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="海底清不清">
```

- [ ] **Step 6: Write the failing test `test/ui/installHint.test.js`**

Android Chrome shows its own install prompt, so we only hint on iPhone Safari, and never once installed.

```js
import { test, expect } from 'vitest';
import { installHint } from '../../src/ui/installHint.js';

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPHONE_LINE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.0.0';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36';

test('iPhone Safari gets the add-to-home-screen hint', () => {
  expect(installHint(IPHONE_SAFARI, false)).toBe('📲 iPhone：點下方「分享」→「加入主畫面」，沒訊號也能打開');
});

test('LINE browser: tell them to open in Safari first', () => {
  expect(installHint(IPHONE_LINE, false)).toBe('📲 用 Safari 打開這個網址，就能加到主畫面');
});

test('no hint on Android, on computers, or when already installed', () => {
  expect(installHint(ANDROID, false)).toBeNull();
  expect(installHint('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', false)).toBeNull();
  expect(installHint(IPHONE_SAFARI, true)).toBeNull();
});
```

- [ ] **Step 7: Run to verify fail**

Run: `npm test -- installHint`
Expected: FAIL — missing module

- [ ] **Step 8: Write `src/ui/installHint.js`**

```js
export function installHint(ua, standalone) {
  if (standalone || !/iPhone|iPad/.test(ua)) return null;
  if (/ Line\//.test(ua)) return '📲 用 Safari 打開這個網址，就能加到主畫面';
  if (/Version\/.*Safari/.test(ua)) return '📲 iPhone：點下方「分享」→「加入主畫面」，沒訊號也能打開';
  return null;
}
```

- [ ] **Step 9: Show the hint in the footer**

In `src/ui/mainView.js`, change the signature to `export function renderMain({ spot, forecast, dayIndex, dayLabels, located, freshness, now, hint = null })` and change the footer line to:

```js
  <footer class="foot">${foot}<br>海流是整片海的預測，分不出島的四邊${hint ? `<br>${esc(hint)}` : ''}</footer>`;
```

In `src/main.js`, add `import { installHint } from './ui/installHint.js';` and pass `hint` in the `renderMain({...})` call:

```js
      hint: installHint(navigator.userAgent, matchMedia('(display-mode: standalone)').matches || navigator.standalone === true),
```

- [ ] **Step 10: Run all tests**

Run: `npm test`
Expected: all pass

- [ ] **Step 11: Check offline by hand**

```bash
npm run build
npx vite preview --port 4173
```

Open `http://localhost:4173`, wait for it to load, then devtools → Application → Service Workers shows one **activated**. Devtools → Network → **Offline** → reload:
1. The page opens (not the browser's "no internet" dinosaur).
2. Cards show gray lights and 「這是 N 小時前的預測」.
3. 回報 → submit → 「已存好，有網路會自動送出」 → back Online → 「補送了 1 筆回報」.
4. Devtools → Application → Manifest shows the name, icons and no errors.

- [ ] **Step 12: Commit**

```bash
git add public vite.config.js index.html package.json package-lock.json src/ui/installHint.js src/ui/mainView.js src/main.js test/ui/installHint.test.js
git commit -m "feat(pwa): open offline and add to home screen"
```

---

### Task 17: Deploy

**Files:**
- Modify: `worker/wrangler.toml` (real KV id + Firebase project id)
- Create: `README.md`

**Human steps (Michael):** approve the Cloudflare login in the browser; confirm before each deploy.

- [ ] **Step 1: Create the KV namespace and fill `wrangler.toml`**

```bash
cd worker
npx wrangler login
npx wrangler kv namespace create CACHE
```

Copy the printed `id` into `[[kv_namespaces]] id`, and set `FIREBASE_PROJECT_ID` to the Firebase project id.

- [ ] **Step 2: Deploy the Worker and warm the cache**

```bash
npx wrangler deploy
curl -s "https://haidi-helper.<account>.workers.dev/v1/base?spot=xiaoliuqiu"
```

Expected: JSON with 4 zones and `satelliteDate`. Note the Worker URL.

- [ ] **Step 3: Build and deploy the web page**

Put the Worker URL into `.env` as `VITE_HELPER_URL`, then:

```bash
cd ..
npm run build
npx wrangler pages deploy dist --project-name haidi-qingbuqing
```

Expected: a `https://haidi-qingbuqing.pages.dev` URL.

- [ ] **Step 4: Add the Pages domain to Firebase Auth**

Firebase console → Authentication → 設定 → 已授權網域 → add `haidi-qingbuqing.pages.dev`.

- [ ] **Step 5: Phone check**

Open the Pages URL on an **iPhone (Safari)** and an **Android phone (Chrome)**, and once inside **LINE's built-in browser**. On each: location prompt appears (https), 「你在哪一區」 shows when near, cards load, one real report works, share opens LINE (or copies). Repeat checks 16–18 from Task 15. On the iPhone: 分享 → 加入主畫面 → open from the home screen icon → turn on airplane mode → the app still opens. Also open the URL once on a computer (checks 19–21).

- [ ] **Step 6: Write `README.md`**

```markdown
# 海底清不清

預測潛點海底能見度的手機網頁。設計：`docs/superpowers/specs/2026-09-27-haidi-qingbuqing-design.md`

- 開發：`npm run dev`（另開 `cd worker && npx wrangler dev --local --port 8787`）
- 測試：`npm test`
- 部署網頁：`npm run build && npx wrangler pages deploy dist --project-name haidi-qingbuqing`
- 部署小幫手：`cd worker && npx wrangler deploy`
- Firestore 規則：`npx firebase deploy --only firestore`
- 加潛點：在 `src/data/spots/` 加一個 JSON，登記到 `index.js`
- 調參數：`src/core/constants.js`
- 每週檢查（設計文件 §8.3）：Firebase 主控台匯出 `reports`，看 ①`meters` 跟 `snapshot.meters` 平均差幾米 ②預測「比平常清」的那幾筆，有幾成真的比平常清
```

- [ ] **Step 7: Commit and update the Obsidian progress note**

```bash
git add worker/wrangler.toml README.md
git commit -m "chore: deploy config and readme"
```

Update `專案筆記/2026 海底清不清/工作筆記.md`: 上次做到哪 = v1 上線、網址; 下一步 = 收回報、每週看準度.
