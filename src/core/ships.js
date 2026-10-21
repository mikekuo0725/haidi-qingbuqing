import { K } from './constants.js';

const MIN_MS = 60000;
const TAIPEI_OFFSET = 8 * 3600000;

// A real ship: 9-digit MMSI starting 2–7, and a name that is not a fishing-net / marker buoy.
export function isShip(mmsi, name) {
  if (!/^[2-7]\d{8}$/.test(String(mmsi))) return false;
  const n = String(name ?? '').trim();
  return !/%/.test(n) && !/buoy|netfish/i.test(n) && !/\dV$/.test(n);
}

// "2026/10/21 11:19:08" is Taiwan time (+08:00) → ms, or null.
export function parseRecordTime(text) {
  const m = /^(\d{4})\/(\d\d)\/(\d\d) (\d\d):(\d\d):(\d\d)$/.exec(String(text ?? '').trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  return Date.UTC(y, mo - 1, d, h, mi, s) - TAIPEI_OFFSET;
}

export const inBox = ([[s, w], [n, e]], lat, lon) => lat >= s && lat <= n && lon >= w && lon <= e;

const round5 = (x) => Math.round(x * 1e5) / 1e5;

// The whole-Taiwan GeoJSON → real ships inside any of the boxes, with only the fields the map needs.
// Kept cheap on purpose (Worker CPU): one pass, no intermediate copies.
export function parseShips(geo, boxes) {
  const out = [];
  for (const f of geo?.features ?? []) {
    const c = f?.geometry?.coordinates;
    const p = f?.properties;
    if (!c || !p) continue;
    const [lon, lat] = c;
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;
    if (!boxes.some((b) => inBox(b, lat, lon))) continue;
    if (!isShip(p.MMSI, p.ShipName)) continue;
    const time = parseRecordTime(p.Record_Time);
    if (time == null) continue;
    out.push({ name: String(p.ShipName ?? '').trim(), mmsi: String(p.MMSI), lat: round5(lat), lon: round5(lon), sog: Number(p.SOG) || 0, cog: Number(p.COG) || 0, time });
  }
  return out;
}

export const shipsForBox = (ships, bbox) => ships.filter((s) => inBox(bbox, s.lat, s.lon));

// How to draw one ship: null = too old to draw.
export function shipLook(ship, now) {
  const minutes = Math.max(0, Math.round((now - ship.time) / MIN_MS));
  if (now - ship.time > K.shipHideMinutes * MIN_MS) return null;
  return { moving: ship.sog >= K.shipMovingKn, grey: now - ship.time > K.shipGreyMinutes * MIN_MS, minutes };
}

export function shipTitle(ship, now) {
  const minutes = Math.max(0, Math.round((now - ship.time) / MIN_MS));
  const ago = minutes < 1 ? '剛剛' : `${minutes} 分鐘前`;
  return `${ship.name || ship.mmsi}・${ship.sog.toFixed(1)} 節・${ago}`;
}

// Taiwan time HH:MM
export const clockText = (ms) => new Date(ms + TAIPEI_OFFSET).toISOString().slice(11, 16);
