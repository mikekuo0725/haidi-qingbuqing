import { test, expect } from 'vitest';
import { taipeiDate, addDays } from '../../src/core/time.js';

test('taipeiDate uses UTC+8', () => {
  const ms = Date.UTC(2026, 8, 27, 17, 0); // 2026-09-27 17:00 UTC = 09-28 01:00 Taipei
  expect(taipeiDate(ms)).toBe('2026-09-28');
  expect(taipeiDate(ms, 1)).toBe('2026-09-29');
});

test('addDays crosses month end', () => {
  expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
  expect(addDays('2026-10-01', -3)).toBe('2026-09-28');
});
