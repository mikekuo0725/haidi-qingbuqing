import { test, expect } from 'vitest';
import { bestWindow } from '../../src/core/bestWindow.js';
import { makeDay } from '../helpers/makeDay.js';

test('the two hours with the weakest current win', () => {
  const day = makeDay({ hour: { currentKmh: 3 } });
  day.hours[5].currentKmh = 0.5; // 13:00
  day.hours[6].currentKmh = 0.5; // 14:00
  expect(bestWindow(day.hours)).toMatchObject({ start: 13, end: 15 });
});

test('with equal current, the window nearest noon wins', () => {
  const day = makeDay({ hour: { currentKmh: 1 } });
  expect(bestWindow(day.hours)).toMatchObject({ start: 11, end: 13 });
});

test('slack when sea level barely changes in the window', () => {
  const day = makeDay({ hour: { currentKmh: 1 } });
  day.hours.forEach((h, i) => { h.seaLevel = i * 0.2; }); // rising fast everywhere
  day.hours[3].seaLevel = 0.62; day.hours[4].seaLevel = 0.63; // 11:00-12:00 nearly flat
  day.hours[3].currentKmh = 0.2; day.hours[4].currentKmh = 0.2;
  expect(bestWindow(day.hours)).toEqual({ start: 11, end: 13, slack: true });
});
