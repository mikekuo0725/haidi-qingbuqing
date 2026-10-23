import { test, expect } from 'vitest';
import { renderMapHome, renderMapSpot, renderSiteCard } from '../../src/ui/mapPanel.js';
import { buildForecast } from '../../src/core/forecast.js';
import { summarizeDay } from '../../src/core/overview.js';
import { SPOTS } from '../../src/data/spots/index.js';
import { makeDay } from '../helpers/makeDay.js';

const spot = SPOTS.xiaoliuqiu;
const DAYS = ['今天', '明天', '後天'];
const forecast = buildForecast({ spot, day: makeDay({ date: '2024-01-18', hour: { waveH: 1.2, waveT: 9, waveDir: 270 } }), stale: null, helper: null });
const summary = summarizeDay(forecast);

test('home panel lists the two clearest spots and every day tab', () => {
  const summaries = { a: [{ meters: 5, light: 'red', zoneName: 'X' }], b: [{ meters: 20, light: 'purple', zoneName: 'Y' }], c: [{ meters: 12, light: 'green', zoneName: 'Z' }] };
  const spots = [{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }, { id: 'c', name: '丙' }];
  const html = renderMapHome({ summaries, spots, dayIndex: 0, dayLabels: DAYS });
  for (const d of DAYS) expect(html).toContain(d);
  expect([...html.matchAll(/data-mapspot="(\w+)"/g)].map((m) => m[1])).toEqual(['b', 'c']);
  expect(html).toContain('點地圖上的圓點看各區');
});

test('spot panel has every zone, the open button, and 沒有資料 when empty', () => {
  const html = renderMapSpot({ spot, summary, forecast, dayIndex: 0, dayLabels: DAYS });
  const rows = [...html.matchAll(/data-zone="(\w+)"/g)].map((m) => m[1]);
  expect(rows).toEqual(forecast.zones.map((z) => z.zoneId));
  for (const z of forecast.zones) expect(html).toContain(z.name);
  expect(html).toContain('看海流、風的動態圖和每小時 →');
  expect(html).toContain('data-action="open-spot"');
  expect(html).toContain('data-action="map-home"');
  const empty = renderMapSpot({ spot, summary: null, forecast: null, dayIndex: 2, dayLabels: DAYS });
  expect(empty).toContain('沒有資料');
  expect(empty).not.toContain('data-zone=');
});

test('spot panel outlines the picked site zone', () => {
  const html = renderMapSpot({ spot, summary, forecast, dayIndex: 0, dayLabels: DAYS, picked: { name: '花瓶岩', zoneId: 'north' } });
  expect(html).toContain('📌 <b>花瓶岩</b> 在「北邊」這一區');
  expect(html).toMatch(/class="tli on" data-zone="north"/);
});

test('names are escaped', () => {
  const html = renderSiteCard({ site: { name: '<b>', zoneId: null }, spot: null, forecast: null, dayIndex: 0, dayLabels: DAYS });
  expect(html).toContain('&lt;b&gt;');
  expect(html).not.toContain('<b><b>');
});

test('site card shows the zone forecast range and reason', () => {
  const zone = forecast.zones.find((z) => z.zoneId === 'north');
  const html = renderSiteCard({ site: { name: '花瓶岩', zoneId: 'north' }, spot, forecast, dayIndex: 1, dayLabels: DAYS });
  expect(html).toContain(`${zone.low}～${zone.high} 米`);
  expect(html).toContain(zone.reason);
  expect(html).toContain('小琉球・北邊');
  expect(html).toContain('明天能見度預測');
  expect(html).toContain('← 看這個潛點各區');
  expect(html).toContain('海流、風動態圖 →');
  expect(html).toContain('data-action="open-spot">海流、風動態圖 →'); // the spot page, where the lines move
});

