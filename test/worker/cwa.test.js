import { test, expect } from 'vitest';
import { coastalUrl, fetchCoastal, mergeSeries } from '../../worker/src/cwa.js';
import { cwaLocation, cwaFile, dayTimes } from '../helpers/cwaFixture.js';

const SENT = '2026-09-30T06:55:58+08:00';
const file = cwaFile(SENT, [
  cwaLocation('恆春鎮沿海', dayTimes('2026-09-30'), { wave: '1.2' }),
  cwaLocation('琉球鄉_南方沿海', dayTimes('2026-09-30')),
]);
const spots = [
  { id: 'a', cwaArea: '琉球鄉_南方沿海' },
  { id: 'b', cwaArea: '恆春鎮沿海' },
  { id: 'c', cwaArea: '恆春鎮沿海' },
  { id: 'd' },                       // a spot abroad: no cwaArea
  { id: 'e', cwaArea: '改了名字的區' }, // CWA renamed an area
];

test('one download serves every spot that names an area', async () => {
  const urls = [];
  const out = await fetchCoastal(spots, 'KEY', async (u) => { urls.push(u); return new Response(file); });
  expect(urls).toEqual([coastalUrl('KEY')]);
  expect(coastalUrl('KEY')).toBe('https://opendata.cwa.gov.tw/fileapi/v1/opendataapi/F-D0047-095?Authorization=KEY&format=JSON');
  expect(Object.keys(out).sort()).toEqual(['a', 'b', 'c']);
  expect(out.b.issuedAt).toBe(SENT);
  expect(out.b.series[0].waveH).toBe(1.2);
  expect(out.a.series).toHaveLength(5);
});

test('a CWA error throws, and the message never holds the key', async () => {
  const err = await fetchCoastal(spots, 'SECRET-KEY', async () => new Response('no', { status: 401 })).catch((e) => e);
  expect(err.message).toBe('CWA 401');
  expect(err.message).not.toContain('SECRET-KEY');
});

test("mergeSeries keeps this morning's earlier points when a later issue starts at noon", () => {
  const p = (time, waveH) => ({ time, waveH });
  const old = [p('2026-09-29T18:00', 1), p('2026-09-30T06:00', 2), p('2026-09-30T09:00', 3), p('2026-09-30T12:00', 4)];
  const fresh = [p('2026-09-30T12:00', 40), p('2026-09-30T15:00', 50)];
  expect(mergeSeries(old, fresh)).toEqual([p('2026-09-30T06:00', 2), p('2026-09-30T09:00', 3), p('2026-09-30T12:00', 40), p('2026-09-30T15:00', 50)]);
  expect(mergeSeries(null, fresh)).toBe(fresh);
  expect(mergeSeries(old, [])).toEqual([]);
});
