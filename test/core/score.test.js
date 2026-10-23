import { test, expect } from 'vitest';
import { baseFromKd, lightFor, rangeFor, compareToNormal, scoreZone, reasonText } from '../../src/core/score.js';
import { SPOTS } from '../../src/data/spots/index.js';
import { makeDay } from '../helpers/makeDay.js';

const spot = SPOTS.xiaoliuqiu;
const west = spot.zones.find((z) => z.id === 'west');
const east = spot.zones.find((z) => z.id === 'east');
const th = spot.thresholds;

test('baseFromKd: 0.1 → 15 m, clamped to 1..40', () => {
  expect(baseFromKd(0.1)).toBeCloseTo(15);
  expect(baseFromKd(0.01)).toBe(40);
  expect(baseFromKd(10)).toBe(1);
});

test('light boundaries', () => {
  expect(lightFor(20, th)).toBe('purple');
  expect(lightFor(19.9, th)).toBe('green');
  expect(lightFor(12, th)).toBe('green');
  expect(lightFor(6, th)).toBe('yellow');
  expect(lightFor(5.9, th)).toBe('red');
});

test('range is wider when confidence is low', () => {
  expect(rangeFor(10, 'high')).toEqual({ low: 8, high: 12 });   // 7.5→8, 11.5→12
  expect(rangeFor(10, 'low')).toEqual({ low: 6, high: 13 });
});

test('compare to normal: ±15%', () => {
  expect(compareToNormal(11.5, 10)).toBe('up');
  expect(compareToNormal(8.5, 10)).toBe('down');
  expect(compareToNormal(10.4, 10)).toBe('same');
});

test('scoreZone multiplies base by all factors', () => {
  const day = makeDay({ date: '2024-01-18' }); // not spring tide
  const s = scoreZone({ zone: west, spot, day, base: 15 });
  const product = Object.values(s.factors).reduce((a, b) => a * b, 1);
  expect(s.rawMeters).toBeCloseTo(15 * product);
  expect(s.meters).toBeCloseTo(15 * product);
  expect(s).not.toHaveProperty('bias');
  expect(Object.keys(s.factors).sort()).toEqual(['cloud', 'currentDir', 'currentSpeed', 'pastWave', 'river', 'tide', 'wave', 'wind']);
});

test('waves from the west: west is the worst zone and reason is wave', () => {
  const day = makeDay({ date: '2024-01-18', hour: { waveH: 1.2, waveT: 9, waveDir: 270 } });
  const w = scoreZone({ zone: west, spot, day, base: 15 });
  const e = scoreZone({ zone: east, spot, day, base: 15 });
  expect(w.meters).toBeLessThan(e.meters);
  expect(w.reasonKey).toBe('wave');
  expect(reasonText('wave', { zone: west, spot, day })).toBe('湧浪正對西邊');
});

test('heavy rain: reason mentions the river and the rain amount', () => {
  const day = makeDay({ date: '2024-01-18', rain3dMm: 180 });
  const e = scoreZone({ zone: east, spot, day, base: 15 });
  expect(e.reasonKey).toBe('river');
  expect(reasonText('river', { zone: east, spot, day })).toBe('高屏溪泥水（上游前 3 天 180mm）');
});

test('calm day gives the good reason', () => {
  const day = makeDay({ date: '2024-01-18', hour: { cloud: 0 } });
  const s = scoreZone({ zone: west, spot, day, base: 15 });
  expect(s.reasonKey).toBe('good');
});
