# 海流動態小線 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On every spot's sea map, short lines drift continuously in the direction and speed of the selected hour's current.

**Architecture:** A transparent `<canvas class="cmap-flow">` sits *under* the map SVG inside `.cmap-box`. The SVG sea rect becomes transparent, so the land (opaque) hides lines that drift onto it, and zone tints and names sit on top. Particle math is pure (`src/core/flow.js`, unit-tested); a small loop (`src/ui/flowCanvas.js`) draws it and reads `data-kn` / `data-to` from the canvas each frame; `main.js` starts and stops the loop beside `syncShips()`.

**Tech Stack:** Vanilla JS, Canvas 2D, Vite, Vitest (environment `node`: no DOM in tests, use plain fake objects). **No three.js** (decided with Michael on 2026-10-22 after comparing two prototypes: canvas "A").

**Spec:** No separate spec file. The design agreed in chat on 2026-10-22 is the "Global Constraints" below.

## Global Constraints

- Canvas 2D only; add no dependency.
- **Ignore the phone's "reduce motion" setting: always animate.** Do not read `prefers-reduced-motion`. (Michael's explicit call, 2026-10-22.)
- Lines follow the selected slider hour's `currents[i].kn` (knots) and `toDeg` (compass degrees the water flows TO; 0 = north, 90 = east). A slider move changes them at once.
- One direction for the whole spot (the current data is a ~10 km grid). **No island wrap-around** in this version.
- Faster current → faster lines. Speed in map units per second = `K.flowSpeedPerKn` × knots (map units: the map is `MAP_W` = 300 wide).
- Runs only while the sea map is on screen AND `document.visibilityState === 'visible'`; stops otherwise.
- Lines must never show on land or cover site names or zone dots: canvas is under the SVG.
- The existing arrow strip, slider, ships, labels, and hit areas stay exactly as they are.
- No new Cloudflare cron, no worker change. Do not deploy; commit and `git push` only.

## Review Focus

- `kn` = 0 → lines do not move and fade out (no division by zero, no NaN positions).
- `toDeg` of 0, 90, 180, 270 and 360 → exactly north/east/south/west velocity (sign of `y`: north = negative y).
- Map with no canvas in the page (detail view, report form) → the loop finds nothing and draws nothing, no error.
- Spot switch or re-render replaces the `<canvas>` element → the loop uses the new one and resizes it; no leftover lines from the old spot.
- Browser without Canvas support (`getContext` returns `null`) → no error, map still works.

---

### Task 1: Particle math (pure)

**Files:**
- Modify: `src/core/constants.js` (add to `K`, after the ship block)
- Create: `src/core/flow.js`
- Test: `test/core/flow.test.js`

**Interfaces:**
- Produces:
  - `K.flowSpeedPerKn = 22`, `K.flowDensity = 220` (map units² per line), `K.flowMaxParticles = 600`, `K.flowLifeMin = 3`, `K.flowLifeMax = 6` (seconds), `K.flowFade = 0.045` (alpha removed per frame by the loop).
  - `flowVelocity(kn: number, toDeg: number): [vx: number, vy: number]` — map units per second; x grows east, y grows south.
  - `particleCount(w: number, h: number): number` — `round(w*h / K.flowDensity)`, at least 1, at most `K.flowMaxParticles`.
  - `makeParticles(n: number, w: number, h: number, rand = Math.random): Particle[]` where `Particle = { x, y, age, life, phase }`.
  - `stepParticle(p: Particle, dt: number, v: [number, number], w: number, h: number, t: number, rand = Math.random): void` — mutates `p`: ages it, moves it by `v` plus a tiny wobble (`sin(t*0.6 + p.phase)` × 0.3 map units/s), and respawns it at a random place with a new `age = 0` and new `life` when `age > life` or it left the box by more than 10 units.
  - `particleAlpha(p: Particle): number` — 0..1; fades in over the first 0.5 s and out over the last 0.8 s of its life.

