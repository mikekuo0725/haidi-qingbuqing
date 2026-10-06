import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import worker, { refreshCoastal, refreshBuoys, COASTAL_CRON, BUOY_CRON, DAILY_HOUR_UTC } from '../../worker/src/index.js';
import { cwaLocation, cwaFile, dayTimes } from '../helpers/cwaFixture.js';
import { obs, buoyFile } from '../helpers/buoyFixture.js';

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

const BASE = JSON.stringify({ spotId: 'xiaoliuqiu', zones: {} });
const coastalCopy = (issuedAt) => JSON.stringify({ issuedAt, series: [{ time: '2026-09-30T06:00', waveH: 0.6 }] });
const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString();
const fakeCtx = () => { const jobs = []; return { jobs, waitUntil: (p) => jobs.push(p) }; };
const ask = (env, ctx) => worker.fetch(new Request('https://x/v1/base?spot=xiaoliuqiu'), env, ctx).then((r) => r.json());
const buoyCopy = (readings) => JSON.stringify({ readings });
const NO_BUOY = buoyCopy([]); // a stored-but-empty buoy copy: no background fetch

test('adds fresh 氣象署 coastal data to the answer', async () => {
  const env = { CACHE: fakeKV({ 'base:xiaoliuqiu': BASE, 'cwa:xiaoliuqiu': coastalCopy(hoursAgo(1)) }) };
  const body = await ask(env, fakeCtx());
  expect(body.coastal.series[0].waveH).toBe(0.6);
});

test('coastal data older than 12 hours, or a failed fetch, is left out', async () => {
  for (const raw of [coastalCopy(hoursAgo(13)), JSON.stringify({ issuedAt: null, series: [] })]) {
    const ctx = fakeCtx();
    const body = await ask({ CACHE: fakeKV({ 'base:xiaoliuqiu': BASE, 'cwa:xiaoliuqiu': raw, 'buoy:46714D': NO_BUOY }) }, ctx);
    expect(body.coastal).toBeUndefined();
    expect(ctx.jobs).toHaveLength(0);
  }
});

test('no coastal copy yet → answer now and fill it in the background', async () => {
  const ctx = fakeCtx();
  const body = await ask({ CACHE: fakeKV({ 'base:xiaoliuqiu': BASE, 'buoy:46714D': NO_BUOY }) }, ctx);
  expect(body.coastal).toBeUndefined();
  expect(ctx.jobs).toHaveLength(1);
  await Promise.all(ctx.jobs); // no CWA_KEY in this env: the job ends at once
});

test('refreshCoastal stores every Taiwan spot; a failure marks empty spots and keeps old copies', async () => {
  const file = cwaFile('2026-09-30T06:55:58+08:00', ['琉球鄉_南方沿海', '恆春鎮沿海', '貢寮區沿海'].map((n) => cwaLocation(n, dayTimes('2026-09-30'))));
  const kv = fakeKV();
  await refreshCoastal({ CACHE: kv, CWA_KEY: 'K' }, async () => new Response(file));
  for (const id of ['xiaoliuqiu', 'kenting', 'qixing', 'northeast']) {
    const c = JSON.parse(await kv.get(`cwa:${id}`));
    expect(c.issuedAt).toBe('2026-09-30T06:55:58+08:00');
    expect(c.series).toHaveLength(5);
  }
  const empty = fakeKV();
  await refreshCoastal({ CACHE: empty, CWA_KEY: 'K' }, async () => new Response('x', { status: 500 }));
  expect(JSON.parse(await empty.get('cwa:kenting'))).toEqual({ issuedAt: null, series: [] });
  const old = JSON.stringify({ issuedAt: '2026-09-30T00:55:00+08:00', series: [{ time: '2026-09-30T00:00' }] });
  const kept = fakeKV({ 'cwa:kenting': old });
  await refreshCoastal({ CACHE: kept, CWA_KEY: 'K' }, async () => new Response('x', { status: 500 }));
  expect(await kept.get('cwa:kenting')).toBe(old);
});

test('refreshCoastal without a key does nothing', async () => {
  const kv = fakeKV();
  let called = false;
  await refreshCoastal({ CACHE: kv }, async () => { called = true; return new Response(''); });
  expect(called).toBe(false);
  expect(await kv.get('cwa:kenting')).toBeNull();
});

