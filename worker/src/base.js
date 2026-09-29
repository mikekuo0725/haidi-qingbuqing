import { kdUrl, parseKdCsv } from './erddap.js';
import { median, DAY_MS } from '../../src/core/math.js';
import { K } from '../../src/core/constants.js';

export async function computeZones(spot, fetchFn = fetch, now = Date.now()) {
  const zones = {};
  let satelliteDate = null;
  for (const z of spot.zones) {
    try {
      const res = await fetchFn(kdUrl(z.satBox));
      if (!res.ok) throw new Error(`NOAA ${res.status}`);
      const { values, latestDate } = parseKdCsv(await res.text());
      const fresh = latestDate && now - Date.parse(`${latestDate}T00:00:00Z`) <= K.satMaxAgeDays * DAY_MS;
      const ok = values.length >= K.satMinValues && fresh;
      zones[z.id] = { kdMedian: ok ? median(values) : null, source: ok ? 'sat' : 'fallback' };
      if (ok && (!satelliteDate || latestDate > satelliteDate)) satelliteDate = latestDate;
    } catch {
      zones[z.id] = { kdMedian: null, source: 'fallback' };
    }
  }
  return { zones, satelliteDate };
}
