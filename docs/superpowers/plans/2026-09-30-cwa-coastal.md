# 台灣潛點改用氣象署沿海預報 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For Taiwan spots, take waves, currents, wind and cloud from 中央氣象署 鄉鎮沿海預報 (`F-D0047-095`) instead of Open-Meteo, with an automatic fallback to Open-Meteo.

**Architecture:** Pure helpers in `src/core/cwa.js` (shared by the Worker and the web page) cut one area out of the 6 MB file, turn it into a 3-hourly series, and turn that into the page's 08–16 hourly fields. The Worker downloads the file every 6 hours, stores a small series per spot in KV (`cwa:<spotId>`), and adds it as `coastal` to its `/v1/base` answer. The page applies `coastal` right after `parseDay`; with no usable data the day stays exactly as today (Open-Meteo).

**Tech Stack:** JavaScript ES modules (no framework), Vite 8, Vitest 5, Cloudflare Worker + KV (free plan), wrangler.

**Spec:** `docs/superpowers/specs/2026-09-30-cwa-coastal-design.md`. Read it before starting.

## Global Constraints

- Repo root: `D:\Users\michael0725\Desktop\2026 海底清不清`. Paths are relative to it. Run commands from the repo root in Git Bash.
- Branch: `feat/cwa-coastal`, created from `main` by the controller before Task 1. Do not push. Do not merge.
- Commit messages end with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- All user-facing text is Traditional Chinese (繁體中文).
- Code in `src/` (outside `src/data/`) must not mention 小琉球, 墾丁, 七星岩, 東北角, a spot id or a zone id. CWA area names (e.g. `恆春鎮沿海`) live only in the spot JSON files and in tests.
- The CWA key is never written into code, tests, logs, error messages or git. The Worker reads it from the secret `env.CWA_KEY`. Error messages must not contain the request URL (the key is in it).
- The Worker must fit the free plan's ~10 ms CPU per run: never `JSON.parse` the whole 6 MB file; parse only the areas the spots use (`extractArea`).
- Fields replaced by CWA: `waveH`, `waveT`, `waveDir`, `currentKmh`, `currentDir`, `windKmh`, `windDir`, `cloud`. Kept from Open-Meteo: `sst`, `seaLevel`, `pastWaves`, `rain3dMm`, `sstPrev3`.
- If any hour 08–16 of a day lacks a CWA value, that whole day uses Open-Meteo (never mix inside one day).
- CWA coastal data older than 12 hours (by its `Sent` time) is not used.
- Direction words → degrees: 偏北 0, 東北 45, 偏東 90, 東南 135, 偏南 180, 西南 225, 偏西 270, 西北 315; a trailing 風 is ignored; anything else (e.g. `-`) → no data.
- CWA directions use the same conventions as Open-Meteo (浪向 = where waves come from, 流向 = where water flows to). Checked 2026-09-30 on 貢寮區沿海: mean difference 28° (waves) and 18° (current), not ~180°.
- Deploy is NOT part of any task. Never run `wrangler deploy`, `wrangler secret put` or `wrangler pages deploy`.
- Full test suite must stay green after every task: `npm test` (171 tests before this plan).

## File Structure

```
src/core/cwa.js                    NEW  dirTextToDeg, issuedAt, extractArea, areaSeries, hourlyFromCwa, applyCoastal
src/core/constants.js              MOD  + K.coastalMaxAgeH = 12
test/helpers/cwaFixture.js         NEW  tiny F-D0047-095 files in the real shape
test/core/cwa.test.js              NEW
src/data/spots/*.json              MOD  + "cwaArea" (4 files)
test/data/spots.test.js            MOD  + cwaArea test
worker/src/cwa.js                  NEW  coastalUrl, fetchCoastal, mergeSeries
worker/src/index.js                MOD  refreshCoastal, coastal in /v1/base, 6-hourly cron
worker/wrangler.toml               MOD  + cron "30 5,11,17,23 * * *"
test/worker/cwa.test.js            NEW
test/worker/index.test.js          MOD
README.md                          MOD  cwaArea + CWA_KEY secret
src/core/forecast.js               MOD  + coastalAt
src/main.js                        MOD  applyCoastal after parseDay
src/ui/mainView.js                 MOD  footer "海況 氣象署 HH:MM"
test/core/forecastCoastal.test.js  NEW
test/ui/mainView.test.js           MOD
```

---

### Task 1: Coastal forecast helpers (pure, no network)

**Files:**
- Create: `src/core/cwa.js`, `test/helpers/cwaFixture.js`, `test/core/cwa.test.js`
- Modify: `src/core/constants.js`

