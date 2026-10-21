import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { isShip, parseRecordTime, parseShips, inBox, shipsForBox, shipLook, shipTitle, clockText } from '../../src/core/ships.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/ais-xiaoliuqiu.json', import.meta.url), 'utf8'));
const XLQ = [[22.31, 120.335], [22.37, 120.405]];

test('real ships are kept', () => {
  expect(isShip('416006379', 'DISCOVER NO3        ')).toBe(true);
  expect(isShip('416000985', 'MING TSAIR CHYUU 16')).toBe(true);
  expect(isShip('416069815', 'CTR PT1762')).toBe(true);
});

test('fishing-net and marker buoys are dropped', () => {
  const buoys = [
    ['444661001', 'NETFISH466101   100%'], ['995156001', 'CT3-5156-01-99%'], ['971550001', 'XINTAI 1-97%'],
    ['912000002', 'BUOY02-99%'], ['994164662', 'BUOY35429-02      7V'], ['168888824', '168888824         9V'],
    ['994164669', '99416466990%'], ['617400003', '6174-3 20%'], ['241230032', 'CT1-3279-2- 50%'],
  ];
  for (const [mmsi, name] of buoys) expect(isShip(mmsi, name), name).toBe(false);
});

test('each rule drops on its own', () => {
  expect(isShip('99416466', 'GOOD NAME')).toBe(false); // 8 digits
  expect(isShip('4160063790', 'GOOD NAME')).toBe(false); // 10 digits
  expect(isShip('116006379', 'GOOD NAME')).toBe(false); // starts with 1
  expect(isShip('816006379', 'GOOD NAME')).toBe(false); // starts with 8
  expect(isShip('9160063xx', 'GOOD NAME')).toBe(false);
  expect(isShip('416006379', 'A 50%')).toBe(false);
  expect(isShip('416006379', 'my buoy 3')).toBe(false); // case-insensitive
  expect(isShip('416006379', 'netfish 3')).toBe(false);
  expect(isShip('416006379', 'SOMETHING 7V   ')).toBe(false); // trailing spaces do not hide the V
  expect(isShip('416006379', 'VIVA')).toBe(true); // a name ending in V, but not <digit>V
  expect(isShip('416006379', undefined)).toBe(true); // no name is fine
});

test('Record_Time is Taiwan time', () => {
  expect(parseRecordTime('2026/10/21 11:19:08')).toBe(Date.UTC(2026, 9, 21, 3, 19, 8));
  expect(parseRecordTime('garbage')).toBeNull();
  expect(parseRecordTime(undefined)).toBeNull();
});

test('parseShips keeps real ships near 小琉球 and drops the buoys', () => {
  const ships = parseShips(fixture, [XLQ]);
  expect(ships).toHaveLength(23);
  expect(fixture.features).toHaveLength(73); // 50 of them were buoys
  const raw = fixture.features.find((f) => f.properties.MMSI === '416006379');
  const d = ships.find((s) => s.mmsi === '416006379');
  expect(d).toEqual({ name: 'DISCOVER NO3', mmsi: '416006379', lat: expect.any(Number), lon: expect.any(Number), sog: raw.properties.SOG, cog: raw.properties.COG, time: parseRecordTime(raw.properties.Record_Time) });
  expect(d.time).toBeGreaterThan(Date.UTC(2026, 9, 21, 3, 0));
  expect(String(d.lat).split('.')[1].length).toBeLessThanOrEqual(5);
});

test('parseShips applies the union of boxes and skips bad features', () => {
  const f = (lon, lat, mmsi = '416000001') => ({ geometry: { coordinates: [lon, lat] }, properties: { ShipName: 'S ', MMSI: mmsi, SOG: 1, COG: 90, Record_Time: '2026/10/21 11:00:00' } });
  const geo = { features: [f(120.35, 22.33), f(121.5, 22.0), f(130, 30), f(120.35, 22.33, '995156001'), { properties: {} }, f(120.35, 22.33, '416000002')] };
  const ships = parseShips(geo, [XLQ, [[21.99, 121.48], [22.1, 121.645]]]);
  expect(ships.map((s) => s.mmsi)).toEqual(['416000001', '416000001', '416000002']);
  expect(parseShips(null, [XLQ])).toEqual([]);
  expect(parseShips({ features: [] }, [XLQ])).toEqual([]);
});

test('inBox and shipsForBox', () => {
  expect(inBox(XLQ, 22.33, 120.35)).toBe(true);
  expect(inBox(XLQ, 22.4, 120.35)).toBe(false);
  const ships = [{ lat: 22.33, lon: 120.35 }, { lat: 25, lon: 121 }];
  expect(shipsForBox(ships, XLQ)).toEqual([ships[0]]);
});

const MIN = 60000;
const NOW = Date.UTC(2026, 9, 21, 4, 0);
const ship = (o) => ({ name: 'A', mmsi: '416000001', lat: 22.3, lon: 120.3, sog: 0, cog: 90, time: NOW, ...o });

test('shipLook: moving at 0.5 kn or more, stopped below', () => {
  expect(shipLook(ship({ sog: 0.5 }), NOW)).toMatchObject({ moving: true, grey: false });
  expect(shipLook(ship({ sog: 0.4 }), NOW)).toMatchObject({ moving: false });
  expect(shipLook(ship({ sog: 6.9 }), NOW).minutes).toBe(0);
});

test('shipLook: grey after 10 minutes, hidden after 30', () => {
  expect(shipLook(ship({ time: NOW - 10 * MIN }), NOW).grey).toBe(false);
  expect(shipLook(ship({ time: NOW - 11 * MIN }), NOW)).toMatchObject({ grey: true, minutes: 11 });
  expect(shipLook(ship({ time: NOW - 30 * MIN }), NOW)).not.toBeNull();
  expect(shipLook(ship({ time: NOW - 31 * MIN }), NOW)).toBeNull();
  expect(shipLook(ship({ time: NOW + 2 * MIN }), NOW).minutes).toBe(0); // clock skew
});

test('shipTitle: name, speed and minutes ago', () => {
  expect(shipTitle(ship({ name: 'DISCOVER NO3', sog: 6.94, time: NOW - 3 * MIN }), NOW)).toBe('DISCOVER NO3・6.9 節・3 分鐘前');
  expect(shipTitle(ship({ name: '', mmsi: '416000001', sog: 0, time: NOW }), NOW)).toBe('416000001・0.0 節・剛剛');
});

test('clockText is Taiwan time HH:MM', () => {
  expect(clockText(Date.UTC(2026, 9, 21, 3, 5))).toBe('11:05');
  expect(clockText(Date.UTC(2026, 9, 21, 16, 30))).toBe('00:30');
});
