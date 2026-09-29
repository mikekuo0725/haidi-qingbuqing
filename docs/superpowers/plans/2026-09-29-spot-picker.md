# 換潛點 + 墾丁 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user switch dive spots from a button at the top-left of the main screen (bottom sheet list sorted by GPS distance, GPS auto-picks a spot you are at), and add 墾丁 as the second spot.

**Architecture:** Spots are already data (`src/data/spots/*.json`); the Worker, weather cache, report queries and Firestore rules are already keyed by spot id. What is missing is (1) the 墾丁 JSON, (2) pure functions that decide which spot to show, (3) a header button + bottom-sheet view, and (4) `src/main.js` holding the current spot in state instead of a module constant. The sheet is a history view (`#spots`) like the detail page, so the phone back button closes it.

**Tech Stack:** JavaScript ES modules (no framework), Vite 8, Vitest 5, Firebase JS SDK, Cloudflare Workers + KV (wrangler 4).

**Spec:** `docs/superpowers/specs/2026-09-29-spot-picker-design.md` (builds on `docs/superpowers/specs/2026-09-27-haidi-qingbuqing-design.md`). Read both before starting.

## Global Constraints

- Repo root: `D:\Users\michael0725\Desktop\2026 海底清不清`. Paths below are relative to it. Run commands from the repo root in Git Bash.
- Branch: `feat/spot-picker`, created from `feat/v1` in Task 1. Do not touch `main`, do not push.
- Commit messages end with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- All user-facing text is Traditional Chinese (繁體中文).
- Phone first: works at 320–480 px with no sideways scroll; tap targets ≥ 44 px; inputs 16 px; muted text via color (not opacity); respect iPhone safe areas; phone back button goes back inside the app. Computers: works with mouse + keyboard; hover highlight.
- Dive spots are data, not code: code must not mention 小琉球, 墾丁, a spot id or a zone id (tests may).
- Show the forecast first; never wait for the GPS prompt before rendering.
- Never store or send the user's GPS position. It lives only in memory (`state.pos`) to compute distances. Reports store only `spotId` + `zoneId`.
- Remembered spot: `localStorage` key `haidi:spot`. Shared link parameter: `?spot=<id>`.
- Spot choice order on open: valid `?spot=` → valid saved `haidi:spot` → `DEFAULT_SPOT_ID` (小琉球).
- GPS auto-switch only when: the user is within the target spot's `locateMaxKm`, it is not the current spot, the page was not opened from a `?spot=` link, the user has not picked a spot by hand this visit, and the main list is on screen (never while in a detail page, report form or the sheet).
- 墾丁 data was checked live on 2026-09-29: Open-Meteo marine at 21.95,120.78 returns real values (grid 21.958,120.792); NOAA `kd_490` boxes return 270 / 360 / 360 values (medians 0.062 / 0.056 / 0.076). Do not re-derive the coordinates; use the JSON in Task 1 exactly.
- Deploy is NOT part of any implementer task. Deploy only in Task 5, by the controller, after Michael says OK. Web: `npm run build` then `npx wrangler deploy` (root `wrangler.jsonc`). Worker: `cd worker && npx wrangler deploy`. Never use `wrangler pages deploy` (it rewrites `vite.config.js` and breaks tests).
- Full test suite must stay green: `npm test` (121 tests before this plan).

## File Structure

```
src/data/spots/kenting.json     NEW  墾丁: 3 zones (west / south / east)
src/data/spots/index.js         MOD  + SPOT_LIST (ordered array), SPOTS built from it
src/core/spotChoice.js          NEW  pure: spotsByDistance, nearbySpotId, initialSpotId, autoSwitchTarget
src/ui/spotSheet.js             NEW  renderSpotSheet → backdrop + dialog HTML
src/ui/mainView.js              MOD  header becomes the spot button; emptyText param
src/styles.css                  MOD  .spotbtn, .sheet-bg, .sheet, .srow …
src/main.js                     MOD  current spot in state; sheet view; auto-switch; share URL
test/data/spots.test.js         MOD  unique ids, facing range, 墾丁 zones
test/core/locate.test.js        MOD  墾丁 cases
test/core/spotChoice.test.js    NEW
test/ui/spotSheet.test.js       NEW
test/ui/mainView.test.js        MOD  header + emptyText
test/worker/index.test.js       MOD  kenting is served
README.md                       MOD  (Task 5) mention the spot picker
```

`src/core/factors.js` is intentionally untouched: the v1 reviewer's "unknown shelter/bottom → NaN" risk is covered by the data test that only allows known values.

---

### Task 1: 墾丁 data

**Files:**
- Create: `src/data/spots/kenting.json`
- Modify: `src/data/spots/index.js`
- Test: `test/data/spots.test.js`, `test/core/locate.test.js`, `test/worker/index.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `SPOT_LIST: Spot[]` (order = order shown in the sheet when there is no GPS: 小琉球, 墾丁), `SPOTS: Record<id, Spot>` (same objects), `DEFAULT_SPOT_ID = 'xiaoliuqiu'`. `SPOTS.kenting` with zones `west`, `south`, `east`.

- [ ] **Step 1: Create the branch**

```bash
git checkout feat/v1
git status --short   # must be empty; stop and report if not
git checkout -b feat/spot-picker
```

- [ ] **Step 2: Write the failing tests**

Append to `test/data/spots.test.js` (keep the existing test; change the import line to also import `SPOT_LIST`):

```js
import { SPOTS, SPOT_LIST, DEFAULT_SPOT_ID } from '../../src/data/spots/index.js';

