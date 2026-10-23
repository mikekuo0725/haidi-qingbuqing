import { test, expect } from 'vitest';
import { buildForecast } from '../../src/core/forecast.js';
import { SPOTS } from '../../src/data/spots/index.js';
import { makeDay } from '../helpers/makeDay.js';

const spot = SPOTS.xiaoliuqiu;
const day = makeDay({ date: '2024-01-18', hour: { cloud: 0 } });
const helper = {
  satelliteDate: '2024-01-10',
  zones: {
    west: { kdMedian: 0.075, source: 'sat', bias: 1, biasN: 0 },
    south: { kdMedian: 0.1, source: 'sat', bias: 1, biasN: 0 },
    north: { kdMedian: null, source: 'fallback', bias: 1, biasN: 0 },
    east: { kdMedian: 0.2, source: 'sat', bias: 0.9, biasN: 12 },
  },
};

test('zones are sorted best first and carry lights and ranges', () => {
  const f = buildForecast({ spot, day, stale: null, helper });
  const m = f.zones.map((z) => z.meters);
  expect(m).toEqual([...m].sort((a, b) => b - a));
  expect(f.zones[0].zoneId).toBe('west');
  expect(f.zones[0].light).toBe('purple');
  expect(f.zones[0].low).toBeLessThan(f.zones[0].high);
});

test('satellite missing → fallback base, lower confidence', () => {
  const f = buildForecast({ spot, day, stale: null, helper });
  const north = f.zones.find((z) => z.zoneId === 'north');
  expect(north.baseSource).toBe('fallback');
  expect(north.base).toBe(10);
  expect(north.confidence).toBe('medium');
});

test('helper missing entirely → all fallback', () => {
  const f = buildForecast({ spot, day, stale: null, helper: null });
  expect(f.zones.every((z) => z.baseSource === 'fallback')).toBe(true);
});

test('stale weather → gray lights', () => {
  const f = buildForecast({ spot, day, stale: 5, helper });
  expect(f.zones.every((z) => z.light === 'gray')).toBe(true);
  expect(f.zones.find((z) => z.zoneId === 'north').confidence).toBe('low');
});

test('confidence is high with satellite and fresh weather', () => {
  const f = buildForecast({ spot, day, stale: null, helper });
  expect(f.zones.find((z) => z.zoneId === 'south').confidence).toBe('high');
});

test('a cached bias in the helper is ignored', () => {
  const f = buildForecast({ spot, day, stale: null, helper });
  const east = f.zones.find((z) => z.zoneId === 'east');
  expect(east.meters).toBe(east.rawMeters);
  expect(east).not.toHaveProperty('bias');
  expect(east).not.toHaveProperty('biasN');
});

test('forecast includes safety, best window and SST', () => {
  const f = buildForecast({ spot, day, stale: null, helper });
  expect(f.safety.currentLevel).toBeDefined();
  expect(f.best.end - f.best.start).toBe(2);
  expect(f.sst).toBe(28);
});

// R2: a zone without satellite data (fallback base) gets the wide range even
// when confidence would otherwise not be 'low' (fresh weather, no stale flag).
test('fallback zone + fresh weather → wide range (R2)', () => {
  const f = buildForecast({ spot, day, stale: null, helper });
  const north = f.zones.find((z) => z.zoneId === 'north');
  expect(north.confidence).toBe('medium');
  expect(north.low).toBe(Math.round(north.meters * 0.6));
  expect(north.high).toBe(Math.round(north.meters * 1.3));
});
