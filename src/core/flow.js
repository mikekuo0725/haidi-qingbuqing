import { K } from './constants.js';
import { clamp } from './math.js';

const FADE_IN = 0.5;
const FADE_OUT = 0.8;
const WOBBLE = 0.3; // map units per second: a little sway so the water does not look ruled
const MARGIN = 10;

// Map units per second; x grows east, y grows south. toDeg is where the water flows TO (0 = north).
export function flowVelocity(kn, toDeg) {
  const r = (toDeg * Math.PI) / 180;
  const s = kn * K.flowSpeedPerKn;
  return [Math.sin(r) * s, -Math.cos(r) * s];
}

export const particleCount = (w, h) => clamp(Math.round((w * h) / K.flowDensity), 1, K.flowMaxParticles);

const spawn = (p, w, h, rand) => {
  p.x = rand() * w;
  p.y = rand() * h;
  p.age = 0;
  p.life = K.flowLifeMin + rand() * (K.flowLifeMax - K.flowLifeMin);
  p.phase = rand() * Math.PI * 2;
  return p;
};

// Start with random ages so the lines do not all appear and vanish together.
export function makeParticles(n, w, h, rand = Math.random) {
  return Array.from({ length: n }, () => {
    const p = spawn({}, w, h, rand);
    p.age = rand() * p.life;
    return p;
  });
}

export function stepParticle(p, dt, v, w, h, t, rand = Math.random) {
  p.age += dt;
  const out = p.x < -MARGIN || p.x > w + MARGIN || p.y < -MARGIN || p.y > h + MARGIN;
  if (p.age > p.life || out) {
    spawn(p, w, h, rand);
    return;
  }
  const sway = v[0] || v[1] ? Math.sin(t * 0.6 + p.phase) * WOBBLE : 0; // still water stays still
  p.x += (v[0] + sway) * dt;
  p.y += (v[1] + sway) * dt;
}

export const particleAlpha = (p) => clamp(Math.min(p.age / FADE_IN, (p.life - p.age) / FADE_OUT), 0, 1);
