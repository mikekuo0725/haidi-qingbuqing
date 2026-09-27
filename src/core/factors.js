import { clamp, exposure } from './math.js';
import { K, SHELTER_MUL, BOTTOM_MUL } from './constants.js';

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
