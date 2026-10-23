// Loading and forecasting one spot: shared by the spot page and the Taiwan map,
// so both always show the same numbers for the same spot and day.
import { fetchWeather, parseDay } from './openmeteo.js';
import { fetchHelper } from './helper.js';
import { saveWeather, loadWeather } from './cache.js';
import { buildForecast } from '../core/forecast.js';
import { taipeiDate } from '../core/time.js';
import { applyCoastal } from '../core/cwa.js';
import { applyBuoy } from '../core/buoy.js';

export const safeParseDay = (raw, date) => {
  try { return parseDay(raw, date); } catch { return null; } // malformed data counts as "no data"
};

// R3: only a copy that parses for today replaces the cache, so one bad fetch never overwrites a good cache.
export async function loadWeatherRaw(spot, { fetchFn = fetch, storage = localStorage, now }) {
  try {
    const raw = await fetchWeather(spot, fetchFn);
    if (safeParseDay(raw, taipeiDate(now))) {
      saveWeather(storage, spot.id, raw, now);
      return { raw, savedAt: now, stale: null };
    }
  } catch { /* offline or API down: fall back to the cached copy */ }
  const cached = loadWeather(storage, spot.id);
  return cached ? { ...cached, stale: (now - cached.savedAt) / 3600000 } : null;
}

export function loadSpot(spot, { fetchFn = fetch, storage = localStorage, now, helperUrl, fresh = false }) {
  return Promise.all([
    loadWeatherRaw(spot, { fetchFn, storage, now }),
    fetchHelper(helperUrl, spot.id, fetchFn, { fresh }),
  ]).then(([weather, helper]) => ({ weather, helper }));
}

// Index = day offset (today, tomorrow, the day after); null for a day with no usable weather.
export function buildDayForecasts({ spot, weather, helper, now }) {
  const today = taipeiDate(now);
  return [0, 1, 2].map((i) => {
    // Taiwan spots: 氣象署 waves/currents/wind when the helper has them, and buoy-measured waves for
    // finished past days (前 3 天的浪); otherwise Open-Meteo as before.
    const parsed = weather ? applyCoastal(safeParseDay(weather.raw, taipeiDate(now, i)), helper?.coastal) : null;
    const day = applyBuoy(parsed, helper?.buoy?.readings, today);
    if (!day) return null;
    return buildForecast({ spot, day, stale: weather.stale, helper });
  });
}