test('the 6-hourly cron refreshes the coastal forecast only', async () => {
  const kv = fakeKV();
  const ctx = fakeCtx();
  await worker.scheduled({ cron: '30 5,11,17,23 * * *' }, { CACHE: kv }, ctx);
  expect(ctx.jobs).toHaveLength(1);
  await Promise.all(ctx.jobs);
  expect(await kv.get('base:xiaoliuqiu')).toBeNull(); // the daily satellite refresh did not run
});

test('the deployed cron list contains COASTAL_CRON', () => {
  const toml = readFileSync(new URL('../../worker/wrangler.toml', import.meta.url), 'utf8');
  expect(toml).toContain(`"${COASTAL_CRON}"`);
});

test('refreshCoastal writes the empty marker before it downloads', async () => {
  const file = cwaFile('2026-09-30T06:55:58+08:00', ['琉球鄉_南方沿海', '恆春鎮沿海', '貢寮區沿海'].map((n) => cwaLocation(n, dayTimes('2026-09-30'))));
  const kv = fakeKV();
  await refreshCoastal({ CACHE: kv, CWA_KEY: 'K' }, async () => {
    expect(await kv.get('cwa:kenting')).toBe(JSON.stringify({ issuedAt: null, series: [] }));
    return new Response(file);
  });
  expect(JSON.parse(await kv.get('cwa:kenting')).series).toHaveLength(5);
});

test('a corrupt KV copy is ignored by requests and overwritten by refreshCoastal', async () => {
  const env = { CACHE: fakeKV({ 'base:xiaoliuqiu': BASE, 'cwa:xiaoliuqiu': 'not json' }) };
  const res = await worker.fetch(new Request('https://x/v1/base?spot=xiaoliuqiu'), env, fakeCtx());
  expect(res.status).toBe(200);
  expect((await res.json()).coastal).toBeUndefined();
  const file = cwaFile('2026-09-30T06:55:58+08:00', ['琉球鄉_南方沿海', '恆春鎮沿海', '貢寮區沿海'].map((n) => cwaLocation(n, dayTimes('2026-09-30'))));
  await refreshCoastal({ CACHE: env.CACHE, CWA_KEY: 'K' }, async () => new Response(file));
  expect(JSON.parse(await env.CACHE.get('cwa:xiaoliuqiu')).series).toHaveLength(5);
});

test('adds the stored readings of the spot\'s buoy', async () => {
  const readings = [{ time: '2026-09-30T13:00', waveH: 0.2 }];
  const env = { CACHE: fakeKV({ 'base:xiaoliuqiu': BASE, 'cwa:xiaoliuqiu': coastalCopy(hoursAgo(1)), 'buoy:46714D': buoyCopy(readings) }) };
  const ctx = fakeCtx();
  const body = await ask(env, ctx);
  expect(body.buoy).toEqual({ readings });
  expect(ctx.jobs).toHaveLength(0);
});

test('no buoy copy yet → answer now and fetch in the background; an empty or corrupt copy is left out', async () => {
  const ctx = fakeCtx();
  const body = await ask({ CACHE: fakeKV({ 'base:xiaoliuqiu': BASE, 'cwa:xiaoliuqiu': coastalCopy(hoursAgo(1)) }) }, ctx);
  expect(body.buoy).toBeUndefined();
  expect(ctx.jobs).toHaveLength(1);
  await Promise.all(ctx.jobs); // no CWA_KEY in this env: the job ends at once
  for (const raw of [NO_BUOY, 'not json']) {
    const ctx2 = fakeCtx();
    const body2 = await ask({ CACHE: fakeKV({ 'base:xiaoliuqiu': BASE, 'cwa:xiaoliuqiu': coastalCopy(hoursAgo(1)), 'buoy:46714D': raw }) }, ctx2);
    expect(body2.buoy).toBeUndefined();
    expect(ctx2.jobs).toHaveLength(0);
  }
});