test('spot ids and zone ids are unique, facings are compass degrees', () => {
  const ids = SPOT_LIST.map((s) => s.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(Object.keys(SPOTS).sort()).toEqual([...ids].sort());
  for (const s of SPOT_LIST) {
    expect(SPOTS[s.id]).toBe(s);
    expect(s.locateMaxKm).toBeGreaterThan(0);
    const zoneIds = s.zones.map((z) => z.id);
    expect(new Set(zoneIds).size).toBe(zoneIds.length);
    for (const z of s.zones) {
      expect(z.facing).toBeGreaterThanOrEqual(0);
      expect(z.facing).toBeLessThan(360);
      expect(z.fallbackBase).toBeGreaterThan(0);
    }
  }
});

test('墾丁 has 西岸 / 南灣 / 東岸', () => {
  expect(SPOTS.kenting.name).toBe('墾丁');
  expect(SPOTS.kenting.zones.map((z) => z.id)).toEqual(['west', 'south', 'east']);
  expect(SPOT_LIST.map((s) => s.id)).toEqual(['xiaoliuqiu', 'kenting']);
});
```

Append to `test/core/locate.test.js`:

```js
const kenting = SPOTS.kenting;

test('墾丁: 萬里桐 → west, 後壁湖 → south, 香蕉灣 → east', () => {
  expect(locate([21.99, 120.71], kenting)).toMatchObject({ status: 'near', zoneId: 'west' });
  expect(locate([21.945, 120.745], kenting)).toMatchObject({ status: 'near', zoneId: 'south' });
  expect(locate([21.925, 120.835], kenting)).toMatchObject({ status: 'near', zoneId: 'east' });
});

test('墾丁 from 小琉球 → far', () => {
  const r = locate([22.34, 120.37], kenting);
  expect(r.status).toBe('far');
  expect(r.km).toBeGreaterThan(55);
});
```

Append to `test/worker/index.test.js`:

```js
test('kenting is a known spot', async () => {
  const data = { spotId: 'kenting', zones: {} };
  const env = { CACHE: fakeKV({ 'base:kenting': JSON.stringify(data) }) };
  const res = await worker.fetch(new Request('https://x/v1/base?spot=kenting'), env);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual(data);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run test/data test/core/locate.test.js test/worker/index.test.js`
Expected: FAIL — `SPOT_LIST` is undefined / `SPOTS.kenting` is undefined / kenting → 404.

- [ ] **Step 4: Create `src/data/spots/kenting.json`**

```json
{
  "id": "kenting",
  "name": "墾丁",
  "center": [21.95, 120.78],
  "locateMaxKm": 20,
  "thresholds": { "purple": 20, "green": 12, "yellow": 6 },
  "riverName": "保力溪",
  "riverBearing": 338,
  "rainPoints": [
    { "name": "車城", "lat": 22.072, "lon": 120.712 },
    { "name": "牡丹", "lat": 22.155, "lon": 120.772 },
    { "name": "恆春", "lat": 22.002, "lon": 120.745 }
  ],
  "safety": { "currentYellowKn": 0.5, "currentRedKn": 1.0, "waveRedM": 1.5 },
  "zones": [
    { "id": "west", "name": "西岸", "location": [21.990, 120.705], "facing": 270,
      "shelter": "semi", "bottom": "rock", "riverImpact": 0.4,
      "satBox": [[21.96, 120.66], [22.02, 120.69]], "fallbackBase": 12 },
    { "id": "south", "name": "南灣", "location": [21.950, 120.755], "facing": 180,
      "shelter": "semi", "bottom": "mixed", "riverImpact": 0.2,
      "satBox": [[21.88, 120.74], [21.92, 120.80]], "fallbackBase": 10 },
    { "id": "east", "name": "東岸", "location": [21.935, 120.840], "facing": 110,
      "shelter": "open", "bottom": "rock", "riverImpact": 0.1,
      "satBox": [[21.92, 120.87], [21.98, 120.90]], "fallbackBase": 15 }
  ]
}
```

- [ ] **Step 5: Replace `src/data/spots/index.js`**

```js
import xiaoliuqiu from './xiaoliuqiu.json';
import kenting from './kenting.json';

// Order = order in the spot list when there is no GPS.
export const SPOT_LIST = [xiaoliuqiu, kenting];
export const SPOTS = Object.fromEntries(SPOT_LIST.map((s) => [s.id, s]));
export const DEFAULT_SPOT_ID = xiaoliuqiu.id;
```

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS, 126 tests (121 + 5).

- [ ] **Step 7: Commit**

```bash
git add src/data/spots/kenting.json src/data/spots/index.js test/data/spots.test.js test/core/locate.test.js test/worker/index.test.js
git commit -m "$(cat <<'EOF'
feat(spots): add 墾丁 with west / south / east zones

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Which spot to show (pure functions)

**Files:**
- Create: `src/core/spotChoice.js`
- Test: `test/core/spotChoice.test.js`

**Interfaces:**
- Consumes: `distanceKm([lat, lon], [lat, lon]) → km` from `src/core/math.js`; spot objects `{ id, center, locateMaxKm }`; `SPOT_LIST` from Task 1 (test only).
- Produces:
  - `spotsByDistance(pos: [lat, lon] | null, spots: Spot[]) → { spot: Spot, km: number | null }[]` — nearest first when `pos`; input order and `km: null` when no `pos`. Never mutates `spots`.
  - `nearbySpotId(pos, spots) → string | null` — id of the nearest spot if within its `locateMaxKm`, else `null` (also `null` for no `pos` or empty list).
  - `initialSpotId({ urlId, savedId, spots, defaultId }) → string` — `urlId` if it is a spot id, else `savedId` if it is a spot id, else `defaultId`.
  - `autoSwitchTarget({ pos, spots, currentId, locked }) → string | null` — `nearbySpotId(...)` when it differs from `currentId` and `locked` is false; otherwise `null`.

- [ ] **Step 1: Write the failing test** — create `test/core/spotChoice.test.js`:

```js
import { test, expect } from 'vitest';
import { spotsByDistance, nearbySpotId, initialSpotId, autoSwitchTarget } from '../../src/core/spotChoice.js';
import { SPOT_LIST } from '../../src/data/spots/index.js';

const A = { id: 'a', center: [22.34, 120.37], locateMaxKm: 15 };
const B = { id: 'b', center: [21.95, 120.78], locateMaxKm: 20 };
const spots = [A, B];
const AT_B = [21.945, 120.80];
const TAINAN = [22.99, 120.21];

test('sorts nearest first when there is a position', () => {
  const rows = spotsByDistance(AT_B, spots);
  expect(rows.map((r) => r.spot.id)).toEqual(['b', 'a']);
  expect(rows[0].km).toBeLessThan(5);
  expect(rows[1].km).toBeGreaterThan(55);
  expect(spots).toEqual([A, B]); // input not reordered
});

test('no position keeps list order and gives no distances', () => {
  expect(spotsByDistance(null, spots)).toEqual([{ spot: A, km: null }, { spot: B, km: null }]);
});

test('nearbySpotId: inside locateMaxKm → id, otherwise null', () => {
  expect(nearbySpotId([22.341, 120.355], spots)).toBe('a');
  expect(nearbySpotId(AT_B, spots)).toBe('b');
  expect(nearbySpotId(TAINAN, spots)).toBeNull();
  expect(nearbySpotId(null, spots)).toBeNull();
  expect(nearbySpotId(AT_B, [])).toBeNull();
});

test('initialSpotId: url > saved > default, unknown ids ignored', () => {
  expect(initialSpotId({ urlId: 'b', savedId: 'a', spots, defaultId: 'a' })).toBe('b');
  expect(initialSpotId({ urlId: null, savedId: 'b', spots, defaultId: 'a' })).toBe('b');
  expect(initialSpotId({ urlId: 'nope', savedId: 'zzz', spots, defaultId: 'a' })).toBe('a');
  expect(initialSpotId({ urlId: 'constructor', savedId: null, spots, defaultId: 'a' })).toBe('a');
});

test('autoSwitchTarget: only when near another spot and not locked', () => {
  expect(autoSwitchTarget({ pos: AT_B, spots, currentId: 'a', locked: false })).toBe('b');
  expect(autoSwitchTarget({ pos: AT_B, spots, currentId: 'a', locked: true })).toBeNull();
  expect(autoSwitchTarget({ pos: AT_B, spots, currentId: 'b', locked: false })).toBeNull();
  expect(autoSwitchTarget({ pos: TAINAN, spots, currentId: 'b', locked: false })).toBeNull();
  expect(autoSwitchTarget({ pos: null, spots, currentId: 'a', locked: false })).toBeNull();
});

test('real data: at 墾丁大街 the nearby spot is kenting', () => {
  expect(nearbySpotId(AT_B, SPOT_LIST)).toBe('kenting');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/core/spotChoice.test.js`
Expected: FAIL — cannot find module `src/core/spotChoice.js`.

- [ ] **Step 3: Implement** — create `src/core/spotChoice.js`:

```js
import { distanceKm } from './math.js';

export function spotsByDistance(pos, spots) {
  const rows = spots.map((spot) => ({ spot, km: pos ? distanceKm(pos, spot.center) : null }));
  return pos ? rows.sort((a, b) => a.km - b.km) : rows;
}

export function nearbySpotId(pos, spots) {
  if (!pos || !spots.length) return null;
  const [nearest] = spotsByDistance(pos, spots);
  return nearest.km <= nearest.spot.locateMaxKm ? nearest.spot.id : null;
}

export function initialSpotId({ urlId, savedId, spots, defaultId }) {
  const known = (id) => id != null && spots.some((s) => s.id === id);
  if (known(urlId)) return urlId;
  if (known(savedId)) return savedId;
  return defaultId;
}

export function autoSwitchTarget({ pos, spots, currentId, locked }) {
  if (locked) return null;
  const id = nearbySpotId(pos, spots);
  return id && id !== currentId ? id : null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/core/spotChoice.test.js` → PASS (6 tests). Then `npm test` → PASS, 132 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/spotChoice.js test/core/spotChoice.test.js
git commit -m "$(cat <<'EOF'
feat(core): decide which dive spot to show from link, memory and GPS

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Header button + spot sheet (HTML + CSS)

**Files:**
- Create: `src/ui/spotSheet.js`
- Modify: `src/ui/mainView.js:44-61` (the `renderMain` function), `src/styles.css`
- Test: `test/ui/spotSheet.test.js` (new), `test/ui/mainView.test.js`

**Interfaces:**
- Consumes: `esc` from `src/ui/format.js`; rows shaped like `spotsByDistance` output from Task 2 (`{ spot, km }`).
- Produces:
  - `renderSpotSheet({ rows, currentId, nearId = null }) → string` — a backdrop `<div class="sheet-bg" data-action="close-sheet">` and a `<div class="sheet" role="dialog" aria-modal="true" aria-label="選潛點">` with one `<button type="button" class="srow" data-spot="<id>">` per row, in the given order.
  - `renderMain({ …existing…, emptyText = '這天沒有資料' })` — header is now `<button type="button" class="spotbtn" data-action="spots">`; when `forecast` is null it shows `emptyText` instead of the fixed 這天沒有資料.

- [ ] **Step 1: Write the failing tests**

Create `test/ui/spotSheet.test.js`:

```js
import { test, expect } from 'vitest';
import { renderSpotSheet } from '../../src/ui/spotSheet.js';
import { SPOTS } from '../../src/data/spots/index.js';

const rows = [{ spot: SPOTS.xiaoliuqiu, km: 0.4 }, { spot: SPOTS.kenting, km: 60.6 }];

test('current spot is ticked, the spot you are at says 你在這裡', () => {
  const html = renderSpotSheet({ rows, currentId: 'xiaoliuqiu', nearId: 'xiaoliuqiu' });
  expect(html).toContain('data-spot="xiaoliuqiu" aria-pressed="true"><span>✓ 小琉球</span><span class="here">你在這裡 · 不到 1 公里</span>');
  expect(html).toContain('data-spot="kenting" aria-pressed="false"><span>墾丁</span><span class="mut">61 公里</span>');
});

test('rows keep the given order', () => {
  const html = renderSpotSheet({ rows: [...rows].reverse(), currentId: 'kenting' });
  const order = [...html.matchAll(/data-spot="(\w+)"/g)].map((m) => m[1]);
  expect(order).toEqual(['kenting', 'xiaoliuqiu']);
});

test('no GPS → no distances and nobody is 你在這裡', () => {
  const html = renderSpotSheet({ rows: rows.map((r) => ({ ...r, km: null })), currentId: 'kenting' });
  expect(html).not.toContain('公里');
  expect(html).not.toContain('你在這裡');
});

test('backdrop closes, sheet is a labelled dialog with the footer line', () => {
  const html = renderSpotSheet({ rows, currentId: 'kenting' });
  expect(html).toContain('<div class="sheet-bg" data-action="close-sheet"></div>');
  expect(html).toContain('role="dialog" aria-modal="true" aria-label="選潛點"');
  expect(html).toContain('更多潛點陸續加入');
  expect(html).toMatch(/<button type="button" class="srow on" data-spot="kenting"/);
});
```

In `test/ui/mainView.test.js`:
- In the test `'a day without data keeps header and tabs and says so instead of cards (R5)'`, replace the line `expect(html).toContain('小琉球 海底清不清');` with `expect(html).toContain('📍 小琉球');`.
- Append:

```js
test('header is a button that opens the spot list', () => {
  const html = renderMain(base);
  expect(html).toContain('<button type="button" class="spotbtn" data-action="spots" aria-label="換潛點，現在是小琉球">📍 小琉球 <span aria-hidden="true">▾</span></button>');
  expect(html).toContain('海底清不清 · 預測，不是保證');
});

test('no data at all shows the given text and keeps the spot button', () => {
  const html = renderMain({ ...base, forecast: null, emptyText: '載入中…' });
  expect(html).toContain('data-action="spots"');
  expect(html).toContain('<div class="pad">載入中…</div>');
  expect(html).not.toContain('這天沒有資料');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/ui/spotSheet.test.js test/ui/mainView.test.js`
Expected: FAIL — module `spotSheet.js` missing; header assertions fail.

- [ ] **Step 3: Create `src/ui/spotSheet.js`**

```js
import { esc } from './format.js';

const kmText = (km) => (km < 1 ? '不到 1' : String(Math.round(km)));

function row({ spot, km }, currentId, nearId) {
  const on = spot.id === currentId;
  const here = km != null && spot.id === nearId;
  const dist = km == null ? '' : `${here ? '你在這裡 · ' : ''}${kmText(km)} 公里`;
  return `<button type="button" class="srow${on ? ' on' : ''}" data-spot="${esc(spot.id)}" aria-pressed="${on}"><span>${on ? '✓ ' : ''}${esc(spot.name)}</span><span class="${here ? 'here' : 'mut'}">${dist}</span></button>`;
}

export function renderSpotSheet({ rows, currentId, nearId = null }) {
  return `<div class="sheet-bg" data-action="close-sheet"></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-label="選潛點">
    <div class="sheet-h">選潛點</div>
    ${rows.map((r) => row(r, currentId, nearId)).join('')}
    <div class="mut sheet-f">更多潛點陸續加入</div>
  </div>`;
}
```

- [ ] **Step 4: Edit `renderMain` in `src/ui/mainView.js`**

Change the signature to add `emptyText`:

```js
export function renderMain({ spot, forecast, dayIndex, dayLabels, located, freshness, now, hint = null, staleHours = forecast?.stale ?? null, emptyText = '這天沒有資料' }) {
```

Replace the header line

```js
  return `<header class="pad"><div class="t1">${esc(spot.name)} 海底清不清</div><div class="mut">預測，不是保證</div></header>
```

with

```js
  return `<header class="pad"><button type="button" class="spotbtn" data-action="spots" aria-label="換潛點，現在是${esc(spot.name)}">📍 ${esc(spot.name)} <span aria-hidden="true">▾</span></button><div class="mut">海底清不清 · 預測，不是保證</div></header>
```

and replace `'<div class="pad">這天沒有資料</div>'` with `` `<div class="pad">${esc(emptyText)}</div>` ``. Nothing else in the file changes.

- [ ] **Step 5: Add CSS** — in `src/styles.css`, after the `.foot { … }` line add:

```css
.spotbtn { display:inline-flex; align-items:center; gap:4px; min-height:var(--tap); margin:0 0 0 -6px; padding:0 8px 0 6px; border:0; border-radius:10px; background:none; font-size:19px; font-weight:800; cursor:pointer; }
.spotbtn:active, .srow:active { filter:brightness(1.2); }
.sheet-bg { position:fixed; inset:0; z-index:20; background:#000a; }
.sheet { position:fixed; left:0; right:0; bottom:0; z-index:21; max-width:480px; max-height:70vh; overflow-y:auto; margin:0 auto; padding:10px 14px calc(16px + env(safe-area-inset-bottom)); border-radius:16px 16px 0 0; background:var(--card); }
.sheet-h { font-weight:800; font-size:16px; padding:6px 2px 8px; }
.srow { display:flex; justify-content:space-between; align-items:center; gap:10px; width:100%; min-height:52px; padding:0 8px; border:0; border-bottom:1px solid var(--chip); background:none; font-size:16px; text-align:left; cursor:pointer; }
.srow.on { font-weight:800; }
.srow .here { font-size:13px; padding:2px 8px; border-radius:8px; background:#123f2e; white-space:nowrap; }
.sheet-f { padding:10px 2px 0; }
```

and extend the hover rule at the bottom to:

```css
  .card[data-zone]:hover, .btn:hover, .days button:hover, .opt span:hover, .spotbtn:hover, .srow:hover { filter:brightness(1.15); }
```

- [ ] **Step 6: Run to verify they pass**

Run: `npx vitest run test/ui` → PASS. Then `npm test` → PASS, 138 tests.

- [ ] **Step 7: Commit**

```bash
git add src/ui/spotSheet.js src/ui/mainView.js src/styles.css test/ui/spotSheet.test.js test/ui/mainView.test.js
git commit -m "$(cat <<'EOF'
feat(ui): spot button in the header and a bottom-sheet spot list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Wire it up in `src/main.js`

**Files:**
- Modify: `src/main.js` (whole file — replace with the version below)

**Interfaces:**
- Consumes: `SPOT_LIST`, `SPOTS`, `DEFAULT_SPOT_ID` (Task 1); `spotsByDistance`, `nearbySpotId`, `initialSpotId`, `autoSwitchTarget` (Task 2); `renderSpotSheet`, `renderMain({ emptyText })` (Task 3). Everything else as in v1.
- Produces: views `main | detail | report | spots`; data attributes `data-action="spots"`, `data-action="close-sheet"`, `data-spot="<id>"` handled here.

`main.js` has no unit tests in v1 (it is DOM wiring). This task is verified by the full suite plus the browser check in Step 3.

What changes compared with v1 (so a reviewer can check each one):
1. `spot` is no longer a module constant: `state.spotId` + `spot()`. `loadWeatherRaw(s, now)` takes the spot so a switch mid-fetch cannot mix spots (`loadId` guard stays).
2. Position is asked once at start (not on every `load()`), kept in `state.pos` (memory only). When it arrives: auto-switch if `autoSwitchTarget` says so and the main list is on screen; otherwise just update "你在哪一區".
3. `render()` always renders the main screen with the header (even with no data), using `emptyText` = 載入中… / the old "抓不到天氣資料…" text. The report form can open even without a forecast (empty snapshot; `zoneBias` already skips `rawMeters` that are not > 0).
4. New view `spots`: main + `renderSpotSheet`. Opening pushes a history entry, so back / backdrop / Esc all close it with `history.back()`. Picking a row stores `state.pendingSpot` and goes back; `popstate` then calls `selectSpot` on the main entry.
5. `selectSpot` saves `haidi:spot`, drops a `?spot=` query from the address bar (so a reload keeps the user's own choice), clears the old spot's data, renders 載入中…, and reloads.
6. Share URL carries `?spot=<id>`.

- [ ] **Step 1: Replace `src/main.js` with:**

```js
import { SPOTS, SPOT_LIST, DEFAULT_SPOT_ID } from './data/spots/index.js';
import { HELPER_URL } from './config.js';
import { fetchWeather, parseDay } from './services/openmeteo.js';
import { fetchHelper } from './services/helper.js';
import { saveWeather, loadWeather } from './services/cache.js';
import { createOutbox } from './services/outbox.js';
import { sendReport, fetchRecentReports, buildReportDoc } from './services/reports.js';
import { buildForecast } from './core/forecast.js';
import { locate } from './core/locate.js';
import { spotsByDistance, nearbySpotId, initialSpotId, autoSwitchTarget } from './core/spotChoice.js';
import { taipeiDate } from './core/time.js';
import { renderMain } from './ui/mainView.js';
import { renderSpotSheet } from './ui/spotSheet.js';
import { installHint } from './ui/installHint.js';
import { renderDetail } from './ui/detailView.js';
import { renderReportForm, parseReportForm } from './ui/reportForm.js';
import { buildShareText, shareOrCopy } from './ui/share.js';
import { md } from './ui/format.js';

const SPOT_KEY = 'haidi:spot';
const app = document.getElementById('app');
const outbox = createOutbox(localStorage, sendReport);
const DAY_LABELS = ['今天', '明天', '後天'];

function readSavedSpot() {
  try { return localStorage.getItem(SPOT_KEY); } catch { return null; }
}
function saveSpot(id) {
  try { localStorage.setItem(SPOT_KEY, id); } catch { /* storage full or blocked */ }
}

const urlSpotId = new URLSearchParams(location.search).get('spot');
const firstSpotId = initialSpotId({ urlId: urlSpotId, savedId: readSavedSpot(), spots: SPOT_LIST, defaultId: DEFAULT_SPOT_ID });

const state = {
  spotId: firstSpotId,
  lockedSpot: firstSpotId === urlSpotId, // opened from a shared link: GPS must not switch away
  pendingSpot: null,
  pos: null, // GPS: memory only, never stored or sent
  loading: true,
  dayIndex: 1, view: 'main', zoneId: null, located: { status: 'none' }, forecasts: [], weather: null, helper: null, reports: [], weatherAt: null,
};
const spot = () => SPOTS[state.spotId];

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3000);
}

function getPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve([p.coords.latitude, p.coords.longitude]), // used only in memory, never stored or sent
      () => resolve(null),
      { timeout: 8000, maximumAge: 600000 },
    );
  });
}

