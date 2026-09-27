import { test, expect } from 'vitest';
import { currentLevel, assessSafety, detectUpwelling, daytimeSst } from '../../src/core/safety.js';
import { makeDay } from '../helpers/makeDay.js';

const safety = { currentYellowKn: 0.5, currentRedKn: 1.0, waveRedM: 1.5 };
const spot = { safety };

test('current level boundaries', () => {
  expect(currentLevel(0.49, safety)).toBe('green');
  expect(currentLevel(0.5, safety)).toBe('yellow');
  expect(currentLevel(0.99, safety)).toBe('yellow');
  expect(currentLevel(1.0, safety)).toBe('red');
});

test('assessSafety uses the strongest daytime current and converts km/h to knots', () => {
  const day = makeDay({ hour: { currentKmh: 1.852 * 0.3 } });
  day.hours[4].currentKmh = 1.852 * 1.1;
  day.hours[4].currentDir = 45;
  const s = assessSafety(day, spot);
  expect(s.currentKn).toBeCloseTo(1.1);
  expect(s.currentToDeg).toBe(45);
  expect(s.currentLevel).toBe('red');
  expect(s.level).toBe('red');
});

test('big waves make the day red even with weak current', () => {
  const day = makeDay({ hour: { waveH: 1.8, currentKmh: 0.2 } });
  const s = assessSafety(day, spot);
  expect(s.waveRed).toBe(true);
  expect(s.level).toBe('red');
});

test('upwelling when SST is 2°C below the previous 3 days', () => {
  expect(detectUpwelling(makeDay({ hour: { sst: 26 }, sstPrev3: 28 }))).toBe(true);
  expect(detectUpwelling(makeDay({ hour: { sst: 27 }, sstPrev3: 28 }))).toBe(false);
  expect(detectUpwelling(makeDay({ sstPrev3: null }))).toBe(false);
});

test('daytimeSst returns mean SST filtering out nulls', () => {
  const day = makeDay({ hour: { sst: 25 } });
  day.hours[3].sst = null;
  day.hours[5].sst = 29;
  expect(daytimeSst(day)).toBeCloseTo((25 * 7 + 29) / 8);
});

test('daytimeSst returns null when all SST values are null', () => {
  const day = makeDay({ hour: { sst: null } });
  expect(daytimeSst(day)).toBe(null);
});
