import { test, expect } from 'vitest';
import { SPOT_LIST } from '../../src/data/spots/index.js';
import { MAPS } from '../../src/data/spots/maps/index.js';

const PATH = /^M-?\d+\.\d,-?\d+\.\d( L-?\d+\.\d,-?\d+\.\d)+Z$/;

test('every spot has a map box that holds all its zones, and valid land paths', () => {
  for (const s of SPOT_LIST) {
    const m = MAPS[s.id];
    expect(m, s.id).toBeDefined();
    const [[south, west], [north, east]] = m.bbox;
    expect(south).toBeLessThan(north);
    expect(west).toBeLessThan(east);
    for (const z of s.zones) {
      expect(z.location[0], `${s.id}/${z.id}`).toBeGreaterThan(south);
      expect(z.location[0], `${s.id}/${z.id}`).toBeLessThan(north);
      expect(z.location[1], `${s.id}/${z.id}`).toBeGreaterThan(west);
      expect(z.location[1], `${s.id}/${z.id}`).toBeLessThan(east);
    }
    expect(Array.isArray(m.land)).toBe(true);
    for (const d of m.land) expect(d).toMatch(PATH);
  }
});

test('小琉球 and 墾丁 have land; 七星岩 says where 鵝鑾鼻 is', () => {
  expect(MAPS.xiaoliuqiu.land.length).toBeGreaterThan(0);
  expect(MAPS.kenting.land.length).toBeGreaterThan(0);
  expect(MAPS.qixing.note).toBe('鵝鑾鼻在北邊約 16 公里');
});
