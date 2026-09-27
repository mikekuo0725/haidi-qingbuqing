import { LIGHT, COMPARE_TEXT, CONF_TEXT, SAFETY_TEXT, knots, arrow, hhmm, md, timeAgo, esc } from './format.js';

function locationRow(spot, located) {
  if (located.status === 'near') {
    const z = spot.zones.find((x) => x.id === located.zoneId);
    return `<div class="loc">📍 你現在在${esc(spot.name)}<b>${esc(z.name)}</b></div>`;
  }
  if (located.status === 'far') return `<div class="loc">📍 你離${esc(spot.name)} ${Math.round(located.km)} 公里</div>`;
  return '';
}

function seaRow(f) {
  const s = f.safety;
  const cur = `${knots(s.currentKn)} ${arrow(s.currentToDeg)} ${LIGHT[s.currentLevel].emoji} ${SAFETY_TEXT[s.currentLevel]}`;
  const wave = s.waveRed ? `<div class="warn">🔴 浪 ${s.waveMaxM.toFixed(1)} 米，不建議下水</div>` : '';
  const up = s.upwelling ? '<div class="warn">🥶 水溫突降，可能有湧升流，幾天後水可能變綠</div>' : '';
  const best = `${f.best.start}~${f.best.end} 點${f.best.slack ? '（平潮）' : ''}`;
  const sst = f.sst == null ? '—' : `${Math.round(f.sst)}°C`;
  return `<div class="sea">
    <div class="wide">🌀 海流<br><b>${cur}</b></div>
    <div>🌡️ 水溫<br><b>${sst}</b></div>
    <div>⏰ 最佳下水<br><b>${best}</b></div>
    <div>🌊 浪<br><b>${s.waveMaxM.toFixed(1)} 米</b></div>
    ${wave}${up}
  </div>`;
}

function card(z, located) {
  const me = located.status === 'near' && located.zoneId === z.zoneId;
  const reports = z.todayReports.length
    ? `<span class="chip">今天 ${z.todayReports.length} 人回報：${Math.round(z.todayReports.reduce((a, r) => a + r.meters, 0) / z.todayReports.length)}m</span>`
    : '';
  const label = esc(`${z.name} ${LIGHT[z.light].emoji} ${z.low}~${z.high} 米`);
  return `<div class="card${me ? ' me' : ''}" data-zone="${z.zoneId}" role="button" tabindex="0" aria-label="${label}">${me ? '<span class="tag">你在這裡</span>' : ''}
    <div class="top"><div class="dot ${LIGHT[z.light].cls}"></div><div class="zn">${esc(z.name)}</div><div class="m">${z.low}~${z.high}m</div></div>
    <div class="sub">${esc(z.reason)}</div>
    <div class="chips"><span class="chip ${z.compare}">${COMPARE_TEXT[z.compare]}</span><span class="chip">把握度 ${CONF_TEXT[z.confidence]}</span>${reports}</div>
  </div>`;
}

export function renderMain({ spot, forecast, dayIndex, dayLabels, located, freshness, now }) {
  const days = dayLabels.map((l, i) => `<button type="button" data-day="${i}" class="${i === dayIndex ? 'on' : ''}">${l}</button>`).join('');
  const staleAgo = forecast?.stale < 1 ? '不到 1 小時前' : ` ${Math.round(forecast?.stale)} 小時前`;
  const stale = forecast?.stale != null ? `<div class="warn">⚪ 抓不到最新天氣，這是${staleAgo}的預測</div>` : '';
  const foot = [
    freshness.weatherAt ? `天氣 ${hhmm(freshness.weatherAt)}` : '天氣 —',
    freshness.satelliteDate ? `衛星 ${md(freshness.satelliteDate)}` : '衛星資料暫缺，準度較低',
    freshness.lastReportAt ? `回報 ${timeAgo(freshness.lastReportAt, now)}` : '還沒有回報',
  ].join(' ・ ');
  return `<header class="pad"><div class="t1">${esc(spot.name)} 海底清不清</div><div class="mut">預測，不是保證</div></header>
  <nav class="days">${days}</nav>
  ${locationRow(spot, located)}
  ${stale}
  ${forecast ? seaRow(forecast) : ''}
  ${forecast ? `<div class="cards">${forecast.zones.map((z) => card(z, located)).join('')}</div>` : '<div class="pad">這天沒有資料</div>'}
  <button type="button" class="btn" data-action="report">🤿 我下水了，回報能見度</button>
  ${forecast ? '<button type="button" class="btn btn2" data-action="share">📤 分享給潛伴</button>' : ''}
  <footer class="foot">${foot}<br>海流是整片海的預測，分不出各區</footer>`;
}