const safeParseDay = (raw, date) => {
  try { return parseDay(raw, date); } catch { return null; } // malformed data counts as "no data"
};

// R3: only a copy that parses for today replaces the cache, so one bad fetch never overwrites a good cache.
async function loadWeatherRaw(s, now) {
  try {
    const raw = await fetchWeather(s);
    if (safeParseDay(raw, taipeiDate(now))) {
      saveWeather(localStorage, s.id, raw, now);
      return { raw, savedAt: now, stale: null };
    }
  } catch { /* offline or API down: fall back to the cached copy */ }
  const cached = loadWeather(localStorage, s.id);
  return cached ? { ...cached, stale: (now - cached.savedAt) / 3600000 } : null;
}

function buildForecasts(now) {
  const { weather, helper, reports } = state;
  const s = spot();
  const today = taipeiDate(now);
  state.forecasts = [0, 1, 2].map((i) => {
    const day = weather ? safeParseDay(weather.raw, taipeiDate(now, i)) : null;
    if (!day) return null;
    return buildForecast({ spot: s, day, stale: weather.stale, helper, reports, now, isToday: day.date === today });
  });
}

function dateLabel(i) {
  const f = state.forecasts[i];
  return f ? `${DAY_LABELS[i]} ${md(f.date)}` : DAY_LABELS[i];
}

