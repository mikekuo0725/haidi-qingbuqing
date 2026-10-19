import { kdUrl, parseKdCsv } from './erddap.js';
import { median, DAY_MS } from '../../src/core/math.js';
import { K } from '../../src/core/constants.js';

const isFresh = (date, now) => !!date && now - Date.parse(`${date}T00:00:00Z`) <= K.satMaxAgeDays * DAY_MS;

// `old` is the previous helper record: when NOAA cannot be reached, a zone keeps its last
// satellite value while that value is still fresh, instead of dropping to the fallback.
export async function computeZones(spot, fetchFn = fetch, now = Date.now(), old = null) {
  const zones = {};
  for (const z of spot.zones) {
    try {
      const res = await fetchFn(kdUrl(z.satBox));
      if (!res.ok) throw new Error(`NOAA ${res.status}`);
      const { values, latestDate } = parseKdCsv(await res.text());
      const ok = values.length >= K.satMinValues && isFresh(latestDate, now);
      zones[z.id] = ok ? { kdMedian: median(values), source: 'sat', satDate: latestDate } : { kdMedian: null, source: 'fallback' };
    } catch {
      const prev = old?.zones?.[z.id];
      const prevDate = prev?.satDate ?? old?.satelliteDate; // copies stored before satDate existed
      zones[z.id] = prev?.source === 'sat' && isFresh(prevDate, now)
        ? { kdMedian: prev.kdMedian, source: 'sat', satDate: prevDate }
        : { kdMedian: null, source: 'fallback' };
    }
  }
  const satDates = Object.values(zones).map((z) => z.satDate).filter(Boolean).sort();
  return { zones, satelliteDate: satDates.at(-1) ?? null };
}
