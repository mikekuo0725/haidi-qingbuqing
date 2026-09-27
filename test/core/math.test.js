import { test, expect } from 'vitest';
import { clamp, angleDiff, alignment, exposure, distanceKm, bearingText, kmhToKnots, median, mean } from '../../src/core/math.js';

test('clamp', () => {
  expect(clamp(5, 0, 1)).toBe(1);
  expect(clamp(-1, 0, 1)).toBe(0);
  expect(clamp(0.5, 0, 1)).toBe(0.5);
});

test('angleDiff wraps around 360', () => {
  expect(angleDiff(350, 10)).toBe(20);
  expect(angleDiff(10, 350)).toBe(20);
  expect(angleDiff(0, 180)).toBe(180);
  expect(angleDiff(270, 270)).toBe(0);
});

test('alignment and exposure', () => {
  expect(alignment(270, 270)).toBeCloseTo(1);
  expect(alignment(90, 270)).toBeCloseTo(-1);
  expect(exposure(270, 270)).toBeCloseTo(1);
  expect(exposure(0, 270)).toBeCloseTo(0);
  expect(exposure(90, 270)).toBe(0);
});

test('distanceKm: 0.1 degree latitude is about 11.1 km', () => {
  expect(distanceKm([22.3, 120.3], [22.4, 120.3])).toBeCloseTo(11.12, 1);
});

test('bearingText', () => {
  expect(bearingText(0)).toBe('北');
  expect(bearingText(44)).toBe('東北');
  expect(bearingText(90)).toBe('東');
  expect(bearingText(200)).toBe('南');
  expect(bearingText(359)).toBe('北');
});

test('kmhToKnots', () => {
  expect(kmhToKnots(1.852)).toBeCloseTo(1);
});

test('median and mean', () => {
  expect(median([3, 1, 2])).toBe(2);
  expect(median([1, 2, 3, 4])).toBe(2.5);
  expect(median([])).toBeNull();
  expect(mean([1, 2, 3])).toBe(2);
  expect(mean([])).toBeNull();
});
