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
import { taipeiDate, openingDayIndex } from './core/time.js';
import { shouldAutoRefresh, isPullRefresh } from './core/refresh.js';
import { renderMain } from './ui/mainView.js';
import { MAPS } from './data/spots/maps/index.js';
import { SITE_LAYERS } from './data/spots/sites/index.js';
import { updateSeaMap } from './ui/seaMap.js';
import { renderSpotSheet } from './ui/spotSheet.js';
import { installHint } from './ui/installHint.js';
import { renderDetail } from './ui/detailView.js';
import { renderReportForm, parseReportForm } from './ui/reportForm.js';
import { buildShareText, shareOrCopy } from './ui/share.js';
import { md } from './ui/format.js';
import { applyCoastal } from './core/cwa.js';
import { applyBuoy } from './core/buoy.js';
import { registerSW } from 'virtual:pwa-register';
import { renderUpdateBar } from './ui/updateBar.js';

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
  mapHour: null, // sea map slider; null = the best dive hour
  loading: true,
  dayIndex: openingDayIndex(Date.now()), view: 'main', zoneId: null, located: { status: 'none' }, forecasts: [], weather: null, helper: null, reports: [], weatherAt: null,
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
    // Taiwan spots: 氣象署 waves/currents/wind when the helper has them, and buoy-measured waves for
    // finished past days (前 3 天的浪); otherwise Open-Meteo as before.
    const parsed = weather ? applyCoastal(safeParseDay(weather.raw, taipeiDate(now, i)), helper?.coastal) : null;
    const day = applyBuoy(parsed, helper?.buoy?.readings, today);
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
    buoy: state.helper?.buoy ?? null,
    // Task 15: from state.weather, not the per-day forecast, so a day with no data at all still says why.
    staleHours: state.weather?.stale ?? null,
    emptyText,
    map: MAPS[s.id] ?? null, siteLayer: SITE_LAYERS[s.id] ?? null, mapHour: state.mapHour,
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
      mapHour: null,
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
async function load({ fresh = false } = {}) {
  const id = ++loadId;
  const now = Date.now();
  const s = spot();
  state.loading = true;
  // R11b: reports can take ~10 s offline; render the forecast without them, rebuild when they arrive.
  const reportsP = fetchRecentReports(s.id).catch(() => null);
  const [weather, helper] = await Promise.all([loadWeatherRaw(s, now), fetchHelper(HELPER_URL, s.id, fetch, { fresh })]);
  if (id !== loadId) return; // a newer load() took over (e.g. the user switched spots)
  state.loadedAt = now;
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
  if (day) { state.dayIndex = Number(day.dataset.day); state.mapHour = null; return render(); } // keep scroll position; tabs are sticky
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'back' || action === 'close-sheet') return history.back();
  if (action === 'spots') {
    if (state.view === 'spots') return;
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

// Refresh without closing the app. Not on the report form (a reload must never touch what the user typed)
// and not under the spot sheet.
const canRefreshNow = () => state.view === 'main' || state.view === 'detail';

// Back from the phone's app switcher: reload if the data is old enough.
document.addEventListener('visibilitychange', () => {
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
