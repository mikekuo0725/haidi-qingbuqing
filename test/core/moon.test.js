import { test, expect } from 'vitest';
import { isSpringTide } from '../../src/core/moon.js';

test('spring tide near new and full moon, not at quarter moon', () => {
  expect(isSpringTide('2024-01-11')).toBe(true);
  expect(isSpringTide('2024-01-25')).toBe(true);
  expect(isSpringTide('2024-01-18')).toBe(false);
});
