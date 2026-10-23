import { test, expect } from 'vitest';
import { loadWeatherRaw, buildDayForecasts, loadSpot } from '../../src/services/spotData.js';
import { SPOTS } from '../../src/data/spots/index.js';
import { fakeRaw, fakeStorage } from '../helpers/fakeRaw.js';

const spot = SPOTS.xiaoliuqiu;
const NOW = Date.UTC(2026, 8, 28, 2); // 2026-09-28 10:00 Taipei

// Open-Meteo is three calls (marine, weather, rain); answer them in that order by URL.
function okFetch(raw = fakeRaw()) {
  return async (url) => {
    const u = String(url);
    const body = u.includes('marine') ? raw.marine : u.includes('precipitation') ? raw.rain : u.includes('/v1/base') ? { zones: {} } : raw.weather;
    return new Response(JSON.stringify(body), { status: 200 });
  };
}
const failFetch = async () => { throw new Error('offline'); };

test('fresh fetch that parses is saved and returned with stale null', async () => {
  const storage = fakeStorage();
  const w = await loadWeatherRaw(spot, { fetchFn: okFetch(), storage, now: NOW });
  expect(w.stale).toBeNull();
  expect(w.savedAt).toBe(NOW);
  expect(storage.getItem('haidi:weather:xiaoliuqiu')).not.toBeNull();
});

test('failed fetch falls back to the cache with stale hours', async () => {
  const storage = fakeStorage({ 'haidi:weather:xiaoliuqiu': JSON.stringify({ raw: fakeRaw(), savedAt: NOW - 3 * 3600000 }) });
  const w = await loadWeatherRaw(spot, { fetchFn: failFetch, storage, now: NOW });
  expect(w.stale).toBe(3);
});

test('failed fetch and empty cache → null', async () => {
  expect(await loadWeatherRaw(spot, { fetchFn: failFetch, storage: fakeStorage(), now: NOW })).toBeNull();
});

test('buildDayForecasts gives 3 entries, null for a day the weather does not cover', () => {
  const now = Date.UTC(2026, 8, 29, 2); // 9/29: today 9/29, tomorrow 9/30, the day after 10/01 is not in the data
  const f = buildDayForecasts({ spot, weather: { raw: fakeRaw(), savedAt: now, stale: null }, helper: null, now });
  expect(f).toHaveLength(3);
  expect(f[0].date).toBe('2026-09-29');
  expect(f[1].date).toBe('2026-09-30');
  expect(f[2]).toBeNull();
});

test('no weather at all → three nulls', () => {
  expect(buildDayForecasts({ spot, weather: null, helper: null, now: NOW })).toEqual([null, null, null]);
});

test('loadSpot fetches weather and helper together', async () => {
  const { weather, helper } = await loadSpot(spot, { fetchFn: okFetch(), storage: fakeStorage(), now: NOW, helperUrl: 'https://h' });
  expect(weather.stale).toBeNull();
  expect(helper).toEqual({ zones: {} });
});
