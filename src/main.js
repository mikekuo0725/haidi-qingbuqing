import { SPOTS, SPOT_LIST, DEFAULT_SPOT_ID } from './data/spots/index.js';
import { HELPER_URL } from './config.js';
import { loadSpot, buildDayForecasts } from './services/spotData.js';
import { loadOverview } from './services/overview.js';
import { summarizeSpot } from './core/overview.js';
import { spotPins, sitePins } from './core/mapPins.js';
import { renderMapHome, renderMapSpot, renderSiteCard } from './ui/mapPanel.js';
import { createTaiwanMap } from './ui/taiwanMap.js';
import EXTRA_SITES from './data/spots/extraSites.json';
import PROTECTION from './data/spots/protection.json';
import { fetchShips } from './services/ships.js';
import { K } from './core/constants.js';
import { locate } from './core/locate.js';
import { spotsByDistance, nearbySpotId, initialSpotId } from './core/spotChoice.js';
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
const urlSpotKnown = SPOT_LIST.some((s) => s.id === urlSpotId);
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
  // Taiwan map (the start view): every spot's forecasts and summaries, the spot open in the panel,
  // the dive site whose card is open, and the site picked from a card (outlined in the spot panel).
  overview: null, overviewAt: null, mapSpotId: urlSpotKnown ? urlSpotId : null, mapSite: null, mapPicked: null,
  loadedSpotId: null, // the spot whose weather + helper the spot page holds
  dayIndex: openingDayIndex(Date.now()), view: 'map', zoneId: null, located: { status: 'none' }, forecasts: [], weather: null, helper: null, weatherAt: null,
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
  if (state.view === 'map') return renderMapView();
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
    staleHours: state.weather ? state.weather.stale : forecast?.stale ?? null,
    emptyText,
    map: MAPS[s.id] ?? null, siteLayer: SITE_LAYERS[s.id] ?? null, mapHour: state.mapHour, ships: state.ships, lines: state.lines,
    hint: installHint(navigator.userAgent, matchMedia('(display-mode: standalone)').matches || navigator.standalone === true),
  });
  if (state.view === 'spots') {
    html += renderSpotSheet({ rows: spotsByDistance(state.pos, SPOT_LIST), currentId: s.id, nearId: nearbySpotId(state.pos, SPOT_LIST) });
  }
  app.innerHTML = html;
}

// The Taiwan map's Leaflet element is made once and moved back in on every render, so the map keeps its place.
const mapEl = document.createElement('div');
mapEl.className = 'tmap';
let taiwan = null;

function mapPanelHtml() {
  const day = state.dayIndex;
  const ov = state.overview;
  if (state.mapSite) {
    const s = SPOTS[state.mapSite.spotId] ?? null;
    return renderSiteCard({ site: state.mapSite, spot: s, forecast: s ? ov?.forecasts[s.id]?.[day] ?? null : null, dayIndex: day, dayLabels: DAY_LABELS });
  }
  if (state.mapSpotId) {
    const s = SPOTS[state.mapSpotId];
    if (!ov) return `${renderMapSpot({ spot: s, summary: null, forecast: null, dayIndex: day, dayLabels: DAY_LABELS })}`.replace('沒有資料', '載入中…');
    return renderMapSpot({ spot: s, summary: ov.summaries[s.id]?.[day] ?? null, forecast: ov.forecasts[s.id]?.[day] ?? null, dayIndex: day, dayLabels: DAY_LABELS, picked: state.mapPicked, located: locate(state.pos, s) });
  }
  const home = renderMapHome({ summaries: ov?.summaries ?? {}, spots: SPOT_LIST, dayIndex: day, dayLabels: DAY_LABELS });
  return ov ? home : home.replace('點地圖上的圓點看各區', '載入中…');
}

