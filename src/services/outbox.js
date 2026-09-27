const KEY = 'haidi:outbox';

const keyOf = (item) => (item && item.id != null ? `id:${item.id}` : `json:${JSON.stringify(item)}`);

export function createOutbox(storage, sendFn) {
  const read = () => JSON.parse(storage.getItem(KEY) ?? '[]');
  const write = (list) => storage.setItem(KEY, JSON.stringify(list));

  // add() and flush() are serialized through this chain so a flush() in
  // progress (each sendFn can take up to ~8s) never overlaps with an add()
  // or another flush() on the same outbox instance — otherwise a plain
  // read-modify-write on `write(left)` could silently overwrite an item
  // queued mid-flush.
  let chain = Promise.resolve();
  const serialize = (fn) => {
    const result = chain.then(fn, fn);
    chain = result.then(() => undefined, () => undefined);
    return result;
  };

  return {
    size: () => read().length,
    add(item) {
      return serialize(async () => {
        try {
          await sendFn(item);
          return 'sent';
        } catch {
          write([...read(), item]);
          return 'queued';
        }
      });
    },
    flush() {
      return serialize(async () => {
        const list = read();
        const sentKeys = new Set();
        let sent = 0;
        for (const item of list) {
          try {
            await sendFn(item);
            sent++;
            sentKeys.add(keyOf(item));
          } catch {
            // left in the outbox
          }
        }
        // Re-read storage instead of writing back the `list` we started
        // with: two different outbox instances (e.g. two tabs) can share
        // the same storage and flush() concurrently, so storage may have
        // moved since we read it. Remove only the items we actually sent,
        // matched by id (or by JSON content when an item has no id).
        const current = read();
        const left = current.filter((item) => !sentKeys.has(keyOf(item)));
        write(left);
        return sent;
      });
    },
  };
}
