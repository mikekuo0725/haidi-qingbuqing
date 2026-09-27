import { SPOTS } from '../../src/data/spots/index.js';
import { zoneBias } from '../../src/core/calibration.js';
import { K } from '../../src/core/constants.js';
import { computeZones } from './base.js';
import { fetchReports } from './firestore.js';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json; charset=utf-8' };
const DAY = 86400000;

export async function buildHelperData(spot, env, fetchFn = fetch, now = Date.now()) {
  const { zones, satelliteDate } = await computeZones(spot, fetchFn, now);
  let bias = {};
  try {
    const reports = await fetchReports(env.FIREBASE_PROJECT_ID, spot.id, now - K.biasWindowDays * DAY, fetchFn);
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (url.pathname !== '/v1/base') return new Response('{"error":"not found"}', { status: 404, headers: CORS });
    const spot = SPOTS[url.searchParams.get('spot')];
    if (!spot) return new Response('{"error":"unknown spot"}', { status: 404, headers: CORS });
    const cached = await env.CACHE.get(`base:${spot.id}`);
    const data = cached ? JSON.parse(cached) : await refresh(spot, env);
    return new Response(JSON.stringify(data), { headers: { ...CORS, 'Cache-Control': 'public, max-age=3600' } });
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(Promise.all(Object.values(SPOTS).map((s) => refresh(s, env))));
  },
};
