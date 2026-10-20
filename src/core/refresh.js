import { K } from './constants.js';

// Coming back to the app (phone app switcher): reload only if the data is old enough.
export const shouldAutoRefresh = (loadedAt, now) =>
  loadedAt == null || now - loadedAt >= K.autoRefreshMinutes * 60000;

// Pull down from the very top of the page.
export const isPullRefresh = ({ startY, endY, scrollY }) =>
  scrollY <= 0 && endY - startY >= K.pullRefreshPx;
