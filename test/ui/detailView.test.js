import { test, expect } from 'vitest';
import { renderDetail } from '../../src/ui/detailView.js';
import { buildForecast } from '../../src/core/forecast.js';
import { SPOTS } from '../../src/data/spots/index.js';
import { makeDay } from '../helpers/makeDay.js';

const spot = SPOTS.xiaoliuqiu;
const NOW = Date.UTC(2024, 0, 18, 4, 0);
const f = buildForecast({ spot, day: makeDay({ date: '2024-01-18', hour: { waveH: 1.2, waveT: 9, waveDir: 270 } }), stale: null,
  helper: { zones: { west: { kdMedian: 0.1, source: 'sat', bias: 0.88, biasN: 23 } } }, reports: [], now: NOW, isToday: false });
const west = f.zones.find((z) => z.zoneId === 'west');

test('shows base, every factor with its multiplier, and bias line', () => {
  const html = renderDetail({ spot, zone: west, dateLabel: '明天 1/18', reports: [], now: NOW });
  expect(html).toContain('平常底分：<b>15 米</b>');
  for (const label of ['今天的浪', '前幾天的浪', '風', '雲量', '潮汐', '河口', '海流方向', '海流速度']) expect(html).toContain(label);
  expect(html).toContain(`×${west.factors.wave.toFixed(2)}`);
  expect(html).toContain('依過去 23 筆回報，這區 ×0.88');
  expect(html).toContain('面向西 ・ 開放海岸 ・ 礁岩');
});

test('no reports message; reports list escapes html', () => {
  expect(renderDetail({ spot, zone: west, dateLabel: 'x', reports: [], now: NOW })).toContain('還沒有人回報這一區');
  const r = [{ id: 'a', zoneId: 'west', meters: 20, depth: 10, diveTime: NOW, nickname: '<b>x</b>', note: '海龜' }];
  const html = renderDetail({ spot, zone: west, dateLabel: 'x', reports: r, now: NOW });
  expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  expect(html).toContain('海龜');
});
