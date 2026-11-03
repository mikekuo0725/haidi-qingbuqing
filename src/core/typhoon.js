// 氣象署 W-C0034-005 (typhoon warning + track) → the small shape the Taiwan map draws.
// The real field names could not be checked (no typhoon at the time of writing), so everything here is forgiving:
// a bad point is dropped, a bad answer is "no typhoons", nothing throws.
import { K } from './constants.js';
import { distanceKm, bearingText } from './math.js';

export { bearingText as compassText };

const HOUR = 3600000;
const TAIPEI_OFFSET = 8 * HOUR;

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

function toNum(v) {
  if (v == null || (typeof v === 'string' && !v.trim())) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ISO with an offset, or "YYYY-MM-DD HH:mm[:ss]" meaning Taiwan time → ms, or null.
function parseTime(v) {
  if (typeof v !== 'string') return null;
  let s = v.trim();
  if (/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d(:\d\d)?$/.test(s)) s = `${s.replace(' ', 'T')}${s.length === 16 ? ':00' : ''}+08:00`;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

// "lon,lat" → { lat, lon }, or null when it is not two real coordinates.
function parseCoord(v) {
  if (typeof v !== 'string') return null;
  const parts = v.split(',');
  if (parts.length !== 2) return null;
  const lon = toNum(parts[0]);
  const lat = toNum(parts[1]);
  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

const DIRS = { N: '北', NNE: '東北', NE: '東北', ENE: '東北', E: '東', ESE: '東南', SE: '東南', SSE: '東南', S: '南', SSW: '西南', SW: '西南', WSW: '西南', W: '西', WNW: '西北', NW: '西北', NNW: '西北' };
function moveDir(v) {
  if (typeof v !== 'string' || !v.trim()) return null;
  const s = v.trim();
  return DIRS[s.toUpperCase()] ?? (/[\u4e00-\u9fff]/.test(s) ? s : null);
}

const hasCjk = (s) => /[\u4e00-\u9fff]/.test(s);
function names(c) {
  const all = [c.cwaTyphoonName, c.typhoonName].filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim());
  const name = all.find(hasCjk) ?? all[0] ?? null;
  const nameEn = all.find((s) => s !== name && !hasCjk(s)) ?? null;
  return { name, nameEn };
}

function parseOne(c, now) {
  if (!c || typeof c !== 'object') return null;
  const fixes = asArray(c.analysisData?.fix)
    .map((f) => ({ f, time: parseTime(f?.fixTime), at: parseCoord(f?.coordinate) }))
    .filter((x) => x.time != null && x.at)
    .sort((a, b) => a.time - b.time);
  const last = fixes[fixes.length - 1];
  if (!last || now - last.time > K.typhoonStaleHours * HOUR) return null;
  const { name, nameEn } = names(c);
  if (!name) return null;
  const radius = toNum(last.f.circleOf15Ms?.radius);
  const track = asArray(c.forecastData?.fix)
    .map((f) => {
      const init = parseTime(f?.initTime);
      const tau = toNum(f?.tau);
      const time = parseTime(f?.forecastTime) ?? (init != null && tau != null ? init + tau * HOUR : null);
      return { time, at: parseCoord(f?.coordinate), f };
    })
    .filter((x) => x.time != null && x.at && x.time > last.time)
    .sort((a, b) => a.time - b.time)
    .map((x) => ({ lat: x.at.lat, lon: x.at.lon, time: x.time, windMs: toNum(x.f.maxWindSpeed), pressureHpa: toNum(x.f.pressure) }));
  return {
    id: nameEn ?? name,
    name,
    nameEn,
    now: {
      lat: last.at.lat,
      lon: last.at.lon,
      time: last.time,
      windMs: toNum(last.f.maxWindSpeed),
      gustMs: toNum(last.f.maxGustSpeed),
      pressureHpa: toNum(last.f.pressure),
      radius7Km: radius != null && radius > 0 ? radius : null,
      movingKmh: toNum(last.f.movingSpeed),
      movingDir: moveDir(last.f.movingDirection),
    },
    track,
  };
}

export function parseTyphoons(raw, now) {
  let data = raw;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return [];
    }
  }
  return asArray(data?.records?.tropicalCyclones?.tropicalCyclone).map((c) => parseOne(c, now)).filter(Boolean);
}

