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

test('東北角 has land (the coast west of the zones)', () => {
  expect(MAPS.northeast.land.length).toBeGreaterThan(0);
  expect(MAPS.northeast.bbox).toEqual([[25.08, 121.88], [25.145, 121.98]]);
});

test('綠島 has land (the whole island)', () => {
  expect(MAPS.ludao.land.length).toBeGreaterThan(0);
  expect(MAPS.ludao.bbox).toEqual([[22.625, 121.455], [22.695, 121.53]]);
});

test('蘭嶼 has land (the whole island)', () => {
  expect(MAPS.lanyu.land.length).toBeGreaterThan(0);
  expect(MAPS.lanyu.bbox).toEqual([[21.99, 121.48], [22.10, 121.645]]);
});

test('澎湖北海 has land (吉貝, 目斗嶼, 姑婆嶼, 險礁 and the islets around them)', () => {
  expect(MAPS['penghu-north'].land.length).toBeGreaterThan(0);
  expect(MAPS['penghu-north'].bbox).toEqual([[23.69, 119.52], [23.80, 119.72]]);
});

test('澎湖南方四島 has land (東吉, 西吉, 東西嶼坪 and the islets around them)', () => {
  expect(MAPS['penghu-south'].land.length).toBeGreaterThan(0);
  expect(MAPS['penghu-south'].bbox).toEqual([[23.21, 119.47], [23.33, 119.72]]);
});
