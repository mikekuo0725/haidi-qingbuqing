import { test, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';

const path = new URL('../../src/data/taiwan-coast.json', import.meta.url);

// Ray casting: is [lon, lat] inside the ring?
function inside([x, y], ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

test('coast covers Taiwan and the dive islands', () => {
  const geo = JSON.parse(readFileSync(path, 'utf8'));
  const rings = geo.features.map((f) => f.geometry.coordinates[0]);
  expect(geo.features.every((f) => f.geometry.type === 'Polygon')).toBe(true);
  expect(rings.length).toBeGreaterThanOrEqual(20);
  for (const ring of rings) for (const [lon, lat] of ring) {
    expect(lon).toBeGreaterThanOrEqual(119.0);
    expect(lon).toBeLessThanOrEqual(122.4);
    expect(lat).toBeGreaterThanOrEqual(21.5);
    expect(lat).toBeLessThanOrEqual(25.6);
  }
  for (const [name, pt] of [['小琉球', [120.37, 22.34]], ['綠島', [121.49, 22.66]], ['蘭嶼', [121.55, 22.045]], ['台灣本島', [121.0, 23.7]]]) {
    expect(rings.some((r) => inside(pt, r)), name).toBe(true);
  }
  expect(statSync(path).size).toBeLessThan(40 * 1024);
});
