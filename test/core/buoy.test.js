import { test, expect } from 'vitest';
import { readingFrom, parseBuoys, mergeReadings, readingMs, latestReading } from '../../src/core/buoy.js';
import { obs, buoyFile, dayReadings } from '../helpers/buoyFixture.js';

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
