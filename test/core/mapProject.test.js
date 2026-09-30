import { test, expect } from 'vitest';
import { MAP_W, mapHeight, project } from '../../src/core/mapProject.js';

const box = [[22.31, 120.335], [22.37, 120.405]];

test('the north-west corner is 0,0 and the south-east corner is width,height', () => {
  expect(project(box, [22.37, 120.335])).toEqual([0, 0]);
  const [x, y] = project(box, [22.31, 120.405]);
  expect(x).toBeCloseTo(MAP_W, 6);
  expect(y).toBeCloseTo(mapHeight(box), 6);
});

test('height keeps real proportions (east-west km shrink with latitude)', () => {
  expect(MAP_W).toBe(300);
  expect(mapHeight(box)).toBeCloseTo(278.0, 0);
});

test('east is right, south is down', () => {
  const [x1, y1] = project(box, [22.34, 120.36]);
  const [x2, y2] = project(box, [22.33, 120.38]);
  expect(x2).toBeGreaterThan(x1);
  expect(y2).toBeGreaterThan(y1);
});
