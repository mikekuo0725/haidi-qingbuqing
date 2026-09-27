import { median, clamp } from './math.js';
import { taipeiDate } from './time.js';
import { K } from './constants.js';

const H = 3600000;
const DAY = 24 * H;

const nowcastBase = (n) => (n === 1 ? K.nowcastN1 : n === 2 ? K.nowcastN2 : K.nowcastN3Plus);

export function nowcast(predMeters, todayReports, now) {
  const n = todayReports.length;
  if (!n) return { meters: predMeters, n: 0, w: 0, applied: false };
  const newest = Math.max(...todayReports.map((r) => r.diveTime));
  const hours = Math.max(0, (now - newest) / H);
  const w = nowcastBase(n) * 0.5 ** (hours / K.nowcastHalfLifeHours);
  const med = median(todayReports.map((r) => r.meters));
  return { meters: predMeters * (1 - w) + med * w, n, w, applied: true };
}

export function outlierWeights(reports) {
  const groups = new Map();
  reports.forEach((r, i) => {
    const key = `${r.zoneId}|${taipeiDate(r.diveTime)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  });
  const weights = reports.map(() => 1);
  for (const idx of groups.values()) {
    if (idx.length < K.outlierMinGroup) continue;
    const med = median(idx.map((i) => reports[i].meters));
    for (const i of idx) {
      if (Math.abs(reports[i].meters - med) > K.outlierThreshold * med) weights[i] = K.outlierWeight;
    }
  }
  return weights;
}

export function zoneBias(reports, now) {
  const recent = reports.filter((r) => now - r.diveTime <= K.biasWindowDays * DAY && r.rawMeters > 0);
  const weights = outlierWeights(recent);
  const acc = {};
  recent.forEach((r, i) => {
    const w = weights[i] * 0.5 ** ((now - r.diveTime) / DAY / K.biasHalfLifeDays);
    const a = (acc[r.zoneId] ??= { sw: 0, swr: 0, n: 0 });
    a.sw += w;
    a.swr += w * (r.meters / r.rawMeters);
    a.n += 1;
  });
  const out = {};
  for (const [zoneId, a] of Object.entries(acc)) {
    if (a.n < K.biasMinReports) { out[zoneId] = { bias: 1, n: a.n }; continue; }
    const ratio = a.swr / a.sw;
    out[zoneId] = {
      bias: clamp(1 + (ratio - 1) * (a.n / (a.n + K.biasShrinkK)), K.biasClampMin, K.biasClampMax),
      n: a.n,
    };
  }
  return out;
}
