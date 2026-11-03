import { parseTyphoons } from '../../src/core/typhoon.js';
import { K } from '../../src/core/constants.js';

const API = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/W-C0034-005';
export const typhoonUrl = (key) => `${API}?Authorization=${encodeURIComponent(key)}&format=JSON`;

// 氣象署 typhoon warnings: ONE answer for everyone, in the Workers Cache API (no cron: the account's 5 free cron triggers are used up).
// The first visitor after the cache runs out pays for the fetch. The key is a fixed made-up URL.
const TY_KEY = 'https://haidi-helper.internal/typhoon/v1';
const FAIL_SECONDS = 60; // a failed / empty-handed answer is kept only this long

// The Cache API may do nothing on *.workers.dev, so a warm isolate also keeps its last answer in `mem`.
export const TY_MEM = {};

// Any problem (no key, CWA down, odd answer) is "no typhoons": the map just has none to draw.
export async function loadTyphoons(cache, key, fetchFn = fetch, now = Date.now(), mem = TY_MEM) {
  if (!key) return { updatedAt: now, typhoons: [], error: 'unavailable' };
  if (mem.data && now < mem.until) return mem.data;
  const hit = await cache.match(TY_KEY);
  if (hit) return hit.json();
  let data = { updatedAt: now, typhoons: [], error: 'unavailable' }; // `error` tells the page this is "could not ask", not "no typhoon"
  let ok = false;
  try {
    const res = await fetchFn(typhoonUrl(key));
    if (res.ok) {
      data = { updatedAt: now, typhoons: parseTyphoons(JSON.parse(await res.text()), now) }; // not JSON → throws → counts as a failure
      ok = true;
    }
  } catch {
    // CWA down or bad key: no typhoons this round
  }
  const seconds = ok ? K.typhoonRefreshMinutes * 60 : FAIL_SECONDS;
  await cache.put(TY_KEY, new Response(JSON.stringify(data), { headers: { 'Cache-Control': `max-age=${seconds}` } }));
  Object.assign(mem, { data, until: now + seconds * 1000 });
  return data;
}
