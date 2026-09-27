const KEY = 'haidi:outbox';

export function createOutbox(storage, sendFn) {
  const read = () => JSON.parse(storage.getItem(KEY) ?? '[]');
  const write = (list) => storage.setItem(KEY, JSON.stringify(list));

  return {
    size: () => read().length,
    async add(item) {
      try {
        await sendFn(item);
        return 'sent';
      } catch {
        write([...read(), item]);
        return 'queued';
      }
    },
    async flush() {
      const list = read();
      const left = [];
      let sent = 0;
      for (const item of list) {
        try { await sendFn(item); sent++; } catch { left.push(item); }
      }
      write(left);
      return sent;
    },
  };
}
