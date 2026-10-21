import { LIGHT, COMPARE_TEXT, CONF_TEXT, hhmm, md, timeAgo, esc, currentSummary, knots, arrow } from './format.js';
import { renderSeaMap } from './seaMap.js';
import { latestReading } from '../core/buoy.js';
import { taipeiDate, taipeiHour } from '../core/time.js';

function locationRow(spot, located) {
  if (located.status === 'near') {
    const z = spot.zones.find((x) => x.id === located.zoneId);
    return `<div class="loc">📍 你現在在${esc(spot.name)}<b>${esc(z.name)}</b></div>`;
  }
  if (located.status === 'far') return `<div class="loc">📍 你離${esc(spot.name)} ${Math.round(located.km)} 公里</div>`;
  return '';
}

// withCurrent: the old one-line current, only for a spot that has no sea map yet.
function seaRow(f, withCurrent) {
  const s = f.safety;
  const wave = s.waveRed ? `<div class="warn">🔴 浪 ${s.waveMaxM.toFixed(1)} 米，不建議下水</div>` : '';
  const up = s.upwelling ? '<div class="warn">🥶 水溫突降，可能有湧升流，幾天後水可能變綠</div>' : '';
  const best = `${f.best.start}~${f.best.end} 點${f.best.slack ? '（平潮）' : ''}`;
  const sst = f.sst == null ? '—' : `${Math.round(f.sst)}°C`;
  return `<div class="sea">
    ${withCurrent ? `<div class="wide">🌀 海流<br><b>${currentSummary(s)}</b></div>` : ''}
    <div>🌡️ 水溫<br><b>${sst}</b></div>
    <div>⏰ 最佳下水<br><b>${best}</b></div>
    <div>🌊 浪<br><b>${s.waveMaxM.toFixed(1)} 米</b></div>
    ${wave}${up}
  </div>`;
}

// 「現在實測」: the spot's 氣象署 buoy, newest reading. The name matters: a buoy can be km away from the spot.
function buoyRow(spot, buoy, now) {
  const r = spot.buoy ? latestReading(buoy?.readings, now) : null;
  if (!r) return '';
  const parts = [
    r.waveH != null ? `浪 ${r.waveH.toFixed(1)} 米` : null,
    r.sst != null ? `水溫 ${Math.round(r.sst)}°C` : null,
    r.currentKn != null ? `流 ${knots(r.currentKn)} ${arrow(r.currentToDeg)}` : null,
  ].filter(Boolean);
  return `<div class="buoy">🛟 ${esc(spot.buoy.name)} ${r.time.slice(11, 16)} 實測：${parts.join(' ・ ')}</div>`;
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

export function renderMain({ spot, forecast, dayIndex, dayLabels, located, freshness, now, hint = null, staleHours = forecast?.stale ?? null, emptyText = '這天沒有資料', map = null, siteLayer = null, mapHour = null, buoy = null, ships = null }) {
  const days = dayLabels.map((l, i) => `<button type="button" data-day="${i}" class="${i === dayIndex ? 'on' : ''}">${l}</button>`).join('');
  // staleHours comes from the app's overall weather state, not just this day's forecast,
  // so a day with no forecast at all (R5) can still say *why* — old cached weather. (Task 15)
  const staleAgo = staleHours < 1 ? '不到 1 小時前' : ` ${Math.round(staleHours)} 小時前`;
  const stale = staleHours != null ? `<div class="warn">⚪ 抓不到最新天氣，這是${staleAgo}的預測</div>` : '';
  const foot = [
    ...(Number.isFinite(Date.parse(forecast?.coastalAt)) ? [`海況 氣象署 ${hhmm(Date.parse(forecast.coastalAt))}`] : []),
    freshness.weatherAt ? `天氣 ${hhmm(freshness.weatherAt)}` : '天氣 —',
    freshness.satelliteDate ? `衛星 ${md(freshness.satelliteDate)}` : '衛星資料暫缺，準度較低',
    freshness.lastReportAt ? `回報 ${timeAgo(freshness.lastReportAt, now)}` : '還沒有回報',
  ].join(' ・ ');
  return `<header class="pad"><button type="button" class="spotbtn" data-action="spots" aria-label="換潛點，現在是${esc(spot.name)}">📍 ${esc(spot.name)} <span aria-hidden="true">▾</span></button><div class="mut">海底能見度預測</div></header>
  <nav class="days">${days}</nav>
  ${spot.notice ? `<div class="notice">⚠️ ${esc(spot.notice)}</div>` : ''}
  ${locationRow(spot, located)}
  ${stale}
  ${forecast && map ? renderSeaMap({ spot, map, layer: siteLayer, forecast, hourIndex: mapHour, ships, now, nowHour: forecast.date === taipeiDate(now) ? taipeiHour(now) : null }) : ''}
  ${forecast ? seaRow(forecast, !map) : ''}
  ${dayIndex === 0 ? buoyRow(spot, buoy, now) : ''}
  ${forecast ? `<div class="cards">${forecast.zones.map((z) => card(z, located)).join('')}</div>` : `<div class="pad">${esc(emptyText)}</div>`}
  <button type="button" class="btn" data-action="report">🤿 我下水了，回報能見度</button>
  ${forecast ? '<button type="button" class="btn btn2" data-action="share">📤 分享給潛伴</button>' : ''}
  <footer class="foot">${foot}<br>海流是整片海的預測，分不出各區${hint ? `<br>${esc(hint)}` : ''}</footer>`;
}
