// 中央氣象署 浮標 (O-B0075-001): one reading per hour for the last 48 hours, values as text, "None" = not measured.
// Used by the Worker (to keep 4 days) and by the page (前 3 天的浪 and the 「現在實測」 line).
import { K } from './constants.js';
import { addDays } from './time.js';

const HOUR = 3600000;

function num(v, lo, hi) {
  if (v == null || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) && x >= lo && x <= hi ? x : null;
}

// "2026-09-30T13:00:00+08:00" → "2026-09-30T13:00" (Taiwan time, same key style as the coastal series)
const hourKey = (t) => (typeof t === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t) ? t.slice(0, 16) : null);

export function readingFrom(obs) {
  const e = obs?.WeatherElements ?? {};
  const cur = e.SeaCurrents?.Layer?.[0] ?? {};
  return {
    time: hourKey(obs?.DateTime),
    waveH: num(e.WaveHeight, 0, K.maxValid.waveH),
    waveT: num(e.WavePeriod, 0.1, 30),
    waveDir: num(e.WaveDirection, 0, 360), // where waves come from
    sst: num(e.SeaTemperature, 0, 40),
    currentKn: num(cur.CurrentSpeedInKnots, 0, 10),
    currentToDeg: num(cur.CurrentDirection, 0, 360), // where water flows to
  };
}

const byTime = (a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0);

// The API does not sort rows by time; we do.
export function parseBuoys(json) {
  const out = {};
  for (const loc of json?.Records?.SeaSurfaceObs?.Location ?? []) {
    const id = loc?.Station?.StationID;
    if (!id) continue;
    out[id] = (loc.StationObsTimes?.StationObsTime ?? []).map(readingFrom).filter((r) => r.time).sort(byTime);
  }
  return out;
}

// keepFrom is a date ("2026-09-26"): string compare keeps every hour of that day and later.
export function mergeReadings(old, fresh, keepFrom) {
  const all = new Map();
  for (const r of [...(old ?? []), ...(fresh ?? [])]) if (r?.time >= keepFrom) all.set(r.time, r);
  return [...all.values()].sort(byTime);
}

export const readingMs = (time) => Date.parse(`${time}:00+08:00`);

// The 「現在實測」 line. readings must be sorted by time (the Worker stores them sorted).
export function latestReading(readings, now) {
  if (!readings?.length) return null;
  const last = readings[readings.length - 1];
  const lastMs = readingMs(last.time);
  if (!(now - lastMs <= K.buoyMaxAgeH * HOUR)) return null;
  const recent = readings.filter((r) => lastMs - readingMs(r.time) <= K.buoyMaxAgeH * HOUR).reverse();
  const cur = recent.find((r) => r.currentKn != null && r.currentToDeg != null); // speed and direction from one reading
  const out = {
    time: last.time,
    waveH: recent.find((r) => r.waveH != null)?.waveH ?? null,
    sst: recent.find((r) => r.sst != null)?.sst ?? null,
    currentKn: cur?.currentKn ?? null,
    currentToDeg: cur?.currentToDeg ?? null,
  };
  return out.waveH != null || out.sst != null || cur ? out : null;
}

const fullWave = (r) => r.waveH != null && r.waveT != null && r.waveDir != null;

// 前 3 天的浪: a finished past day with ≥ buoyMinHours full wave hours uses what the buoy measured;
// any other day keeps Open-Meteo's model. today = Taiwan date "YYYY-MM-DD".
export function applyBuoy(day, readings, today) {
  if (!day || !readings?.length) return day;
  let changed = false;
  const pastWaves = day.pastWaves.map((model, i) => {
    const d = addDays(day.date, -(i + 1));
    if (d >= today) return model; // today is not over yet
    const list = readings.filter((r) => r.time?.startsWith(d) && fullWave(r))
      .map((r) => ({ waveH: r.waveH, waveT: r.waveT, waveDir: r.waveDir }));
    if (list.length < K.buoyMinHours) return model;
    changed = true;
    return list;
  });
  return changed ? { ...day, pastWaves } : day;
}
