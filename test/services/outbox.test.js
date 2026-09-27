import { test, expect } from 'vitest';
import { createOutbox } from '../../src/services/outbox.js';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
}

test('sent immediately when online', async () => {
  const sent = [];
  const box = createOutbox(fakeStorage(), async (d) => { sent.push(d); });
  expect(await box.add({ a: 1 })).toBe('sent');
  expect(sent).toEqual([{ a: 1 }]);
  expect(box.size()).toBe(0);
});

test('queued when sending fails, flushed later', async () => {
  let online = false;
  const sent = [];
  const storage = fakeStorage();
  const box = createOutbox(storage, async (d) => { if (!online) throw new Error('offline'); sent.push(d); });
  expect(await box.add({ a: 1 })).toBe('queued');
  expect(box.size()).toBe(1);
  online = true;
  expect(await box.flush()).toBe(1);
  expect(sent).toEqual([{ a: 1 }]);
  expect(box.size()).toBe(0);
});

test('queue survives a page reload (same storage)', async () => {
  const storage = fakeStorage();
  const box1 = createOutbox(storage, async () => { throw new Error('offline'); });
  await box1.add({ a: 1 });
  const box2 = createOutbox(storage, async () => {});
  expect(box2.size()).toBe(1);
});
