# 拿掉潛伴回報 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the whole 潛伴回報 feature (form, sending, offline outbox, report lists, same-day correction, long-term per-zone correction). Forecasts come only from weather + satellite.

**Architecture:** Pure removal, inside-out. Task 1 strips reports out of the forecast math (`forecast.js`, `score.js`, `calibration.js`). Task 2 strips the screens. Task 3 strips `main.js`, the Firebase client and its services. Task 4 strips the helper (worker). Task 5 locks the Firestore database and fixes the docs. Each task leaves `npm test` green.

**Tech Stack:** Vanilla JS, Vite, Vitest (environment `node`), Cloudflare Worker (helper), Firebase (being removed from the web page).

**Spec:** No separate spec file. Michael's decision on 2026-10-22 (Obsidian `專案筆記/2026 海底清不清/工作筆記.md`, section「拿掉潛伴回報」): **option C — remove the whole report feature.** The constraints below are that decision.

## Global Constraints

- Remove everything about reports from the web page and the helper: form, send, outbox, retry, "今天 N 人回報", "最近回報", "回報修正", "依過去 N 筆回報", the footer "回報 …/還沒有回報", the button "🤿 我下水了，回報能見度".
- **Do not delete the Firebase project or the one existing report** (2026-10-18). Deleting cannot be undone. Only stop using it.
- 把握度 stays, with a new rule (it used to need a recent report for 高): **高 = satellite + fresh weather; 低 = no satellite and old weather; 中 = everything else.** (`rangeFor` is unchanged: only `low` widens the range, so the meters ranges do not move.)
- The predicted meters for every zone must equal today's numbers whenever there were no reports (today: every spot except 小琉球 10/18). Nothing else in the forecast changes.
- The `firebase` package leaves the web page bundle. `firebase-tools` (devDependency) stays: Task 5 needs it to lock the database.
- No new Cloudflare cron. Do not deploy. Commit and `git push` only; Michael says when to go live (helper first, then web page).
- Public repo: no keys in git.

## Review Focus

- **An unsent report waiting in a phone's outbox** (`localStorage['haidi:outbox']`) when the new version loads → it is dropped quietly; no toast, no error; the key and `haidi:nickname` are removed. (Task 3)
- **Back button onto an old `#report` history entry** (the phone kept history from the old version) → shows the main list, not a blank page. (Task 3)
- **The helper's cached KV data still has `bias: 0.9` from before** → the page ignores it; meters equal base × factors. (Task 1)
- **Old helper (not yet redeployed) + new web page, or new helper + old web page** → both still work: the new page ignores `bias`; the old page uses `h?.bias ?? 1`, so a missing field means 1. This is why the helper can go live in either order. (Task 1, Task 4)
- **Detail page waterfall with no correction rows** → the last bar ends exactly at the predicted meters; no "回報修正 ×1.00" row. (Task 2)

---

### Task 1: Forecast math without reports

**Files:**
- Modify: `src/core/forecast.js`, `src/core/score.js:29-54`, `src/core/constants.js:45-60`, `worker/src/index.js:2,8,25-35`, `src/ui/mainView.js:45-52`, `src/ui/detailView.js:18-36,56,71`
- Delete: `src/core/calibration.js`, `test/core/calibration.test.js`
- Test: `test/core/forecast.test.js`, `test/core/score.test.js`, and every other `buildForecast(...)` caller in tests (`test/ui/mainView.test.js`, `test/ui/detailView.test.js`, `test/ui/seaMap.test.js`, `test/ui/share.test.js`)

**Interfaces:**
- Produces: `buildForecast({ spot, day, stale, helper })` — `reports`, `now`, `isToday` are gone. Each zone object no longer has `bias`, `biasN`, `nowcastN`, `todayReports`. It keeps `base`, `factors`, `rawMeters`, `meters` (now `meters === rawMeters`), `low`, `high`, `light`, `confidence`, `reason`, `compare`, `baseSource`, `name`, `zoneId`, `reasonKey`.
- Produces: `scoreZone({ zone, spot, day, base })` — no `bias` parameter, no `bias` in the result; `compare` is `compareToNormal(meters, base)`.

