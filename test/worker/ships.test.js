import { test, expect, afterEach, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fetchAis, AIS_URL, AIS_REFERER } from '../../worker/src/ships.js';
import worker from '../../worker/src/index.js';
import { loadShips, SHIP_MEM } from '../../worker/src/ships.js';

beforeEach(() => { for (const k of Object.keys(SHIP_MEM)) delete SHIP_MEM[k]; });
import { MAPS } from '../../src/data/spots/maps/index.js';

const fixtureText = readFileSync(new URL('../fixtures/ais-xiaoliuqiu.json', import.meta.url), 'utf8');
const BOXES = Object.values(MAPS).map((m) => m.bbox);
const NOW = Date.UTC(2026, 9, 21, 3, 30);

function fakeCache() {
  const store = new Map();
  const puts = [];
  return {
    puts,
    match: async (k) => store.get(k)?.clone(),
    put: async (k, res) => { puts.push([k, res]); store.set(k, res.clone()); },
  };
}
const okFetch = (calls = []) => async (url, init) => { calls.push([url, init]); return new Response(fixtureText); };
const origCaches = globalThis.caches;
afterEach(() => { globalThis.caches = origCaches; });

test('fetchAis sends the Referer the site needs and returns only real ships in the boxes', async () => {
  const calls = [];
  const ships = await fetchAis(BOXES, okFetch(calls));
  expect(calls[0][0]).toBe(AIS_URL);
  expect(calls[0][1].headers.Referer).toBe(AIS_REFERER);
  expect(ships).toHaveLength(23);
  expect(ships[0]).toHaveProperty('mmsi');
});

test('fetchAis: a bad status throws, an empty feed is an empty list', async () => {
  await expect(fetchAis(BOXES, async () => new Response('x', { status: 503 }))).rejects.toThrow('AIS 503');
  expect(await fetchAis(BOXES, async () => new Response('{"type":"FeatureCollection","features":[]}'))).toEqual([]);
});

test('loadShips fetches once, caches for 90 s, and serves the next call from the cache', async () => {
  const cache = fakeCache();
  const calls = [];
  const a = await loadShips(cache, okFetch(calls), NOW);
  const b = await loadShips(cache, okFetch(calls), NOW + 5000);
  expect(calls).toHaveLength(1);
  expect(b).toEqual(a);
  expect(a.updatedAt).toBe(NOW);
  expect(a.ships).toHaveLength(23);
  expect(a.error).toBeUndefined();
  expect(cache.puts[0][1].headers.get('Cache-Control')).toBe('max-age=90');
});

test('loadShips: an empty or failed feed is "unavailable" and cached only 30 s', async () => {
  for (const f of [async () => new Response('{"features":[]}'), async () => { throw new Error('down'); }, async () => new Response('x', { status: 500 })]) {
    const cache = fakeCache();
    const d = await loadShips(cache, f, NOW, {});
    expect(d).toMatchObject({ ships: [], error: 'unavailable' });
    expect(cache.puts[0][1].headers.get('Cache-Control')).toBe('max-age=30');
  }
});

const ask = (path) => worker.fetch(new Request(`https://x${path}`), {});

test('GET /v1/ships answers one spot from the shared list, with CORS and a 60 s cache header', async () => {
  const cache = fakeCache();
  await cache.put('https://haidi-helper.internal/ships/v1', new Response(JSON.stringify({
    updatedAt: NOW,
    ships: [
      { name: 'A', mmsi: '416000001', lat: 22.33, lon: 120.37, sog: 1, cog: 10, time: NOW },
      { name: 'B', mmsi: '416000002', lat: 21.9, lon: 120.8, sog: 0, cog: 0, time: NOW },
    ],
  })));
  globalThis.caches = { default: cache };
  const res = await ask('/v1/ships?spot=xiaoliuqiu');
  expect(res.status).toBe(200);
  expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
  const body = await res.json();
  expect(body.updatedAt).toBe(NOW);
  expect(body.ships.map((s) => s.name)).toEqual(['A']);
  const kenting = await (await ask('/v1/ships?spot=kenting')).json();
  expect(kenting.ships.map((s) => s.name)).toEqual(['B']);
});

test('GET /v1/ships: unknown spot → 404; failed feed → 200 with error', async () => {
  globalThis.caches = { default: fakeCache() };
  expect((await ask('/v1/ships?spot=nope')).status).toBe(404);
  expect((await ask('/v1/ships')).status).toBe(404);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('down'); };
  try {
    const res = await ask('/v1/ships?spot=xiaoliuqiu');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ships: [], error: 'unavailable' });
  } finally {
    globalThis.fetch = realFetch;
  }
});
