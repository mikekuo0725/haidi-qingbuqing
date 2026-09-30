import { scoreZone, lightFor, rangeFor, reasonText, baseFromKd } from './score.js';
import { assessSafety, daytimeSst, currentLevel } from './safety.js';
import { bestWindow } from './bestWindow.js';
import { nowcast } from './calibration.js';
import { taipeiDate } from './time.js';
import { kmhToKnots } from './math.js';
import { K } from './constants.js';

const DAY_MS = 86400000;

export function buildForecast({ spot, day, stale, helper, reports, now, isToday }) {
  const zones = spot.zones.map((zone) => {
    const h = helper?.zones?.[zone.id];
    const sat = h?.source === 'sat' && h.kdMedian > 0;
    const base = sat ? baseFromKd(h.kdMedian) : zone.fallbackBase;
    const score = scoreZone({ zone, spot, day, base, bias: h?.bias ?? 1 });

    const zoneReports = reports.filter((r) => r.zoneId === zone.id);
    const todayReports = zoneReports.filter((r) => taipeiDate(r.diveTime) === day.date);
    const hasRecent = zoneReports.some((r) => r.diveTime <= now && now - r.diveTime <= K.recentReportDays * DAY_MS);
    const nc = isToday ? nowcast(score.meters, todayReports, now) : { meters: score.meters, n: 0, applied: false };

    const weatherOk = stale == null;
    const confidence = sat && weatherOk && hasRecent ? 'high' : !sat && !weatherOk ? 'low' : 'medium';
    const { low, high } = rangeFor(nc.meters, sat ? confidence : 'low');

    return {
      ...score,
      name: zone.name,
      baseSource: sat ? 'sat' : 'fallback',
      biasN: h?.biasN ?? 0,
      meters: nc.meters,
      low,
      high,
      light: weatherOk ? lightFor(nc.meters, spot.thresholds) : 'gray',
      confidence,
      reason: nc.applied ? `依今天 ${nc.n} 人回報調整` : reasonText(score.reasonKey, { zone, spot, day }),
      nowcastN: nc.n,
      todayReports,
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
    // For the sea map's hour slider: the whole-sea current, hour by hour.
    currents: day.hours.map((h) => {
      const kn = kmhToKnots(h.currentKmh);
      return { hour: h.hour, kn, toDeg: h.currentDir, level: currentLevel(kn, spot.safety) };
    }),
  };
}
