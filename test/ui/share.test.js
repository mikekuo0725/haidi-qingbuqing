import { test, expect } from 'vitest';
import { buildShareText, shareOrCopy } from '../../src/ui/share.js';
import { buildForecast } from '../../src/core/forecast.js';
import { SPOTS } from '../../src/data/spots/index.js';
import { makeDay } from '../helpers/makeDay.js';

const spot = SPOTS.xiaoliuqiu;
const f = buildForecast({ spot, day: makeDay({ date: '2024-01-18' }), stale: null, helper: null });

test('share text lists zones best first, current, SST, best window and url', () => {
  const t = buildShareText({ spot, dayLabel: '明天', forecast: f, url: 'https://x' });
  expect(t.startsWith('明天小琉球：')).toBe(true);
  expect(t).toContain(`${f.zones[0].name} `);
  expect(t).toContain('節');
  expect(t).toContain('水溫 28°C');
  expect(t).toContain('最佳');
  expect(t.endsWith('👉 https://x')).toBe(true);
});

test('shareOrCopy uses Web Share, then clipboard', async () => {
  expect(await shareOrCopy('t', { share: async () => {} })).toBe('shared');
  expect(await shareOrCopy('t', { clipboard: { writeText: async () => {} } })).toBe('copied');
  expect(await shareOrCopy('t', {})).toBe('failed');
});

test('shareOrCopy: closing the share sheet is quiet; a blocked share falls back to clipboard', async () => {
  const abort = Object.assign(new Error('cancel'), { name: 'AbortError' });
  const blocked = Object.assign(new Error('nope'), { name: 'NotAllowedError' });
  let copied = null;
  const clipboard = { writeText: async (t) => { copied = t; } };
  expect(await shareOrCopy('t', { share: async () => { throw abort; }, clipboard })).toBe('cancelled');
  expect(copied).toBe(null);
  expect(await shareOrCopy('t', { share: async () => { throw blocked; }, clipboard })).toBe('copied');
  expect(copied).toBe('t');
  expect(await shareOrCopy('t', { share: async () => { throw blocked; } })).toBe('failed');
  expect(await shareOrCopy('t', { clipboard: { writeText: async () => { throw blocked; } } })).toBe('failed');
});
