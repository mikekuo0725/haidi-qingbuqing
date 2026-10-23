import { SPOTS, SPOT_LIST, DEFAULT_SPOT_ID } from './data/spots/index.js';
import { HELPER_URL } from './config.js';
import { loadSpot, buildDayForecasts } from './services/spotData.js';
import { fetchShips } from './services/ships.js';
import { K } from './core/constants.js';
import { locate } from './core/locate.js';
import { spotsByDistance, nearbySpotId, initialSpotId, autoSwitchTarget } from './core/spotChoice.js';
import { openingDayIndex } from './core/time.js';
import { shouldAutoRefresh, isPullRefresh } from './core/refresh.js';
import { renderMain } from './ui/mainView.js';
import { MAPS } from './data/spots/maps/index.js';
import { SITE_LAYERS } from './data/spots/sites/index.js';
import { updateSeaMap, updateShips, setLines } from './ui/seaMap.js';
import { normLines } from './core/flow.js';
import { createFlow } from './ui/flowCanvas.js';
import { renderSpotSheet } from './ui/spotSheet.js';
import { installHint } from './ui/installHint.js';
import { renderDetail } from './ui/detailView.js';
import { buildShareText, shareOrCopy } from './ui/share.js';
import { md } from './ui/format.js';
import { registerSW } from 'virtual:pwa-register';
import { renderUpdateBar } from './ui/updateBar.js';

const SPOT_KEY = 'haidi:spot';
const LINES_KEY = 'haidi:lines';
const app = document.getElementById('app');
const DAY_LABELS = ['今天', '明天', '後天'];

function readSavedSpot() {
  try { return localStorage.getItem(SPOT_KEY); } catch { return null; }
}
function saveSpot(id) {
  try { localStorage.setItem(SPOT_KEY, id); } catch { /* storage full or blocked */ }
}
function readSavedLines() {
  try { return normLines(localStorage.getItem(LINES_KEY)); } catch { return 'both'; }
}
function saveLines(mode) {
  try { localStorage.setItem(LINES_KEY, mode); } catch { /* storage full or blocked */ }
}

const urlSpotId = new URLSearchParams(location.search).get('spot');
const firstSpotId = initialSpotId({ urlId: urlSpotId, savedId: readSavedSpot(), spots: SPOT_LIST, defaultId: DEFAULT_SPOT_ID });

const state = {
  spotId: firstSpotId,
  lockedSpot: firstSpotId === urlSpotId, // opened from a shared link: GPS must not switch away
  pendingSpot: null,
  pos: null, // GPS: memory only, never stored or sent
  mapHour: null, // sea map slider; null = the best dive hour
  ships: null, // 航港局 AIS positions for this spot: { updatedAt, ships } or null
  lines: readSavedLines(), // which drifting lines the sea map draws: both | cur | wind
  loading: true,
  dayIndex: openingDayIndex(Date.now()), view: 'main', zoneId: null, located: { status: 'none' }, forecasts: [], weather: null, helper: null, weatherAt: null,
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

function buildForecasts(now) {
  state.forecasts = buildDayForecasts({ spot: spot(), weather: state.weather, helper: state.helper, now });
}

function dateLabel(i) {
  const f = state.forecasts[i];
  return f ? `${DAY_LABELS[i]} ${md(f.date)}` : DAY_LABELS[i];
}

function render() {
  renderView();
  syncShips();
  syncFlow();
}

function renderView() {
  const now = Date.now();
  const s = spot();
  const forecast = state.forecasts[state.dayIndex];
  const zone = state.view === 'detail' ? forecast?.zones.find((z) => z.zoneId === state.zoneId) : null;
  app.dataset.view = state.view; // CSS widens only the main list on computers
  if (zone) {
    app.innerHTML = renderDetail({ spot: s, zone, dateLabel: dateLabel(state.dayIndex) });
    return;
  }
  app.dataset.view = 'main';
  const hasData = state.forecasts.some(Boolean);
  let emptyText = '這天沒有資料';
  if (!hasData) emptyText = state.loading ? '載入中…' : '抓不到天氣資料，也沒有之前存的預測。請確認網路後重新整理。';
  let html = renderMain({
    spot: s, forecast: forecast ?? null, dayIndex: state.dayIndex, dayLabels: DAY_LABELS, located: state.located,
    freshness: { weatherAt: state.weatherAt, satelliteDate: state.helper?.satelliteDate ?? null }, now,
    buoy: state.helper?.buoy ?? null,
    // Task 15: from state.weather, not the per-day forecast, so a day with no data at all still says why.
    staleHours: state.weather?.stale ?? null,
    emptyText,
    map: MAPS[s.id] ?? null, siteLayer: SITE_LAYERS[s.id] ?? null, mapHour: state.mapHour, ships: state.ships, lines: state.lines,
    hint: installHint(navigator.userAgent, matchMedia('(display-mode: standalone)').matches || navigator.standalone === true),
  });
  if (state.view === 'spots') {
    html += renderSpotSheet({ rows: spotsByDistance(state.pos, SPOT_LIST), currentId: s.id, nearId: nearbySpotId(state.pos, SPOT_LIST) });
  }
  app.innerHTML = html;
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
      located: locate(state.pos, spot()), forecasts: [], weather: null, helper: null, weatherAt: null, loading: true,
      mapHour: null, ships: null,
    });
  }
  render();
  if (changed) {
    window.scrollTo(0, 0);
    load();
  }
}

