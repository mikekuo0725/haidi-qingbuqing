import { test, expect } from 'vitest';
import { zoneRegions, borderLines, zoneAt } from '../../src/core/mapRegions.js';

// A round island at the middle of the box, cut into four quarters by borders going NE, SE, SW and NW.
const bbox = [[22.0, 120.0], [22.1, 120.1]];
const c = [22.05, 120.05];
const layer = {
  center: c,
  bounds: [
    { name: 'ne', from: [22.06, 120.06], bearing: 45, next: 'east' },
    { name: 'se', from: [22.04, 120.06], bearing: 135, next: 'south' },
    { name: 'sw', from: [22.04, 120.04], bearing: 225, next: 'west' },
    { name: 'nw', from: [22.06, 120.04], bearing: 315, next: 'north' },
  ],
};

test('the sea between two borders belongs to the zone named on the first one', () => {
  expect(zoneAt(bbox, layer, [22.095, 120.05])).toBe('north');
  expect(zoneAt(bbox, layer, [22.05, 120.095])).toBe('east');
  expect(zoneAt(bbox, layer, [22.005, 120.05])).toBe('south');
  expect(zoneAt(bbox, layer, [22.05, 120.005])).toBe('west');
});

test('one region per zone, and one dashed line per border that is not hidden', () => {
  expect(zoneRegions(bbox, layer).map((r) => r.zoneId)).toEqual(['east', 'south', 'west', 'north']);
  expect(borderLines(bbox, layer)).toHaveLength(4);
  const hidden = { ...layer, bounds: layer.bounds.map((b, i) => (i === 0 ? { ...b, hidden: true } : b)) };
  expect(borderLines(bbox, hidden)).toHaveLength(3);
});

test('a border starts at its cape and heads out on its bearing', () => {
  const [ne] = borderLines(bbox, layer);
  const [x0, y0] = ne.from;
  const [x1, y1] = ne.to;
  expect(x1).toBeGreaterThan(x0); // east
  expect(y1).toBeLessThan(y0); // north (y grows south)
});
