import { LIGHT, knots } from './format.js';

export function buildShareText({ spot, dayLabel, forecast, url }) {
  const zones = forecast.zones.map((z) => `${z.name} ${LIGHT[z.light].emoji} ${z.low}~${z.high} 米`).join('、');
  const s = forecast.safety;
  const sst = forecast.sst == null ? '' : `｜水溫 ${Math.round(forecast.sst)}°C`;
  return `${dayLabel}${spot.name}：${zones}｜流 ${knots(s.currentKn)} ${LIGHT[s.currentLevel].emoji}${sst}｜最佳 ${forecast.best.start}~${forecast.best.end} 點 👉 ${url}`;
}

export async function shareOrCopy(text, nav = navigator) {
  try {
    if (nav.share) { await nav.share({ text }); return 'shared'; }
    if (nav.clipboard?.writeText) { await nav.clipboard.writeText(text); return 'copied'; }
  } catch { /* user cancelled or blocked */ }
  return 'failed';
}
