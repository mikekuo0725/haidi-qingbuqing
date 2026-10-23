import { test, expect } from 'vitest';
import { buildForecast } from '../../src/core/forecast.js';
import { SPOTS } from '../../src/data/spots/index.js';
import { makeDay } from '../helpers/makeDay.js';

const build = (day) => buildForecast({ spot: SPOTS.xiaoliuqiu, day, stale: null, helper: null });

test('the forecast says when 氣象署 issued the sea data it used', () => {
  const day = { ...makeDay({ date: '2024-01-18' }), coastalAt: '2024-01-18T06:55:58+08:00' };
  expect(build(day).coastalAt).toBe('2024-01-18T06:55:58+08:00');
  expect(build(makeDay({ date: '2024-01-18' })).coastalAt).toBeNull();
});
