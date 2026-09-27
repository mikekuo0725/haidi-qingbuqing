import { test, expect } from 'vitest';
import { nowcast, outlierWeights, zoneBias } from '../../src/core/calibration.js';

const H = 3600000;
const DAY = 24 * H;
const NOW = Date.UTC(2026, 8, 28, 4, 0); // 12:00 Taipei
const rep = (over) => ({ id: Math.random().toString(36), zoneId: 'west', meters: 20, depth: 10, diveTime: NOW, rawMeters: 20, ...over });

test('nowcast: no reports → unchanged', () => {
  expect(nowcast(10, [], NOW)).toMatchObject({ meters: 10, n: 0, applied: false });
});

test('nowcast: 1 report moves 30% toward it', () => {
  const r = nowcast(10, [rep({ meters: 20 })], NOW);
  expect(r.w).toBeCloseTo(0.3);
  expect(r.meters).toBeCloseTo(13);
});

test('nowcast: 6 hours later only a quarter of the effect is left', () => {
  const r = nowcast(10, [rep({ meters: 20, diveTime: NOW - 6 * H })], NOW);
  expect(r.w).toBeCloseTo(0.075);
});

test('nowcast: 3+ reports use 0.7 and their median', () => {
  const r = nowcast(10, [rep({ meters: 20 }), rep({ meters: 22 }), rep({ meters: 30 })], NOW);
  expect(r.w).toBeCloseTo(0.7);
  expect(r.meters).toBeCloseTo(10 * 0.3 + 22 * 0.7);
});

test('outlier: far from the median of 3+ same-day reports gets 0.3', () => {
  const list = [rep({ meters: 20 }), rep({ meters: 22 }), rep({ meters: 5 })];
  expect(outlierWeights(list)).toEqual([1, 1, 0.3]);
});

test('outlier: fewer than 3 reports → all weight 1', () => {
  expect(outlierWeights([rep({ meters: 20 }), rep({ meters: 5 })])).toEqual([1, 1]);
});

test('zoneBias: 4 reports → no correction', () => {
  const list = Array.from({ length: 4 }, (_, i) => rep({ meters: 8, rawMeters: 10, diveTime: NOW - i * DAY }));
  expect(zoneBias(list, NOW).west).toEqual({ bias: 1, n: 4 });
});

test('zoneBias: 10 reports all 0.8× → bias 0.9', () => {
  const list = Array.from({ length: 10 }, (_, i) => rep({ meters: 8, rawMeters: 10, diveTime: NOW - i * DAY }));
  expect(zoneBias(list, NOW).west.bias).toBeCloseTo(0.9);
});

test('zoneBias: clamped to 0.5..1.5', () => {
  const list = Array.from({ length: 200 }, (_, i) => rep({ meters: 30, rawMeters: 10, diveTime: NOW - (i % 80) * DAY }));
  expect(zoneBias(list, NOW).west.bias).toBe(1.5);
});

test('zoneBias: reports older than 90 days are ignored', () => {
  const list = Array.from({ length: 10 }, () => rep({ meters: 8, rawMeters: 10, diveTime: NOW - 100 * DAY }));
  expect(zoneBias(list, NOW).west).toBeUndefined();
});
