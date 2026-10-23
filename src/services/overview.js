// Every spot at once for the Taiwan map. One spot failing only greys out that spot.
import { loadSpot, buildDayForecasts } from './spotData.js';
import { summarizeSpot } from '../core/overview.js';

const NONE = [null, null, null];

export async function loadOverview(spots, { fetchFn = fetch, storage = localStorage, now, helperUrl, fresh = false }) {
  const rows = await Promise.all(spots.map(async (spot) => {
    try {
      const { weather, helper } = await loadSpot(spot, { fetchFn, storage, now, helperUrl, fresh });
      const forecasts = weather ? buildDayForecasts({ spot, weather, helper, now }) : NONE;
      return [spot.id, forecasts];
    } catch {
      return [spot.id, NONE];
    }
  }));
  return {
    forecasts: Object.fromEntries(rows),
    summaries: Object.fromEntries(rows.map(([id, f]) => [id, summarizeSpot(f)])),
  };
}
