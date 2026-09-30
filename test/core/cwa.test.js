import { test, expect } from 'vitest';
import { dirTextToDeg, issuedAt, extractArea, areaSeries, hourlyFromCwa, applyCoastal } from '../../src/core/cwa.js';
import { cwaLocation, cwaFile, dayTimes } from '../helpers/cwaFixture.js';
import { makeDay } from '../helpers/makeDay.js';

const SENT = '2026-09-30T06:55:58+08:00';
const series = (v) => areaSeries(cwaLocation('x', dayTimes('2026-09-30'), v));

test('compass words become degrees; a trailing 風 is fine; anything else is no data', () => {
  expect(['偏北', '東北', '偏東', '東南', '偏南', '西南', '偏西', '西北'].map(dirTextToDeg)).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
  expect(dirTextToDeg('偏西風')).toBe(270);
  expect(dirTextToDeg('-')).toBeNull();
  expect(dirTextToDeg(undefined)).toBeNull();
});

test('finds one area in the whole file and reads when the file was sent', () => {
  const text = cwaFile(SENT, [
    cwaLocation('恆春鎮沿海', dayTimes('2026-09-30'), { wave: '1.2' }),
    cwaLocation('琉球鄉_南方沿海', dayTimes('2026-09-30')),
  ]);
  expect(issuedAt(text)).toBe(SENT);
  expect(extractArea(text, '恆春鎮沿海').LocationName).toBe('恆春鎮沿海');
  expect(extractArea(text, '恆春鎮沿海').WeatherElement.find((e) => e.ElementName === '浪高').Time[0].ElementValue.WaveHeight).toBe('1.2');
  expect(extractArea(text, '琉球鄉_南方沿海').LocationName).toBe('琉球鄉_南方沿海');
  expect(extractArea(text, '琉球鄉_北方沿海')).toBeNull();
  expect(issuedAt('{}')).toBeNull();
});

test('areaSeries: one row per time with numbers and degrees; None and - are no data', () => {
  const rows = series();
  expect(rows).toHaveLength(5);
  expect(rows[0]).toEqual({ time: '2026-09-30T06:00', windKmh: 9.3, windDir: 270, cloud: 40, waveH: 0.6, waveDir: 45, waveT: 8.5, currentKmh: 1.1, currentDir: 0 });
  const [bad] = series({ wave: 'None', curDir: '-' });
  expect(bad.waveH).toBeNull();
  expect(bad.currentDir).toBeNull();
});

test('08..16 from the 3-hourly points: numbers in between, exact on the hour', () => {
  const hours = hourlyFromCwa(series({ wave: ['0.3', '0.6', '0.9', '1.2', '1.5'] }), '2026-09-30');
  expect(hours.map((h) => h.hour)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16]);
  expect(hours[0].waveH).toBeCloseTo(0.5, 6); // 06 → 0.3, 09 → 0.6: 08 is two thirds of the way
  expect(hours[1].waveH).toBeCloseTo(0.6, 6);
  expect(hours[8].waveH).toBeCloseTo(1.3, 6); // 15 → 1.2, 18 → 1.5
});

test('directions take the nearer point', () => {
  const hours = hourlyFromCwa(series({ curDir: ['偏北', '偏東', '偏南', '偏西', '西北'] }), '2026-09-30');
  // 06 偏北, 09 偏東, 12 偏南, 15 偏西, 18 西北
  expect(hours.map((h) => h.currentDir)).toEqual([90, 90, 90, 180, 180, 180, 270, 270, 270]);
});

test('a missing point or value, or another day → null (the whole day falls back)', () => {
  const s = series();
  expect(hourlyFromCwa(s.filter((p) => !p.time.endsWith('18:00')), '2026-09-30')).toBeNull();
  expect(hourlyFromCwa(series({ wave: ['0.3', 'None', '0.9', '1.2', '1.5'] }), '2026-09-30')).toBeNull();
  expect(hourlyFromCwa(s, '2026-10-01')).toBeNull();
});

test('applyCoastal swaps the 8 sea and wind fields, keeps water temperature and tide', () => {
  const day = makeDay({ date: '2026-09-30', hour: { sst: 28, seaLevel: 0.4 } });
  const out = applyCoastal(day, { issuedAt: SENT, series: series({ wave: '1.2' }) });
  expect(out.coastalAt).toBe(SENT);
  expect(out.hours[0]).toMatchObject({ hour: 8, waveH: 1.2, waveT: 8.5, waveDir: 45, currentKmh: 1.1, currentDir: 0, windKmh: 9.3, windDir: 270, cloud: 40, sst: 28, seaLevel: 0.4 });
  expect(out.pastWaves).toBe(day.pastWaves);
  expect(day.hours[0].waveH).toBe(0.3); // the input is not changed
});

test('applyCoastal leaves the day alone without usable coastal data', () => {
  const day = makeDay({ date: '2026-09-30' });
  expect(applyCoastal(day, null)).toBe(day);
  expect(applyCoastal(day, undefined)).toBe(day);
  expect(applyCoastal(day, { issuedAt: SENT, series: [] })).toBe(day);
  expect(applyCoastal(null, { issuedAt: SENT, series: series() })).toBeNull();
});

test('hourlyFromCwa works without Array.prototype.findLast (older Safari / Chrome)', () => {
  const orig = Array.prototype.findLast;
  delete Array.prototype.findLast;
  try {
    expect(hourlyFromCwa(series(), '2026-09-30')).toHaveLength(9);
  } finally {
    Array.prototype.findLast = orig;
  }
});

test('applyCoastal never throws on malformed series', () => {
  const day = makeDay({ date: '2026-09-30' });
  expect(applyCoastal(day, { issuedAt: SENT, series: [null] })).toBe(day);
});
