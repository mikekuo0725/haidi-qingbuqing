import { test, expect } from 'vitest';
import { summarizeDay, summarizeSpot, rankSpots } from '../../src/core/overview.js';
import { buildForecast } from '../../src/core/forecast.js';
import { SPOTS } from '../../src/data/spots/index.js';
import { makeDay } from '../helpers/makeDay.js';

const spot = SPOTS.xiaoliuqiu;
const f = buildForecast({ spot, day: makeDay({ date: '2024-01-18' }), stale: null, helper: null });

test('best zone and its light come from zones[0]', () => {
  const s = summarizeDay(f);
  expect(s.zoneId).toBe(f.zones[0].zoneId);
  expect(s.zoneName).toBe(f.zones[0].name);
  expect(s.meters).toBe(f.zones[0].meters);
  expect(s.light).toBe(f.zones[0].light);
  expect(s.date).toBe('2024-01-18');
});

test('flow and wind come from the best hour', () => {
  const plain = {
    date: 'x', zones: [{ zoneId: 'a', name: 'A', meters: 10, light: 'green' }], sst: 27, best: { start: 11 },
    currents: [
      { hour: 10, kn: 0.2, toDeg: 90, windKmh: 5, windDir: 0 },
      { hour: 11, kn: 0.6, toDeg: 270, windKmh: 12, windDir: 180 },
    ],
  };
  expect(summarizeDay(plain)).toMatchObject({ flowKn: 0.6, flowToDeg: 270, windKmh: 12, windDir: 180, sst: 27 });
  expect(summarizeDay({ ...plain, best: { start: 15 } }).flowToDeg).toBe(90); // no match → first hour
});

test('null forecast → null summary', () => {
  expect(summarizeDay(null)).toBeNull();
  expect(summarizeSpot([f, null, null])[1]).toBeNull();
  expect(summarizeSpot([f, null, null])).toHaveLength(3);
});

test('zoneLights has every zone of the spot', () => {
  const s = summarizeDay(f);
  expect(Object.keys(s.zoneLights).sort()).toEqual(spot.zones.map((z) => z.id).sort());
  for (const z of f.zones) expect(s.zoneLights[z.zoneId]).toBe(z.light);
});

test('rankSpots puts the clearest first and no-data spots last', () => {
  const day = (m) => ({ meters: m });
  const order = rankSpots({ a: [day(8)], b: [null], c: [day(15)], d: [day(3)] }, 0);
  expect(order).toEqual(['c', 'a', 'd', 'b']);
});
