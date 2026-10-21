import { test, expect } from 'vitest';
import { readingFrom, parseBuoys, mergeReadings, readingMs, latestReading, applyBuoy } from '../../src/core/buoy.js';
import { pastWaveFactor } from '../../src/core/factors.js';
import { SPOTS } from '../../src/data/spots/index.js';
import { obs, buoyFile, dayReadings } from '../helpers/buoyFixture.js';
import { makeDay } from '../helpers/makeDay.js';

const at = (time) => readingMs(time);

test('one buoy row becomes numbers', () => {
  expect(readingFrom(obs({ time: '2026-09-30T13:00' }))).toEqual({
    time: '2026-09-30T13:00', waveH: 0.3, waveT: 4, waveDir: 200, sst: 28.5, currentKn: 0.5, currentToDeg: 210,
  });
});

test('"None", empty, "-" and out-of-range values become null', () => {
  const r = readingFrom(obs({ time: '2026-09-30T13:00', waveH: 'None', waveT: '', waveDir: '400', sst: '-', kn: 'None', toDeg: 'None' }));
  expect(r).toEqual({ time: '2026-09-30T13:00', waveH: null, waveT: null, waveDir: null, sst: null, currentKn: null, currentToDeg: null });
});

test('a row without current layers or other elements still parses to nulls', () => {
  expect(readingFrom({ DateTime: '2026-09-30T13:00:00+08:00', WeatherElements: { WaveHeight: '0.5' } }))
    .toEqual({ time: '2026-09-30T13:00', waveH: 0.5, waveT: null, waveDir: null, sst: null, currentKn: null, currentToDeg: null });
  expect(readingFrom({}).time).toBeNull();
});

test('parseBuoys sorts each station by time and drops rows without a time', () => {
  const file = buoyFile({
    '46714D': [obs({ time: '2026-09-30T13:00' }), obs({ time: '2026-09-29T01:00' }), { WeatherElements: {} }],
    '46759A': [],
  });
  const out = parseBuoys(file);
  expect(out['46714D'].map((r) => r.time)).toEqual(['2026-09-29T01:00', '2026-09-30T13:00']);
  expect(out['46759A']).toEqual([]);
  expect(parseBuoys({})).toEqual({});
  expect(parseBuoys(null)).toEqual({});
});

test('mergeReadings: fresh wins on the same hour, older than keepFrom is dropped, result sorted', () => {
  const old = [{ time: '2026-09-25T10:00', waveH: 9 }, { time: '2026-09-29T10:00', waveH: 1 }, { time: '2026-09-29T11:00', waveH: 1 }];
  const fresh = [{ time: '2026-09-29T12:00', waveH: 3 }, { time: '2026-09-29T11:00', waveH: 2 }];
  expect(mergeReadings(old, fresh, '2026-09-26')).toEqual([
    { time: '2026-09-29T10:00', waveH: 1 }, { time: '2026-09-29T11:00', waveH: 2 }, { time: '2026-09-29T12:00', waveH: 3 },
  ]);
  expect(mergeReadings(undefined, fresh, '2026-09-26').map((r) => r.time)).toEqual(['2026-09-29T11:00', '2026-09-29T12:00']);
  expect(mergeReadings(old, undefined, '2026-09-26')).toHaveLength(2);
  expect(mergeReadings(null, null, '2026-09-26')).toEqual([]);
});

test('mergeReadings: an all-null fresh row never wipes an old reading (the API sends its oldest hour empty)', () => {
  const full = { time: '2026-09-29T10:00', waveH: 1, waveT: 5, waveDir: 200, sst: 27, currentKn: 1, currentToDeg: 90 };
  const empty = { time: '2026-09-29T10:00', waveH: null, waveT: null, waveDir: null, sst: null, currentKn: null, currentToDeg: null };
  expect(mergeReadings([full], [empty], '2026-09-26')).toEqual([full]);
  expect(mergeReadings([empty], [full], '2026-09-26')).toEqual([full]);
});

test('mergeReadings: same hour merges field by field, a fresh value wins, a fresh null keeps the old one', () => {
  const old = { time: '2026-09-29T10:00', waveH: 1, waveT: 5, sst: 27 };
  const fresh = { time: '2026-09-29T10:00', waveH: 2, waveT: 5, sst: null };
  expect(mergeReadings([old], [fresh], '2026-09-26')).toEqual([{ time: '2026-09-29T10:00', waveH: 2, waveT: 5, sst: 27 }]);
});

test('mergeReadings: currentKn and currentToDeg stay from one reading', () => {
  const t = '2026-09-29T10:00';
  const old = { time: t, currentKn: 1, currentToDeg: 90 };
  expect(mergeReadings([old], [{ time: t, currentKn: 2, currentToDeg: null }], '2026-09-26')[0]).toMatchObject({ currentKn: 1, currentToDeg: 90 });
  expect(mergeReadings([old], [{ time: t, currentKn: null, currentToDeg: 10 }], '2026-09-26')[0]).toMatchObject({ currentKn: 1, currentToDeg: 90 });
  expect(mergeReadings([old], [{ time: t, currentKn: 2, currentToDeg: 10 }], '2026-09-26')[0]).toMatchObject({ currentKn: 2, currentToDeg: 10 });
});