// A typhoon is drawn only while its newest position is recent: one that has gone from the warnings must not hang on the map.
export const typhoonFresh = (t, now) => now - t.now.time <= K.typhoonStaleHours * HOUR;

// Compass bearing from one [lat, lon] to another: 0 = north, 90 = east.
export function bearingDeg([lat1, lon1], [lat2, lon2]) {
  const r = Math.PI / 180;
  const dLon = (lon2 - lon1) * r;
  const y = Math.sin(dLon) * Math.cos(lat2 * r);
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos(dLon);
  return (((Math.atan2(y, x) / r) % 360) + 360) % 360;
}

// null while the typhoon is inside the map view; otherwise where it is, seen from the middle of the view.
export function typhoonHint(t, { center, bounds: [[s, w], [n, e]] }) {
  const { lat, lon } = t.now;
  if (lat >= s && lat <= n && lon >= w && lon <= e) return null;
  const dirDeg = bearingDeg(center, [lat, lon]);
  return { dirDeg, dirText: bearingText(dirDeg), km: Math.round(distanceKm(center, [lat, lon]) / 10) * 10 };
}

export function typhoonStamp(ms) {
  const d = new Date(ms + TAIPEI_OFFSET);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
const place = (p) => `${p.lat.toFixed(1)}°${p.lat >= 0 ? 'N' : 'S'} ${Math.abs(p.lon).toFixed(1)}°${p.lon >= 0 ? 'E' : 'W'}`;

// The body of the typhoon card, one string per line; a line without its data is left out.
export function typhoonCardLines(t) {
  const { windMs, gustMs, pressureHpa, radius7Km, movingKmh, movingDir } = t.now;
  const lines = [];
  if (windMs != null) lines.push(`最大風速 ${windMs} m/s${gustMs != null ? `（陣風 ${gustMs}）` : ''}`);
  if (pressureHpa != null) lines.push(`中心氣壓 ${pressureHpa} hPa`);
  if (radius7Km != null) lines.push(`七級風半徑 ${radius7Km} 公里`);
  if (movingKmh != null) lines.push(`移動 ${movingDir ? `${movingDir} ` : ''}${movingKmh} 公里/小時`);
  for (const p of (t.track ?? []).slice(0, 2)) lines.push(`預計：${typhoonStamp(p.time)} 到 ${place(p)}`);
  return lines;
}

// Edge arrows of several typhoons can land on top of each other: nudge each one up or down until its label
// (about chipW × chipH px) no longer sits on an earlier one. Same order in, same order out.
export function spreadPoints(points, [, h], inset = 28, chipW = 170, chipH = 28) {
  const placed = [];
  for (const [x, y0] of points) {
    const options = [0, chipH, -chipH, 2 * chipH, -2 * chipH].map((d) => y0 + d).filter((y) => y >= inset && y <= h - inset);
    const y = options.find((c) => !placed.some(([px, py]) => Math.abs(px - x) < chipW && Math.abs(py - c) < chipH)) ?? y0;
    placed.push([x, y]);
  }
  return placed;
}

// Where a ray from `center` [x, y] in direction `dirDeg` (0 = up, 90 = right) meets the view's rectangle
// [w, h] shrunk by `inset` px on every side. Screen coordinates: y grows downward.
export function edgePoint([cx, cy], [w, h], dirDeg, inset = 28) {
  const r = (dirDeg * Math.PI) / 180;
  const dx = Math.sin(r);
  const dy = -Math.cos(r);
  const tx = Math.abs(dx) < 1e-9 ? Infinity : ((dx > 0 ? w - inset : inset) - cx) / dx;
  const ty = Math.abs(dy) < 1e-9 ? Infinity : ((dy > 0 ? h - inset : inset) - cy) / dy;
  const t = Math.min(tx, ty);
  return [cx + dx * t, cy + dy * t];
}
