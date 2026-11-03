import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseTyphoons, typhoonHint, typhoonCardLines, bearingDeg } from '../../src/core/typhoon.js';
import { K } from '../../src/core/constants.js';

const raw = JSON.parse(readFileSync(new URL('../fixtures/cwa-typhoon.json', import.meta.url), 'utf8'));
const NOW = Date.parse('2026-11-03T12:00:00+08:00');
const T = (iso) => Date.parse(iso);

test('parses two typhoons from the fixture, current position from the last analysis fix', () => {
  const list = parseTyphoons(raw, NOW);
  expect(list.map((t) => t.name)).toEqual(['煙花', 'SEPAT']);
  const a = list[0];
  expect(a.nameEn).toBe('IN-FA');
  expect(a.id).toBe('IN-FA');
  expect(a.now).toEqual({ lat: 18.2, lon: 121.8, time: T('2026-11-03T10:00:00+08:00'), windMs: 43, gustMs: 53, pressureHpa: 935, radius7Km: 200, movingKmh: 15, movingDir: '西北' });
});

test('forecast points are sorted by time and only the ones after now are kept', () => {
  const a = parseTyphoons(raw, NOW)[0];
  expect(a.track.map((p) => p.time)).toEqual([T('2026-11-04T08:00:00+08:00'), T('2026-11-03T20:00:00+08:00'), T('2026-11-05T08:00:00+08:00')].sort((x, y) => x - y));
  expect(a.track[0]).toEqual({ lat: 18.9, lon: 121.2, time: T('2026-11-03T20:00:00+08:00'), windMs: 42, pressureHpa: 940 });
});

test('a forecast point with a broken coordinate is dropped, the rest stay', () => {
  const a = parseTyphoons(raw, NOW)[0];
  expect(a.track).toHaveLength(3); // tau 0 is before now, tau 36 has coordinate "abc"
});

test('empty / null / garbage / string-of-garbage input gives []', () => {
  for (const bad of [null, undefined, {}, [], 'nope', '{"records":{}}', { records: { tropicalCyclones: { tropicalCyclone: null } } }, { records: { tropicalCyclones: { tropicalCyclone: [] } } }, 42]) {
    expect(parseTyphoons(bad, NOW)).toEqual([]);
  }
});

test('numbers given as strings are read as numbers; a missing radius gives radius7Km null', () => {
  const b = parseTyphoons(raw, NOW)[1];
  expect(b.now.lat).toBe(15);
  expect(b.now.lon).toBe(135);
  expect(b.now.windMs).toBe(25);
  expect(b.now.radius7Km).toBeNull();
  expect(b.now.gustMs).toBeNull();
  expect(b.nameEn).toBeNull();
  expect(b.id).toBe('SEPAT');
});

test('a typhoon whose newest fix is older than K.typhoonStaleHours is dropped', () => {
  const late = NOW + (K.typhoonStaleHours + 1) * 3600000;
  expect(parseTyphoons(raw, late)).toEqual([]);
});

test('also accepts the raw answer as a JSON string', () => {
  expect(parseTyphoons(JSON.stringify(raw), NOW)).toHaveLength(2);
});

const VIEW = { center: [22.55, 120.9], bounds: [[20.5, 118.5], [26, 123.5]] };
const at = (lat, lon) => ({ now: { lat, lon } });

test('typhoonHint is null inside the view; outside it gives bearing and km rounded to 10', () => {
  expect(typhoonHint(at(22, 121), VIEW)).toBeNull();
  const h = typhoonHint(at(19, 126), VIEW);
  expect(h.dirText).toBe('東南');
  expect(h.km % 10).toBe(0);
  expect(h.km).toBeGreaterThan(600);
  expect(h.km).toBeLessThan(720);
  expect(h.dirDeg).toBeGreaterThan(112);
  expect(h.dirDeg).toBeLessThan(158);
});

test('typhoonHint works across 180° longitude without NaN', () => {
  const view = { center: [22.5, 179], bounds: [[20, 177], [25, 180]] };
  const h = typhoonHint(at(22.5, -179), view);
  expect(Number.isFinite(h.km)).toBe(true);
  expect(Number.isFinite(h.dirDeg)).toBe(true);
  expect(h.dirText).toBe('東');
});

test('bearingDeg: north is 0, east is 90', () => {
  expect(Math.round(bearingDeg([0, 0], [1, 0]))).toBe(0);
  expect(Math.round(bearingDeg([0, 0], [0, 1]))).toBe(90);
});

test('typhoonCardLines gives every line when the data is there', () => {
  const a = parseTyphoons(raw, NOW)[0];
  const lines = typhoonCardLines(a);
  expect(lines[0]).toBe('最大風速 43 m/s（陣風 53）');
  expect(lines).toContain('中心氣壓 935 hPa');
  expect(lines).toContain('七級風半徑 200 公里');
  expect(lines).toContain('移動 西北 15 公里/小時');
  expect(lines.filter((l) => l.startsWith('預計：'))).toHaveLength(2);
  expect(lines.find((l) => l.startsWith('預計：'))).toBe('預計：11/3 20:00 到 18.9°N 121.2°E');
});

test('typhoonCardLines leaves out lines whose data is missing', () => {
  const b = parseTyphoons(raw, NOW)[1];
  const lines = typhoonCardLines(b);
  expect(lines.some((l) => l.includes('七級風'))).toBe(false);
  expect(lines.some((l) => l.includes('陣風'))).toBe(false);
  expect(lines.some((l) => l.startsWith('移動'))).toBe(false);
  expect(lines[0]).toBe('最大風速 25 m/s');
  expect(typhoonCardLines({ now: { lat: 1, lon: 1 }, track: [] })).toEqual([]);
});
