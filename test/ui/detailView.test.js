import { test, expect } from 'vitest';
import { renderDetail } from '../../src/ui/detailView.js';
import { buildForecast } from '../../src/core/forecast.js';
import { SPOTS } from '../../src/data/spots/index.js';
import { makeDay } from '../helpers/makeDay.js';

const spot = SPOTS.xiaoliuqiu;
const f = buildForecast({ spot, day: makeDay({ date: '2024-01-18', hour: { waveH: 1.2, waveT: 9, waveDir: 270 } }), stale: null,
  helper: { zones: { west: { kdMedian: 0.1, source: 'sat' } } } });
const west = f.zones.find((z) => z.zoneId === 'west');

test('shows base and every factor with its multiplier', () => {
  const html = renderDetail({ spot, zone: west, dateLabel: '明天 1/18' });
  expect(html).toContain('平常底分：<b>15 米</b>');
  for (const label of ['今天的浪', '前幾天的浪', '風', '雲量', '潮汐', '河口', '海流方向', '海流速度']) expect(html).toContain(label);
  expect(html).toContain(`×${west.factors.wave.toFixed(2)}`);
  expect(html).not.toContain('回報修正');
  expect(html).not.toContain('今天的回報');
  expect(html.slice(html.indexOf('wf-row end'))).toContain(`<div class="wf-n">${west.meters.toFixed(1)}</div>`);
  expect(html).toContain('面向西 ・ 開放海岸 ・ 礁岩');
});

test('detail page has no report section', () => {
  expect(renderDetail({ spot, zone: west, dateLabel: 'x' })).not.toContain('回報');
});

test('waterfall: biggest loss first, flagged as 最大扣分, and the steps add up to the forecast', () => {
  const html = renderDetail({ spot, zone: west, dateLabel: 'x' });
  const nums = [...html.matchAll(/class="wf-n[^"]*">([+−])([\d.]+)</g)].map((m) => (m[1] === '−' ? -1 : 1) * Number(m[2]));
  const sum = west.base + nums.reduce((a, b) => a + b, 0);
  expect(Math.abs(sum - west.meters)).toBeLessThan(0.1 * (nums.length + 1)); // each step is rounded to 0.1
  expect(nums[0]).toBeLessThanOrEqual(Math.min(...nums));
  expect(html).toContain('最大扣分：');
  expect(html).toContain('wf-row end');
});
