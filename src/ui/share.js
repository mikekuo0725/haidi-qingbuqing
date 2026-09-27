import { LIGHT, knots } from './format.js';

export function buildShareText({ spot, dayLabel, forecast, url }) {
  const zones = forecast.zones.map((z) => `${z.name} ${LIGHT[z.light].emoji} ${z.low}~${z.high} 米`).join('、');
  const s = forecast.safety;
  const sst = forecast.sst == null ? '' : `｜水溫 ${Math.round(forecast.sst)}°C`;
  return `${dayLabel}${spot.name}：${zones}｜流 ${knots(s.currentKn)} ${LIGHT[s.currentLevel].emoji}${sst}｜最佳 ${forecast.best.start}~${forecast.best.end} 點 👉 ${url}`;
}

export async function shareOrCopy(text, nav = navigator) {
  if (nav.share) {
    try { await nav.share({ text }); return 'shared'; } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled'; // user closed the share sheet
      // blocked (e.g. LINE's in-app browser): fall back to the clipboard
    }
  }
  if (nav.clipboard?.writeText) {
    try { await nav.clipboard.writeText(text); return 'copied'; } catch { /* blocked */ }
  }
  return 'failed';
}
