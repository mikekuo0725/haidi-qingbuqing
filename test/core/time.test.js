import { test, expect } from 'vitest';
import { taipeiDate, addDays, taipeiHour, openingDayIndex } from '../../src/core/time.js';

test('taipeiDate uses UTC+8', () => {
  const ms = Date.UTC(2026, 8, 27, 17, 0); // 2026-09-27 17:00 UTC = 09-28 01:00 Taipei
  expect(taipeiDate(ms)).toBe('2026-09-28');
  expect(taipeiDate(ms, 1)).toBe('2026-09-29');
});

test('addDays crosses month end', () => {
  expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
  expect(addDays('2026-10-01', -3)).toBe('2026-09-28');
});

const taipei = (h, m = 0) => Date.UTC(2026, 9, 19, h - 8, m); // 2026-10-19 h:m Taipei

test('taipeiHour uses UTC+8', () => {
  expect(taipeiHour(taipei(9, 30))).toBe(9);
  expect(taipeiHour(Date.UTC(2026, 9, 19, 17, 0))).toBe(1); // 01:00 the next day in Taipei
});

test('the app opens on today before 15:00 Taipei and on tomorrow from 15:00', () => {
  expect(openingDayIndex(taipei(0, 30))).toBe(0);
  expect(openingDayIndex(taipei(14, 59))).toBe(0);
  expect(openingDayIndex(taipei(15, 0))).toBe(1);
  expect(openingDayIndex(taipei(23, 59))).toBe(1);
});
