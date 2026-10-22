import { test, expect } from 'vitest';
import { renderReportForm, parseReportForm } from '../../src/ui/reportForm.js';
import { SPOTS } from '../../src/data/spots/index.js';

const spot = SPOTS.xiaoliuqiu;
const NOW = Date.UTC(2026, 8, 28, 2, 30); // 10:30 Taipei

test('form preselects your zone and remembers nickname', () => {
  const html = renderReportForm({ spot, defaultZoneId: 'west', nickname: 'Michael', now: NOW });
  expect(html).toMatch(/value="west" checked/);
  expect(html).toContain('value="Michael"');
  for (const m of ['3', '5', '8', '10', '15', '20', '25', '30+']) expect(html).toContain(`value="${m}"`);
  expect(html).toContain('value="10:30"');
  expect(html).toContain('只存「哪一區」');
});

test('parse: valid form', () => {
  const r = parseReportForm({ zoneId: 'west', meters: '20', depth: '10', time: '09:15', nickname: 'M', note: '' }, NOW);
  expect(r).toMatchObject({ zoneId: 'west', meters: '20', depth: '10', nickname: 'M' });
  expect(r.diveTime).toBe(Date.UTC(2026, 8, 28, 1, 15));
});

test('parse: missing meters → error; a blank nickname is fine', () => {
  expect(parseReportForm({ zoneId: 'west', depth: '10', time: '09:15', nickname: 'M' }, NOW)).toEqual({ error: '請選看到幾米' });
  expect(parseReportForm({ zoneId: 'west', meters: '20', depth: '10', time: '09:15', nickname: ' ' }, NOW)).toMatchObject({ nickname: '' });
});

test('parse: a dive time later than now → error', () => {
  expect(parseReportForm({ zoneId: 'west', meters: '20', depth: '10', time: '23:00', nickname: 'M' }, NOW)).toEqual({ error: '下水時間不能比現在晚' });
});

// R4: anything the Firestore rules would reject must be caught here, or it sits in the outbox forever.
const ok = { zoneId: 'west', meters: '20', depth: '10', time: '09:15', nickname: 'M', note: '' };

test('parse: rejects what the Firestore rules would reject', () => {
  expect(parseReportForm({ ...ok, zoneId: '' }, NOW)).toEqual({ error: '請選哪一區' });
  expect(parseReportForm({ ...ok, meters: '70' }, NOW)).toEqual({ error: '請選看到幾米' });
  expect(parseReportForm({ ...ok, meters: 'abc' }, NOW)).toEqual({ error: '請選看到幾米' });
  expect(parseReportForm({ ...ok, meters: '-1' }, NOW)).toEqual({ error: '請選看到幾米' });
  expect(parseReportForm({ ...ok, depth: '61' }, NOW)).toEqual({ error: '請選大概幾米深' });
  expect(parseReportForm({ ...ok, depth: 'x' }, NOW)).toEqual({ error: '請選大概幾米深' });
  expect(parseReportForm({ ...ok, nickname: 'a'.repeat(21) }, NOW)).toEqual({ error: '暱稱最多 20 個字' });
  expect(parseReportForm({ ...ok, note: 'a'.repeat(201) }, NOW)).toEqual({ error: '想說的話最多 200 個字' });
  expect(parseReportForm({ ...ok, time: '' }, NOW)).toEqual({ error: '請輸入下水時間' });
});

test('parse: 30+ and edge values are accepted; text is trimmed', () => {
  const r = parseReportForm({ ...ok, meters: '30+', depth: '30+', nickname: '  M  ', note: ' hi ' }, NOW);
  expect(r).toMatchObject({ meters: '30+', depth: '30+', nickname: 'M', note: 'hi' });
  expect(parseReportForm({ ...ok, nickname: ` ${'a'.repeat(20)} ` }, NOW).nickname).toBe('a'.repeat(20));
  expect(parseReportForm({ ...ok, depth: undefined }, NOW).depth).toBe('10');
});

test('form title names the spot being reported', () => {
  const kenting = renderReportForm({ spot: SPOTS.kenting, defaultZoneId: null, nickname: '', now: NOW });
  const xiaoliuqiu = renderReportForm({ spot: SPOTS.xiaoliuqiu, defaultZoneId: null, nickname: '', now: NOW });
  expect(kenting).toContain('回報能見度 · 📍 墾丁');
  expect(xiaoliuqiu).toContain('回報能見度 · 📍 小琉球');
});
