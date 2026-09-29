import { test, expect } from 'vitest';
import { locate } from '../../src/core/locate.js';
import { SPOTS } from '../../src/data/spots/index.js';

const spot = SPOTS.xiaoliuqiu;

test('on the west coast → west zone', () => {
  expect(locate([22.341, 120.355], spot)).toMatchObject({ status: 'near', zoneId: 'west' });
});

test('in Tainan → far, with distance', () => {
  const r = locate([22.99, 120.21], spot);
  expect(r.status).toBe('far');
  expect(r.km).toBeGreaterThan(60);
});

test('no position → none', () => {
  expect(locate(null, spot)).toEqual({ status: 'none' });
});

const kenting = SPOTS.kenting;

test('墾丁: 萬里桐 → west, 後壁湖 → south, 香蕉灣 → east', () => {
  expect(locate([21.99, 120.71], kenting)).toMatchObject({ status: 'near', zoneId: 'west' });
  expect(locate([21.945, 120.745], kenting)).toMatchObject({ status: 'near', zoneId: 'south' });
  expect(locate([21.925, 120.835], kenting)).toMatchObject({ status: 'near', zoneId: 'east' });
});

test('墾丁 from 小琉球 → far', () => {
  const r = locate([22.34, 120.37], kenting);
  expect(r.status).toBe('far');
  expect(r.km).toBeGreaterThan(55);
});