function render() {
  const now = Date.now();
  const s = spot();
  const forecast = state.forecasts[state.dayIndex];
  const zone = state.view === 'detail' ? forecast?.zones.find((z) => z.zoneId === state.zoneId) : null;
  app.dataset.view = state.view; // CSS widens only the main list on computers
  if (zone) {
    app.innerHTML = renderDetail({ spot: s, zone, dateLabel: dateLabel(state.dayIndex), reports: state.reports, now });
    return;
  }
  if (state.view === 'report') {
    const defaultZoneId = state.located.status === 'near' ? state.located.zoneId : null;
    app.innerHTML = renderReportForm({ spot: s, defaultZoneId, nickname: localStorage.getItem('haidi:nickname'), now });
    return;
  }
  app.dataset.view = 'main';
  const hasData = state.forecasts.some(Boolean);
  let emptyText = '這天沒有資料';
  if (!hasData) emptyText = state.loading ? '載入中…' : '抓不到天氣資料，也沒有之前存的預測。請確認網路後重新整理。';
  const lastReportAt = state.reports.length ? Math.max(...state.reports.map((r) => r.diveTime)) : null;
  let html = renderMain({
    spot: s, forecast: forecast ?? null, dayIndex: state.dayIndex, dayLabels: DAY_LABELS, located: state.located,
    freshness: { weatherAt: state.weatherAt, satelliteDate: state.helper?.satelliteDate ?? null, lastReportAt }, now,
    // Task 15: from state.weather, not the per-day forecast, so a day with no data at all still says why.
    staleHours: state.weather?.stale ?? null,
    emptyText,
    hint: installHint(navigator.userAgent, matchMedia('(display-mode: standalone)').matches || navigator.standalone === true),
  });
  if (state.view === 'spots') {
    html += renderSpotSheet({ rows: spotsByDistance(state.pos, SPOT_LIST), currentId: s.id, nearId: nearbySpotId(state.pos, SPOT_LIST) });
  }
  app.innerHTML = html;
}