- [ ] **Step 1: Write the failing tests** in `test/core/flow.test.js`:
  - `flowVelocity(1, 0)` ≈ `[0, -22]`; `(1, 90)` ≈ `[22, 0]`; `(1, 180)` ≈ `[0, 22]`; `(1, 270)` ≈ `[-22, 0]`; `(1, 360)` ≈ `(1, 0)`; `(0, 123)` equals `[0, 0]` and has no `NaN` (use `Math.abs` for `-0`).
  - `particleCount(300, 278)` is 379; `particleCount(300, 10)` is 14; `particleCount(3000, 3000)` is 600; `particleCount(0, 0)` is 1.
  - `makeParticles(5, 300, 278, () => 0.5)` has 5 items, each inside `0..300 × 0..278`, `life` between `K.flowLifeMin` and `K.flowLifeMax`.
  - `stepParticle` with `v = [10, 0]`, `dt = 1`, `p.age = 0`, `life = 5`, start `x = 100` → `x` moves by 10 ± 0.3 and `age` is 1.
  - `stepParticle` respawns (age back to 0, position inside the box) when `age` passes `life`, and when `x` is 311.
  - `particleAlpha`: 0 at `age = 0`; 1 mid-life; 0 at `age = life`; never below 0 or above 1 for `age` outside `0..life`.
- [ ] **Step 2: Run** `npx vitest run test/core/flow.test.js` — expected: FAIL (module not found).
- [ ] **Step 3: Implement** `src/core/flow.js` and the `K` constants with the signatures above. Pass `rand` through so tests are deterministic.
- [ ] **Step 4: Run** `npx vitest run test/core/flow.test.js` — expected: PASS.
- [ ] **Step 5: Commit** `git add src/core/constants.js src/core/flow.js test/core/flow.test.js && git commit -m "feat(flow): pure particle math for the current flow lines"`

---

### Task 2: Canvas element in the sea map markup

**Files:**
- Modify: `src/ui/seaMap.js` (`renderSeaMap`, `updateSeaMap`; add `flowCanvas`)
- Modify: `src/styles.css` (lines 25–27 area)
- Test: `test/ui/seaMap.test.js`

**Interfaces:**
- Consumes: `currents[i]` shape `{ hour, kn, toDeg, level }` (already used by `currentStrip`).
- Produces:
  - `flowCanvas(c: { kn: number, toDeg: number }): string` — returns `<canvas class="cmap-flow" aria-hidden="true" data-kn="…" data-to="…"></canvas>` (values as plain numbers, `toDeg` rounded to an integer, `kn` to 2 decimals).
  - `renderSeaMap` puts `flowCanvas(c)` inside `.cmap-box`, **before** the `<svg>`.
  - `updateSeaMap(root, c)` also updates `data-kn` / `data-to` on `.cmap-flow` (if present; no error if absent).
  - CSS: `.cmap-box` gets `background:#0d3a52`; `.cmap-sea { fill:transparent }`; `.cmap-flow { position:absolute; inset:0; width:100%; height:100%; pointer-events:none }`; `.cmap-box svg { position:relative }` so the SVG paints above the canvas and still takes the clicks.

- [ ] **Step 1: Write the failing tests** in `test/ui/seaMap.test.js`:
  - `renderSeaMap(...)` contains `class="cmap-flow"` and the canvas comes before `<svg` in the string.
  - With `hourIndex: 2` the canvas `data-kn` and `data-to` equal that hour's `forecast.currents[2]` values (`toDeg` rounded).
  - `flowCanvas({ kn: 0.8, toDeg: 224.6 })` contains `data-kn="0.8"` and `data-to="225"`.
  - `updateSeaMap` with a fake `root` whose `querySelector` returns stub elements (follow how the existing `updateShips` test fakes `root`) sets the two data attributes via `setAttribute` and does not throw when `.cmap-flow` is missing.
- [ ] **Step 2: Run** `npx vitest run test/ui/seaMap.test.js` — expected: new tests FAIL.
- [ ] **Step 3: Implement** the markup and CSS above. Keep every existing class and `data-mapzone` hook unchanged.
- [ ] **Step 4: Run** `npx vitest run test/ui/seaMap.test.js` — expected: PASS (existing tests too).
- [ ] **Step 5: Commit** `git add src/ui/seaMap.js src/styles.css test/ui/seaMap.test.js && git commit -m "feat(flow): canvas layer under the sea map, direction and speed on the element"`

---

### Task 3: The drawing loop and wiring

**Files:**
- Create: `src/ui/flowCanvas.js`
- Modify: `src/main.js` (import; `render()` at line ~113; `visibilitychange` handler at line ~357)
- Test: `test/ui/flowCanvas.test.js`

