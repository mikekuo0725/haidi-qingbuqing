import { kmhToKnots } from './math.js';
import { K } from './constants.js';

// weaker current is better; being close to noon (better light) is a small tie-breaker
const hourScore = (h) => -kmhToKnots(h.currentKmh) - K.noonWeight * Math.abs(h.hour - K.noonHour);

// hours: local 08..16. A window is two consecutive hours [start, start+2).
export function bestWindow(hours) {
  let best = null;
  for (let i = 0; i + 1 < hours.length; i++) {
    const a = hours[i];
    const b = hours[i + 1];
    const score = hourScore(a) + hourScore(b);
    if (!best || score > best.score) best = { i, score };
  }
  const a = hours[best.i];
  const b = hours[best.i + 1];
  const slack = a.seaLevel != null && b.seaLevel != null && Math.abs(b.seaLevel - a.seaLevel) < K.slackSeaLevelM;
  return { start: a.hour, end: b.hour + 1, slack };
}
