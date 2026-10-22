import { test, expect } from 'vitest';
import { flowVelocity, particleCount, makeParticles, stepParticle, particleAlpha } from '../../src/core/flow.js';
import { K } from '../../src/core/constants.js';

const near = (got, want) => {
  expect(got[0]).toBeCloseTo(want[0], 6);
  expect(got[1]).toBeCloseTo(want[1], 6);
};

test('flowVelocity points where the water flows: 0 north, 90 east, 180 south, 270 west', () => {
  near(flowVelocity(1, 0), [0, -22]);
  near(flowVelocity(1, 90), [22, 0]);
  near(flowVelocity(1, 180), [0, 22]);
  near(flowVelocity(1, 270), [-22, 0]);
  near(flowVelocity(1, 360), flowVelocity(1, 0));
});

test('flowVelocity grows with the speed and is still at 0 knots', () => {
  near(flowVelocity(2, 90), [44, 0]);
  const v = flowVelocity(0, 123);
  expect(Math.abs(v[0])).toBe(0);
  expect(Math.abs(v[1])).toBe(0);
});

test('particleCount follows the map area, within 1..max', () => {
  expect(particleCount(300, 278)).toBe(379);
  expect(particleCount(300, 10)).toBe(14);
  expect(particleCount(3000, 3000)).toBe(K.flowMaxParticles);
  expect(particleCount(0, 0)).toBe(1);
});

test('makeParticles puts every particle inside the box with a life in range', () => {
  const ps = makeParticles(5, 300, 278, () => 0.5);
  expect(ps).toHaveLength(5);
  for (const p of ps) {
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThanOrEqual(300);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeLessThanOrEqual(278);
    expect(p.life).toBeGreaterThanOrEqual(K.flowLifeMin);
    expect(p.life).toBeLessThanOrEqual(K.flowLifeMax);
  }
});

test('stepParticle moves by the velocity (plus a tiny wobble) and ages', () => {
  const p = { x: 100, y: 100, age: 0, life: 5, phase: 0 };
  stepParticle(p, 1, [10, 0], 300, 278, 0, () => 0.5);
  expect(p.x).toBeGreaterThan(109.5);
  expect(p.x).toBeLessThan(110.5);
  expect(p.age).toBe(1);
});

test('stepParticle respawns an old particle, and one that left the box', () => {
  const old = { x: 100, y: 100, age: 5.9, life: 5, phase: 0 };
  stepParticle(old, 0.1, [0, 0], 300, 278, 0, () => 0.25);
  expect(old.age).toBe(0);
  expect(old.x).toBeCloseTo(75);
  expect(old.y).toBeCloseTo(69.5);

  const out = { x: 311, y: 100, age: 1, life: 5, phase: 0 };
  stepParticle(out, 0.016, [0, 0], 300, 278, 0, () => 0.25);
  expect(out.age).toBe(0);
  expect(out.x).toBeLessThanOrEqual(300);
});

test('particleAlpha fades in, holds, fades out, and stays within 0..1', () => {
  expect(particleAlpha({ age: 0, life: 5 })).toBe(0);
  expect(particleAlpha({ age: 2.5, life: 5 })).toBe(1);
  expect(particleAlpha({ age: 5, life: 5 })).toBe(0);
  expect(particleAlpha({ age: -1, life: 5 })).toBe(0);
  expect(particleAlpha({ age: 9, life: 5 })).toBe(0);
});
