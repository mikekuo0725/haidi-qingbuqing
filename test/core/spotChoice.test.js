import { test, expect } from 'vitest';
import { spotsByDistance, nearbySpotId, initialSpotId, autoSwitchTarget } from '../../src/core/spotChoice.js';
import { SPOT_LIST } from '../../src/data/spots/index.js';

const A = { id: 'a', center: [22.34, 120.37], locateMaxKm: 15 };
const B = { id: 'b', center: [21.95, 120.78], locateMaxKm: 20 };
const spots = [A, B];
const AT_B = [21.945, 120.80];
const TAINAN = [22.99, 120.21];

test('sorts nearest first when there is a position', () => {
  const rows = spotsByDistance(AT_B, spots);
  expect(rows.map((r) => r.spot.id)).toEqual(['b', 'a']);
  expect(rows[0].km).toBeLessThan(5);
  expect(rows[1].km).toBeGreaterThan(55);
  expect(spots).toEqual([A, B]); // input not reordered
});

test('no position keeps list order and gives no distances', () => {
  expect(spotsByDistance(null, spots)).toEqual([{ spot: A, km: null }, { spot: B, km: null }]);
});

test('nearbySpotId: inside locateMaxKm → id, otherwise null', () => {
  expect(nearbySpotId([22.341, 120.355], spots)).toBe('a');
  expect(nearbySpotId(AT_B, spots)).toBe('b');
  expect(nearbySpotId(TAINAN, spots)).toBeNull();
  expect(nearbySpotId(null, spots)).toBeNull();
  expect(nearbySpotId(AT_B, [])).toBeNull();
});

test('initialSpotId: url > saved > default, unknown ids ignored', () => {
  expect(initialSpotId({ urlId: 'b', savedId: 'a', spots, defaultId: 'a' })).toBe('b');
  expect(initialSpotId({ urlId: null, savedId: 'b', spots, defaultId: 'a' })).toBe('b');
  expect(initialSpotId({ urlId: 'nope', savedId: 'zzz', spots, defaultId: 'a' })).toBe('a');
  expect(initialSpotId({ urlId: 'constructor', savedId: null, spots, defaultId: 'a' })).toBe('a');
});

test('autoSwitchTarget: only when near another spot and not locked', () => {
  expect(autoSwitchTarget({ pos: AT_B, spots, currentId: 'a', locked: false })).toBe('b');
  expect(autoSwitchTarget({ pos: AT_B, spots, currentId: 'a', locked: true })).toBeNull();
  expect(autoSwitchTarget({ pos: AT_B, spots, currentId: 'b', locked: false })).toBeNull();
  expect(autoSwitchTarget({ pos: TAINAN, spots, currentId: 'b', locked: false })).toBeNull();
  expect(autoSwitchTarget({ pos: null, spots, currentId: 'a', locked: false })).toBeNull();
});

test('real data: 墾丁大街 and 鵝鑾鼻 → kenting, on the boat at 七星岩 → qixing', () => {
  expect(nearbySpotId(AT_B, SPOT_LIST)).toBe('kenting');
  expect(nearbySpotId([21.902, 120.852], SPOT_LIST)).toBe('kenting');
  expect(nearbySpotId([21.7589, 120.8247], SPOT_LIST)).toBe('qixing');
});

test('real data: in the water at 龍洞灣 → northeast', () => {
  expect(nearbySpotId([25.1148, 121.9192], SPOT_LIST)).toBe('northeast');
});

test('real data: in the water at 綠島石朗 → ludao', () => {
  expect(nearbySpotId([22.6549, 121.4721], SPOT_LIST)).toBe('ludao');
});
