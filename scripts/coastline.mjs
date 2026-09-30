// Fetch coastlines from OpenStreetMap once and save them as SVG paths for the sea map.
// Usage: node scripts/coastline.mjs [spotId ...]   (no ids = every spot in coastline-spots.json)
// Map data © OpenStreetMap contributors (ODbL).
import { readFileSync, writeFileSync } from 'node:fs';
import { chainWays, closeRing, toPath } from './coastline-lib.js';

const CONFIG = JSON.parse(readFileSync(new URL('./coastline-spots.json', import.meta.url), 'utf8'));
const OUT = new URL('../src/data/spots/maps/', import.meta.url);
const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Overpass answers with an HTML error page when busy, and with 406 without these headers.
async function fetchCoast([[s, w], [n, e]]) {
  const query = `[out:json][timeout:90];way["natural"="coastline"](${s},${w},${n},${e});out geom;`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const url = MIRRORS[attempt % MIRRORS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': 'haidi-qingbuqing-coastline/1.0', Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      });
      const text = await res.text();
      if (res.ok && text.startsWith('{')) return JSON.parse(text).elements;
      console.warn(`${url}: HTTP ${res.status}, not JSON; retrying`);
    } catch (err) {
      console.warn(`${url}: ${err.message}; retrying`);
    }
    await sleep(15000);
  }
  throw new Error('Overpass is busy; try again later');
}

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CONFIG);
for (const id of ids) {
  const cfg = CONFIG[id];
  if (!cfg) throw new Error(`no entry for "${id}" in scripts/coastline-spots.json`);
  const elements = await fetchCoast(cfg.bbox);
  const ways = elements.filter((el) => el.type === 'way' && el.geometry).map((el) => el.geometry.map((p) => [p.lat, p.lon]));
  const land = [];
  for (const chain of chainWays(ways)) {
    const ring = closeRing(chain, cfg.close);
    if (!ring) { console.warn(`${id}: skipped an open coastline (${chain.length} points); add "close" points`); continue; }
    const d = toPath(cfg.bbox, ring);
    if (d) land.push(d);
  }
  const out = { bbox: cfg.bbox, land, ...(cfg.note ? { note: cfg.note } : {}) };
  writeFileSync(new URL(`${id}.json`, OUT), `${JSON.stringify(out, null, 2)}\n`);
  console.log(`${id}: ${land.length} land shape(s), ${land.join('').length} characters`);
  await sleep(5000); // be polite to the free Overpass servers
}