test('readingMs reads the key as Taiwan time', () => {
  expect(readingMs('2026-09-30T13:00')).toBe(Date.UTC(2026, 8, 30, 5, 0));
});

test('latestReading: newest row; each item looked up to 3 hours back; current speed and direction from one row', () => {
  const rows = [
    { time: '2026-09-30T10:00', waveH: 0.9, waveT: 5, waveDir: 200, sst: 27, currentKn: 1.2, currentToDeg: 90 },
    { time: '2026-09-30T11:00', waveH: 0.4, waveT: 4, waveDir: 200, sst: null, currentKn: 0.8, currentToDeg: null },
    { time: '2026-09-30T13:00', waveH: null, waveT: null, waveDir: null, sst: 29, currentKn: null, currentToDeg: null },
  ];
  expect(latestReading(rows, at('2026-09-30T14:10'))).toEqual({ time: '2026-09-30T13:00', waveH: 0.4, sst: 29, currentKn: 1.2, currentToDeg: 90 });
});

test('latestReading: a value more than 3 hours before the newest row is not used', () => {
  const rows = [
    { time: '2026-09-30T09:00', waveH: 0.5, sst: 27, currentKn: 1, currentToDeg: 90 },
    { time: '2026-09-30T13:00', waveH: null, sst: 29, currentKn: null, currentToDeg: null },
  ];
  expect(latestReading(rows, at('2026-09-30T13:30'))).toEqual({ time: '2026-09-30T13:00', waveH: null, sst: 29, currentKn: null, currentToDeg: null });
});

test('latestReading: nothing when the newest row is over 3 hours old, the list is empty, or every item is missing', () => {
  const rows = dayReadings('2026-09-30', 11); // 00:00 .. 10:00
  expect(latestReading(rows, at('2026-09-30T13:01'))).toBeNull();
  expect(latestReading(rows, at('2026-09-30T13:00'))).not.toBeNull();
  expect(latestReading([], at('2026-09-30T13:00'))).toBeNull();
  expect(latestReading(undefined, 0)).toBeNull();
  const empty = [{ time: '2026-09-30T13:00', waveH: null, waveT: null, waveDir: null, sst: null, currentKn: null, currentToDeg: null }];
  expect(latestReading(empty, at('2026-09-30T13:30'))).toBeNull();
});

test('applyBuoy: each finished past day with ≥12 full wave hours uses the buoy; others keep Open-Meteo', () => {
  const day = makeDay({ date: '2026-09-30' }); // pastWaves = 3 × 24 calm Open-Meteo hours
  const readings = [
    ...dayReadings('2026-09-27', 24, { waveH: 2 }), // day-3: 24 hours → buoy
    ...dayReadings('2026-09-28', 11, { waveH: 2 }), // day-2: 11 hours → Open-Meteo
    ...dayReadings('2026-09-29', 12, { waveH: 2 }), // day-1: 12 hours → buoy
  ];
  const out = applyBuoy(day, readings, '2026-09-30');
  expect(out.pastWaves[0]).toHaveLength(12);
  expect(out.pastWaves[0][0]).toEqual({ waveH: 2, waveT: 4, waveDir: 200 });
  expect(out.pastWaves[1]).toBe(day.pastWaves[1]);
  expect(out.pastWaves[2]).toHaveLength(24);
  expect(out.hours).toBe(day.hours);
  expect(day.pastWaves[0][0].waveH).toBe(0.3); // the input day is not changed
});

test('applyBuoy: an hour missing height, period or direction does not count', () => {
  const day = makeDay({ date: '2026-09-30' });
  const readings = [...dayReadings('2026-09-29', 11, { waveH: 2 }), { time: '2026-09-29T20:00', waveH: 2, waveT: null, waveDir: 200 }];
  expect(applyBuoy(day, readings, '2026-09-30')).toBe(day);
});

test('applyBuoy: today is not finished yet, so tomorrow keeps Open-Meteo for day-1', () => {
  const tomorrow = makeDay({ date: '2026-10-01' });
  expect(applyBuoy(tomorrow, dayReadings('2026-09-30', 24, { waveH: 2 }), '2026-09-30')).toBe(tomorrow);
});

test('applyBuoy: no day or no readings → unchanged', () => {
  const day = makeDay({ date: '2026-09-30' });
  expect(applyBuoy(null, dayReadings('2026-09-29'), '2026-09-30')).toBeNull();
  expect(applyBuoy(day, undefined, '2026-09-30')).toBe(day);
  expect(applyBuoy(day, [], '2026-09-30')).toBe(day);
});

test('big buoy waves yesterday lower the 前幾天的浪 factor', () => {
  const day = makeDay({ date: '2026-09-30' });
  const out = applyBuoy(day, dayReadings('2026-09-29', 24, { waveH: 2, waveT: 8, waveDir: 270 }), '2026-09-30');
  const zone = SPOTS.xiaoliuqiu.zones.find((z) => z.id === 'west');
  expect(pastWaveFactor(out.pastWaves, zone)).toBeLessThan(pastWaveFactor(day.pastWaves, zone));
});
