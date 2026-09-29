import { test, expect } from 'vitest';
import worker from '../../worker/src/index.js';

function fakeKV(initial = {}) {
  const store = new Map(Object.entries(initial));
  return { get: async (k) => store.get(k) ?? null, put: async (k, v) => { store.set(k, v); } };
}

test('serves cached helper data with CORS', async () => {
  const data = { spotId: 'xiaoliuqiu', zones: {} };
  const env = { CACHE: fakeKV({ 'base:xiaoliuqiu': JSON.stringify(data) }) };
  const res = await worker.fetch(new Request('https://x/v1/base?spot=xiaoliuqiu'), env);
  expect(res.status).toBe(200);
  expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  expect(await res.json()).toEqual(data);
});

test('unknown spot → 404', async () => {
  const res = await worker.fetch(new Request('https://x/v1/base?spot=nope'), { CACHE: fakeKV() });
  expect(res.status).toBe(404);
});

test('kenting is a known spot', async () => {
  const data = { spotId: 'kenting', zones: {} };
  const env = { CACHE: fakeKV({ 'base:kenting': JSON.stringify(data) }) };
  const res = await worker.fetch(new Request('https://x/v1/base?spot=kenting'), env);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual(data);
});
