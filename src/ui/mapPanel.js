// The panel under the Taiwan map: home (the clearest spots), one spot (every zone), or one dive site.
import { LIGHT, esc, knots, arrow } from './format.js';
import { rankSpots } from '../core/overview.js';
import { bearingText } from '../core/math.js';

function dayTabs(dayLabels, dayIndex) {
  return `<nav class="days">${dayLabels.map((l, i) => `<button type="button" data-day="${i}" class="${i === dayIndex ? 'on' : ''}">${l}</button>`).join('')}</nav>`;
}

const dot = (light) => `<span class="tdot ${LIGHT[light].cls}"></span>`;
const flowText = (kn, toDeg) => (Number.isFinite(kn) && Number.isFinite(toDeg) ? `${knots(kn)} ${arrow(toDeg)}` : '—');
const windText = (kmh, from) => (Number.isFinite(kmh) && Number.isFinite(from) ? `從${bearingText(from)}來 ${Math.round(kmh)} 公里` : '—');

export function renderMapHome({ summaries, spots, dayIndex, dayLabels }) {
  const byId = Object.fromEntries(spots.map((s) => [s.id, s]));
  const best = rankSpots(summaries, dayIndex).filter((id) => summaries[id]?.[dayIndex] && byId[id]).slice(0, 2);
  const rows = best.map((id) => {
    const d = summaries[id][dayIndex];
    return `<div class="tli" data-mapspot="${id}" role="button" tabindex="0">${dot(d.light)}<div>${esc(byId[id].name)}<small>最清：${esc(d.zoneName)}</small></div><span class="m">${Math.round(d.meters)} 米</span></div>`;
  }).join('');
  return `${dayTabs(dayLabels, dayIndex)}${rows}<div class="mut tp-hint">點地圖上的圓點看各區</div>`;
}

export function renderMapSpot({ spot, summary, forecast, dayIndex, dayLabels, picked = null }) {
  const head = `<div class="tp-head">📍 ${esc(spot.name)}<button type="button" class="link" data-action="map-home">← 全台</button></div>${dayTabs(dayLabels, dayIndex)}`;
  if (!summary || !forecast) return `${head}<div class="pad mut">沒有資料</div>`;
  const pickedZone = picked && forecast.zones.find((z) => z.zoneId === picked.zoneId);
  const strip = `<div class="tstrip"><span>🌊 海流<br><b>${flowText(summary.flowKn, summary.flowToDeg)}</b></span><span>🌬️ 風<br><b>${windText(summary.windKmh, summary.windDir)}</b></span><span>🌡️ 水溫<br><b>${summary.sst == null ? '—' : `${Math.round(summary.sst)}°C`}</b></span></div>`;
  const pick = pickedZone ? `<div class="tp-pick">📌 <b>${esc(picked.name)}</b> 在「${esc(pickedZone.name)}」這一區</div>` : '';
  const rows = forecast.zones.map((z) => `<div class="tli${pickedZone?.zoneId === z.zoneId ? ' on' : ''}" data-zone="${z.zoneId}" role="button" tabindex="0">${dot(z.light)}<div>${esc(z.name)}<small>${esc(z.reason)}</small></div><span class="m">${z.low}~${z.high} 米</span></div>`).join('');
  return `${head}${strip}${pick}${rows}<button type="button" class="btn" data-action="open-spot">看海流、風的動態圖和每小時 →</button>`;
}

export function renderSiteCard({ site, spot, forecast, dayIndex, dayLabels }) {
  const facts = [site.level ? `${site.level}潛點` : null, site.maxDepthM ? `最深 ${site.maxDepthM} 米` : null, site.entry ?? null].filter(Boolean);
  const zone = spot && forecast ? forecast.zones.find((z) => z.zoneId === site.zoneId) : null;
  let body;
  if (zone) {
    const c = forecast.currents.find((x) => x.hour === forecast.best.start) ?? forecast.currents[0] ?? {};
    body = `<div class="tli big ${LIGHT[zone.light].cls}">${dot(zone.light)}<div>${dayLabels[dayIndex]}能見度預測<small>${esc(spot.name)}・${esc(zone.name)}・${esc(zone.reason)}</small></div><span class="m">${zone.low}～${zone.high} 米</span></div>
    <div class="tstrip"><span>🌊 海流<br><b>${flowText(c.kn, c.toDeg)}</b></span><span>🌬️ 風<br><b>${windText(c.windKmh, c.windDir)}</b></span><span>⏰ 最佳下水<br><b>${forecast.best.start}~${forecast.best.end} 點</b></span></div>
    <div class="tp-btns"><button type="button" class="btn btn2" data-action="map-spot">← 看這個潛點各區</button><button type="button" class="btn" data-action="open-spot" data-zone="${zone.zoneId}">海流、風動態圖 →</button></div>`;
  } else {
    body = `<div class="tli">${dot('gray')}<div>這裡還沒有能見度預測<small>以後加了這個潛點就會有</small></div></div>`;
  }
  const src = site.url ? `<div class="mut tp-src">潛點資料：BlueTrend 藍色脈動 <a href="${esc(site.url)}" target="_blank" rel="noopener">介紹 ↗</a></div>` : '';
  return `<div class="tp-head">📍 ${esc(site.name)}<button type="button" class="link" data-action="map-home">← 全台</button></div>${dayTabs(dayLabels, dayIndex)}
  ${facts.length ? `<div class="mut tp-facts">${esc(facts.join(' · '))}</div>` : ''}${body}${src}`;
}