// Late data (location, reports) re-renders the list and detail, never the report form: that would wipe what the user typed.
function refresh() {
  if (state.view !== 'report') render();
}

// Phone back button: every view change is a history entry, so "back" returns to the list instead of leaving the site.
let mainScrollY = 0;
function go(view, zoneId = null) {
  if (state.view === 'main') mainScrollY = window.scrollY;
  state.view = view;
  state.zoneId = zoneId;
  history.pushState({ view, zoneId }, '', view === 'main' ? '#' : `#${view}${zoneId ? `/${zoneId}` : ''}`);
  render();
  if (view !== 'spots') window.scrollTo(0, 0); // the sheet floats over the list: keep the list where it was
}

function selectSpot(id, { manual }) {
  if (manual) state.lockedSpot = true;
  const changed = id !== state.spotId && SPOT_LIST.some((s) => s.id === id);
  if (changed) {
    state.spotId = id;
    saveSpot(id);
    // A shared ?spot= link must not win over this choice when the page is reloaded.
    if (location.search) history.replaceState(history.state, '', location.pathname + location.hash);
    Object.assign(state, {
      located: locate(state.pos, spot()), forecasts: [], weather: null, helper: null, reports: [], weatherAt: null, loading: true,
    });
  }
  render();
  if (changed) {
    window.scrollTo(0, 0);
    load();
  }
}

