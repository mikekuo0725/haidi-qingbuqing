import { test, expect } from 'vitest';
import { spotPins, sitePins, layerFor } from '../../src/core/mapPins.js';
import { SPOTS, SPOT_LIST } from '../../src/data/spots/index.js';
import { SITE_LAYERS } from '../../src/data/spots/sites/index.js';

const sum = (meters, light, zoneLights = {}) => ({ meters, light, flowToDeg: 90, zoneLights });

test('spot with no data that day is a grey pin without arrow', () => {
  const pins = spotPins(SPOT_LIST, { xiaoliuqiu: [null, null, null] }, 0);
  const p = pins.find((x) => x.id === 'xiaoliuqiu');
  expect(p).toMatchObject({ light: 'gray', label: '小琉球', flowToDeg: null });
  expect(p.lat).toBe(SPOTS.xiaoliuqiu.center[0]);
  expect(pins).toHaveLength(SPOT_LIST.length); // spots missing from summaries are grey too
});

test('pin label rounds metres', () => {
  const p = spotPins([SPOTS.xiaoliuqiu], { xiaoliuqiu: [sum(14.6, 'green')] }, 0)[0];
  expect(p).toMatchObject({ label: '小琉球 15m', light: 'green', flowToDeg: 90 });
});

test('site light follows its zone', () => {
  const pins = sitePins(SITE_LAYERS, { xiaoliuqiu: [sum(10, 'green', { north: 'purple', west: 'red' })] }, 0);
  expect(pins.find((p) => p.name === '花瓶岩')).toMatchObject({ spotId: 'xiaoliuqiu', zoneId: 'north', light: 'purple' });
  expect(pins.find((p) => p.name === '杉福漁港').light).toBe('red');
  expect(pins.find((p) => p.spotId === 'kenting').light).toBe('gray'); // no summary → grey
});

test('layerFor switches at 9.5 and labels at 11.5', () => {
  expect(layerFor(9.4)).toEqual({ spots: true, sites: false, labels: false });
  expect(layerFor(9.5).sites).toBe(true);
  expect(layerFor(9.5).spots).toBe(false);
  expect(layerFor(11.4).labels).toBe(false);
  expect(layerFor(11.5).labels).toBe(true);
});
