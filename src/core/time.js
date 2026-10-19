import { K } from './constants.js';

const DAY = 86400000;
const TAIPEI_OFFSET = 8 * 3600000;

export const taipeiDate = (ms, offsetDays = 0) =>
  new Date(ms + TAIPEI_OFFSET + offsetDays * DAY).toISOString().slice(0, 10);

export const addDays = (dateStr, n) =>
  new Date(Date.parse(`${dateStr}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

export const taipeiHour = (ms) => new Date(ms + TAIPEI_OFFSET).getUTCHours();

// Which day tab the app opens on: 0 = today, 1 = tomorrow.
export const openingDayIndex = (ms) => (taipeiHour(ms) < K.todayUntilHour ? 0 : 1);
