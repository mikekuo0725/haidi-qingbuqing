import { clamp } from './math.js';
import { K } from './constants.js';
import {
  waveFactor, pastWaveFactor, windFactor, cloudFactor, tideFactor,
  riverFactor, currentDirFactor, currentSpeedFactor,
} from './factors.js';

export const baseFromKd = (kd) => clamp(K.kdToMeters / kd, K.baseMin, K.baseMax);

export function lightFor(meters, th) {
  if (meters >= th.purple) return 'purple';
  if (meters >= th.green) return 'green';
  if (meters >= th.yellow) return 'yellow';
  return 'red';
}

export function rangeFor(meters, confidence) {
  const [lo, hi] = confidence === 'low' ? K.range.low : K.range.normal;
  return { low: Math.round(meters * lo), high: Math.round(meters * hi) };
}

export function compareToNormal(meters, normal) {
  const r = meters / normal;
  if (r >= K.compareUp) return 'up';
  if (r <= K.compareDown) return 'down';
  return 'same';
}

export function scoreZone({ zone, spot, day, base, bias = 1 }) {
  const factors = {
    wave: waveFactor(day.hours, zone),
    pastWave: pastWaveFactor(day.pastWaves, zone),
    wind: windFactor(day.hours, zone),
    cloud: cloudFactor(day.hours),
    tide: tideFactor(day.date),
    river: riverFactor(day.rain3dMm, day.hours, zone, spot),
    currentDir: currentDirFactor(day.hours, spot),
    currentSpeed: currentSpeedFactor(day.hours, zone),
  };
  const product = Object.values(factors).reduce((a, b) => a * b, 1);
  const rawMeters = base * product;
  const meters = rawMeters * bias;
  const [worstKey, worstVal] = Object.entries(factors).reduce((w, e) => (e[1] < w[1] ? e : w));
  return {
    zoneId: zone.id,
    base,
    bias,
    factors,
    rawMeters,
    meters,
    reasonKey: worstVal < K.reasonThreshold ? worstKey : 'good',
    compare: compareToNormal(meters, base * bias),
  };
}

export function reasonText(key, { zone, spot, day }) {
  switch (key) {
    case 'wave': return `湧浪正對${zone.name}`;
    case 'pastWave': return '前幾天的大浪還沒清完';
    case 'wind': return `風吹向${zone.name}`;
    case 'cloud': return '陰天，光線比較暗';
    case 'tide': return '大潮，水流比較強';
    case 'river': return `${spot.riverName}泥水（上游前 3 天 ${Math.round(day.rain3dMm)}mm）`;
    case 'currentDir': return `海流從${spot.riverName}那邊帶水過來`;
    case 'currentSpeed': return '強流攪起海底的沙';
    default: return '浪小、風平，條件不錯';
  }
}
