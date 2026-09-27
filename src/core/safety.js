import { kmhToKnots, mean } from './math.js';
import { K } from './constants.js';

export function currentLevel(kn, safety) {
  if (kn >= safety.currentRedKn) return 'red';
  if (kn >= safety.currentYellowKn) return 'yellow';
  return 'green';
}

export function daytimeSst(day) {
  return mean(day.hours.map((h) => h.sst).filter((v) => v != null));
}

export function detectUpwelling(day) {
  const today = daytimeSst(day);
  if (today == null || day.sstPrev3 == null) return false;
  return day.sstPrev3 - today >= K.upwellingDropC;
}

export function assessSafety(day, spot) {
  const strongest = day.hours.reduce((a, b) => (b.currentKmh > a.currentKmh ? b : a));
  const currentKn = kmhToKnots(strongest.currentKmh);
  const cLevel = currentLevel(currentKn, spot.safety);
  const waveMaxM = Math.max(...day.hours.map((h) => h.waveH));
  const waveRed = waveMaxM > spot.safety.waveRedM;
  return {
    currentKn,
    currentToDeg: strongest.currentDir,
    currentLevel: cLevel,
    waveMaxM,
    waveRed,
    level: waveRed ? 'red' : cLevel,
    upwelling: detectUpwelling(day),
  };
}
