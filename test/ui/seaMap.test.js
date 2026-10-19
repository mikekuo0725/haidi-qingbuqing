import { test, expect } from 'vitest';
import { renderSeaMap, currentStrip, defaultHourIndex } from '../../src/ui/seaMap.js';
import { SITE_LAYERS } from '../../src/data/spots/sites/index.js';
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
  expect(html).toContain('© OpenStreetMap');
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

test('on today the slider starts at the current hour, if it is a dive hour', () => {
  const ten = forecast.currents.findIndex((c) => c.hour === 10);
  expect(defaultHourIndex(forecast, 10)).toBe(ten);
  expect(renderSeaMap({ spot, map, forecast, nowHour: 10 })).toContain(`value="${ten}"`);
  expect(defaultHourIndex(forecast, 6)).toBe(defaultHourIndex(forecast)); // before the first dive hour: the best hour
  expect(defaultHourIndex(forecast, 20)).toBe(defaultHourIndex(forecast));
  expect(renderSeaMap({ spot, map, forecast, hourIndex: 2, nowHour: 10 })).toContain('value="2"'); // the user's choice wins
});

test('a chosen hour is kept, and clamped to the day', () => {
  expect(renderSeaMap({ spot, map, forecast, hourIndex: 2 })).toContain('value="2"');
  expect(renderSeaMap({ spot, map, forecast, hourIndex: 99 })).toContain('value="8"');
});

test('the current strip turns the arrow to where the water flows, coloured by strength', () => {
  const b = currentStrip({ hour: 10, kn: 0.16, toDeg: 225, level: 'green' });
  expect(b).toContain('rotate(225)');
  expect(b).toContain('往西南');
  expect(b).toContain('0.16 節');
  expect(b).toContain('class="cmap-arrow gr"');
  expect(b).toContain('整片海的大概流向');
  expect(currentStrip({ hour: 10, kn: 1.3, toDeg: 0, level: 'red' })).toContain('class="cmap-arrow re"');
});

test('shows the strongest current of the day under the slider', () => {
  expect(renderSeaMap({ spot, map, forecast })).toContain('這天最強');
});

test('the current strip sits under the map, not on it', () => {
  const html = renderSeaMap({ spot, map, forecast });
  expect(html.indexOf('class="cmap-now"')).toBeGreaterThan(html.indexOf('</svg>'));
  expect(html).not.toContain('cmap-badge');
});

test('with dive sites: zones are coloured sea with dashed borders, no zone circles', () => {
  const layer = SITE_LAYERS.xiaoliuqiu;
  const html = renderSeaMap({ spot, map, layer, forecast });
  for (const z of forecast.zones) {
    expect(html).toMatch(new RegExp(`class="cmap-region ${LIGHT[z.light].cls}" data-mapzone="${z.zoneId}"`));
  }
  expect(html.match(/class="cmap-border"/g)).toHaveLength(layer.bounds.length);
  expect(html).not.toContain('r="10"');
  for (const s of layer.sites) expect(html).toContain(`>${s.name}</text>`);
  expect(html.match(/class="cmap-site"/g)).toHaveLength(layer.sites.length);
});

test('tapping a dive site, its name or its zone opens that zone', () => {
  const html = renderSeaMap({ spot, map, layer: SITE_LAYERS.xiaoliuqiu, forecast });
  expect(html).toMatch(/class="cmap-site" data-mapzone="north"/);
  expect(html).toMatch(/class="cmap-site-name" data-mapzone="north"[^>]*>花瓶岩</);
  expect(html).toMatch(/class="cmap-zone-name" data-mapzone="north"[^>]*>北邊</);
});
