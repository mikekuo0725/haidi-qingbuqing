import { test, expect } from 'vitest';
import { createFlow } from '../../src/ui/flowCanvas.js';

function fakeCtx() {
  const calls = { stroke: 0, segments: [], cleared: 0, filled: 0 };
  let from = null;
  const ctx = {
    calls,
    clearRect: () => { calls.cleared++; },
    fillRect: () => { calls.filled++; },
    beginPath: () => {},
    moveTo: (x, y) => { from = [x, y]; },
    lineTo: (x, y) => { calls.segments.push([from, [x, y]]); },
    stroke: () => { calls.stroke++; },
  };
  return ctx;
}
const fakeCanvas = (ctx, kn = '1', to = '90') => ({
  clientWidth: 300, clientHeight: 278, width: 0, height: 0,
  dataset: { kn, to },
  getContext: () => ctx,
});
function rig(initial) {
  const r = { canvas: initial, cb: null, id: 0, cancelled: [], ts: 0 };
  r.flow = createFlow({
    find: () => r.canvas,
    raf: (cb) => { r.cb = cb; return ++r.id; },
    cancel: (id) => r.cancelled.push(id),
  });
  r.frame = () => { const cb = r.cb; r.cb = null; r.ts += 16; cb(r.ts); };
  return r;
}

test('start schedules frames, sizes the canvas to the page box, and draws lines', () => {
  const ctx = fakeCtx();
  const r = rig(fakeCanvas(ctx));
  r.flow.start();
  expect(r.flow.running()).toBe(true);
  r.frame();
  r.frame();
  expect([r.canvas.width, r.canvas.height]).toEqual([300, 278]);
  expect(ctx.calls.stroke).toBeGreaterThan(0);
  expect(r.cb).not.toBeNull(); // the next frame is already scheduled
});

test('stop cancels the pending frame, and start works again after it', () => {
  const r = rig(fakeCanvas(fakeCtx()));
  r.flow.start();
  r.flow.start(); // a second start changes nothing
  expect(r.id).toBe(1);
  r.flow.stop();
  expect(r.cancelled).toEqual([1]);
  expect(r.flow.running()).toBe(false);
  r.flow.start();
  expect(r.flow.running()).toBe(true);
});

test('no canvas on the page: nothing drawn, no error, and the loop keeps going', () => {
  const r = rig(null);
  r.flow.start();
  expect(() => r.frame()).not.toThrow();
  expect(r.cb).not.toBeNull();
});

test('a canvas without a 2d context is left alone', () => {
  const r = rig({ ...fakeCanvas(null), getContext: () => null });
  r.flow.start();
  expect(() => r.frame()).not.toThrow();
});

test('a new canvas element (the page was redrawn) gets sized and drawn on', () => {
  const r = rig(fakeCanvas(fakeCtx()));
  r.flow.start();
  r.frame();
  const ctx2 = fakeCtx();
  r.canvas = fakeCanvas(ctx2);
  r.frame();
  r.frame();
  expect([r.canvas.width, r.canvas.height]).toEqual([300, 278]);
  expect(ctx2.calls.stroke).toBeGreaterThan(0);
});

test('at 0 knots the lines do not move', () => {
  const ctx = fakeCtx();
  const r = rig(fakeCanvas(ctx, '0', '90'));
  r.flow.start();
  for (let i = 0; i < 5; i++) r.frame();
  expect(ctx.calls.segments.length).toBeGreaterThan(0);
  const moved = ctx.calls.segments.filter(([a, b]) => Math.abs(a[0] - b[0]) > 1e-9 || Math.abs(a[1] - b[1]) > 1e-9);
  // a respawned line jumps to a new place; with 3 s minimum life nothing respawns in 5 frames of 16 ms
  expect(moved).toHaveLength(0);
});

test('every frame wipes the whole canvas: no fade-by-overlay, so no faint residue is left behind', () => {
  const ctx = fakeCtx();
  const r = rig(fakeCanvas(ctx));
  r.flow.start();
  for (let i = 0; i < 4; i++) r.frame();
  expect(ctx.calls.cleared).toBe(4);
  expect(ctx.calls.filled).toBe(0);
  expect(ctx.globalCompositeOperation).not.toBe('destination-out');
});
