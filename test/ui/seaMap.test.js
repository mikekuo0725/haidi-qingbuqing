import { test, expect } from 'vitest';
import { renderSeaMap, currentBadge, defaultHourIndex } from '../../src/ui/seaMap.js';
import { LIGHT } from '../../src/ui/format.js';
import { buildForecast } from '../../src/core/forecast.js';
import { SPOTS } from '../../src/data/spots/index.js';
import { MAPS } from '../../src/data/spots/maps/index.js';
import { makeDay } from '../helpers/makeDay.js';

const spot = SPOTS.xiaoliuqiu;
const map = MAPS.xiaoliuqiu;
const NOW = Date.UTC(2024, 0, 18, 4, 0);
const make = (stale = null) => buildForecast({ spot, day: makeDay({ date: '2024-01-18' }), stale, helper: null, reports: [], now: NOW, isToday: true });
const forecast = make();

test('one dot per zone, in spot order, coloured by that zone light', () => {
  const html = renderSeaMap({ spot, map, forecast });
  expect([...html.matchAll(/data-mapzone="(\w+)"/g)].map((m) => m[1])).toEqual(spot.zones.map((z) => z.id));
  for (const z of forecast.zones) {
    expect(html).toMatch(new RegExp(`data-mapzone="${z.zoneId}"><circle [^>]*class="${LIGHT[z.light].cls}"`));
  }
  expect(html).not.toContain('data-zone=');
});

test('old weather makes every dot gray', () => {
  const html = renderSeaMap({ spot, map, forecast: make(3) });
  expect([...html.matchAll(/<circle [^>]*class="(\w+)"/g)].map((m) => m[1])).toEqual(spot.zones.map(() => 'gy'));
});

test('draws every land shape and the note', () => {
  const html = renderSeaMap({ spot, map, forecast });
  expect(html.match(/class="cmap-land"/g)).toHaveLength(map.land.length);
  expect(renderSeaMap({ spot: SPOTS.qixing, map: MAPS.qixing, forecast })).toContain('鵝鑾鼻在北邊約 16 公里');
});

test('the slider starts at the best dive hour', () => {
  const i = defaultHourIndex(forecast);
  expect(forecast.currents[i].hour).toBe(forecast.best.start);
  const html = renderSeaMap({ spot, map, forecast });
  expect(html).toContain(`type="range" min="0" max="8" step="1" value="${i}"`);
  expect(html).toContain(`<span class="cmap-time">${String(forecast.best.start).padStart(2, '0')}:00</span>`);
});

test('a chosen hour is kept, and clamped to the day', () => {
  expect(renderSeaMap({ spot, map, forecast, hourIndex: 2 })).toContain('value="2"');
  expect(renderSeaMap({ spot, map, forecast, hourIndex: 99 })).toContain('value="8"');
});

test('the badge turns the arrow to where the water flows, coloured by strength', () => {
  const b = currentBadge({ hour: 10, kn: 0.16, toDeg: 225, level: 'green' });
  expect(b).toContain('rotate(225)');
  expect(b).toContain('往西南');
  expect(b).toContain('0.16 節');
  expect(b).toContain('class="cmap-arrow gr"');
  expect(b).toContain('整片海的大概流向');
  expect(currentBadge({ hour: 10, kn: 1.3, toDeg: 0, level: 'red' })).toContain('class="cmap-arrow re"');
});

test('shows the strongest current of the day under the slider', () => {
  expect(renderSeaMap({ spot, map, forecast })).toContain('這天最強');
});
