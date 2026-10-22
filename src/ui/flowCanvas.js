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
    ctx.globalCompositeOperation = 'destination-out'; // old pixels fade: that is the tail
    ctx.fillStyle = `rgba(0,0,0,${K.flowFade})`;
    ctx.fillRect(0, 0, pw, ph);
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.8 * ratio;
    const t = ts / 1000;
    for (const p of particles) {
      const ox = p.x;
      const oy = p.y;
      stepParticle(p, dt, v, W, h, t);
      if (p.age === 0) continue; // it just restarted somewhere else: no streak across the map
      ctx.strokeStyle = `rgba(150,225,255,${(0.85 * particleAlpha(p)).toFixed(2)})`;
      ctx.beginPath();
      ctx.moveTo(ox * k, oy * k);
      ctx.lineTo(p.x * k, p.y * k);
      ctx.stroke();
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
