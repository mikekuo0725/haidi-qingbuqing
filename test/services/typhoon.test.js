import { test, expect } from 'vitest';
import { fetchTyphoons } from '../../src/services/typhoon.js';
import { typhoonFresh } from '../../src/core/typhoon.js';
import { K } from '../../src/core/constants.js';

test('asks the helper for /v1/typhoon and returns the list', async () => {
  const seen = [];
  const f = async (url) => { seen.push(url); return { ok: true, json: async () => ({ updatedAt: 5, typhoons: [{ id: 'A' }] }) }; };
  expect(await fetchTyphoons('https://h', f)).toEqual([{ id: 'A' }]);
  expect(seen[0]).toBe('https://h/v1/typhoon');
  expect(await fetchTyphoons('https://h', async () => ({ ok: true, json: async () => ({ typhoons: [] }) }))).toEqual([]);
});

test('any failure or odd answer gives null (could not ask) and never throws', async () => {
  expect(await fetchTyphoons('https://h', async () => ({ ok: false }))).toBeNull();
  expect(await fetchTyphoons('https://h', async () => { throw new Error('down'); })).toBeNull();
  expect(await fetchTyphoons('https://h', async () => ({ ok: true, json: async () => ({ updatedAt: 1 }) }))).toBeNull();
  expect(await fetchTyphoons('https://h', async () => ({ ok: true, json: async () => null }))).toBeNull();
});

test('an answer the helper marks as an error (CWA was down) is "could not ask", not "no typhoon"', async () => {
  expect(await fetchTyphoons('https://h', async () => ({ ok: true, json: async () => ({ updatedAt: 1, typhoons: [], error: 'unavailable' }) }))).toBeNull();
});

test('typhoonFresh: a position older than K.typhoonStaleHours is not fresh', () => {
  const now = Date.parse('2026-11-03T12:00:00+08:00');
  expect(typhoonFresh({ now: { time: now - 3600000 } }, now)).toBe(true);
  expect(typhoonFresh({ now: { time: now - (K.typhoonStaleHours + 1) * 3600000 } }, now)).toBe(false);
});