function renderMapView() {
  app.dataset.view = 'map';
  app.innerHTML = `<div class="tpanel">${mapPanelHtml()}</div>`;
  app.prepend(mapEl);
  if (!taiwan) {
    taiwan = createTaiwanMap(mapEl, {
      onSpot: (id) => openMapSpot(id),
      onSite: (p) => openMapSite(p),
      panelHeight: () => app.querySelector('.tpanel')?.offsetHeight ?? 0,
    });
    if (state.mapSpotId) taiwan.jumpToSpot(SPOTS[state.mapSpotId]);
  }
  taiwan.show();
  if (state.mapJump && state.mapSpotId) taiwan.jumpToSpot(SPOTS[state.mapSpotId]);
  state.mapJump = false;
  const summaries = state.overview?.summaries ?? {};
  taiwan.setPins(spotPins(SPOT_LIST, summaries, state.dayIndex), sitePins(SITE_LAYERS, EXTRA_SITES, summaries, state.dayIndex));
  taiwan.setMe(state.pos);
}

function openMapSpot(id) {
  Object.assign(state, { mapSpotId: id, mapSite: null, mapPicked: null });
  render();
  taiwan.flyToSpot(SPOTS[id]);
}

// A small dive site: its own card. The map stays where the user tapped it.
function openMapSite(p) {
  const protection = PROTECTION[p.spotId ?? 'other']?.[p.name] ?? null;
  Object.assign(state, { mapSite: { ...p, protection }, mapSpotId: SPOTS[p.spotId] ? p.spotId : null, mapPicked: null });
  render();
}

function mapHome() {
  Object.assign(state, { mapSpotId: null, mapSite: null, mapPicked: null });
  render();
  taiwan.flyHome();
}

// From the map into the spot page, or straight to one zone's detail page: then "back" returns to the map.
function openSpotPage(id, zoneId = null) {
  selectSpot(id, { manual: true });
  if (zoneId) go('detail', zoneId, { fromMap: true });
  else go('main', null, { fromMap: true });
}

// Map and spot page always show the same numbers: whichever loaded last is copied to the other.
function shareWithMap(id, forecasts) {
  if (!state.overview) return;
  state.overview.forecasts[id] = forecasts;
  state.overview.summaries[id] = summarizeSpot(forecasts);
}

let overviewId = 0;
async function loadMap({ fresh = false } = {}) {
  const id = ++overviewId;
  const now = Date.now();
  const ov = await loadOverview(SPOT_LIST, { now, helperUrl: HELPER_URL, fresh });
  if (id !== overviewId) return;
  state.overview = ov;
  state.overviewAt = now;
  if (state.loadedSpotId) {
    if (state.loadedAt > now) shareWithMap(state.loadedSpotId, state.forecasts); // the spot page's own load is newer: keep it
    else {
      // The map's data is newer: the spot page must reload too, or it would mix new forecasts with old weather.
      state.loadedSpotId = null;
      if (state.view !== 'map') load();
    }
  }
  render();
}

// Phone back button: every view change is a history entry, so "back" returns to the list instead of leaving the site.
let mainScrollY = 0;
function go(view, zoneId = null, extra = {}) {
  if (state.view === 'main') mainScrollY = window.scrollY;
  state.view = view;
  state.zoneId = zoneId;
  history.pushState({ view, zoneId, ...extra }, '', view === 'main' ? '#spot' : `#${view}${zoneId ? `/${zoneId}` : ''}`);
  render();
  if (view !== 'spots') window.scrollTo(0, 0); // the sheet floats over the list: keep the list where it was
}

function selectSpot(id, { manual }) {
  if (manual) state.lockedSpot = true;
  if (!SPOT_LIST.some((s) => s.id === id)) return;
  const changed = id !== state.spotId;
  if (changed) {
    state.spotId = id;
    saveSpot(id);
    // A shared ?spot= link must not win over this choice when the page is reloaded.
    if (location.search) history.replaceState(history.state, '', location.pathname + location.hash);
    Object.assign(state, {
      located: locate(state.pos, spot()), forecasts: [], weather: null, helper: null, weatherAt: null, loading: true,
      mapHour: null, ships: null, loadedSpotId: null,
    });
    // Switched on the spot page (spot sheet): back on the map, show this spot's panel.
    if (state.view !== 'map') Object.assign(state, { mapSpotId: id, mapSite: null, mapPicked: null, mapJump: true });
  }
  // The map already has this spot's forecasts: show them at once, the spot's own load adds buoy and helper details.
  if (state.loadedSpotId !== id && state.overview?.forecasts[id]) state.forecasts = state.overview.forecasts[id];
  render();
  if (changed) window.scrollTo(0, 0);
  if (state.loadedSpotId !== id) load();
}

