// 中央氣象署 鄉鎮沿海預報 (F-D0047-095): one point every 3 hours, directions as 8 compass words.
// Used by the Worker (to cut the file down) and by the page (to fill hours 08..16).

const DIRS = { 偏北: 0, 東北: 45, 偏東: 90, 東南: 135, 偏南: 180, 西南: 225, 偏西: 270, 西北: 315 };

export function dirTextToDeg(text) {
  if (typeof text !== 'string') return null;
  return DIRS[text.replace(/風$/, '')] ?? null;
}

export const issuedAt = (text) => /"Sent"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? null;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The file is ~6 MB (121 areas); parsing all of it is too slow for a free Worker.
// Find the area by text and parse only its Location object (LocationName is its first key).
export function extractArea(text, name) {
  const m = new RegExp(`"LocationName"\\s*:\\s*"${escapeRe(name)}"`).exec(text);
  if (!m) return null;
  const start = text.lastIndexOf('{', m.index);
  let depth = 0;
  for (let j = start; j < text.length; j++) {
    const c = text[j];
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(text.slice(start, j + 1));
  }
  return null;
}

const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// [element name in the file, value key, our field, converter]
const FIELDS = [
  ['浪高', 'WaveHeight', 'waveH', num],
  ['浪週期', 'WavePeriod', 'waveT', num],
  ['浪向', 'WaveDirection', 'waveDir', dirTextToDeg],
  ['流速', 'OceanCurrentSpeedKph', 'currentKmh', num],
  ['流向', 'OceanCurrentDirection', 'currentDir', dirTextToDeg],
  ['風速', 'WindSpeedKph', 'windKmh', num],
  ['風向', 'WindDirection', 'windDir', dirTextToDeg],
  ['雲量', 'SkyCover', 'cloud', num],
];

export function areaSeries(location) {
  const byTime = new Map();
  for (const [element, key, field, convert] of FIELDS) {
    const el = location.WeatherElement.find((e) => e.ElementName === element);
    for (const t of el?.Time ?? []) {
      const time = t.DataTime.slice(0, 16); // Taiwan time, same format as Open-Meteo's hourly.time
      if (!byTime.has(time)) byTime.set(time, { time });
      byTime.get(time)[field] = convert(t.ElementValue?.[key]);
    }
  }
  return [...byTime.values()].sort((a, b) => (a.time < b.time ? -1 : 1));
}

const NUMBERS = ['waveH', 'waveT', 'currentKmh', 'windKmh', 'cloud'];
const DIRECTIONS = ['waveDir', 'currentDir', 'windDir'];
const hourOf = (time) => Number(time.slice(11, 13));

// Numbers: straight line between the two points around the hour. Directions: the nearer point
// (8 compass words cannot be averaged sensibly). Any gap → null, so the day keeps Open-Meteo.
export function hourlyFromCwa(series, date) {
  const pts = series.filter((p) => p.time.startsWith(date));
  const hours = [];
  for (let h = 8; h <= 16; h++) {
    let a;
    for (let k = pts.length - 1; k >= 0; k--) if (hourOf(pts[k].time) <= h) { a = pts[k]; break; }
    const b = pts.find((p) => hourOf(p.time) >= h);
    if (!a || !b) return null;
    const ha = hourOf(a.time);
    const hb = hourOf(b.time);
    const f = hb === ha ? 0 : (h - ha) / (hb - ha);
    const near = h - ha <= hb - h ? a : b;
    const out = { hour: h };
    for (const k of NUMBERS) {
      if (a[k] == null || b[k] == null) return null;
      out[k] = a[k] + (b[k] - a[k]) * f;
    }
    for (const k of DIRECTIONS) {
      if (near[k] == null) return null;
      out[k] = near[k];
    }
    hours.push(out);
  }
  return hours;
}

// Water temperature, tide, past waves and rain stay from Open-Meteo (CWA's coastal forecast has none).
export function applyCoastal(day, coastal) {
  if (!day || !coastal?.series?.length) return day;
  try {
    const cwa = hourlyFromCwa(coastal.series, day.date);
    if (!cwa) return day;
    return { ...day, hours: day.hours.map((h, i) => ({ ...h, ...cwa[i] })), coastalAt: coastal.issuedAt };
  } catch {
    return day;
  }
}
