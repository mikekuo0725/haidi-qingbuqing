import { parseBuoys } from '../../src/core/buoy.js';

const API = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-B0075-001';
export const buoyUrl = (key, ids) => `${API}?Authorization=${encodeURIComponent(key)}&StationID=${ids.join(',')}&format=JSON`;

// One small request (~90 KB for 3 buoys, last 48 hours) for every buoy the spots use.
export async function fetchBuoys(ids, key, fetchFn = fetch) {
  const res = await fetchFn(buoyUrl(key, ids));
  if (!res.ok) throw new Error(`CWA buoy ${res.status}`); // never the URL: it holds the key
  return parseBuoys(await res.json());
}
