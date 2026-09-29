import { test, expect } from 'vitest';
import { renderMain } from '../../src/ui/mainView.js';
import { buildForecast } from '../../src/core/forecast.js';
import { SPOTS } from '../../src/data/spots/index.js';
import { makeDay } from '../helpers/makeDay.js';

const spot = SPOTS.xiaoliuqiu;
const NOW = Date.UTC(2024, 0, 18, 4, 0);
const forecast = buildForecast({ spot, day: makeDay({ date: '2024-01-18' }), stale: null, helper: null, reports: [], now: NOW, isToday: true });
const base = { spot, forecast, dayIndex: 0, dayLabels: ['今天', '明天', '後天'], located: { status: 'none' }, freshness: { weatherAt: NOW, satelliteDate: '2024-01-10', lastReportAt: null }, now: NOW };

test('shows 4 cards in forecast order with ranges', () => {
  const html = renderMain(base);
  const order = [...html.matchAll(/data-zone="(\w+)"/g)].map((m) => m[1]);
  expect(order).toEqual(forecast.zones.map((z) => z.zoneId));
  expect(html).toContain(`${forecast.zones[0].low}~${forecast.zones[0].high}m`);
});

test('marks the zone you are in', () => {
  const html = renderMain({ ...base, located: { status: 'near', zoneId: 'west', km: 0.5 } });
  expect(html).toContain('📍 你現在在小琉球<b>西邊</b>');
  expect(html).toMatch(/data-zone="west"[^>]*>\s*<span class="tag">你在這裡<\/span>/);
});

test('far away shows the distance', () => {
  expect(renderMain({ ...base, located: { status: 'far', km: 65.4 } })).toContain('📍 你離小琉球 65 公里');
});

test('stale weather shows how old it is', () => {
  const stale = buildForecast({ spot, day: makeDay({ date: '2024-01-18' }), stale: 3, helper: null, reports: [], now: NOW, isToday: true });
  expect(renderMain({ ...base, forecast: stale })).toContain('這是 3 小時前的預測');
});

test('sea info row and footer freshness', () => {
  const html = renderMain(base);
  expect(html).toContain('🌀');
  expect(html).toContain('🌡️');
  expect(html).toContain('⏰');
  expect(html).toContain('衛星 1/10');
  expect(html).toContain('分不出各區');
});

test('day tabs render as keyboard-accessible buttons', () => {
  const html = renderMain(base);
  expect(html).toMatch(/<button type="button" data-day="0"[^>]*>今天<\/button>/);
  expect(html).toMatch(/<button type="button" data-day="1"[^>]*>明天<\/button>/);
  expect(html).toMatch(/<button type="button" data-day="2"[^>]*>後天<\/button>/);
});

test('a day without data keeps header and tabs and says so instead of cards (R5)', () => {
  const html = renderMain({ ...base, forecast: null, dayIndex: 2 });
  expect(html).toContain('📍 小琉球');
  expect(html).toMatch(/<button type="button" data-day="2" class="on">後天<\/button>/);
  expect(html).toContain('這天沒有資料');
  expect(html).not.toContain('data-zone=');
  expect(html).not.toContain('class="sea"');
  expect(html).not.toContain('data-action="share"');
});

test('a day with no data at all still shows the stale-weather hint (Task 15)', () => {
  const html = renderMain({ ...base, forecast: null, dayIndex: 2, staleHours: 4 });
  expect(html).toContain('這天沒有資料');
  expect(html).toContain('這是 4 小時前的預測');
});

test('stale weather under 1 hour old says so instead of "0 小時前"', () => {
  const fresh = buildForecast({ spot, day: makeDay({ date: '2024-01-18' }), stale: 0.3, helper: null, reports: [], now: NOW, isToday: true });
  const html = renderMain({ ...base, forecast: fresh });
  expect(html).toContain('這是不到 1 小時前的預測');
  expect(html).not.toContain('0 小時前');
});

test('header is a button that opens the spot list', () => {
  const html = renderMain(base);
  expect(html).toContain('<button type="button" class="spotbtn" data-action="spots" aria-label="換潛點，現在是小琉球">📍 小琉球 <span aria-hidden="true">▾</span></button>');
  expect(html).toContain('海底清不清 · 預測，不是保證');
});

test('no data at all shows the given text and keeps the spot button', () => {
  const html = renderMain({ ...base, forecast: null, emptyText: '載入中…' });
  expect(html).toContain('data-action="spots"');
  expect(html).toContain('<div class="pad">載入中…</div>');
  expect(html).not.toContain('這天沒有資料');
});

test('a spot notice shows under the day tabs; spots without one show nothing', () => {
  expect(renderMain(base)).not.toContain('class="notice"');
  const html = renderMain({ ...base, spot: { ...spot, notice: '高級潛點：只能搭船去' } });
  expect(html).toMatch(/<\/nav>\s*<div class="notice">⚠️ 高級潛點：只能搭船去<\/div>/);
});
