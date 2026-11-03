import { test, expect, afterEach, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { typhoonUrl, loadTyphoons, TY_MEM } from '../../worker/src/typhoon.js';
import worker from '../../worker/src/index.js';

const fixtureText = readFileSync(new URL('../fixtures/cwa-typhoon.json', import.meta.url), 'utf8');
const NOW = Date.parse('2026-11-03T12:00:00+08:00');

beforeEach(() => { for (const k of Object.keys(TY_MEM)) delete TY_MEM[k]; });
const origCaches = globalThis.caches;
const origFetch = globalThis.fetch;
afterEach(() => { globalThis.caches = origCaches; globalThis.fetch = origFetch; });

function fakeCache() {
  const store = new Map();
  const puts = [];
  return {
    puts,
    match: async (k) => store.get(k)?.clone(),
    put: async (k, res) => { puts.push([k, res]); store.set(k, res.clone()); },
  };
}
const okFetch = (calls = []) => async (url) => { calls.push(url); return new Response(fixtureText); };

test('typhoonUrl puts the key encoded in the query', () => {
  expect(typhoonUrl('A&B')).toBe('https://opendata.cwa.gov.tw/api/v1/rest/datastore/W-C0034-005?Authorization=A%26B&format=JSON');
});

test('loadTyphoons returns parsed typhoons and caches them: a second call within the window does not fetch', async () => {
  const cache = fakeCache();
  const calls = [];
  const a = await loadTyphoons(cache, 'KEY', okFetch(calls), NOW);
  const b = await loadTyphoons(cache, 'KEY', okFetch(calls), NOW + 5000, {});
  expect(calls).toHaveLength(1);
  expect(calls[0]).toBe(typhoonUrl('KEY'));
  expect(a.typhoons.map((t) => t.name)).toEqual(['煙花', 'SEPAT']);
  expect(a.updatedAt).toBe(NOW);
  expect(a.error).toBeUndefined();
  expect(b).toEqual(a);
  expect(cache.puts[0][1].headers.get('Cache-Control')).toBe('max-age=600');
});

test('a failed fetch (throws / not ok / not JSON) gives an empty list and is cached only briefly', async () => {
  for (const f of [async () => { throw new Error('down'); }, async () => new Response('x', { status: 500 }), async () => new Response('<html>')]) {
    const cache = fakeCache();
    const d = await loadTyphoons(cache, 'KEY', f, NOW, {});
    expect(d).toMatchObject({ typhoons: [], error: 'unavailable' });
    expect(cache.puts[0][1].headers.get('Cache-Control')).toBe('max-age=60');
  }
});

test('no CWA_KEY gives an empty list and never fetches', async () => {
  const cache = fakeCache();
  const calls = [];
  const d = await loadTyphoons(cache, undefined, okFetch(calls), NOW, {});
  expect(d.typhoons).toEqual([]);
  expect(calls).toHaveLength(0);
});

test('GET /v1/typhoon answers 200 with CORS and an empty list when upstream fails', async () => {
  globalThis.caches = { default: fakeCache() };
  globalThis.fetch = async () => { throw new Error('down'); };
  const res = await worker.fetch(new Request('https://x/v1/typhoon'), { CWA_KEY: 'KEY' });
  expect(res.status).toBe(200);
  expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  expect(res.headers.get('Cache-Control')).toBe('public, max-age=60'); // a failed answer must not sit in browsers for long
  expect(await res.json()).toMatchObject({ typhoons: [], error: 'unavailable' });
});