- [ ] **Step 1: Rewrite the tests first**
  - `test/core/forecast.test.js`: delete the tests `bias from helper is applied`, `today with a report: nowcast applied and reason rewritten`, `a report with a future diveTime does not count as recent (Task 10)`, `not today: reports do not change meters`. Drop `reports`, `now`, `isToday` from every `buildForecast` call. Add:
    - `confidence is high with satellite and fresh weather` — zone `south` (helper `source: 'sat'`), `stale: null` → `confidence === 'high'`.
    - `a cached bias in the helper is ignored` — helper zone `east: { kdMedian: 0.2, source: 'sat', bias: 0.9, biasN: 12 }` → `east.meters` equals `east.rawMeters`, and `east` has no `bias`/`biasN` keys.
  - `satellite missing → fallback base, lower confidence` and the test at line 85-89 stay as they are (north has no satellite → `medium` with fresh weather).
  - `test/ui/mainView.test.js`: add `zone card has no report chip` — no `人回報` in the html. `test/ui/detailView.test.js`: rename `shows base, every factor with its multiplier, and bias line` → `shows base and every factor with its multiplier`, drop the `依過去 23 筆回報` expectation, add: no `回報修正`, no `今天的回報`, and the `wf-row end` row shows `zone.meters.toFixed(1)`. Its fixture's helper drops `bias: 0.88, biasN: 23`.
  - `test/core/score.test.js`: `scoreZone multiplies base by all factors and bias` → rename `scoreZone multiplies base by all factors`, call without `bias`, expect `meters === base × product`. Drop `bias: 1` from the other calls.
  - Other test files: drop `reports: [], now: …, isToday: …` from their `buildForecast` calls.

- [ ] **Step 2: Run** `npx vitest run test/core` — Expected: FAIL (high confidence, ignored bias).

- [ ] **Step 3: Implement**
  - `score.js`: remove `bias` as above.
  - `forecast.js`: remove the `nowcast` and `taipeiDate` imports, `DAY_MS`, the three report lines, `nc`. `confidence = sat && weatherOk ? 'high' : !sat && !weatherOk ? 'low' : 'medium'`. `reason` is always `reasonText(...)`. `meters`/`light`/`rangeFor` use `score.meters`.
  - Delete `calibration.js`. `constants.js`: delete `recentReportDays` and the whole `// calibration` block (`nowcast*`, `outlier*`, `bias*`). Change line 1's comment from "Reports will tell us how to change them." to nothing after "Every tuning number lives here."
  - The helper imports `zoneBias` from the deleted file, so in `worker/src/index.js` also delete line 2 (`zoneBias` import), line 8 (`fetchReports` import) and lines 25-35 (the `bias` block: `return { spotId: spot.id, updatedAt: now, satelliteDate, zones }` directly). Drop `K`/`DAY_MS` imports there only if nothing else uses them. The rest of the worker goes in Task 4.
  - The screens read the removed fields, so remove those reads too: `mainView.js` `card()` loses the `reports` chip (lines 45-47 and `${reports}`); `detailView.js` `waterfall()` ends after the sorted factor steps (delete `biased`, `extra`, and "then the report correction" from its comment) and `biasLine` is deleted.

- [ ] **Step 4: Run** `npm test` — Expected: PASS (all files).

- [ ] **Step 5: Commit**

```bash
git add -A src/core src/ui test worker/src/index.js
git commit -m "refactor(forecast): predictions no longer use 潛伴回報"
```

### Task 2: Screens without reports

**Files:**
- Modify: `src/ui/mainView.js:43-78`, `src/ui/detailView.js:18-80`, `src/styles.css:103-113,121`
- Delete: `src/ui/reportForm.js`, `test/ui/reportForm.test.js`
- Test: `test/ui/mainView.test.js`, `test/ui/detailView.test.js`

**Interfaces:**
- Consumes: zone objects from Task 1 (no `bias`, `biasN`, `todayReports`).
- Produces: `renderDetail({ spot, zone, dateLabel })` — no `reports`. `renderMain({ … freshness: { weatherAt, satelliteDate } … })` — no `lastReportAt`.

