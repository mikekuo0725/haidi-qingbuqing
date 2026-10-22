import { K } from '../core/constants.js';
import { flowVelocity, windVelocity, particleCount, windParticleCount, makeParticles, stepParticle, particleAlpha, normLines } from '../core/flow.js';

const W = 300; // the map is this many map units wide (MAP_W)
const MAX_DPR = 2;
const MAX_DT = 0.05;
const CURRENT = { rgb: '150,225,255', alpha: 0.85, width: 1.8 };
const WIND = { rgb: '255,110,40', alpha: 0.9, width: 1.4 };

// Move every line one step and sort the visible ones into 4 groups by how visible they are now (fading in or out).
function advance(list, v, dt, t, h) {
  const groups = [[], [], [], []];
  for (const p of list) {
    stepParticle(p, dt, v, W, h, t);
    const trail = (p.trail ??= []);
    if (p.age === 0) trail.length = 0; // it just restarted somewhere else: no streak across the map
    trail.push(p.x, p.y);
    if (trail.length > 2 * K.flowTrail) trail.splice(0, 2);
    const a = particleAlpha(p);
    if (a > 0) groups[Math.min(3, Math.ceil(a * 4) - 1)].push(trail);
  }
  return groups;
}

// One stroke per (tail step, visibility group): a few dozen calls a frame, not one per line.
function strokeGroups(ctx, groups, style, k, ratio) {
  ctx.lineWidth = style.width * ratio;
  for (let s = 0; s < K.flowTrail - 1; s++) {
    const fade = 1 - s / K.flowTrail; // s = 0 is the newest step
    groups.forEach((trails, g) => {
      ctx.beginPath();
      let any = false;
      for (const trail of trails) {
        const n = trail.length / 2;
        if (n < s + 2) continue;
        const i = 2 * (n - 2 - s);
        ctx.moveTo(trail[i] * k, trail[i + 1] * k);
        ctx.lineTo(trail[i + 2] * k, trail[i + 3] * k);
        any = true;
      }
      if (!any) return;
      ctx.strokeStyle = `rgba(${style.rgb},${(style.alpha * ((g + 1) / 4) * fade).toFixed(2)})`;
      ctx.stroke();
    });
  }
}

// The loop behind the drifting lines on the sea map. It looks for the current .cmap-flow canvas on every frame,
// so a page redraw or a spot change just hands it a new canvas. The canvas carries what to draw:
// data-lines (both | cur | wind), the current (data-kn, data-to) and the wind (data-wkmh, data-wfrom).
export function createFlow({
  find,
  raf = (cb) => requestAnimationFrame(cb),
  cancel = (id) => cancelAnimationFrame(id),
}) {
  let id = null;
  let last = null;
  let canvas = null;
  let current = [];
  let wind = [];
  let h = 0;
  let drawn = { cur: false, wind: false }; // what the previous frame drew

  function frame(ts) {
    id = raf(frame);
    const dt = last == null ? 0.016 : Math.min((ts - last) / 1000, MAX_DT);
    last = ts;
    const c = find();
    const ctx = c?.getContext('2d');
    if (!c || !ctx || !c.clientWidth) return;

    const ratio = Math.min(globalThis.devicePixelRatio || 1, MAX_DPR);
    const pw = Math.round(c.clientWidth * ratio);
    const ph = Math.round(c.clientHeight * ratio);
    if (c !== canvas || c.width !== pw || c.height !== ph) {
      canvas = c;
      c.width = pw;
      c.height = ph;
      h = (W * c.clientHeight) / c.clientWidth;
      current = makeParticles(particleCount(W, h), W, h);
      wind = makeParticles(windParticleCount(W, h), W, h);
    }

    const lines = normLines(c.dataset.lines);
    const hasWind = c.dataset.wfrom != null && c.dataset.wfrom !== '';
    const want = { cur: lines !== 'wind', wind: lines !== 'cur' && hasWind };
    // a set that was off comes back with fresh tails, so it does not streak from where it was left
    if (want.cur && !drawn.cur) current.forEach((p) => { p.trail = []; });
    if (want.wind && !drawn.wind) wind.forEach((p) => { p.trail = []; });
    drawn = want;

    const k = pw / W;
    ctx.clearRect(0, 0, pw, ph); // wiped every frame: tails come from remembered positions, so nothing is left behind
    ctx.lineCap = 'round';
    const t = ts / 1000;
    if (want.cur) {
      const v = flowVelocity(Number(c.dataset.kn) || 0, Number(c.dataset.to) || 0);
      strokeGroups(ctx, advance(current, v, dt, t, h), CURRENT, k, ratio);
    }
    if (want.wind) {
      const v = windVelocity(Number(c.dataset.wkmh) || 0, Number(c.dataset.wfrom) || 0);
      strokeGroups(ctx, advance(wind, v, dt, t, h), WIND, k, ratio);
    }
  }

  return {
    start() {
      if (id != null) return;
      last = null;
      id = raf(frame);
    },
    stop() {
      if (id != null) cancel(id);
      id = null;
    },
    running: () => id != null,
  };
}