// A history entry from an older version can name a view that is gone (the report form): show the map.
const VIEWS = ['map', 'main', 'detail', 'spots'];
window.addEventListener('popstate', (e) => {
  const view = e.state?.view;
  state.view = VIEWS.includes(view) ? view : 'map';
  state.zoneId = state.view === view ? e.state?.zoneId ?? null : null;
  if (state.view !== view) history.replaceState({ view: 'map' }, '', '#');
  if (state.pendingSpot) { // a row in the sheet was picked: switch now that we are back on the main entry
    const id = state.pendingSpot;
    state.pendingSpot = null;
    selectSpot(id, { manual: true });
    return;
  }
  // A spot page entry from before a reload: its spot was never loaded in this page.
  if (state.view !== 'map' && state.loadedSpotId !== state.spotId) {
    if (state.overview?.forecasts[state.spotId]) state.forecasts = state.overview.forecasts[state.spotId];
    load();
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
  state.loadedSpotId = s.id;
  buildForecasts(now);
  shareWithMap(s.id, state.forecasts);
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
  if (state.view === 'map' && mapClick(e)) return;
  if (e.target.closest('[data-action="map"]')) {
    if (state.view === 'spots') return;
    return history.state?.fromMap ? history.back() : go('map');
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

// Clicks in the Taiwan map's panel. Returns true when handled.
function mapClick(e) {
  const t = (sel) => e.target.closest(sel);
  const action = t('[data-action]')?.dataset.action;
  if (t('[data-mapspot]')) { openMapSpot(t('[data-mapspot]').dataset.mapspot); return true; }
  if (action === 'map-home') { mapHome(); return true; }
  if (action === 'map-spot') {
    const site = state.mapSite;
    Object.assign(state, { mapSite: null, mapSpotId: site.spotId, mapPicked: site });
    render();
    return true;
  }
  if (action === 'open-spot') { openSpotPage(state.mapSpotId); return true; }
  const row = t('.tli[data-zone]');
  if (row && state.mapSpotId) { openSpotPage(state.mapSpotId, row.dataset.zone); return true; }
  return false;
}

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
  const card = e.target.closest?.('[data-zone], [data-mapspot]');
  if (!card || e.target !== card) return;
  e.preventDefault(); // Space would scroll the page
  if (state.view === 'map') return card.click();
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
const canRefreshNow = () => state.view === 'main' || state.view === 'detail' || state.view === 'map';

// Back from the phone's app switcher: reload if the data is old enough.
document.addEventListener('visibilitychange', () => {
  syncShips();
  syncFlow();
  if (document.visibilityState !== 'visible' || !canRefreshNow()) return;
  if (state.view === 'map') {
    if (shouldAutoRefresh(state.overviewAt, Date.now())) loadMap({ fresh: true });
  } else if (shouldAutoRefresh(state.loadedAt, Date.now())) load({ fresh: true });
});

// Pull down from the top of the page (iPhone home-screen apps have no built-in pull to refresh).
let pullStartY = null;
document.addEventListener('touchstart', (e) => {
  const onSlider = e.target.closest?.('input[type="range"]'); // dragging the sea map slider is not a pull
  const onMap = state.view === 'map'; // dragging the Taiwan map or scrolling its panel is not a pull either
  pullStartY = window.scrollY <= 0 && canRefreshNow() && !onSlider && !onMap ? e.touches[0].clientY : null;
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

history.replaceState({ view: 'map' }, '', '#');
// 潛伴回報 was removed: drop a report still waiting to be sent, and the saved nickname, quietly.
try {
  localStorage.removeItem('haidi:outbox');
  localStorage.removeItem('haidi:nickname');
} catch {}
// Do not wait for the location prompt: show the forecast first, then pick a spot / zone when (if) GPS arrives.
getPosition().then((pos) => {
  if (!pos) return;
  state.pos = pos;
  state.located = locate(pos, spot());
  // Near a spot and still on the map's home view (not opened from a shared link): open that spot's panel.
  const near = nearbySpotId(pos, SPOT_LIST);
  if (near && state.view === 'map' && !state.mapSpotId && !state.mapSite && !state.lockedSpot) return openMapSpot(near);
  render();
});
render(); // the map + 載入中… right away
loadMap();

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
