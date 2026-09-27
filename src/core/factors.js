import { clamp, exposure, alignment, kmhToKnots, mean } from './math.js';
import { K, SHELTER_MUL, BOTTOM_MUL, STRONG_CURRENT_MUL } from './constants.js';
import { isSpringTide } from './moon.js';

export const waveEnergy = ({ waveH, waveT }) => waveH * waveH * waveT;

const hitEnergy = (w, zone) => waveEnergy(w) * exposure(w.waveDir, zone.facing);

const maxHit = (waves, zone) => waves.reduce((m, w) => Math.max(m, hitEnergy(w, zone)), 0);

const zoneMul = (zone) => SHELTER_MUL[zone.shelter] * BOTTOM_MUL[zone.bottom];

export function waveFactor(hours, zone) {
  return clamp(1 - K.wave * maxHit(hours, zone) * zoneMul(zone), K.waveMin, 1);
}

export function pastWaveFactor(pastWaves, zone) {
  const worst = pastWaves.reduce((m, day, i) => Math.max(m, K.pastWeights[i] * maxHit(day, zone)), 0);
  return clamp(1 - K.pastWave * worst * zoneMul(zone), K.pastWaveMin, 1);
}

export function windFactor(hours, zone) {
  // signed onshore speed: + blowing from sea onto this zone, - blowing off the island
  const s = mean(hours.map((h) => h.windKmh * alignment(h.windDir, zone.facing)));
  if (s > 0) {
    return clamp(1 - K.wind * Math.max(0, s - K.windStartKmh) * SHELTER_MUL[zone.shelter], K.windMin, 1);
  }
  return 1 + K.windOffshoreBonus * Math.min(1, -s / K.windOffshoreFullKmh);
}

export const cloudFactor = (hours) => 1 - K.cloud * (mean(hours.map((h) => h.cloud)) / 100);

export const tideFactor = (dateStr) => (isSpringTide(dateStr) ? K.springTide : 1);

// +1 = current heads away from the river mouth (brings river water to the spot), -1 = heads toward it
export const riverAlignment = (hours, spot) =>
  mean(hours.map((h) => alignment(h.currentDir, (spot.riverBearing + 180) % 360)));

export function riverFactor(rain3dMm, hours, zone, spot) {
  if (rain3dMm <= 0) return 1;
  const a = riverAlignment(hours, spot);
  const curMul = a > 0 ? 1 + K.riverCurrentHeavier * a : 1 - K.riverCurrentLighter * -a;
  const hit = zone.riverImpact * Math.min(1, rain3dMm / K.riverFullMm) * K.river * curMul;
  return clamp(1 - hit, K.riverMin, 1);
}

export function currentDirFactor(hours, spot) {
  const a = riverAlignment(hours, spot);
  return a < 0 ? 1 + K.offshoreCurrentBonus * -a : 1;
}

export function currentSpeedFactor(hours, zone) {
  const kn = kmhToKnots(mean(hours.map((h) => h.currentKmh)));
  if (kn >= K.currentStrongKn) return STRONG_CURRENT_MUL[zone.bottom];
  if (kn >= K.currentMidLoKn && kn <= K.currentMidHiKn) return K.currentMidBonus;
  return 1;
}
