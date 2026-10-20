import { test, expect } from 'vitest';
import { fetchHelper } from '../../src/services/helper.js';

test('returns JSON on success', async () => {
  const f = async () => ({ ok: true, json: async () => ({ spotId: 'x' }) });
  expect(await fetchHelper('https://h', 'x', f)).toEqual({ spotId: 'x' });
});

test('fresh: true skips the browser cache (pull to refresh)', async () => {
  const seen = [];
  const f = async (url, opts) => { seen.push(opts); return { ok: true, json: async () => ({}) }; };
  await fetchHelper('https://h', 'x', f);
  await fetchHelper('https://h', 'x', f, { fresh: true });
  expect(seen[0]).toBeUndefined();
  expect(seen[1]).toEqual({ cache: 'reload' });
});

test('returns null on HTTP error or network error', async () => {
  expect(await fetchHelper('https://h', 'x', async () => ({ ok: false }))).toBeNull();
  expect(await fetchHelper('https://h', 'x', async () => { throw new Error('down'); })).toBeNull();
});
