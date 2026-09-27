import { test, expect, vi } from 'vitest';
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

test('add() that fails while a slow flush() is in progress is not lost', async () => {
  const storage = fakeStorage();
  storage.setItem('haidi:outbox', JSON.stringify([{ id: 'slow' }]));
  let releaseSlow;
  const sendFn = vi.fn((item) => {
    if (item.id === 'slow') return new Promise((resolve) => { releaseSlow = resolve; });
    if (item.id === 'fails') return Promise.reject(new Error('nope'));
    return Promise.resolve();
  });
  const box = createOutbox(storage, sendFn);

  const flushDone = box.flush();
  const addDone = box.add({ id: 'fails' }); // queued while flush() is still awaiting sendFn('slow')
  await new Promise((r) => setTimeout(r, 0)); // let flush()'s microtasks reach the pending sendFn('slow') call
  expect(releaseSlow).toBeInstanceOf(Function);
  releaseSlow();
  await flushDone;
  await addDone;

  expect(JSON.parse(storage.getItem('haidi:outbox'))).toEqual([{ id: 'fails' }]);
});

test('two concurrent flush() calls on separate instances lose nothing', async () => {
  const storage = fakeStorage();
  storage.setItem('haidi:outbox', JSON.stringify([{ id: 'a' }, { id: 'b' }]));
  const sendFn = async () => { await new Promise((r) => setTimeout(r, 5)); };
  const box1 = createOutbox(storage, sendFn);
  const box2 = createOutbox(storage, sendFn);

  await Promise.all([box1.flush(), box2.flush()]);

  expect(JSON.parse(storage.getItem('haidi:outbox'))).toEqual([]);
});
