const DAY = 86400000;
const TAIPEI_OFFSET = 8 * 3600000;

export const taipeiDate = (ms, offsetDays = 0) =>
  new Date(ms + TAIPEI_OFFSET + offsetDays * DAY).toISOString().slice(0, 10);

export const addDays = (dateStr, n) =>
  new Date(Date.parse(`${dateStr}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
