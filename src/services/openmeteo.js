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