- [ ] **Step 1: Tests**
  - `mainView.test.js`: add `no report button and no report footer` — the html contains neither `data-action="report"` nor `回報`.
  - `detailView.test.js`: delete `no reports message; reports list escapes html` and `a report with no nickname shows as 匿名`. Add `detail page has no report section` — `renderDetail` html does not contain `回報`. Drop `reports: []` from every `renderDetail` call.

- [ ] **Step 2: Run** `npx vitest run test/ui` — Expected: FAIL.

- [ ] **Step 3: Implement**
  - `mainView.js`: in `renderMain` remove the footer item `freshness.lastReportAt …` and the button `data-action="report"`. Drop `timeAgo` from the import if nothing else uses it.
  - `detailView.js`: delete `reportRow`, `list`, the `最近回報` section, and the `reports` parameter. Drop now-unused imports (`hhmm` if unused).
  - Delete `reportForm.js` and its test.
  - `styles.css`: delete `.rep`. Delete `.q`, `.opts`, `.opt …`, `.inp`, `.err` **only if** `git grep -n 'class="q\b\|"opts\|"opt"\|"inp"\|"err"' src` finds nothing left. Line 121 comment: "Detail page stays phone-width".

- [ ] **Step 4: Run** `npm test` — Expected: PASS (all files).

- [ ] **Step 5: Commit**

```bash
git add -A src/ui src/styles.css test/ui
git commit -m "feat(ui): remove the report button, form and report lists"
```

### Task 3: main.js and the Firebase client

**Files:**
- Modify: `src/main.js`, `src/config.js`, `.env.example`, `package.json`, `package-lock.json` (via npm)
- Delete: `src/services/reports.js`, `src/services/outbox.js`, `test/services/reports.test.js`, `test/services/outbox.test.js`

**Interfaces:**
- Consumes: `buildForecast({ spot, day, stale, helper })`, `renderDetail({ spot, zone, dateLabel })`, `renderMain` without `lastReportAt`.
- Produces: `src/config.js` exports only `HELPER_URL`.

`main.js` has no unit tests (it touches the DOM); this task is checked in the browser.

- [ ] **Step 1: Edit `src/main.js`** — remove:
  - imports of `createOutbox`, `sendReport`, `fetchRecentReports`, `buildReportDoc`, `renderReportForm`, `parseReportForm`; `const outbox = …`
  - `reports: []` in the initial `state` and in `selectSpot`'s `Object.assign`
  - `reports` in `buildForecasts` (call `buildForecast({ spot: s, day, stale: weather.stale, helper })`; drop the `now`/`today` arguments it no longer needs — keep `today` for `applyBuoy`)
  - the `state.view === 'report'` branch in `renderView`, `lastReportAt`, and `reports: state.reports, now` from `renderDetail`
  - in `load()`: `reportsP` and everything after the first `refresh()` that waits for reports; the "R11b" comment
  - `currentSnapshot`, the `'report'` action, the whole `submit` listener with `let sending`, the `online` listener, the `outbox.flush()` at the bottom
  - `refresh()` becomes `render()` everywhere (its only reason was the report form); delete the function and its comment
  - `canRefreshNow` comment: drop "Not on the report form …"
- [ ] **Step 2: Add the two safety lines** (Review Focus 1 and 2):
  - Once at start-up, next to `history.replaceState({ view: 'main' }, '', '#')`: remove `haidi:outbox` and `haidi:nickname` from `localStorage`, inside `try { … } catch {}` (storage can throw in private mode).
  - In the `popstate` handler: `const VIEWS = ['main', 'detail', 'spots']`; a `state.view` not in it becomes `'main'` (and `zoneId` `null`).
- [ ] **Step 3: Firebase out of the page**
  - `src/config.js`: delete `firebaseConfig`. `.env.example`: delete the 4 `VITE_FIREBASE_*` lines.
  - `npm uninstall firebase` (keeps `firebase-tools`).
  - `git grep -n "firebase" src` — Expected: no match.
- [ ] **Step 4: Run** `npm test` and `npm run build` — Expected: both pass. Then `grep -rl "firestore.googleapis\|initializeApp" dist` — Expected: no file.
- [ ] **Step 5: Check in the browser** (`npm run dev`, helper from production via `.env`): main list shows cards with 把握度, no report button, no "回報" anywhere; open a zone → detail waterfall, no 最近回報; back button returns to the list; switch spot; pull to refresh works. In DevTools set `localStorage['haidi:outbox'] = '[{"id":"x"}]'`, reload → key gone, no toast. Open `/#report` → main list. Console: no errors.

  Note: `requestAnimationFrame` does not run in the built-in browser pane; that only affects the flow lines, not this check.