**Interfaces:**
- Consumes: nothing new (`test/helpers/makeDay.js` already exists: `makeDay({ date, hour })` gives 9 hours 08–16 with `waveH: 0.3`, `sst: 28`, `seaLevel: 0`, …).
- Produces:
  - `dirTextToDeg(text) → number | null`
  - `issuedAt(text: string) → string | null` (the file's `"Sent"` value, e.g. `'2026-09-30T06:55:58+08:00'`)
  - `extractArea(text: string, name: string) → Location object | null`
  - `areaSeries(location) → Array<{ time: 'YYYY-MM-DDTHH:MM', waveH, waveT, waveDir, currentKmh, currentDir, windKmh, windDir, cloud }>` (each value `number | null`), sorted by time
  - `hourlyFromCwa(series, date: 'YYYY-MM-DD') → Array<{ hour, waveH, waveT, waveDir, currentKmh, currentDir, windKmh, windDir, cloud }> (9 items, hours 8..16) | null`
  - `applyCoastal(day, coastal: { issuedAt, series } | null | undefined) → day` (a new day object with those 8 fields replaced and `coastalAt: coastal.issuedAt`; or the same `day` object unchanged; `null` stays `null`)
  - `K.coastalMaxAgeH = 12`
  - Test helpers `cwaLocation(name, times, values?)`, `cwaFile(sent, locations)`, `dayTimes(date)` in `test/helpers/cwaFixture.js`

- [ ] **Step 1: Write the test fixture**

`test/helpers/cwaFixture.js`:

```js
// Tiny 鄉鎮沿海預報 (F-D0047-095) files in the real shape (checked against the 2026-09-30 download).
// In the real file LocationName is the first key of every Location, and the JSON is pretty-printed.
const el = (name, key, values, times) => ({
  ElementName: name,
  Time: times.map((t, i) => ({ DataTime: t, ElementValue: { [key]: values[i] } })),
});

export function cwaLocation(name, times, v = {}) {
  const fill = (x) => times.map((_, i) => (Array.isArray(x) ? x[i] : x));
  return {
    LocationName: name,
    Geocode: '10013220',
    Latitude: '22.29',
    Longitude: '120.36',
    WeatherElement: [
      el('風速', 'WindSpeedKph', fill(v.wind ?? '9.3'), times),
      el('風向', 'WindDirection', fill(v.windDir ?? '偏西風'), times),
      el('雲量', 'SkyCover', fill(v.cloud ?? '40.0'), times),
      el('天氣現象', 'Weather', fill('多雲'), times),
      el('浪高', 'WaveHeight', fill(v.wave ?? '0.6'), times),
      el('浪向', 'WaveDirection', fill(v.waveDir ?? '東北'), times),
      el('浪週期', 'WavePeriod', fill(v.period ?? '8.5'), times),
      el('流速', 'OceanCurrentSpeedKph', fill(v.cur ?? '1.1'), times),
      el('流向', 'OceanCurrentDirection', fill(v.curDir ?? '偏北'), times),
    ],
  };
}

export const cwaFile = (sent, locations) =>
  JSON.stringify({ cwaopendata: { Sent: sent, Dataset: { Locations: { Location: locations } } } }, null, 1);

// The 5 points of one day that the page needs: 06, 09, 12, 15, 18 (Taiwan time).
export const dayTimes = (date) => ['06', '09', '12', '15', '18'].map((h) => `${date}T${h}:00:00+08:00`);
```

- [ ] **Step 2: Write the failing tests**

`test/core/cwa.test.js`:

```js
import { test, expect } from 'vitest';
import { dirTextToDeg, issuedAt, extractArea, areaSeries, hourlyFromCwa, applyCoastal } from '../../src/core/cwa.js';
import { cwaLocation, cwaFile, dayTimes } from '../helpers/cwaFixture.js';
import { makeDay } from '../helpers/makeDay.js';

const SENT = '2026-09-30T06:55:58+08:00';
const series = (v) => areaSeries(cwaLocation('x', dayTimes('2026-09-30'), v));

test('compass words become degrees; a trailing 風 is fine; anything else is no data', () => {
  expect(['偏北', '東北', '偏東', '東南', '偏南', '西南', '偏西', '西北'].map(dirTextToDeg)).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
  expect(dirTextToDeg('偏西風')).toBe(270);
  expect(dirTextToDeg('-')).toBeNull();
  expect(dirTextToDeg(undefined)).toBeNull();
});

test('finds one area in the whole file and reads when the file was sent', () => {
  const text = cwaFile(SENT, [
    cwaLocation('恆春鎮沿海', dayTimes('2026-09-30'), { wave: '1.2' }),
    cwaLocation('琉球鄉_南方沿海', dayTimes('2026-09-30')),
  ]);
  expect(issuedAt(text)).toBe(SENT);
  expect(extractArea(text, '恆春鎮沿海').LocationName).toBe('恆春鎮沿海');
  expect(extractArea(text, '恆春鎮沿海').WeatherElement.find((e) => e.ElementName === '浪高').Time[0].ElementValue.WaveHeight).toBe('1.2');
  expect(extractArea(text, '琉球鄉_南方沿海').LocationName).toBe('琉球鄉_南方沿海');
  expect(extractArea(text, '琉球鄉_北方沿海')).toBeNull();
  expect(issuedAt('{}')).toBeNull();
});

test('areaSeries: one row per time with numbers and degrees; None and - are no data', () => {
  const rows = series();
  expect(rows).toHaveLength(5);
  expect(rows[0]).toEqual({ time: '2026-09-30T06:00', windKmh: 9.3, windDir: 270, cloud: 40, waveH: 0.6, waveDir: 45, waveT: 8.5, currentKmh: 1.1, currentDir: 0 });
  const [bad] = series({ wave: 'None', curDir: '-' });
  expect(bad.waveH).toBeNull();
  expect(bad.currentDir).toBeNull();
});

test('08..16 from the 3-hourly points: numbers in between, exact on the hour', () => {
  const hours = hourlyFromCwa(series({ wave: ['0.3', '0.6', '0.9', '1.2', '1.5'] }), '2026-09-30');
  expect(hours.map((h) => h.hour)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16]);
  expect(hours[0].waveH).toBeCloseTo(0.5, 6); // 06 → 0.3, 09 → 0.6: 08 is two thirds of the way
  expect(hours[1].waveH).toBeCloseTo(0.6, 6);
  expect(hours[8].waveH).toBeCloseTo(1.3, 6); // 15 → 1.2, 18 → 1.5
});

test('directions take the nearer point', () => {
  const hours = hourlyFromCwa(series({ curDir: ['偏北', '偏東', '偏南', '偏西', '西北'] }), '2026-09-30');
  // 06 偏北, 09 偏東, 12 偏南, 15 偏西, 18 西北
  expect(hours.map((h) => h.currentDir)).toEqual([90, 90, 90, 180, 180, 180, 270, 270, 270]);
});

test('a missing point or value, or another day → null (the whole day falls back)', () => {
  const s = series();
  expect(hourlyFromCwa(s.filter((p) => !p.time.endsWith('18:00')), '2026-09-30')).toBeNull();
  expect(hourlyFromCwa(series({ wave: ['0.3', 'None', '0.9', '1.2', '1.5'] }), '2026-09-30')).toBeNull();
  expect(hourlyFromCwa(s, '2026-10-01')).toBeNull();
});

test('applyCoastal swaps the 8 sea and wind fields, keeps water temperature and tide', () => {
  const day = makeDay({ date: '2026-09-30', hour: { sst: 28, seaLevel: 0.4 } });
  const out = applyCoastal(day, { issuedAt: SENT, series: series({ wave: '1.2' }) });
  expect(out.coastalAt).toBe(SENT);
  expect(out.hours[0]).toMatchObject({ hour: 8, waveH: 1.2, waveT: 8.5, waveDir: 45, currentKmh: 1.1, currentDir: 0, windKmh: 9.3, windDir: 270, cloud: 40, sst: 28, seaLevel: 0.4 });
  expect(out.pastWaves).toBe(day.pastWaves);
  expect(day.hours[0].waveH).toBe(0.3); // the input is not changed
});

test('applyCoastal leaves the day alone without usable coastal data', () => {
  const day = makeDay({ date: '2026-09-30' });
  expect(applyCoastal(day, null)).toBe(day);
  expect(applyCoastal(day, undefined)).toBe(day);
  expect(applyCoastal(day, { issuedAt: SENT, series: [] })).toBe(day);
  expect(applyCoastal(null, { issuedAt: SENT, series: series() })).toBeNull();
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run test/core/cwa.test.js`
Expected: FAIL — cannot find module `../../src/core/cwa.js`.

- [ ] **Step 4: Implement**

`src/core/cwa.js`:

```js
// 中央氣象署 鄉鎮沿海預報 (F-D0047-095): one point every 3 hours, directions as 8 compass words.
// Used by the Worker (to cut the file down) and by the page (to fill hours 08..16).

const DIRS = { 偏北: 0, 東北: 45, 偏東: 90, 東南: 135, 偏南: 180, 西南: 225, 偏西: 270, 西北: 315 };

export function dirTextToDeg(text) {
  if (typeof text !== 'string') return null;
  return DIRS[text.replace(/風$/, '')] ?? null;
}

export const issuedAt = (text) => /"Sent"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? null;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The file is ~6 MB (121 areas); parsing all of it is too slow for a free Worker.
// Find the area by text and parse only its Location object (LocationName is its first key).
export function extractArea(text, name) {
  const m = new RegExp(`"LocationName"\\s*:\\s*"${escapeRe(name)}"`).exec(text);
  if (!m) return null;
  const start = text.lastIndexOf('{', m.index);
  let depth = 0;
  for (let j = start; j < text.length; j++) {
    const c = text[j];
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(text.slice(start, j + 1));
  }
  return null;
}

const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// [element name in the file, value key, our field, converter]
const FIELDS = [
  ['浪高', 'WaveHeight', 'waveH', num],
  ['浪週期', 'WavePeriod', 'waveT', num],
  ['浪向', 'WaveDirection', 'waveDir', dirTextToDeg],
  ['流速', 'OceanCurrentSpeedKph', 'currentKmh', num],
  ['流向', 'OceanCurrentDirection', 'currentDir', dirTextToDeg],
  ['風速', 'WindSpeedKph', 'windKmh', num],
  ['風向', 'WindDirection', 'windDir', dirTextToDeg],
  ['雲量', 'SkyCover', 'cloud', num],
];

export function areaSeries(location) {
  const byTime = new Map();
  for (const [element, key, field, convert] of FIELDS) {
    const el = location.WeatherElement.find((e) => e.ElementName === element);
    for (const t of el?.Time ?? []) {
      const time = t.DataTime.slice(0, 16); // Taiwan time, same format as Open-Meteo's hourly.time
      if (!byTime.has(time)) byTime.set(time, { time });
      byTime.get(time)[field] = convert(t.ElementValue?.[key]);
    }
  }
  return [...byTime.values()].sort((a, b) => (a.time < b.time ? -1 : 1));
}

const NUMBERS = ['waveH', 'waveT', 'currentKmh', 'windKmh', 'cloud'];
const DIRECTIONS = ['waveDir', 'currentDir', 'windDir'];
const hourOf = (time) => Number(time.slice(11, 13));

// Numbers: straight line between the two points around the hour. Directions: the nearer point
// (8 compass words cannot be averaged sensibly). Any gap → null, so the day keeps Open-Meteo.
export function hourlyFromCwa(series, date) {
  const pts = series.filter((p) => p.time.startsWith(date));
  const hours = [];
  for (let h = 8; h <= 16; h++) {
    const a = pts.findLast((p) => hourOf(p.time) <= h);
    const b = pts.find((p) => hourOf(p.time) >= h);
    if (!a || !b) return null;
    const ha = hourOf(a.time);
    const hb = hourOf(b.time);
    const f = hb === ha ? 0 : (h - ha) / (hb - ha);
    const near = h - ha <= hb - h ? a : b;
    const out = { hour: h };
    for (const k of NUMBERS) {
      if (a[k] == null || b[k] == null) return null;
      out[k] = a[k] + (b[k] - a[k]) * f;
    }
    for (const k of DIRECTIONS) {
      if (near[k] == null) return null;
      out[k] = near[k];
    }
    hours.push(out);
  }
  return hours;
}

// Water temperature, tide, past waves and rain stay from Open-Meteo (CWA's coastal forecast has none).
export function applyCoastal(day, coastal) {
  if (!day || !coastal?.series?.length) return day;
  const cwa = hourlyFromCwa(coastal.series, day.date);
  if (!cwa) return day;
  return { ...day, hours: day.hours.map((h, i) => ({ ...h, ...cwa[i] })), coastalAt: coastal.issuedAt };
}
```

In `src/core/constants.js`, replace the last lines

```js
  // satellite
  satMinValues: 10,
  satMaxAgeDays: 45,
};
```

with

```js
  // satellite
  satMinValues: 10,
  satMaxAgeDays: 45,

  // 氣象署 coastal forecast: older than this (by its "Sent" time) is not used
  coastalMaxAgeH: 12,
};
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run test/core/cwa.test.js` → PASS (8 tests). Then `npm test` → all pass (179).

- [ ] **Step 6: Commit**

```bash
git add src/core/cwa.js src/core/constants.js test/helpers/cwaFixture.js test/core/cwa.test.js
git commit -m "feat(core): read 氣象署 coastal forecast into hourly sea fields"
```

---

### Task 2: The Worker fetches and serves the coastal forecast

**Files:**
- Create: `worker/src/cwa.js`, `test/worker/cwa.test.js`
- Modify: `worker/src/index.js`, `worker/wrangler.toml`, `src/data/spots/xiaoliuqiu.json`, `src/data/spots/kenting.json`, `src/data/spots/qixing.json`, `src/data/spots/northeast.json`, `test/data/spots.test.js`, `test/worker/index.test.js`, `README.md`

**Interfaces:**
- Consumes: `extractArea`, `areaSeries`, `issuedAt` from `src/core/cwa.js`; `K.coastalMaxAgeH` (Task 1); fixture `cwaLocation`, `cwaFile`, `dayTimes` (Task 1).
- Produces:
  - Spot JSON field `cwaArea: string` on all 4 spots (values below).
  - `coastalUrl(key) → string`, `fetchCoastal(spots, key, fetchFn = fetch) → Promise<{ [spotId]: { issuedAt, series } }>` (throws `Error('CWA <status>')` on a bad status), `mergeSeries(old, fresh) → series` in `worker/src/cwa.js`.
  - `refreshCoastal(env, fetchFn = fetch) → Promise<void>` exported from `worker/src/index.js`; KV key `cwa:<spotId>` = `{ issuedAt: string | null, series: [...] }`.
  - `/v1/base` answer gains `coastal: { issuedAt, series }` when the spot has a `cwaArea` and the copy is at most 12 h old (Task 3 reads `helper.coastal`).

- [ ] **Step 1: Write the failing tests**

In `test/data/spots.test.js`, append:

```js
test('Taiwan spots name their 氣象署 coastal area', () => {
  expect(SPOT_LIST.map((s) => [s.id, s.cwaArea])).toEqual([
    ['xiaoliuqiu', '琉球鄉_南方沿海'],
    ['kenting', '恆春鎮沿海'],
    ['qixing', '恆春鎮沿海'],
    ['northeast', '貢寮區沿海'],
  ]);
});
```

`test/worker/cwa.test.js`:

```js
import { test, expect } from 'vitest';
import { coastalUrl, fetchCoastal, mergeSeries } from '../../worker/src/cwa.js';
import { cwaLocation, cwaFile, dayTimes } from '../helpers/cwaFixture.js';

const SENT = '2026-09-30T06:55:58+08:00';
const file = cwaFile(SENT, [
  cwaLocation('恆春鎮沿海', dayTimes('2026-09-30'), { wave: '1.2' }),
  cwaLocation('琉球鄉_南方沿海', dayTimes('2026-09-30')),
]);
const spots = [
  { id: 'a', cwaArea: '琉球鄉_南方沿海' },
  { id: 'b', cwaArea: '恆春鎮沿海' },
  { id: 'c', cwaArea: '恆春鎮沿海' },
  { id: 'd' },                       // a spot abroad: no cwaArea
  { id: 'e', cwaArea: '改了名字的區' }, // CWA renamed an area
];

test('one download serves every spot that names an area', async () => {
  const urls = [];
  const out = await fetchCoastal(spots, 'KEY', async (u) => { urls.push(u); return new Response(file); });
  expect(urls).toEqual([coastalUrl('KEY')]);
  expect(coastalUrl('KEY')).toBe('https://opendata.cwa.gov.tw/fileapi/v1/opendataapi/F-D0047-095?Authorization=KEY&format=JSON');
  expect(Object.keys(out).sort()).toEqual(['a', 'b', 'c']);
  expect(out.b.issuedAt).toBe(SENT);
  expect(out.b.series[0].waveH).toBe(1.2);
  expect(out.a.series).toHaveLength(5);
});

test('a CWA error throws, and the message never holds the key', async () => {
  const err = await fetchCoastal(spots, 'SECRET-KEY', async () => new Response('no', { status: 401 })).catch((e) => e);
  expect(err.message).toBe('CWA 401');
  expect(err.message).not.toContain('SECRET-KEY');
});

test("mergeSeries keeps this morning's earlier points when a later issue starts at noon", () => {
  const p = (time, waveH) => ({ time, waveH });
  const old = [p('2026-09-29T18:00', 1), p('2026-09-30T06:00', 2), p('2026-09-30T09:00', 3), p('2026-09-30T12:00', 4)];
  const fresh = [p('2026-09-30T12:00', 40), p('2026-09-30T15:00', 50)];
  expect(mergeSeries(old, fresh)).toEqual([p('2026-09-30T06:00', 2), p('2026-09-30T09:00', 3), p('2026-09-30T12:00', 40), p('2026-09-30T15:00', 50)]);
  expect(mergeSeries(null, fresh)).toBe(fresh);
  expect(mergeSeries(old, [])).toEqual([]);
});
```

In `test/worker/index.test.js`, change the first import line to

```js
import worker, { refreshCoastal } from '../../worker/src/index.js';
import { cwaLocation, cwaFile, dayTimes } from '../helpers/cwaFixture.js';
```

and append:

```js
const BASE = JSON.stringify({ spotId: 'xiaoliuqiu', zones: {} });
const coastalCopy = (issuedAt) => JSON.stringify({ issuedAt, series: [{ time: '2026-09-30T06:00', waveH: 0.6 }] });
const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString();
const fakeCtx = () => { const jobs = []; return { jobs, waitUntil: (p) => jobs.push(p) }; };
const ask = (env, ctx) => worker.fetch(new Request('https://x/v1/base?spot=xiaoliuqiu'), env, ctx).then((r) => r.json());

test('adds fresh 氣象署 coastal data to the answer', async () => {
  const env = { CACHE: fakeKV({ 'base:xiaoliuqiu': BASE, 'cwa:xiaoliuqiu': coastalCopy(hoursAgo(1)) }) };
  const body = await ask(env, fakeCtx());
  expect(body.coastal.series[0].waveH).toBe(0.6);
});

test('coastal data older than 12 hours, or a failed fetch, is left out', async () => {
  for (const raw of [coastalCopy(hoursAgo(13)), JSON.stringify({ issuedAt: null, series: [] })]) {
    const ctx = fakeCtx();
    const body = await ask({ CACHE: fakeKV({ 'base:xiaoliuqiu': BASE, 'cwa:xiaoliuqiu': raw }) }, ctx);
    expect(body.coastal).toBeUndefined();
    expect(ctx.jobs).toHaveLength(0);
  }
});

test('no coastal copy yet → answer now and fill it in the background', async () => {
  const ctx = fakeCtx();
  const body = await ask({ CACHE: fakeKV({ 'base:xiaoliuqiu': BASE }) }, ctx);
  expect(body.coastal).toBeUndefined();
  expect(ctx.jobs).toHaveLength(1);
  await Promise.all(ctx.jobs); // no CWA_KEY in this env: the job ends at once
});

test('refreshCoastal stores every Taiwan spot; a failure marks empty spots and keeps old copies', async () => {
  const file = cwaFile('2026-09-30T06:55:58+08:00', ['琉球鄉_南方沿海', '恆春鎮沿海', '貢寮區沿海'].map((n) => cwaLocation(n, dayTimes('2026-09-30'))));
  const kv = fakeKV();
  await refreshCoastal({ CACHE: kv, CWA_KEY: 'K' }, async () => new Response(file));
  for (const id of ['xiaoliuqiu', 'kenting', 'qixing', 'northeast']) {
    const c = JSON.parse(await kv.get(`cwa:${id}`));
    expect(c.issuedAt).toBe('2026-09-30T06:55:58+08:00');
    expect(c.series).toHaveLength(5);
  }
  const empty = fakeKV();
  await refreshCoastal({ CACHE: empty, CWA_KEY: 'K' }, async () => new Response('x', { status: 500 }));
  expect(JSON.parse(await empty.get('cwa:kenting'))).toEqual({ issuedAt: null, series: [] });
  const old = JSON.stringify({ issuedAt: '2026-09-30T00:55:00+08:00', series: [{ time: '2026-09-30T00:00' }] });
  const kept = fakeKV({ 'cwa:kenting': old });
  await refreshCoastal({ CACHE: kept, CWA_KEY: 'K' }, async () => new Response('x', { status: 500 }));
  expect(await kept.get('cwa:kenting')).toBe(old);
});

test('refreshCoastal without a key does nothing', async () => {
  const kv = fakeKV();
  let called = false;
  await refreshCoastal({ CACHE: kv }, async () => { called = true; return new Response(''); });
  expect(called).toBe(false);
  expect(await kv.get('cwa:kenting')).toBeNull();
});

test('the 6-hourly cron refreshes the coastal forecast only', async () => {
  const kv = fakeKV();
  const ctx = fakeCtx();
  await worker.scheduled({ cron: '30 5,11,17,23 * * *' }, { CACHE: kv }, ctx);
  expect(ctx.jobs).toHaveLength(1);
  await Promise.all(ctx.jobs);
  expect(await kv.get('base:xiaoliuqiu')).toBeNull(); // the daily satellite refresh did not run
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/data/spots.test.js test/worker/cwa.test.js test/worker/index.test.js`
Expected: FAIL — `cwaArea` is undefined, `worker/src/cwa.js` is missing, `refreshCoastal` is not exported.

- [ ] **Step 3: Add `cwaArea` to the 4 spots**

In each file, add one line right after the `"name": …,` line (keep everything else unchanged):

- `src/data/spots/xiaoliuqiu.json`: `  "cwaArea": "琉球鄉_南方沿海",`
- `src/data/spots/kenting.json`: `  "cwaArea": "恆春鎮沿海",`
- `src/data/spots/qixing.json`: `  "cwaArea": "恆春鎮沿海",`
- `src/data/spots/northeast.json`: `  "cwaArea": "貢寮區沿海",`

(小琉球's buoy and dive sites are on the south side, so `琉球鄉_南方沿海`. 龍洞 is in 貢寮區.)

- [ ] **Step 4: Write `worker/src/cwa.js`**

```js
import { extractArea, areaSeries, issuedAt } from '../../src/core/cwa.js';

const FILE_URL = 'https://opendata.cwa.gov.tw/fileapi/v1/opendataapi/F-D0047-095';
export const coastalUrl = (key) => `${FILE_URL}?Authorization=${encodeURIComponent(key)}&format=JSON`;

// One ~6 MB download for all spots; only the areas they use are parsed (free-plan CPU limit).
export async function fetchCoastal(spots, key, fetchFn = fetch) {
  const res = await fetchFn(coastalUrl(key));
  if (!res.ok) throw new Error(`CWA ${res.status}`); // never the URL: it holds the key
  const text = await res.text();
  const sent = issuedAt(text);
  const byArea = new Map();
  const out = {};
  for (const s of spots) {
    if (!s.cwaArea) continue;
    if (!byArea.has(s.cwaArea)) {
      const location = extractArea(text, s.cwaArea);
      byArea.set(s.cwaArea, location ? areaSeries(location) : null);
    }
    const series = byArea.get(s.cwaArea);
    if (series?.length) out[s.id] = { issuedAt: sent, series };
  }
  return out;
}

// A new issue (e.g. 12:55) starts at 12:00; keep the morning points of the same day from the
// previous copy, so today's 08..11 still come from 氣象署.
export function mergeSeries(old, fresh) {
  const first = fresh[0]?.time;
  if (!first || !old?.length) return fresh;
  const day = first.slice(0, 10);
  return [...old.filter((p) => p.time < first && p.time.startsWith(day)), ...fresh];
}
```

- [ ] **Step 5: Update `worker/src/index.js`**

Replace the whole file with:

```js
import { SPOTS } from '../../src/data/spots/index.js';
import { zoneBias } from '../../src/core/calibration.js';
import { K } from '../../src/core/constants.js';
import { DAY_MS } from '../../src/core/math.js';
import { computeZones } from './base.js';
import { fetchReports } from './firestore.js';
import { fetchCoastal, mergeSeries } from './cwa.js';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json; charset=utf-8' };
const COASTAL_CRON = '30 5,11,17,23 * * *'; // 01:30, 07:30, 13:30, 19:30 Taiwan time (see wrangler.toml)

export async function buildHelperData(spot, env, fetchFn = fetch, now = Date.now()) {
  const { zones, satelliteDate } = await computeZones(spot, fetchFn, now);
  let bias = {};
  try {
    const reports = await fetchReports(env.FIREBASE_PROJECT_ID, spot.id, now - K.biasWindowDays * DAY_MS, fetchFn);
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

// 氣象署 coastal forecast → KV `cwa:<spotId>`. A failed fetch keeps the last copy; a spot with no
// copy at all gets an empty one, so requests stop starting new downloads until the next cron.
export async function refreshCoastal(env, fetchFn = fetch) {
  if (!env.CWA_KEY) return;
  const spots = Object.values(SPOTS).filter((s) => s.cwaArea);
  let fresh = {};
  try {
    fresh = await fetchCoastal(spots, env.CWA_KEY, fetchFn);
  } catch {
    // CWA down, bad key or over the CPU limit: the page falls back to Open-Meteo
  }
  await Promise.all(spots.map(async (s) => {
    const key = `cwa:${s.id}`;
    const f = fresh[s.id];
    const oldRaw = await env.CACHE.get(key);
    if (f) {
      const old = oldRaw ? JSON.parse(oldRaw) : null;
      await env.CACHE.put(key, JSON.stringify({ issuedAt: f.issuedAt, series: mergeSeries(old?.series, f.series) }));
    } else if (oldRaw == null) {
      await env.CACHE.put(key, JSON.stringify({ issuedAt: null, series: [] }));
    }
  }));
}

function usableCoastal(raw, now) {
  if (!raw) return null;
  const c = JSON.parse(raw);
  if (!c.issuedAt || !c.series?.length) return null;
  return now - Date.parse(c.issuedAt) <= K.coastalMaxAgeH * 3600000 ? c : null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (url.pathname !== '/v1/base') return new Response('{"error":"not found"}', { status: 404, headers: CORS });
    const spot = SPOTS[url.searchParams.get('spot')];
    if (!spot) return new Response('{"error":"unknown spot"}', { status: 404, headers: CORS });
    const cached = await env.CACHE.get(`base:${spot.id}`);
    const data = cached ? JSON.parse(cached) : await refresh(spot, env);
    if (spot.cwaArea) {
      const raw = await env.CACHE.get(`cwa:${spot.id}`);
      if (raw == null) ctx?.waitUntil(refreshCoastal(env)); // first request after a deploy fills it
      const coastal = usableCoastal(raw, Date.now());
      if (coastal) data.coastal = coastal;
    }
    return new Response(JSON.stringify(data), { headers: { ...CORS, 'Cache-Control': 'public, max-age=3600' } });
  },

  async scheduled(event, env, ctx) {
    if (event.cron === COASTAL_CRON) ctx.waitUntil(refreshCoastal(env));
    else ctx.waitUntil(Promise.all(Object.values(SPOTS).map((s) => refresh(s, env))));
  },
};
```

- [ ] **Step 6: Add the cron**

In `worker/wrangler.toml`, replace

```toml
crons = ["0 22 * * *"]   # 06:00 Taipei every day
```

with

```toml
crons = ["0 22 * * *", "30 5,11,17,23 * * *"]   # 06:00 Taipei: satellite + reports; every 6 h (01:30/07:30/13:30/19:30 Taipei): 氣象署 coastal forecast
```

- [ ] **Step 7: README**

In `README.md`, find the text `不會壞。` inside the `加潛點` bullet (it appears once; check with `grep -c "不會壞。" README.md` → `1`) and insert right after it:

```
台灣的潛點再加 `cwaArea`:氣象署「鄉鎮沿海預報」的區名(例如 `恆春鎮沿海`),要跟氣象署一字不差;國外潛點不要加,會照舊用 Open-Meteo。
```

Then add a new bullet right after the `加潛點` bullet:

```
- 氣象署金鑰:小幫手要有祕密 `CWA_KEY`(氣象署開放資料平臺的授權碼),設定一次就好:`cd worker && npx wrangler secret put CWA_KEY --config wrangler.toml`。沒設定的話台灣潛點也照舊用 Open-Meteo。金鑰不要放進程式或 git。
```

- [ ] **Step 8: Run the tests**

Run: `npx vitest run test/data/spots.test.js test/worker/cwa.test.js test/worker/index.test.js` → PASS. Then `npm test` → all pass (189).

- [ ] **Step 9: Commit**

```bash
git add worker/src/cwa.js worker/src/index.js worker/wrangler.toml src/data/spots/xiaoliuqiu.json src/data/spots/kenting.json src/data/spots/qixing.json src/data/spots/northeast.json test/data/spots.test.js test/worker/cwa.test.js test/worker/index.test.js README.md
git commit -m "feat(worker): serve the 氣象署 coastal forecast for Taiwan spots"
```

---

### Task 3: The page uses it

**Files:**
- Modify: `src/core/forecast.js`, `src/main.js`, `src/ui/mainView.js`, `test/ui/mainView.test.js`
- Create: `test/core/forecastCoastal.test.js`

**Interfaces:**
- Consumes: `applyCoastal(day, coastal)` (Task 1); `helper.coastal` in the `/v1/base` answer (Task 2); `hhmm(ms)` from `src/ui/format.js` (existing: Taiwan `HH:MM`).
- Produces: `buildForecast(...)` result gains `coastalAt: string | null`. Footer starts with `海況 氣象署 HH:MM ・ ` when the day used CWA.

- [ ] **Step 1: Write the failing tests**

`test/core/forecastCoastal.test.js`:

```js
import { test, expect } from 'vitest';
import { buildForecast } from '../../src/core/forecast.js';
import { SPOTS } from '../../src/data/spots/index.js';
import { makeDay } from '../helpers/makeDay.js';

const NOW = Date.UTC(2024, 0, 18, 4, 0);
const build = (day) => buildForecast({ spot: SPOTS.xiaoliuqiu, day, stale: null, helper: null, reports: [], now: NOW, isToday: true });

test('the forecast says when 氣象署 issued the sea data it used', () => {
  const day = { ...makeDay({ date: '2024-01-18' }), coastalAt: '2024-01-18T06:55:58+08:00' };
  expect(build(day).coastalAt).toBe('2024-01-18T06:55:58+08:00');
  expect(build(makeDay({ date: '2024-01-18' })).coastalAt).toBeNull();
});
```

In `test/ui/mainView.test.js`, append:

```js
test('the footer names 氣象署 when the day used its sea forecast', () => {
  const html = renderMain({ ...base, forecast: { ...forecast, coastalAt: '2024-01-18T06:55:58+08:00' } });
  expect(html).toContain('海況 氣象署 06:55 ・ 天氣');
  expect(renderMain(base)).not.toContain('氣象署');
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/core/forecastCoastal.test.js test/ui/mainView.test.js`
Expected: FAIL — `coastalAt` is `undefined`; the footer has no `海況`.

- [ ] **Step 3: Implement**

In `src/core/forecast.js`, in the returned object, after `sst: daytimeSst(day),` add:

```js
    coastalAt: day.coastalAt ?? null, // set when the sea fields came from 氣象署
```

In `src/ui/mainView.js`, replace

```js
  const foot = [
    freshness.weatherAt ? `天氣 ${hhmm(freshness.weatherAt)}` : '天氣 —',
```

with

```js
  const foot = [
    ...(forecast?.coastalAt ? [`海況 氣象署 ${hhmm(Date.parse(forecast.coastalAt))}`] : []),
    freshness.weatherAt ? `天氣 ${hhmm(freshness.weatherAt)}` : '天氣 —',
```

In `src/main.js`, add next to the other imports:

```js
import { applyCoastal } from './core/cwa.js';
```

and in `buildForecasts`, replace

```js
    const day = weather ? safeParseDay(weather.raw, taipeiDate(now, i)) : null;
```

with

```js
    // Taiwan spots: 氣象署 waves/currents/wind when the helper has them; otherwise Open-Meteo as before.
    const day = weather ? applyCoastal(safeParseDay(weather.raw, taipeiDate(now, i)), helper?.coastal) : null;
```

- [ ] **Step 4: Run tests and build**

```bash
npm test
npm run build
```

Expected: all pass (191); build succeeds.

- [ ] **Step 5: Look at it in a browser**

The live helper has no `coastal` yet (it is deployed after this plan), so check the fallback: `npm run dev`, open http://localhost:5173 — every spot looks exactly as before and the footer has no `海況`. Report what you saw. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/core/forecast.js src/main.js src/ui/mainView.js test/core/forecastCoastal.test.js test/ui/mainView.test.js
git commit -m "feat(app): use the 氣象署 coastal forecast for Taiwan spots"
```

---

## After the plan (controller only, not an implementer task)

- Final review of the branch with the strongest model.
- Show Michael; after his OK, merge `feat/cwa-coastal` into `main` (fast-forward) and delete the branch.
- Deploy only when Michael says 上線, in this order:
  1. **Ask Michael first**, then set the secret from `.env` without printing it: `grep '^CWA_KEY=' .env | cut -d= -f2- | tr -d '\r" ' | (cd worker && npx wrangler secret put CWA_KEY --config wrangler.toml)`.
  2. `cd worker && npx wrangler deploy --config wrangler.toml` (check `--dry-run` first shows `env.CACHE`).
  3. `curl "https://haidi-helper.mikekuo0725.workers.dev/v1/base?spot=xiaoliuqiu"` once (starts the background fill), wait ~30 s, curl each of the 4 spots again: each answer must have `coastal` with a recent `issuedAt`. If not, run `npx wrangler tail --config wrangler.toml` during a request and look for CPU-limit errors; if they happen, tell Michael (free plan too small → Open-Meteo fallback is working; paid plan is his decision).
  4. `npm run build` then `npx wrangler deploy` from the repo root.
  5. Open the live page: footer starts with `海況 氣象署 HH:MM`; the sea map arrow moves every 3 hours.
- Update the Obsidian note `專案筆記/2026 海底清不清/工作筆記.md`.