**Interfaces:**
- Consumes: Task 1 (`flowVelocity`, `particleCount`, `makeParticles`, `stepParticle`, `particleAlpha`, `K.flowFade`), Task 2 (`.cmap-flow` with `data-kn`, `data-to`), `MAP_W` and `mapHeight` are **not** needed: derive `w = 300`, `h = 300 * canvas.clientHeight / canvas.clientWidth` from the element.
- Produces:
  - `createFlow({ find, raf, cancel, now }): { start(): void, stop(): void, running(): boolean }`
    - `find(): HTMLCanvasElement | null` — returns the current `.cmap-flow`. Default in `main.js`: `() => app.querySelector('.cmap-flow')`.
    - `raf` / `cancel` / `now` default to `requestAnimationFrame`, `cancelAnimationFrame`, `performance.now` (injected in tests).
    - Each frame: take `canvas = find()`; if none or `getContext('2d')` is `null` → draw nothing, keep looping (a later render may bring a canvas). If the canvas element changed since last frame, or its pixel size no longer matches `clientWidth × devicePixelRatio` (cap ratio at 2), resize it and rebuild the particles with `particleCount`. Then fade old pixels (`destination-out`, alpha `K.flowFade`), and for each particle step it, and stroke a line from its old to its new position (`rgba(150,225,255, 0.85 × particleAlpha)`, width 1.8 × ratio, round caps). `dt` = elapsed seconds, capped at 0.05.
    - `start()` is a no-op when already running; `stop()` cancels the pending frame.
  - `main.js`: `syncFlow()` — start when `document.visibilityState === 'visible' && mapShown()`, else stop; call it in `render()` after `syncShips()` and at the top of the `visibilitychange` handler beside `syncShips()`.

- [ ] **Step 1: Write the failing tests** in `test/ui/flowCanvas.test.js` using fake `find`, `raf` (stores the callback; test calls it by hand), `cancel`, `now`, and a fake canvas `{ clientWidth: 300, clientHeight: 278, width: 0, height: 0, dataset: { kn: '1', to: '90' }, getContext: () => ctx }` where `ctx` records calls:
  - `start()` then one manual frame → `running()` is true, the canvas was resized to 300 × 278 (ratio 1), `ctx.stroke` called at least once after two frames.
  - `stop()` → `cancel` called with the pending id, `running()` is false; a second `start()` works.
  - `find` returning `null` → frame runs without throwing and still schedules the next frame.
  - `getContext` returning `null` → no throw.
  - Replacing the fake canvas with a new object between frames → the new one gets resized (width/height set).
  - `dataset.kn = '0'` → after several frames the recorded line segments have zero length (`moveTo` and `lineTo` get the same point).
- [ ] **Step 2: Run** `npx vitest run test/ui/flowCanvas.test.js` — expected: FAIL (module not found).
- [ ] **Step 3: Implement** `src/ui/flowCanvas.js`, then wire `main.js`. Do not read `matchMedia('(prefers-reduced-motion)')`.
- [ ] **Step 4: Run** `npm test` — expected: all tests PASS (previous count was 298; the new ones add to it).
- [ ] **Step 5: Run** `npm run build` — expected: success, and `dist/assets/index-*.js` is within about 5 KB of the previous size (623 KB).
- [ ] **Step 6: Commit** `git add src/ui/flowCanvas.js src/main.js test/ui/flowCanvas.test.js && git commit -m "feat(flow): drifting lines on the sea map, stops when hidden"`

---

### Task 4: Check it in the real page, then push

**Files:** none (verification only; `.claude/launch.json` `haidi-dev` already exists in `G:\我的雲端硬碟\2026 海底清不清`).

- [ ] **Step 1:** Start `haidi-dev` with `preview_start`; open the page at 390 px wide. For 小琉球, 墾丁, 澎湖南方四島 (the widest, flattest map): lines move, none show on land, site names and zone dots stay readable and clickable (click a dot → detail opens).
- [ ] **Step 2:** Drag the slider across all hours: direction and speed change at once; no jump of the page; the arrow strip still updates.
- [ ] **Step 3:** Switch spot from the spot sheet and back: the new map has lines, and no lines from the old one remain. Open a zone detail, go back: lines run again. Read the console: no errors.
- [ ] **Step 4:** Emulate "reduce motion" with `resize_window` `colorScheme` untouched and the browser's reduced-motion setting on if the pane allows it; lines must still move. If the pane cannot emulate it, say so in the report instead of claiming it was checked.
- [ ] **Step 5:** `git push`. Do **not** deploy (Michael: other items first, deploy together when he says so). Add a dated line to the Obsidian note `專案筆記/2026 海底清不清/工作筆記.md` under "上次做到哪": what was added, commit hash, "還沒上線", and the 4 earlier items still waiting to deploy.