window.addEventListener('popstate', (e) => {
  state.view = e.state?.view ?? 'main';
  state.zoneId = e.state?.zoneId ?? null;
  if (state.pendingSpot) { // a row in the sheet was picked: switch now that we are back on the main entry
    const id = state.pendingSpot;
    state.pendingSpot = null;
    selectSpot(id, { manual: true });
    return;
  }
  render();
  window.scrollTo(0, state.view === 'main' ? mainScrollY : 0);
});

let loadId = 0;
async function load() {
  const id = ++loadId;
  const now = Date.now();
  const s = spot();
  state.loading = true;
  // R11b: reports can take ~10 s offline; render the forecast without them, rebuild when they arrive.
  const reportsP = fetchRecentReports(s.id).catch(() => null);
  const [weather, helper] = await Promise.all([loadWeatherRaw(s, now), fetchHelper(HELPER_URL, s.id)]);
  if (id !== loadId) return; // a newer load() took over (e.g. the user switched spots)
  state.weather = weather;
  state.helper = helper;
  state.weatherAt = weather?.savedAt ?? null;
  state.loading = false;
  buildForecasts(now);
  if (!state.forecasts[state.dayIndex]) state.dayIndex = state.forecasts.findIndex(Boolean);
  if (state.dayIndex < 0) state.dayIndex = 0;
  refresh();
  const reports = await reportsP;
  if (id !== loadId || reports == null) return;
  state.reports = reports;
  buildForecasts(Date.now());
  refresh();
}

