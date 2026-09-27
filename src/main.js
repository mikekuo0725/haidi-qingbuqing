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

const state = { dayIndex: 1, view: 'main', zoneId: null, located: { status: 'none' }, forecasts: [], weather: null, helper: null, reports: [], weatherAt: null };

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
      (p) => resolve([p.coords.latitude, p.coords.longitude]), // used only here, never stored or sent
      () => resolve(null),
      { timeout: 8000, maximumAge: 600000 },
    );
  });
}

const safeParseDay = (raw, date) => {
  try { return parseDay(raw, date); } catch { return null; } // malformed data counts as "no data"
};

// R3: only a copy that parses for today replaces the cache, so one bad fetch never overwrites a good cache.
async function loadWeatherRaw(now) {
  try {
    const raw = await fetchWeather(spot);
    if (safeParseDay(raw, taipeiDate(now))) {
      saveWeather(localStorage, spot.id, raw, now);
      return { raw, savedAt: now, stale: null };
    }
  } catch { /* offline or API down: fall back to the cached copy */ }
  const cached = loadWeather(localStorage, spot.id);
  return cached ? { ...cached, stale: (now - cached.savedAt) / 3600000 } : null;
}

function buildForecasts(now) {
  const { weather, helper, reports } = state;
  const today = taipeiDate(now);
  state.forecasts = [0, 1, 2].map((i) => {
    const day = weather ? safeParseDay(weather.raw, taipeiDate(now, i)) : null;
    if (!day) return null;
    return buildForecast({ spot, day, stale: weather.stale, helper, reports, now, isToday: day.date === today });
  });
}

function dateLabel(i) {
  const f = state.forecasts[i];
  return f ? `${DAY_LABELS[i]} ${md(f.date)}` : DAY_LABELS[i];
}

function render() {
  const now = Date.now();
  app.dataset.view = state.view; // CSS widens only the main list on computers
  if (!state.forecasts.some(Boolean)) {
    app.innerHTML = '<div class="pad">抓不到天氣資料，也沒有之前存的預測。請確認網路後重新整理。</div>';
    return;
  }
  const forecast = state.forecasts[state.dayIndex];
  const zone = state.view === 'detail' ? forecast?.zones.find((z) => z.zoneId === state.zoneId) : null;
  if (zone) {
    app.innerHTML = renderDetail({ spot, zone, dateLabel: dateLabel(state.dayIndex), reports: state.reports, now });
  } else if (state.view === 'report') {
    const defaultZoneId = state.located.status === 'near' ? state.located.zoneId : null;
    app.innerHTML = renderReportForm({ spot, defaultZoneId, nickname: localStorage.getItem('haidi:nickname'), now });
  } else {
    app.dataset.view = 'main';
    const lastReportAt = state.reports.length ? Math.max(...state.reports.map((r) => r.diveTime)) : null;
    app.innerHTML = renderMain({
      spot, forecast: forecast ?? null, dayIndex: state.dayIndex, dayLabels: DAY_LABELS, located: state.located,
      freshness: { weatherAt: state.weatherAt, satelliteDate: state.helper?.satelliteDate ?? null, lastReportAt }, now,
    });
  }
}

// Late data (location, reports) re-renders the list and detail, never the report form: that would wipe what the user typed.
function refresh() {
  if (state.view !== 'report' && state.forecasts.length) render();
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

let loadId = 0;
async function load() {
  const id = ++loadId;
  const now = Date.now();
  // Do not wait for the location prompt: show the forecast first, add "你在哪一區" when (if) it arrives.
  getPosition().then((pos) => {
    state.located = locate(pos, spot);
    if (pos) refresh();
  });
  // R11b: reports can take ~10 s offline; render the forecast without them, rebuild when they arrive.
  const reportsP = fetchRecentReports(spot.id).catch(() => null);
  const [weather, helper] = await Promise.all([loadWeatherRaw(now), fetchHelper(HELPER_URL, spot.id)]);
  if (id !== loadId) return; // a newer load() took over
  state.weather = weather;
  state.helper = helper;
  state.weatherAt = weather?.savedAt ?? null;
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
  const day = e.target.closest('[data-day]');
  if (day) { state.dayIndex = Number(day.dataset.day); return render(); } // keep scroll position; tabs are sticky
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'back') return history.back();
  if (action === 'report') return go('report');
  if (action === 'share') {
    const forecast = state.forecasts[state.dayIndex];
    if (!forecast) return;
    const r = await shareOrCopy(buildShareText({ spot, dayLabel: DAY_LABELS[state.dayIndex], forecast, url: location.href.split('#')[0] }));
    if (r === 'copied') toast('已複製，貼到 LINE 就可以了');
    if (r === 'failed') toast('這支手機不能分享，請手動複製網址');
    return;
  }
  const card = e.target.closest('[data-zone]');
  if (card) go('detail', card.dataset.zone);
});

// R6: zone cards are role="button" divs — Enter/Space opens them like a click.
app.addEventListener('keydown', (e) => {
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
    const doc = buildReportDoc({ spotId: spot.id, form, snapshot: currentSnapshot(form.zoneId) });
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
outbox.flush();
load();
