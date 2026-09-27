import { K } from './constants.js';

const SYNODIC = 29.530588853;
const REF_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14); // a known new moon

// Moon age at local noon (04:00 UTC) of the given Taipei date.
export function moonAgeDays(dateStr) {
  const t = Date.parse(`${dateStr}T04:00:00Z`);
  const days = (t - REF_NEW_MOON) / 86400000;
  return ((days % SYNODIC) + SYNODIC) % SYNODIC;
}

export function isSpringTide(dateStr) {
  const age = moonAgeDays(dateStr);
  const toNew = Math.min(age, SYNODIC - age);
  const toFull = Math.abs(age - SYNODIC / 2);
  return toNew <= K.springDays || toFull <= K.springDays;
}
