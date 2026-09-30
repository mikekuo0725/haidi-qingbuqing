import { test, expect } from 'vitest';
import { fetchBuoys, buoyUrl } from '../../worker/src/buoy.js';
import { obs, buoyFile } from '../helpers/buoyFixture.js';

test('buoyUrl asks only for the given stations', () => {
  expect(buoyUrl('A&B', ['46714D', '46759A']))
    .toBe('https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-B0075-001?Authorization=A%26B&StationID=46714D,46759A&format=JSON');
});

test('fetchBuoys parses each station', async () => {
  const file = buoyFile({ '46714D': [obs({ time: '2026-09-30T13:00' })] });
  const out = await fetchBuoys(['46714D'], 'SECRET', async () => new Response(JSON.stringify(file)));
  expect(out['46714D'][0]).toMatchObject({ time: '2026-09-30T13:00', waveH: 0.3 });
});

test('a failed fetch throws without the URL (it holds the key)', async () => {
  const err = await fetchBuoys(['46714D'], 'SECRET', async () => new Response('x', { status: 401 })).catch((e) => e);
  expect(err.message).toBe('CWA buoy 401');
});
