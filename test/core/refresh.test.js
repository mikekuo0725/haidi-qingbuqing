import { test, expect } from 'vitest';
import { shouldAutoRefresh, isPullRefresh } from '../../src/core/refresh.js';
import { K } from '../../src/core/constants.js';

const MIN = 60000;

test('auto refresh only after the app was away long enough', () => {
  const t0 = 1_000_000;
  expect(shouldAutoRefresh(t0, t0 + (K.autoRefreshMinutes - 1) * MIN)).toBe(false);
  expect(shouldAutoRefresh(t0, t0 + K.autoRefreshMinutes * MIN)).toBe(true);
});

test('auto refresh when nothing was ever loaded', () => {
  expect(shouldAutoRefresh(null, 5)).toBe(true);
});

test('pull refresh needs the page at the top and a long enough pull', () => {
  expect(isPullRefresh({ startY: 100, endY: 100 + K.pullRefreshPx, scrollY: 0 })).toBe(true);
  expect(isPullRefresh({ startY: 100, endY: 100 + K.pullRefreshPx - 1, scrollY: 0 })).toBe(false);
  expect(isPullRefresh({ startY: 100, endY: 400, scrollY: 30 })).toBe(false); // not at the top
  expect(isPullRefresh({ startY: 400, endY: 100, scrollY: 0 })).toBe(false); // swiped up
});
