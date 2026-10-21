import { parseShips } from '../../src/core/ships.js';
import { K } from '../../src/core/constants.js';
import { MAPS } from '../../src/data/spots/maps/index.js';

export const AIS_URL = 'https://mpbais.motcmpb.gov.tw/aismpb/tools/geojsonais.ashx';
export const AIS_REFERER = 'https://mpbais.motcmpb.gov.tw/aismpb/'; // without it the site answers an empty list

// One download of the whole of Taiwan (~4,000 ships, ~1.5 MB); no area filter exists upstream.
// Parsed once and cut down to real ships inside the given boxes. An empty answer is the caller's problem:
// the site sometimes returns 0 features when it is in trouble.
export async function fetchAis(boxes, fetchFn = fetch) {
  const res = await fetchFn(AIS_URL, { headers: { Referer: AIS_REFERER } });
  if (!res.ok) throw new Error(`AIS ${res.status}`);
  return parseShips(JSON.parse(await res.text()), boxes);
}

// 航港局 AIS ships: ONE answer for all spots, in the Workers Cache API (not KV: its free tier allows only 1,000 writes a day).
// The key is a fixed made-up URL. The upstream file is ~1.5 MB for the whole of Taiwan, so it is parsed once,
// cut down to real ships inside the union of every spot's map, and that small list is cached.
// NOTE: parsing 1.5 MB is the risk for the free plan's ~10 ms CPU per request. Check CPU time in the dashboard after deploy.
const SHIPS_KEY = 'https://haidi-helper.internal/ships/v1';
const SHIP_BOXES = Object.values(MAPS).map((m) => m.bbox);

// The Cache API may do nothing on *.workers.dev, so a warm isolate also keeps its last answer in `mem`.
export const SHIP_MEM = {};

export async function loadShips(cache, fetchFn = fetch, now = Date.now(), mem = SHIP_MEM) {
  if (mem.data && now < mem.until) return mem.data;
  const hit = await cache.match(SHIPS_KEY);
  if (hit) return hit.json();
  let data = { updatedAt: now, ships: [], error: 'unavailable' };
  try {
    const ships = await fetchAis(SHIP_BOXES, fetchFn);
    if (ships.length) data = { updatedAt: now, ships }; // 0 ships means the site is in trouble, not an empty sea
  } catch {
    // site down: no ships this round
  }
  const seconds = data.error ? K.shipEmptySeconds : K.shipCacheSeconds;
  await cache.put(SHIPS_KEY, new Response(JSON.stringify(data), { headers: { 'Cache-Control': `max-age=${seconds}` } }));
  Object.assign(mem, { data, until: now + seconds * 1000 });
  return data;
}
