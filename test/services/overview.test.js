import { test, expect } from 'vitest';
import { loadOverview } from '../../src/services/overview.js';
import { buildDayForecasts } from '../../src/services/spotData.js';
import { summarizeSpot } from '../../src/core/overview.js';
import { SPOTS, SPOT_LIST } from '../../src/data/spots/index.js';
import { fakeRaw, fakeStorage } from '../helpers/fakeRaw.js';

const NOW = Date.UTC(2026, 8, 28, 2); // 2026-09-28 10:00 Taipei
const raw = fakeRaw();

function fakeFetch({ failIf = () => false } = {}) {
  return async (url) => {
    const u = String(url);
    if (failIf(u)) throw new Error('offline');
    const body = u.includes('/v1/base') ? { zones: {} }
      : u.includes('marine') ? raw.marine : u.includes('precipitation') ? raw.rain : raw.weather;
    return new Response(JSON.stringify(body), { status: 200 });
  };
}
const opts = (extra = {}) => ({ fetchFn: fakeFetch(), storage: fakeStorage(), now: NOW, helperUrl: 'https://h', ...extra });

test('every spot gets 3 summaries', async () => {
  const { summaries, forecasts } = await loadOverview(SPOT_LIST, opts());
  for (const s of SPOT_LIST) {
    expect(summaries[s.id]).toHaveLength(3);
    expect(summaries[s.id][0]).not.toBeNull();
    expect(forecasts[s.id]).toHaveLength(3);
  }
});

test('one spot failing leaves the others intact', async () => {
  const lat = String(SPOTS.kenting.center[0]);
  const { summaries } = await loadOverview(SPOT_LIST, opts({ fetchFn: fakeFetch({ failIf: (u) => u.includes(`latitude=${lat}`) }) }));
  expect(summaries.kenting).toEqual([null, null, null]);
  expect(summaries.xiaoliuqiu[0]).not.toBeNull();
});

test('a spot whose load throws does not reject the whole call', async () => {
  const broken = { ...SPOTS.lanyu, id: 'broken', zones: null }; // buildForecast will throw on zones.map
  const { summaries } = await loadOverview([SPOTS.xiaoliuqiu, broken], opts());
  expect(summaries.broken).toEqual([null, null, null]);
  expect(summaries.xiaoliuqiu[0]).not.toBeNull();
});

test('weather is cached per spot', async () => {
  const storage = fakeStorage();
  await loadOverview(SPOT_LIST, opts({ storage }));
  expect(storage.getItem('haidi:weather:lanyu')).not.toBeNull();
});

test('the overview equals the spot page', async () => {
  const { summaries } = await loadOverview(SPOT_LIST, opts());
  const spot = SPOTS.xiaoliuqiu;
  const page = summarizeSpot(buildDayForecasts({ spot, weather: { raw, savedAt: NOW, stale: null }, helper: { zones: {} }, now: NOW }));
  expect(summaries.xiaoliuqiu[0]).toEqual(page[0]);
});
