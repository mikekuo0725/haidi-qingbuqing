import { scoreZone, lightFor, rangeFor, reasonText, baseFromKd } from './score.js';
import { assessSafety, daytimeSst, currentLevel } from './safety.js';
import { bestWindow } from './bestWindow.js';
import { kmhToKnots } from './math.js';
export function buildForecast({ spot, day, stale, helper }) {
  const zones = spot.zones.map((zone) => {
    const h = helper?.zones?.[zone.id];
    const sat = h?.source === 'sat' && h.kdMedian > 0;
    const base = sat ? baseFromKd(h.kdMedian) : zone.fallbackBase;
    const score = scoreZone({ zone, spot, day, base });

    const weatherOk = stale == null;
    const confidence = sat && weatherOk ? 'high' : !sat && !weatherOk ? 'low' : 'medium';
    const { low, high } = rangeFor(score.meters, sat ? confidence : 'low');

    return {
      ...score,
      name: zone.name,
      baseSource: sat ? 'sat' : 'fallback',
      meters: score.meters,
      low,
      high,
      light: weatherOk ? lightFor(score.meters, spot.thresholds) : 'gray',
      confidence,
      reason: reasonText(score.reasonKey, { zone, spot, day }),
    };
  });

  zones.sort((a, b) => b.meters - a.meters);
  return {
    date: day.date,
    stale,
    zones,
    safety: assessSafety(day, spot),
    best: bestWindow(day.hours),
    sst: daytimeSst(day),
    coastalAt: day.coastalAt ?? null, // set when the sea fields came from 氣象署
    // For the sea map's hour slider: the whole-sea current, hour by hour.
    currents: day.hours.map((h) => {
      const kn = kmhToKnots(h.currentKmh);
      return { hour: h.hour, kn, toDeg: h.currentDir, level: currentLevel(kn, spot.safety), windKmh: h.windKmh, windDir: h.windDir };
    }),
  };
}
