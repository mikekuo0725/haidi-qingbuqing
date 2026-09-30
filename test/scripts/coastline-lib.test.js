import { test, expect } from 'vitest';
import { chainWays, closeRing, toPath } from '../../scripts/coastline-lib.js';

const A = [0, 0]; const B = [0, 1]; const C = [1, 1]; const D = [1, 0];

test('chainWays joins ways that share an end, in either order', () => {
  expect(chainWays([[A, B], [B, C], [C, D]])).toEqual([[A, B, C, D]]);
  expect(chainWays([[B, C], [A, B]])).toEqual([[A, B, C]]);
});

test('chainWays keeps separate islands separate', () => {
  const island = [[5, 5], [5, 6], [6, 6], [5, 5]];
  expect(chainWays([[A, B], island])).toEqual([[A, B], island]);
});

test('closeRing keeps a closed ring as it is', () => {
  const ring = [A, B, C, A];
  expect(closeRing(ring)).toBe(ring);
});

test('closeRing returns null for an open line with no close points', () => {
  expect(closeRing([A, B, C])).toBeNull();
  expect(closeRing([A, B, C], [])).toBeNull();
});

test('closeRing walks the close points starting from the one nearest the line end', () => {
  const far1 = [9, 1]; const far0 = [9, 0];
  expect(closeRing([A, B, C], [far1, far0])).toEqual([A, B, C, far1, far0, A]);
  expect(closeRing([A, B, C], [far0, far1])).toEqual([A, B, C, far1, far0, A]);
});

test('toPath projects, drops points closer than the step, one decimal, closed', () => {
  const box = [[22.31, 120.335], [22.37, 120.405]];
  const ring = [[22.37, 120.335], [22.37, 120.3350001], [22.34, 120.37], [22.31, 120.405], [22.37, 120.335]];
  const d = toPath(box, ring);
  expect(d.startsWith('M0.0,0.0 L')).toBe(true);
  expect(d.endsWith('Z')).toBe(true);
  expect(d.split(' L')).toHaveLength(4); // the near-duplicate second point is gone
  expect(d).toMatch(/^M-?\d+\.\d,-?\d+\.\d( L-?\d+\.\d,-?\d+\.\d)+Z$/);
});

test('toPath returns null for a speck smaller than 3 points', () => {
  const box = [[22.31, 120.335], [22.37, 120.405]];
  expect(toPath(box, [[22.34, 120.37], [22.34, 120.3700001], [22.34, 120.37]])).toBeNull();
});
