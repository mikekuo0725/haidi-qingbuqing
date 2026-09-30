import { SPOTS } from '../../src/data/spots/index.js';
import { zoneBias } from '../../src/core/calibration.js';
import { K } from '../../src/core/constants.js';
import { DAY_MS } from '../../src/core/math.js';
import { computeZones } from './base.js';
import { fetchReports } from './firestore.js';
import { fetchCoastal, mergeSeries } from './cwa.js';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json; charset=utf-8' };
export const COASTAL_CRON = '30 5,11,17,23 * * *'; // 01:30, 07:30, 13:30, 19:30 Taiwan time (see wrangler.toml)

export async function buildHelperData(spot, env, fetchFn = fetch, now = Date.now()) {
  const { zones, satelliteDate } = await computeZones(spot, fetchFn, now);
  let bias = {};
  try {
    const reports = await fetchReports(env.FIREBASE_PROJECT_ID, spot.id, now - K.biasWindowDays * DAY_MS, fetchFn);
    bias = zoneBias(reports, now);
  } catch {
    // no reports reachable → no correction
  }
  for (const id of Object.keys(zones)) {
    zones[id].bias = bias[id]?.bias ?? 1;
    zones[id].biasN = bias[id]?.n ?? 0;
  }
  return { spotId: spot.id, updatedAt: now, satelliteDate, zones };
}

async function refresh(spot, env) {
  const data = await buildHelperData(spot, env);
  await env.CACHE.put(`base:${spot.id}`, JSON.stringify(data));
  return data;
}

function parseJson(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// 氣象署 coastal forecast → KV `cwa:<spotId>`. A failed fetch keeps the last copy; a spot with no
// copy at all gets an empty one, so requests stop starting new downloads until the next cron.
export async function refreshCoastal(env, fetchFn = fetch) {
  if (!env.CWA_KEY) return;
  const spots = Object.values(SPOTS).filter((s) => s.cwaArea);
  const olds = await Promise.all(spots.map(async (s) => parseJson(await env.CACHE.get(`cwa:${s.id}`))));
  // Mark spots with no copy before the big download: if the job is killed mid-way, requests still stop retrying.
  await Promise.all(spots.map((s, i) => (olds[i] ? null : env.CACHE.put(`cwa:${s.id}`, JSON.stringify({ issuedAt: null, series: [] })))));
  let fresh = {};
  try {
    fresh = await fetchCoastal(spots, env.CWA_KEY, fetchFn);
  } catch {
    // CWA down, bad key or over the CPU limit: the page falls back to Open-Meteo
  }
  await Promise.all(spots.map(async (s, i) => {
    const f = fresh[s.id];
    if (f) {
      await env.CACHE.put(`cwa:${s.id}`, JSON.stringify({ issuedAt: f.issuedAt, series: mergeSeries(olds[i]?.series, f.series) }));
    }
  }));
}

function usableCoastal(raw, now) {
  const c = parseJson(raw);
  if (!c?.issuedAt || !c.series?.length) return null;
  return now - Date.parse(c.issuedAt) <= K.coastalMaxAgeH * 3600000 ? c : null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (url.pathname !== '/v1/base') return new Response('{"error":"not found"}', { status: 404, headers: CORS });
    const spot = SPOTS[url.searchParams.get('spot')];
    if (!spot) return new Response('{"error":"unknown spot"}', { status: 404, headers: CORS });
    const cached = await env.CACHE.get(`base:${spot.id}`);
    const data = cached ? JSON.parse(cached) : await refresh(spot, env);
    if (spot.cwaArea) {
      const raw = await env.CACHE.get(`cwa:${spot.id}`);
      if (raw == null) ctx?.waitUntil(refreshCoastal(env)); // first request after a deploy fills it
      const coastal = usableCoastal(raw, Date.now());
      if (coastal) data.coastal = coastal;
    }
    return new Response(JSON.stringify(data), { headers: { ...CORS, 'Cache-Control': 'public, max-age=3600' } });
  },

  async scheduled(event, env, ctx) {
    if (event.cron === COASTAL_CRON) ctx.waitUntil(refreshCoastal(env));
    else ctx.waitUntil(Promise.all(Object.values(SPOTS).map((s) => refresh(s, env))));
  },
};