// A history entry from an older version can name a view that is gone (the report form): show the list.
const VIEWS = ['main', 'detail', 'spots'];
window.addEventListener('popstate', (e) => {
  const view = e.state?.view;
  state.view = VIEWS.includes(view) ? view : 'main';
  state.zoneId = state.view === view ? e.state?.zoneId ?? null : null;
  if (state.view !== view) history.replaceState({ view: 'main' }, '', '#');
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
async function load({ fresh = false } = {}) {
  const id = ++loadId;
  const now = Date.now();
  const s = spot();
  state.loading = true;
  const { weather, helper } = await loadSpot(s, { now, helperUrl: HELPER_URL, fresh });
  if (id !== loadId) return; // a newer load() took over (e.g. the user switched spots)
  state.loadedAt = now;
  state.weather = weather;
  state.helper = helper;
  state.weatherAt = weather?.savedAt ?? null;
  state.loading = false;
  buildForecasts(now);
  if (!state.forecasts[state.dayIndex]) state.dayIndex = state.forecasts.findIndex(Boolean);
  if (state.dayIndex < 0) state.dayIndex = 0;
  render();
}

app.addEventListener('click', async (e) => {
  const linesBtn = e.target.closest('.cmap-lines [data-lines]');
  if (linesBtn) {
    state.lines = normLines(linesBtn.dataset.lines);
    saveLines(state.lines);
    return setLines(app, state.lines); // only the lines change: no page redraw
  }
  const pick = e.target.closest('[data-spot]');
  if (pick) { state.pendingSpot = pick.dataset.spot; return history.back(); } // popstate does the switch
  const day = e.target.closest('[data-day]');
  if (day) { state.dayIndex = Number(day.dataset.day); state.mapHour = null; return render(); } // keep scroll position; tabs are sticky
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'back' || action === 'close-sheet') return history.back();
  if (action === 'spots') {
    if (state.view === 'spots') return;
    go('spots');
    app.querySelector('.srow.on')?.focus(); // keyboard users land on the current spot
    return;
  }
  if (action === 'share') {
    const forecast = state.forecasts[state.dayIndex];
    if (!forecast) return;
    const url = `${location.origin}${location.pathname}?spot=${encodeURIComponent(spot().id)}`;
    const r = await shareOrCopy(buildShareText({ spot: spot(), dayLabel: DAY_LABELS[state.dayIndex], forecast, url }));
    if (r === 'copied') toast('已複製，貼到 LINE 就可以了');
    if (r === 'failed') toast('這支手機不能分享，請手動複製網址');
    return;
  }
  const dot = e.target.closest('[data-mapzone]');
  if (dot) return go('detail', dot.dataset.mapzone);
  const card = e.target.closest('[data-zone]');
  if (card) go('detail', card.dataset.zone);
});

// Sea map slider: move the arrow in place (a full render would drop the finger's drag).
app.addEventListener('input', (e) => {
  if (!e.target.matches('.cmap input[type="range"]')) return;
  const c = state.forecasts[state.dayIndex]?.currents[Number(e.target.value)];
  if (!c) return;
  state.mapHour = Number(e.target.value);
  updateSeaMap(app, c);
});

// R6: zone cards are role="button" divs — Enter/Space opens them like a click.
app.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest?.('[data-zone]');
  if (!card || e.target !== card) return;
  e.preventDefault(); // Space would scroll the page
  go('detail', card.dataset.zone);
});

