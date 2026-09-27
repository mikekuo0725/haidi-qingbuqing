import { bearingText } from '../core/math.js';

export const LIGHT = {
  purple: { emoji: '🟣', cls: 'pu' }, green: { emoji: '🟢', cls: 'gr' },
  yellow: { emoji: '🟡', cls: 'ye' }, red: { emoji: '🔴', cls: 're' }, gray: { emoji: '⚪', cls: 'gy' },
};
export const COMPARE_TEXT = { up: '比平常清 ↑', down: '比平常濁 ↓', same: '跟平常差不多' };
export const CONF_TEXT = { high: '高', medium: '中', low: '低' };
export const SAFETY_TEXT = { green: '輕鬆', yellow: '注意', red: '⚠️ 流強，建議放流潛或換時段' };
export const FACTOR_LABEL = {
  wave: '🌊 今天的浪', pastWave: '🌊 前幾天的浪', wind: '🌬️ 風', cloud: '☁️ 雲量',
  tide: '🌙 潮汐', river: '🌧️ 河口', currentDir: '🌀 海流方向', currentSpeed: '🌀 海流速度',
};
export const SHELTER_TEXT = { open: '開放海岸', semi: '半開放', bay: '灣內' };
export const BOTTOM_TEXT = { rock: '礁岩', mixed: '混合', sand: '沙底' };

export const knots = (kn) => `${kn.toFixed(2)} 節`;
export const arrow = (toDeg) => `→ 往${bearingText(toDeg)}`;
export const hhmm = (ms) => new Date(ms + 8 * 3600000).toISOString().slice(11, 16);
export const md = (dateStr) => `${Number(dateStr.slice(5, 7))}/${Number(dateStr.slice(8, 10))}`;

export function timeAgo(ms, now) {
  const min = Math.max(0, Math.round((now - ms) / 60000));
  if (min < 60) return `${min} 分鐘前`;
  if (min < 1440) return `${Math.round(min / 60)} 小時前`;
  return `${Math.round(min / 1440)} 天前`;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
