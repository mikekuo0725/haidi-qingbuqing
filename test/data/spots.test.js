import { test, expect } from 'vitest';
import { SPOTS, SPOT_LIST, DEFAULT_SPOT_ID } from '../../src/data/spots/index.js';

test('every spot has the fields the code needs', () => {
  for (const spot of Object.values(SPOTS)) {
    expect(spot.thresholds.purple).toBeGreaterThan(spot.thresholds.green);
    expect(spot.thresholds.green).toBeGreaterThan(spot.thresholds.yellow);
    expect(spot.rainPoints.length).toBeGreaterThan(0);
    expect(spot.zones.length).toBeGreaterThan(0);
    for (const z of spot.zones) {
      expect(['open', 'semi', 'bay']).toContain(z.shelter);
      expect(['sand', 'mixed', 'rock']).toContain(z.bottom);
      expect(z.riverImpact).toBeGreaterThanOrEqual(0);
      expect(z.riverImpact).toBeLessThanOrEqual(1);
      expect(z.satBox[0][0]).toBeLessThan(z.satBox[1][0]);
      expect(z.satBox[0][1]).toBeLessThan(z.satBox[1][1]);
    }
  }
  expect(SPOTS[DEFAULT_SPOT_ID]).toBeDefined();
});

test('spot ids and zone ids are unique, facings are compass degrees', () => {
  const ids = SPOT_LIST.map((s) => s.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(Object.keys(SPOTS).sort()).toEqual([...ids].sort());
  for (const s of SPOT_LIST) {
    expect(SPOTS[s.id]).toBe(s);
    expect(s.locateMaxKm).toBeGreaterThan(0);
    const zoneIds = s.zones.map((z) => z.id);
    expect(new Set(zoneIds).size).toBe(zoneIds.length);
    for (const z of s.zones) {
      expect(z.facing).toBeGreaterThanOrEqual(0);
      expect(z.facing).toBeLessThan(360);
      expect(z.fallbackBase).toBeGreaterThan(0);
    }
  }
});

test('墾丁 has 西岸 / 南灣 / 東岸', () => {
  expect(SPOTS.kenting.name).toBe('墾丁');
  expect(SPOTS.kenting.zones.map((z) => z.id)).toEqual(['west', 'south', 'east']);
  expect(SPOT_LIST.map((s) => s.id)).toEqual(['xiaoliuqiu', 'kenting', 'qixing', 'northeast']);
});

test('東北角 has 鼻頭角 / 龍洞灣 / 和美, a small 雙溪 effect and a monsoon notice', () => {
  const n = SPOTS.northeast;
  expect(n.name).toBe('東北角');
  expect(n.zones.map((z) => z.id)).toEqual(['bitou', 'longdong', 'hemei']);
  expect(n.zones.map((z) => z.name)).toEqual(['鼻頭角', '龍洞灣', '和美']);
  expect(n.riverName).toBe('雙溪');
  expect(n.zones.every((z) => z.riverImpact <= 0.2)).toBe(true);
  expect(n.notice).toContain('東北季風');
});

test('七星岩 is its own spot: 2 sides, no river effect, a safety notice', () => {
  const q = SPOTS.qixing;
  expect(q.name).toBe('七星岩');
  expect(q.zones.map((z) => z.id)).toEqual(['north', 'south']);
  expect(q.zones.every((z) => z.riverImpact === 0)).toBe(true);
  expect(q.notice).toContain('高級潛點');
  for (const s of SPOT_LIST) {
    if (s.notice !== undefined) {
      expect(typeof s.notice).toBe('string');
      expect(s.notice.length).toBeLessThanOrEqual(40);
    }
  }
});
