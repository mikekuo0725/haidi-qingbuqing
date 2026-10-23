import { test, expect } from 'vitest';
import { buildForecast } from '../../src/core/forecast.js';
import { SPOTS } from '../../src/data/spots/index.js';
import { makeDay } from '../helpers/makeDay.js';

const spot = SPOTS.xiaoliuqiu; // current yellow ≥ 0.5 kn, red ≥ 1.0 kn
const build = (hour) => buildForecast({ spot, day: makeDay({ date: '2024-01-18', hour }), stale: null, helper: null });

test('one current per forecast hour, 08 to 16', () => {
  expect(build({}).currents.map((c) => c.hour)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16]);
});

test('current is in knots, keeps the flow-to direction and gets the spot light', () => {
  expect(build({ currentKmh: 1.852, currentDir: 225 }).currents[0]).toMatchObject({ hour: 8, kn: 1, toDeg: 225, level: 'red' });
  expect(build({ windKmh: 18, windDir: 40 }).currents[0]).toMatchObject({ windKmh: 18, windDir: 40 });
  expect(build({ currentKmh: 1.2, currentDir: 90 }).currents[0].level).toBe('yellow');
  expect(build({ currentKmh: 0.5, currentDir: 90 }).currents[0].level).toBe('green');
});
