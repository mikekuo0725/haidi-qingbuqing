import { test, expect } from 'vitest';
import { knots, currentSummary } from '../../src/ui/format.js';

test('knots(0.97) displays as 0.97 節 with 2 decimals', () => {
  expect(knots(0.97)).toBe('0.97 節');
});

test('knots(1) displays as 1.00 節 with 2 decimals', () => {
  expect(knots(1)).toBe('1.00 節');
});

test('knots(1.234) rounds to 1.23 節', () => {
  expect(knots(1.234)).toBe('1.23 節');
});

test('knots(0) displays as 0.00 節', () => {
  expect(knots(0)).toBe('0.00 節');
});

test('currentSummary is the strongest-current line', () => {
  const s = { currentKn: 0.8123, currentToDeg: 135, currentLevel: 'yellow' };
  expect(currentSummary(s)).toBe('0.81 節 → 往東南 🟡 注意');
});