// Esc closes the spot sheet from anywhere on the page (focus can be on body after a click or a re-render).
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.view === 'spots') history.back();
});

// Live ships on the sea map: asked while the map is on screen and the page is visible, every few minutes.
// A failure just leaves the old (or no) ships; nothing is shown to the user.
let shipTimer = null;
let shipLoadId = 0;
const mapShown = () => state.view === 'main' && !!MAPS[state.spotId] && !!state.forecasts[state.dayIndex];

async function loadShips() {
  const id = ++shipLoadId;
  const spotId = state.spotId;
  const data = await fetchShips(HELPER_URL, spotId);
  if (id !== shipLoadId || spotId !== state.spotId) return; // a newer answer or another spot took over
  if (!data) return;
  state.ships = data;
  if (mapShown()) updateShips(app, MAPS[spotId].bbox, data, Date.now());
}

// Drifting lines on the sea map: run while the map is on screen and the page is visible. The phone's
// "reduce motion" setting is deliberately ignored (Michael's call).
const flow = createFlow({ find: () => app.querySelector('.cmap-flow') });
function syncFlow() {
  if (document.visibilityState === 'visible' && mapShown()) flow.start();
  else flow.stop();
}

function syncShips() {
  const want = K.shipsOn && document.visibilityState === 'visible' && mapShown();
  if (want && shipTimer == null) {
    loadShips();
    shipTimer = setInterval(loadShips, K.shipRefreshMinutes * 60000);
  } else if (!want && shipTimer != null) {
    clearInterval(shipTimer);
    shipTimer = null;
    shipLoadId++; // an answer still on its way is dropped
  }
}

// Refresh without closing the app. Not under the spot sheet.
const canRefreshNow = () => state.view === 'main' || state.view === 'detail';

// Back from the phone's app switcher: reload if the data is old enough.
document.addEventListener('visibilitychange', () => {
  syncShips();
  syncFlow();
  if (document.visibilityState !== 'visible' || !canRefreshNow()) return;
  if (shouldAutoRefresh(state.loadedAt, Date.now())) load({ fresh: true });
});

// Pull down from the top of the page (iPhone home-screen apps have no built-in pull to refresh).
let pullStartY = null;
document.addEventListener('touchstart', (e) => {
  const onSlider = e.target.closest?.('input[type="range"]'); // dragging the sea map slider is not a pull
  pullStartY = window.scrollY <= 0 && canRefreshNow() && !onSlider ? e.touches[0].clientY : null;
}, { passive: true });
document.addEventListener('touchend', async (e) => {
  if (pullStartY == null) return;
  const startY = pullStartY;
  pullStartY = null;
  if (!isPullRefresh({ startY, endY: e.changedTouches[0].clientY, scrollY: window.scrollY })) return;
  toast('更新中…');
  await load({ fresh: true });
  toast('已更新');
});

history.replaceState({ view: 'main' }, '', '#');
// 潛伴回報 was removed: drop a report still waiting to be sent, and the saved nickname, quietly.
try {
  localStorage.removeItem('haidi:outbox');
  localStorage.removeItem('haidi:nickname');
} catch {}
// Do not wait for the location prompt: show the forecast first, then pick a spot / zone when (if) GPS arrives.
getPosition().then((pos) => {
  if (!pos) return;
  state.pos = pos;
  const target = autoSwitchTarget({ pos, spots: SPOT_LIST, currentId: state.spotId, locked: state.lockedSpot });
  if (target && state.view === 'main') return selectSpot(target, { manual: false });
  state.located = locate(pos, spot());
  render();
});
render(); // header + 載入中… right away
load();

// A new version downloads in the background; show a bar and swap only when the user presses it.
const updateSW = registerSW({
  onNeedRefresh() {
    const bar = document.createElement('div');
    bar.className = 'update-bar';
    bar.innerHTML = renderUpdateBar();
    bar.querySelector('[data-update]').addEventListener('click', () => updateSW(true));
    document.body.append(bar);
    document.body.classList.add('has-update');
  },
});
