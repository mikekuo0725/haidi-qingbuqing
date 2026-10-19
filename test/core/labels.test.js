import { test, expect } from 'vitest';
import { placeLabels } from '../../src/core/labels.js';

const area = { width: 300, height: 200 };
const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

test('labels around the same spot never sit on top of each other', () => {
  const items = ['甲甲甲', '乙乙乙', '丙丙丙', '丁丁丁'].map((text) => ({ text, x: 150, y: 100, size: 11, kind: 'site' }));
  const out = placeLabels(items, { ...area, obstacles: [] });
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) expect(overlaps(out[i].box, out[j].box), `${i}/${j}`).toBe(false);
  }
  expect(out.every((l) => l.overlap === 0)).toBe(true);
});

test('a site name goes right of its dot when there is room, and stays inside the map', () => {
  const [l] = placeLabels([{ text: '花瓶岩', x: 100, y: 100, size: 11, kind: 'site' }], { ...area, obstacles: [] });
  expect(l.box[0]).toBeGreaterThan(100);
  const [edge] = placeLabels([{ text: '花瓶岩', x: 298, y: 100, size: 11, kind: 'site' }], { ...area, obstacles: [] });
  expect(edge.box[2]).toBeLessThanOrEqual(300);
});

test('a zone name is centred on its point when nothing is there', () => {
  const [l] = placeLabels([{ text: '北邊', x: 150, y: 100, size: 13, kind: 'zone' }], { ...area, obstacles: [] });
  expect((l.box[0] + l.box[2]) / 2).toBeCloseTo(150, 0);
  expect(l.leader).toBeNull();
});

test('a name pushed far from its dot gets a line back to it', () => {
  const ring = [];
  for (let dx = -60; dx <= 60; dx += 2) for (let dy = -24; dy <= 24; dy += 2) if (Math.abs(dx) > 4 || Math.abs(dy) > 4) ring.push([150 + dx, 100 + dy, 151 + dx, 101 + dy]);
  const [l] = placeLabels([{ text: '大咕咾', x: 150, y: 100, size: 11, kind: 'site' }], { ...area, obstacles: ring.filter(([x, y]) => Math.abs(x - 150) < 40 && Math.abs(y - 100) < 14) });
  expect(l.leader).not.toBeNull();
  expect(l.leader.slice(0, 2)).toEqual([150, 100]);
});