function currentSnapshot(zoneId) {
  const f = state.forecasts[0] ?? state.forecasts[state.dayIndex];
  const z = f?.zones.find((x) => x.zoneId === zoneId);
  if (!z) return { date: f?.date ?? null, base: null, bias: 1, factors: {}, rawMeters: null, meters: null };
  return { date: f.date, base: z.base, bias: z.bias, factors: z.factors, rawMeters: z.rawMeters, meters: z.meters };
}

app.addEventListener('click', async (e) => {
  const pick = e.target.closest('[data-spot]');
  if (pick) { state.pendingSpot = pick.dataset.spot; return history.back(); } // popstate does the switch
  const day = e.target.closest('[data-day]');
  if (day) { state.dayIndex = Number(day.dataset.day); return render(); } // keep scroll position; tabs are sticky
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'back' || action === 'close-sheet') return history.back();
  if (action === 'spots') {
    go('spots');
    app.querySelector('.srow.on')?.focus(); // keyboard users land on the current spot
    return;
  }
  if (action === 'report') return go('report');
  if (action === 'share') {
    const forecast = state.forecasts[state.dayIndex];
    if (!forecast) return;
    const url = `${location.origin}${location.pathname}?spot=${encodeURIComponent(spot().id)}`;
    const r = await shareOrCopy(buildShareText({ spot: spot(), dayLabel: DAY_LABELS[state.dayIndex], forecast, url }));
    if (r === 'copied') toast('已複製，貼到 LINE 就可以了');
    if (r === 'failed') toast('這支手機不能分享，請手動複製網址');
    return;
  }
  const card = e.target.closest('[data-zone]');
  if (card) go('detail', card.dataset.zone);
});

// R6: zone cards are role="button" divs — Enter/Space opens them like a click. Esc closes the spot sheet.
app.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.view === 'spots') return history.back();
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest?.('[data-zone]');
  if (!card || e.target !== card) return;
  e.preventDefault(); // Space would scroll the page
  go('detail', card.dataset.zone);
});

