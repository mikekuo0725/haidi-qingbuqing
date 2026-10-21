import { test, expect } from 'vitest';
import { fetchShips } from '../../src/services/ships.js';

test('asks the helper for one spot and returns the list', async () => {
  const seen = [];
  const f = async (url) => { seen.push(url); return { ok: true, json: async () => ({ updatedAt: 5, ships: [{ name: 'A' }] }) }; };
  expect(await fetchShips('https://h', 'xiaoliuqiu', f)).toEqual({ updatedAt: 5, ships: [{ name: 'A' }] });
  expect(seen[0]).toBe('https://h/v1/ships?spot=xiaoliuqiu');
});

test('any failure or odd answer means no ships (null), never an error', async () => {
  expect(await fetchShips('https://h', 'x', async () => ({ ok: false }))).toBeNull();
  expect(await fetchShips('https://h', 'x', async () => { throw new Error('down'); })).toBeNull();
  expect(await fetchShips('https://h', 'x', async () => ({ ok: true, json: async () => ({ updatedAt: 1 }) }))).toBeNull();
  expect(await fetchShips('https://h', 'x', async () => ({ ok: true, json: async () => null }))).toBeNull();
});
