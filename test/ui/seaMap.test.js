import { test, expect } from 'vitest';
import { renderSeaMap, currentStrip, defaultHourIndex, updateShips, updateSeaMap, flowCanvas, windStrip } from '../../src/ui/seaMap.js';
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

test('the wind strip names where the wind comes from and turns the arrow to where it blows', () => {
  const w = windStrip({ windDir: 0, windKmh: 17.6 });
  expect(w).toContain('風 從北來 18 公里/時');
  expect(w).toContain('rotate(180)');
  expect(windStrip({ windDir: 225, windKmh: 5 })).toContain('rotate(405)');
  expect(windStrip({ windDir: 225, windKmh: 5 })).toContain('從西南來');
});

test('no wind data: the wind strip stays as a hidden node', () => {
  expect(windStrip({})).toBe('<div class="cmap-wind" hidden></div>');
  expect(windStrip({ windDir: NaN, windKmh: 3 })).toContain('hidden');
});

test('the wind strip sits under the map, after the current strip', () => {
  const html = renderSeaMap({ spot, map, forecast });
  expect(html.indexOf('class="cmap-wind"')).toBeGreaterThan(html.indexOf('class="cmap-now"'));
});

test('updateSeaMap swaps the wind strip too, and copes without one', () => {
  const wind = { outerHTML: '' };
  const nodes = { '.cmap-now': { outerHTML: '' }, '.cmap-time': { textContent: '' }, '.cmap input[type="range"]': { setAttribute() {} }, '.cmap-wind': wind };
  const c = { hour: 10, kn: 1, toDeg: 90, level: 'green', windKmh: 10, windDir: 90 };
  updateSeaMap({ querySelector: (q) => nodes[q] ?? null }, c);
  expect(wind.outerHTML).toContain('風 從東來');
  expect(() => updateSeaMap({ querySelector: (q) => (q === '.cmap-wind' ? null : nodes[q] ?? null) }, c)).not.toThrow();
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

// ---- ship layer ----
const SHIP_NOW = Date.UTC(2026, 9, 21, 4, 0);
const sh = (o) => ({ name: 'DISCOVER NO3', mmsi: '416006379', lat: 22.34, lon: 120.37, sog: 0, cog: 90, time: SHIP_NOW - 2 * 60000, ...o });
const withShips = (ships, extra = {}) => renderSeaMap({ spot, map, layer: SITE_LAYERS.xiaoliuqiu, forecast, ships: { updatedAt: SHIP_NOW, ships }, now: SHIP_NOW, ...extra });

test('a moving ship is a boat turned to its course, a stopped one is a dot', () => {
  const html = withShips([sh({ sog: 6.9, cog: 135 }), sh({ mmsi: '416000002', sog: 0.2 })]);
  expect(html).toMatch(/<path class="cmap-ship"[^>]*rotate\(135\)/);
  expect(html.match(/<circle class="cmap-ship"/g)).toHaveLength(1);
});

test('a position older than 10 minutes is grey, older than 30 minutes is not drawn', () => {
  const html = withShips([sh({ time: SHIP_NOW - 11 * 60000 }), sh({ mmsi: '416000003', time: SHIP_NOW - 31 * 60000 })]);
  expect(html.match(/cmap-ship cmap-ship-old/g)).toHaveLength(1);
  expect(html.match(/class="cmap-ship[ "]/g)).toHaveLength(1);
});

test('each ship has a title with name, speed and minutes', () => {
  expect(withShips([sh({ sog: 6.94, time: SHIP_NOW - 3 * 60000 })])).toContain('<title>DISCOVER NO3・6.9 節・3 分鐘前</title>');
});

test('ship names are escaped', () => {
  expect(withShips([sh({ name: '<b>&' })])).toContain('<title>&lt;b&gt;&amp;・');
});

test('ships are under the dive-site dots and names', () => {
  const html = withShips([sh()]);
  const g = html.indexOf('class="cmap-ships"');
  expect(g).toBeGreaterThan(html.indexOf('class="cmap-land"'));
  expect(g).toBeLessThan(html.indexOf('class="cmap-site"'));
  expect(g).toBeLessThan(html.indexOf('cmap-zone-name'));
});

test('the caption shows the Taiwan time of the fetch, and is hidden with no data', () => {
  expect(withShips([sh()])).toContain('船位：航港局 AIS 12:00・只顯示有開 AIS 的船');
  const none = renderSeaMap({ spot, map, layer: SITE_LAYERS.xiaoliuqiu, forecast });
  expect(none).toContain('class="cmap-ships"');
  expect(none).toMatch(/<div class="cmap-shipcap" hidden><\/div>/);
  expect(withShips([])).toMatch(/<div class="cmap-shipcap" hidden><\/div>/);
  expect(withShips([sh({ time: SHIP_NOW - 40 * 60000 })])).toMatch(/<div class="cmap-shipcap" hidden><\/div>/); // all too old
});

test('ships also show on the map without dive-site names', () => {
  const html = renderSeaMap({ spot, map, forecast, ships: { updatedAt: SHIP_NOW, ships: [sh()] }, now: SHIP_NOW });
  expect(html).toContain('class="cmap-ship"');
});

test('updateShips swaps only the ship layer and the caption', () => {
  const nodes = {
    g: { outerHTML: '' },
    cap: { outerHTML: '' },
  };
  const root = { querySelector: (q) => (q === '.cmap-ships' ? nodes.g : q === '.cmap-shipcap' ? nodes.cap : null) };
  updateShips(root, map.bbox, { updatedAt: SHIP_NOW, ships: [sh()] }, SHIP_NOW);
  expect(nodes.g.outerHTML).toContain('class="cmap-ships"');
  expect(nodes.g.outerHTML).toContain('cmap-ship');
  expect(nodes.cap.outerHTML).toContain('12:00');
});

test('the flow canvas sits before the svg and carries the chosen hour current', () => {
  const html = renderSeaMap({ spot, map, forecast, hourIndex: 2 });
  expect(html).toContain('class="cmap-flow"');
  expect(html.indexOf('class="cmap-flow"')).toBeLessThan(html.indexOf('<svg viewBox'));
  const c = forecast.currents[2];
  expect(html).toContain(`data-kn="${c.kn.toFixed(2)}"`);
  expect(html).toContain(`data-to="${Math.round(c.toDeg)}"`);
});

test('flowCanvas writes plain numbers: knots to 2 decimals, degrees rounded', () => {
  const html = flowCanvas({ kn: 0.8, toDeg: 224.6 });
  expect(html).toContain('data-kn="0.80"');
  expect(html).toContain('data-to="225"');
  expect(html).toContain('aria-hidden="true"');
});

test('updateSeaMap also hands the new current to the flow canvas, and copes without one', () => {
  const attrs = {};
  const nodes = {
    '.cmap-now': { outerHTML: '' },
    '.cmap-time': { textContent: '' },
    '.cmap input[type="range"]': { setAttribute() {} },
    '.cmap-flow': { setAttribute: (k, v) => { attrs[k] = v; } },
  };
  const make = (withFlow) => ({ querySelector: (q) => (q === '.cmap-flow' && !withFlow ? null : nodes[q] ?? null) });
  const c = { hour: 10, kn: 1.234, toDeg: 89.6, level: 'green' };
  updateSeaMap(make(true), c);
  expect(attrs).toEqual({ 'data-kn': '1.23', 'data-to': '90' });
  expect(() => updateSeaMap(make(false), c)).not.toThrow();
});