let sending = false;
app.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (sending) return; // a double tap must not send twice
  const values = Object.fromEntries(new FormData(e.target).entries());
  const form = parseReportForm(values, Date.now());
  if (form.error) { document.getElementById('report-error').textContent = form.error; return; }
  sending = true;
  const submit = e.target.querySelector('[type="submit"]');
  submit.disabled = true;
  let ok = false;
  try {
    localStorage.setItem('haidi:nickname', form.nickname);
    // Built once per submit, before the outbox, so the stored item keeps its id across retries (R4).
    const doc = buildReportDoc({ spotId: spot().id, form, snapshot: currentSnapshot(form.zoneId) });
    const result = await outbox.add(doc);
    ok = true;
    toast(result === 'sent' ? '謝謝回報！' : '已存好，有網路會自動送出');
    // Sending can take seconds: if the user already left the form (back, or opened a card), do not pop their page.
    if (state.view === 'report' && history.state?.view === 'report') history.back(); // popstate renders the list
  } catch {
    const err = document.getElementById('report-error');
    if (err) err.textContent = '送出失敗，請再試一次';
  } finally {
    sending = false;
    submit.disabled = false; // harmless if the form is gone
  }
  if (ok) await load();
});

window.addEventListener('online', () => outbox.flush().then((n) => {
  if (!n) return;
  toast(`補送了 ${n} 筆回報`);
  load(); // show the sent reports on the cards
}));

history.replaceState({ view: 'main' }, '', '#');
// Do not wait for the location prompt: show the forecast first, then pick a spot / zone when (if) GPS arrives.
getPosition().then((pos) => {
  if (!pos) return;
  state.pos = pos;
  const target = autoSwitchTarget({ pos, spots: SPOT_LIST, currentId: state.spotId, locked: state.lockedSpot });
  if (target && state.view === 'main') return selectSpot(target, { manual: false });
  state.located = locate(pos, spot());
  refresh();
});
outbox.flush();
render(); // header + 載入中… right away
load();
```

- [ ] **Step 2: Run the whole suite**

Run: `npm test`
Expected: PASS, 138 tests (no test count change in this task).

- [ ] **Step 3: Browser check (dev server)**

Run `npm run dev` and open http://localhost:5173 in the browser pane. The dev page talks to the live helper, which does not know 墾丁 until Task 5 — so on 墾丁 the footer says 「衛星資料暫缺，準度較低」. That is expected.

Check at widths 320, 390 and 1280:
1. Header shows `📍 小琉球 ▾`; tapping it opens the sheet from the bottom; 小琉球 row is ticked; no sideways scroll at 320.
2. Tap the dark backdrop → sheet closes. Open again, press the browser back button → sheet closes, page stays on the site. Open again, press Esc → closes.
3. Pick 墾丁 → 載入中… with the header still visible → 3 cards 西岸 / 南灣 / 東岸.
4. Reload → still 墾丁. Open http://localhost:5173/?spot=xiaoliuqiu → 小琉球; switch to 墾丁 in the sheet; the address bar loses `?spot=`; reload → 墾丁.
5. Share (copy fallback in desktop Chrome) → the copied text ends with `?spot=kenting`.
6. With DevTools "offline", switch to a spot never opened before: the error text shows and the spot button still works to switch back.

Record the result of each item in the report. Do not deploy.

- [ ] **Step 4: Commit**

```bash
git add src/main.js
git commit -m "$(cat <<'EOF'
feat(app): switch dive spots from the header; GPS picks the spot you are at

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Deploy + phone check (controller, needs Michael's OK)

**Files:**
- Modify: `README.md` (one line under 常用指令)

- [ ] **Step 1: README** — under `- 加潛點:在 src/data/spots/ 加一個 JSON,登記到 index.js` change the line to:

```
- 加潛點:在 `src/data/spots/` 加一個 JSON,加進 `index.js` 的 `SPOT_LIST`(順序 = 沒 GPS 時清單的順序)。加完要重新部署**小幫手和網頁**(小幫手要知道新潛點才會抓衛星)
```

Commit: `docs: how to add a spot now that there is a spot list` (with the Co-Authored-By line).

- [ ] **Step 2: Ask Michael for OK to deploy.** Then run, in this order, each from the repo root:

```bash
(cd worker && npx wrangler deploy)
```

```bash
npm run build
```

```bash
npx wrangler deploy
```

If wrangler says `dist\wrangler.json` does not exist: rename `.wrangler/deploy/config.json` to `.wrangler/deploy/config.json.bak-<date>` and run the deploy again. After deploy run `git status --short` — it must be clean (no `vite.config.js` / `package.json` changes).

- [ ] **Step 3: Verify live**

```bash
curl -s "https://haidi-helper.mikekuo0725.workers.dev/v1/base?spot=kenting"
```

Expected: JSON with `"spotId":"kenting"` and zones `west`, `south`, `east`, each `"source":"sat"`.

```bash
curl -s https://haidi-qingbuqing.mikekuo0725.workers.dev/ | grep -o 'assets/index-[^"]*'
```

Expected: the same `index-*.js` name as in `dist/index.html`.

- [ ] **Step 4: Michael's phone checklist** (iPhone Safari, Android Chrome, LINE in-app browser)
1. 小琉球 opens by default; `📍 小琉球 ▾` button is easy to tap.
2. Sheet opens, back button closes it, pick 墾丁 works, closing and reopening the page keeps 墾丁.
3. Share to LINE → the friend's link opens 墾丁.
4. When physically at 小琉球 or 墾丁 (or later), the page switches to that spot by itself and marks 「你在這裡」.

Then run superpowers:finishing-a-development-branch for `feat/spot-picker`.