test('refreshBuoys asks once for every buoy and keeps 4 days per buoy', async () => {
  const now = Date.UTC(2026, 8, 30, 6, 10); // 14:10 Taiwan
  const file = buoyFile({
    '46714D': [obs({ time: '2026-09-30T13:00', waveH: '0.2' })],
    '46759A': [obs({ time: '2026-09-30T13:00', waveH: '0.4' })],
    '46694A': [obs({ time: '2026-09-30T13:00', waveH: 'None' })],
  });
  const kv = fakeKV({ 'buoy:46714D': buoyCopy([{ time: '2026-09-25T10:00', waveH: 9 }, { time: '2026-09-29T10:00', waveH: 1 }]) });
  const urls = [];
  await refreshBuoys({ CACHE: kv, CWA_KEY: 'K' }, async (u) => { urls.push(u); return new Response(JSON.stringify(file)); }, now);
  expect(urls).toHaveLength(1);
  expect(urls[0]).toContain('StationID=46714D,46759A,46694A,C6S94,46735A&');
  expect(JSON.parse(await kv.get('buoy:46714D')).readings.map((r) => [r.time, r.waveH]))
    .toEqual([['2026-09-29T10:00', 1], ['2026-09-30T13:00', 0.2]]); // 9/25 is older than 4 days
  expect(JSON.parse(await kv.get('buoy:46759A')).readings[0].waveH).toBe(0.4);
  expect(JSON.parse(await kv.get('buoy:46694A')).readings[0].waveH).toBeNull();
});

test('refreshBuoys keeps the old readings when 氣象署 fails, and stores an empty copy for a new buoy', async () => {
  const now = Date.UTC(2026, 8, 30, 6, 10);
  const kv = fakeKV({ 'buoy:46714D': buoyCopy([{ time: '2026-09-29T10:00', waveH: 1 }]) });
  await refreshBuoys({ CACHE: kv, CWA_KEY: 'K' }, async () => new Response('x', { status: 500 }), now);
  expect(JSON.parse(await kv.get('buoy:46714D')).readings).toEqual([{ time: '2026-09-29T10:00', waveH: 1 }]);
  expect(JSON.parse(await kv.get('buoy:46759A'))).toEqual({ readings: [] });
});

test('refreshBuoys without a key does nothing', async () => {
  const kv = fakeKV();
  let called = false;
  await refreshBuoys({ CACHE: kv }, async () => { called = true; return new Response(''); });
  expect(called).toBe(false);
  expect(await kv.get('buoy:46714D')).toBeNull();
});

test('the hourly cron refreshes the buoys only', async () => {
  const kv = fakeKV();
  const ctx = fakeCtx();
  await worker.scheduled({ cron: BUOY_CRON }, { CACHE: kv }, ctx);
  expect(ctx.jobs).toHaveLength(1);
  await Promise.all(ctx.jobs);
  expect(await kv.get('base:xiaoliuqiu')).toBeNull(); // the daily satellite refresh did not run
});

test('the deployed cron list contains BUOY_CRON', () => {
  const toml = readFileSync(new URL('../../worker/wrangler.toml', import.meta.url), 'utf8');
  expect(toml).toContain(`"${BUOY_CRON}"`);
});

test('at 06:35 Taipei the hourly cron runs the daily satellite refresh instead of the buoys', async () => {
  const realFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (u) => { urls.push(String(u)); throw new Error('offline'); };
  try {
    const ctx = fakeCtx();
    await worker.scheduled({ cron: BUOY_CRON, scheduledTime: Date.UTC(2026, 8, 30, DAILY_HOUR_UTC, 35) }, { CACHE: fakeKV(), CWA_KEY: 'K' }, ctx);
    expect(ctx.jobs).toHaveLength(1);
    await Promise.allSettled(ctx.jobs);
    expect(urls.some((u) => u.includes('O-B0075-001'))).toBe(false); // not the buoy request
    expect(urls.length).toBeGreaterThan(0); // the satellite / weather requests
    urls.length = 0;
    const ctx2 = fakeCtx();
    await worker.scheduled({ cron: BUOY_CRON, scheduledTime: Date.UTC(2026, 8, 30, DAILY_HOUR_UTC - 1, 35) }, { CACHE: fakeKV(), CWA_KEY: 'K' }, ctx2);
    await Promise.allSettled(ctx2.jobs);
    expect(urls.every((u) => u.includes('O-B0075-001'))).toBe(true); // buoys only
    expect(urls).toHaveLength(1);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('the deployed cron list has only 2 triggers (the free plan allows 5 per account)', () => {
  const toml = readFileSync(new URL('../../worker/wrangler.toml', import.meta.url), 'utf8');
  const line = /^crons = \[(.*?)\]/m.exec(toml)[1];
  expect(line.match(/"[^"]+"/g)).toHaveLength(2);
});
