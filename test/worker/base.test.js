import { test, expect } from 'vitest';
import { computeZones } from '../../worker/src/base.js';

const spot = { zones: [{ id: 'w', satBox: [[22.32, 120.31], [22.36, 120.34]] }] };
const csv = (date, n) => 'h\nu\n' + Array.from({ length: n }, () => `${date}T12:00:00Z,0,22.3,120.3,0.1`).join('\n');
const fetchOf = (text, ok = true) => async () => ({ ok, text: async () => text });
const NOW = Date.UTC(2026, 8, 27);

test('enough fresh values → sat with median', async () => {
  const r = await computeZones(spot, fetchOf(csv('2026-09-15', 20)), NOW);
  expect(r.zones.w).toEqual({ kdMedian: 0.1, source: 'sat', satDate: '2026-09-15' });
  expect(r.satelliteDate).toBe('2026-09-15');
});

test('too few values, too old, or NOAA down → fallback', async () => {
  expect((await computeZones(spot, fetchOf(csv('2026-09-15', 5)), NOW)).zones.w.source).toBe('fallback');
  expect((await computeZones(spot, fetchOf(csv('2026-07-01', 20)), NOW)).zones.w.source).toBe('fallback');
  expect((await computeZones(spot, fetchOf('', false), NOW)).zones.w.source).toBe('fallback');
});

const yesterday = { satelliteDate: '2026-09-15', zones: { w: { kdMedian: 0.08, source: 'sat', satDate: '2026-09-15' } } };
const down = async () => { throw new Error('offline'); };

test('NOAA down keeps yesterday\'s satellite value', async () => {
  const r = await computeZones(spot, down, NOW, yesterday);
  expect(r.zones.w).toEqual({ kdMedian: 0.08, source: 'sat', satDate: '2026-09-15' });
  expect(r.satelliteDate).toBe('2026-09-15');
  const r502 = await computeZones(spot, fetchOf('', false), NOW, yesterday);
  expect(r502.zones.w.kdMedian).toBe(0.08);
});

test('NOAA down does not keep a value older than satMaxAgeDays', async () => {
  const old = { satelliteDate: '2026-07-01', zones: { w: { kdMedian: 0.08, source: 'sat', satDate: '2026-07-01' } } };
  const r = await computeZones(spot, down, NOW, old);
  expect(r.zones.w.source).toBe('fallback');
  expect(r.satelliteDate).toBeNull();
});

test('a copy stored before satDate existed uses the spot satelliteDate', async () => {
  const legacy = { satelliteDate: '2026-09-15', zones: { w: { kdMedian: 0.08, source: 'sat' } } };
  expect((await computeZones(spot, down, NOW, legacy)).zones.w.kdMedian).toBe(0.08);
});

test('NOAA answering with too few values is a real fallback, not a reason to keep yesterday', async () => {
  const r = await computeZones(spot, fetchOf(csv('2026-09-15', 5)), NOW, yesterday);
  expect(r.zones.w.source).toBe('fallback');
});