- [ ] **Step 6: Commit**

```bash
git add -A src test/services .env.example package.json package-lock.json
git commit -m "feat: remove report sending, outbox and the Firebase client"
```

### Task 4: Helper (worker) without reports

**Files:**
- Modify: `worker/src/index.js` (anything Task 1 left), `worker/wrangler.toml:9`
- Delete: `worker/src/firestore.js`, `test/worker/firestore.test.js`
- Test: `test/worker/index.test.js`

**Interfaces:**
- Produces: `buildHelperData(spot, env, fetchFn, now, old)` → `{ spotId, updatedAt, satelliteDate, zones }`; each zone has no `bias`/`biasN`.

- [ ] **Step 1: Test** — in `test/worker/index.test.js` add `helper data has no report correction and asks nothing of Firestore`: run `buildHelperData` with a `fetchFn` that records URLs; expect no URL containing `firestore.googleapis.com`, and every zone in the result without `bias`/`biasN` keys. Remove `bias: 1, biasN: 0` from the fixture on line 227.
- [ ] **Step 2: Run** `npx vitest run test/worker` — Expected: PASS if Task 1 already removed the block (then the test pins it); if it fails, finish removing the bias code in `index.js`.
- [ ] **Step 3: Implement** — delete `firestore.js` and its test; delete `FIREBASE_PROJECT_ID` from `wrangler.toml` `[vars]` (leave the `[vars]` header if other vars remain, else remove it). `git grep -n "FIREBASE\|firestore" worker` — Expected: no match.
- [ ] **Step 4: Run** `npm test` and `cd worker && npx wrangler deploy --dry-run --config wrangler.toml` — Expected: tests pass; dry run builds and lists `env.CACHE` (KV), and no `FIREBASE_PROJECT_ID`.
- [ ] **Step 5: Commit**

```bash
git add -A worker test/worker
git commit -m "feat(helper): stop reading reports from Firestore"
```

### Task 5: Lock the database, fix the docs

**Files:**
- Modify: `firestore.rules`, `firestore.indexes.json`, `README.md:26-27,41,46`
- Keep: `firebase.json`, `.firebaserc` (needed to deploy the locked rules)

- [ ] **Step 1: `firestore.rules`** — replace the `reports` block with deny-all, so the old public key in old page copies cannot add new reports:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

  `firestore.indexes.json`: `{ "indexes": [], "fieldOverrides": [] }`.
- [ ] **Step 2: README** — delete the 每週檢查 lines (26 and 46). Line 27 → `**金鑰**:設一次就好,平常不用動`. Line 41 → `Firestore(潛伴回報,已拿掉):資料庫鎖住、不刪;規則上線 npx firebase deploy --only firestore:rules`.
- [ ] **Step 3: Taiwan map plan** — `git grep -n "回報\|report" docs/superpowers/plans/2026-10-22-taiwan-map.md`: any step that still reads or shows reports gets that part deleted (the plan says reports are removed first).
- [ ] **Step 4: Final check** — `npm test`, `npm run build`, `git grep -n -i "report\|回報\|firebase\|outbox" -- src worker test` — Expected: no match except unrelated words (e.g. `buoys report hourly` comment in `worker/src/index.js`). Read each remaining match.
- [ ] **Step 5: Commit and push**

```bash
git add -A firestore.rules firestore.indexes.json README.md docs
git commit -m "chore: lock Firestore, drop report docs"
git push
```

### Going live (only when Michael says)

1. Helper: `cd worker && npx wrangler deploy --config wrangler.toml`, then `curl "https://haidi-helper.mikekuo0725.workers.dev/v1/base?spot=xiaoliuqiu"` — zones have no `bias`.
2. Web page: `npm run build`, then `npx wrangler deploy` (project root). Check the live JS has no `firestore.googleapis`.
3. Firestore rules: `npx firebase deploy --only firestore:rules` (Michael's OK first: it changes a live service). The one report stays stored.
