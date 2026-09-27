import { test, expect } from 'vitest';
import { windFactor, cloudFactor, tideFactor, riverFactor, currentDirFactor, currentSpeedFactor } from '../../src/core/factors.js';
import { makeDay } from '../helpers/makeDay.js';

const zone = (over = {}) => ({ id: 'w', facing: 270, shelter: 'open', bottom: 'mixed', riverImpact: 0.3, ...over });
const spot = { riverBearing: 23 };

test('onshore wind hurts, offshore wind helps a little', () => {
  const onshore = windFactor(makeDay({ hour: { windKmh: 30, windDir: 270 } }).hours, zone());
  const offshore = windFactor(makeDay({ hour: { windKmh: 20, windDir: 90 } }).hours, zone());
  expect(onshore).toBeCloseTo(1 - 0.006 * 20, 5);
  expect(offshore).toBeCloseTo(1.03, 5);
});

test('cloudy is a small minus, at most ×0.9', () => {
  expect(cloudFactor(makeDay({ hour: { cloud: 100 } }).hours)).toBeCloseTo(0.9);
  expect(cloudFactor(makeDay({ hour: { cloud: 0 } }).hours)).toBe(1);
});

test('tide factor is 0.92 on spring tide', () => {
  expect(tideFactor('2024-01-11')).toBe(0.92);
  expect(tideFactor('2024-01-18')).toBe(1);
});

test('heavy upstream rain hurts high riverImpact zones most', () => {
  const day = makeDay({ hour: { currentDir: 90 } }); // current flowing east: neutral-ish to river at 23°
  const east = riverFactor(200, day.hours, zone({ riverImpact: 0.8 }), spot);
  const west = riverFactor(200, day.hours, zone({ riverImpact: 0.3 }), spot);
  expect(east).toBeLessThan(west);
  expect(riverFactor(0, day.hours, zone({ riverImpact: 0.8 }), spot)).toBe(1);
});

test('current flowing from the river mouth makes river effect heavier', () => {
  const fromRiver = makeDay({ hour: { currentDir: 203 } }).hours; // heading SSW, i.e. away from mouth at 23°, toward the island
  const toRiver = makeDay({ hour: { currentDir: 23 } }).hours;
  const z = zone({ riverImpact: 0.8 });
  expect(riverFactor(150, fromRiver, z, spot)).toBeLessThan(riverFactor(150, toRiver, z, spot));
});

test('current from offshore is a small plus', () => {
  expect(currentDirFactor(makeDay({ hour: { currentDir: 23 } }).hours, spot)).toBeCloseTo(1.05);
  expect(currentDirFactor(makeDay({ hour: { currentDir: 203 } }).hours, spot)).toBe(1);
});

test('current speed: middle is a plus, strong hurts sand but not rock', () => {
  const mid = makeDay({ hour: { currentKmh: 0.5 * 1.852 } }).hours;
  const strong = makeDay({ hour: { currentKmh: 1.2 * 1.852 } }).hours;
  const slow = makeDay({ hour: { currentKmh: 0.1 * 1.852 } }).hours;
  expect(currentSpeedFactor(mid, zone())).toBe(1.05);
  expect(currentSpeedFactor(strong, zone({ bottom: 'sand' }))).toBe(0.85);
  expect(currentSpeedFactor(strong, zone({ bottom: 'rock' }))).toBe(1);
  expect(currentSpeedFactor(slow, zone())).toBe(1);
});
