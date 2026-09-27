import { test, expect } from 'vitest';
import { waveFactor, pastWaveFactor } from '../../src/core/factors.js';
import { makeDay, calmWaves } from '../helpers/makeDay.js';

const zone = (over = {}) => ({ id: 'w', facing: 270, shelter: 'open', bottom: 'mixed', riverImpact: 0.3, ...over });
const big = { waveH: 1.2, waveT: 9, waveDir: 270 };

test('waves hitting a zone head-on hurt that zone most', () => {
  const day = makeDay({ hour: big });
  const west = waveFactor(day.hours, zone({ facing: 270 }));
  const east = waveFactor(day.hours, zone({ facing: 90 }));
  expect(west).toBeLessThan(0.7);
  expect(east).toBe(1);
});

test('longer wave period hurts more', () => {
  const short = waveFactor(makeDay({ hour: { ...big, waveT: 5 } }).hours, zone());
  const long = waveFactor(makeDay({ hour: { ...big, waveT: 12 } }).hours, zone());
  expect(long).toBeLessThan(short);
});

test('a bay loses less than open coast for the same waves', () => {
  const day = makeDay({ hour: big });
  expect(waveFactor(day.hours, zone({ shelter: 'bay' }))).toBeGreaterThan(waveFactor(day.hours, zone({ shelter: 'open' })));
});

test('sand bottom loses more than rock for the same waves', () => {
  const day = makeDay({ hour: { ...big, waveH: 0.8 } });
  expect(waveFactor(day.hours, zone({ bottom: 'sand' }))).toBeLessThan(waveFactor(day.hours, zone({ bottom: 'rock' })));
});

test('factor never goes below 0.3', () => {
  const day = makeDay({ hour: { waveH: 5, waveT: 15, waveDir: 270 } });
  expect(waveFactor(day.hours, zone())).toBe(0.3);
});

test('big waves two days ago still hurt today, more than 3 calm days', () => {
  const storm = Array.from({ length: 24 }, () => big);
  const calm = pastWaveFactor([calmWaves(), calmWaves(), calmWaves()], zone());
  const afterStorm = pastWaveFactor([calmWaves(), storm, calmWaves()], zone());
  expect(afterStorm).toBeLessThan(calm);
});

test('yesterday counts more than 3 days ago', () => {
  const storm = Array.from({ length: 24 }, () => big);
  const yesterday = pastWaveFactor([storm, calmWaves(), calmWaves()], zone());
  const threeAgo = pastWaveFactor([calmWaves(), calmWaves(), storm], zone());
  expect(yesterday).toBeLessThan(threeAgo);
});
