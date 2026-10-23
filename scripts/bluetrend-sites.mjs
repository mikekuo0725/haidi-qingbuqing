// Builds src/data/spots/extraSites.json from the BlueTrend dive sites (BlueTrend 藍色脈動 said yes, 2026-10-22).
// Used on the Taiwan map only; the spot pages' small sea maps keep our own sites/*.json.
// Run: node scripts/bluetrend-sites.mjs "G:\我的雲端硬碟\2026 海底清不清\潛點參考資料\bluetrend_台灣潛點.json"
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { zoneAt } from '../src/core/mapRegions.js';
import { distanceKm } from '../src/core/math.js';

const SKIP = ['玉女岩']; // BlueTrend gives it the same coordinates as 軍艦岩
const NEAR_KM = 0.5;

const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const ids = readdirSync(new URL('../src/data/spots/sites/', import.meta.url)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
const layers = Object.fromEntries(ids.map((id) => [id, readJson(`../src/data/spots/sites/${id}.json`)]));
const boxes = Object.fromEntries(ids.map((id) => [id, readJson(`../src/data/spots/maps/${id}.json`).bbox]));
const inBox = ([[a, b], [c, d]], [lat, lon]) => lat >= a && lat <= c && lon >= b && lon <= d;

const bt = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const sites = { other: [] };
const details = {};
for (const s of bt) {
  if (SKIP.some((n) => s.name.startsWith(n))) continue;
  const location = [s.lat, s.lon];
  const facts = { level: s.level, maxDepthM: s.maxDepthM, entry: s.entry, url: s.url };
  // One of our own sites close by (or with the same name): it borrows BlueTrend's facts instead.
  let ours = null;
  for (const [id, layer] of Object.entries(layers)) for (const o of layer.sites) {
    const km = distanceKm(location, o.location);
    if ((km <= NEAR_KM || o.name === s.name) && (!ours || km < ours.km)) ours = { id, name: o.name, km };
  }
  if (ours) {
    details[ours.id] ??= {};
    details[ours.id][ours.name] ??= facts; // the closest BlueTrend site wins; first one for ties
    continue;
  }
  const id = ids.find((x) => inBox(boxes[x], location));
  const zoneId = id ? zoneAt(boxes[id], layers[id], location) : null;
  const key = zoneId ? id : 'other';
  (sites[key] ??= []).push({ name: s.name, location, zoneId: key === 'other' ? null : zoneId, ...facts });
}
writeFileSync(new URL('../src/data/spots/extraSites.json', import.meta.url), `${JSON.stringify({ sites, details }, null, 1)}\n`);
for (const [k, v] of Object.entries(sites)) console.log(`${k}: ${v.length}`);
console.log(`details: ${Object.values(details).reduce((n, d) => n + Object.keys(d).length, 0)}`);
