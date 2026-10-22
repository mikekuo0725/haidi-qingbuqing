import { K } from '../core/constants.js';
import { flowVelocity, particleCount, makeParticles, stepParticle, particleAlpha } from '../core/flow.js';

const W = 300; // the map is this many map units wide (MAP_W)
const MAX_DPR = 2;
const MAX_DT = 0.05;

// The loop behind the drifting lines on the sea map. It looks for the current .cmap-flow canvas on every frame,
// so a page redraw or a spot change just hands it a new canvas. Direction and speed are read from the canvas.
export function createFlow({
  find,
  raf = (cb) => requestAnimationFrame(cb),
  cancel = (id) => cancelAnimationFrame(id),
}) {
  let id = null;
  let last = null;
  let canvas = null;
  let particles = [];
  let h = 0;

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
      particles = makeParticles(particleCount(W, h), W, h);
    }

    const v = flowVelocity(Number(c.dataset.kn) || 0, Number(c.dataset.to) || 0);
    const k = pw / W;
    ctx.clearRect(0, 0, pw, ph); // wiped every frame: tails come from remembered positions, so nothing is left behind
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.8 * ratio;
    const t = ts / 1000;
    const groups = [[], [], [], []]; // lines by how visible they are now (fading in or out)
    for (const p of particles) {
      stepParticle(p, dt, v, W, h, t);
      const trail = (p.trail ??= []);
      if (p.age === 0) trail.length = 0; // it just restarted somewhere else: no streak across the map
      trail.push(p.x, p.y);
      if (trail.length > 2 * K.flowTrail) trail.splice(0, 2);
      const a = particleAlpha(p);
      if (a > 0) groups[Math.min(3, Math.ceil(a * 4) - 1)].push(trail);
    }
    // One stroke per (tail step, visibility group): a few dozen calls a frame, not one per line.
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
        ctx.strokeStyle = `rgba(150,225,255,${(0.85 * ((g + 1) / 4) * fade).toFixed(2)})`;
        ctx.stroke();
      });
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