test('site card without level data has no 最深 line', () => {
  expect(renderSiteCard({ site: { name: '花瓶岩', zoneId: 'north' }, spot, forecast, dayIndex: 0, dayLabels: DAYS })).not.toContain('最深');
  const withLevel = renderSiteCard({ site: { name: '花瓶岩', zoneId: 'north', level: '中級', maxDepthM: 20, entry: '岸潛' }, spot, forecast, dayIndex: 0, dayLabels: DAYS });
  expect(withLevel).toContain('中級潛點 · 最深 20 米 · 岸潛');
});

test('site outside our spots says 這裡還沒有能見度預測 and has no open-spot button', () => {
  const html = renderSiteCard({ site: { name: '和平島', zoneId: null }, spot: null, forecast: null, dayIndex: 0, dayLabels: DAYS });
  expect(html).toContain('這裡還沒有能見度預測');
  expect(html).not.toContain('open-spot');
  expect(html).not.toContain('map-spot');
});

test('spot panel shows the BlueTrend link for a picked BlueTrend site', () => {
  const picked = { name: '新點', zoneId: 'north', level: '初級', maxDepthM: 12, entry: '岸潛', url: 'https://bluetrend.media/x' };
  const html = renderMapSpot({ spot, summary, forecast, dayIndex: 0, dayLabels: DAYS, picked });
  expect(html).toContain('初級 · 最深 12 米 · 岸潛');
  expect(html).toContain('<a href="https://bluetrend.media/x" target="_blank" rel="noopener">BlueTrend 介紹 ↗</a>');
});

test('map panel rows carry compare and confidence', () => {
  const f2 = { ...forecast, zones: forecast.zones.map((z, i) => (i === 0 ? { ...z, compare: 'up', confidence: 'high' } : z)) };
  const html = renderMapSpot({ spot, summary, forecast: f2, dayIndex: 0, dayLabels: DAYS });
  const first = html.slice(html.indexOf(`data-zone="${f2.zones[0].zoneId}"`)).split('</div></div>')[0];
  expect(first).toContain('比平常清 ↑');
  expect(first).toContain('把握度 高');
  const card = renderSiteCard({ site: { name: 'x', zoneId: f2.zones[0].zoneId }, spot, forecast: f2, dayIndex: 0, dayLabels: DAYS });
  expect(card).toContain('比平常清 ↑');
  expect(card).toContain('把握度 高');
});

test('map panel marks the zone you are in', () => {
  const html = renderMapSpot({ spot, summary, forecast, dayIndex: 0, dayLabels: DAYS, located: { status: 'near', zoneId: 'west' } });
  const row = html.slice(html.indexOf('data-zone="west"'));
  expect(row.slice(0, row.indexOf('</span></div>') + 20)).toContain('你在這裡');
  expect(html.match(/你在這裡/g)).toHaveLength(1);
});

test('site card shows the protection line and link; a site without an entry shows none', () => {
  const protection = { kind: 'no-take', text: '琉球漁業資源保育區：不能抓', url: 'https://data.gov.tw/dataset/36320' };
  const html = renderSiteCard({ site: { name: '花瓶岩', zoneId: 'north', protection }, spot, forecast, dayIndex: 0, dayLabels: DAYS });
  expect(html).toContain('🛡️ 琉球漁業資源保育區：不能抓');
  expect(html).toContain('<a href="https://data.gov.tw/dataset/36320" target="_blank" rel="noopener">官方公告 ↗</a>');
  const permit = renderSiteCard({ site: { name: 'x', zoneId: null, protection: { ...protection, kind: 'permit', text: '要先申請' } }, spot: null, forecast: null, dayIndex: 0, dayLabels: DAYS });
  expect(permit).toContain('⚠️ 要先申請');
  expect(renderSiteCard({ site: { name: '花瓶岩', zoneId: 'north' }, spot, forecast, dayIndex: 0, dayLabels: DAYS })).not.toContain('官方公告');
});

test('a site in one of our spots on a day with no data does not promise a future spot', () => {
  const html = renderSiteCard({ site: { name: '花瓶岩', zoneId: 'north' }, spot, forecast: null, dayIndex: 2, dayLabels: DAYS });
  expect(html).not.toContain('以後加了這個潛點就會有');
  expect(html).toContain('後天沒有資料');
});
