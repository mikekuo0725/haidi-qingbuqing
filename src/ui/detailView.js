import { LIGHT, CONF_TEXT, FACTOR_LABEL, SHELTER_TEXT, BOTTOM_TEXT, hhmm, esc } from './format.js';
import { bearingText } from '../core/math.js';

const ORDER = ['wave', 'pastWave', 'wind', 'cloud', 'tide', 'river', 'currentDir', 'currentSpeed'];

function bar(key, v) {
  const loss = Math.round(Math.max(0, 1 - v) * 100); // bar length = how much it takes away
  return `<div class="bar"><span class="l">${FACTOR_LABEL[key]}</span><span class="v"><i style="width:${loss}%"></i></span><span class="n">×${v.toFixed(2)}</span></div>`;
}

function reportRow(r) {
  const note = r.note ? ` ・ ${esc(r.note)}` : '';
  return `<div class="rep">${r.meters}m ・ ${r.depth}m 深 ・ ${hhmm(r.diveTime)} ・ ${esc(r.nickname)}${note}</div>`;
}

export function renderDetail({ spot, zone, dateLabel, reports }) {
  const z = spot.zones.find((x) => x.id === zone.zoneId);
  const baseLine = zone.baseSource === 'sat' ? '（衛星最近 30 天）' : '（衛星資料暫缺，用保守數字）';
  const biasLine = zone.biasN >= 5 ? `<div>依過去 ${zone.biasN} 筆回報，這區 ×${zone.bias.toFixed(2)}</div>` : '';
  const list = reports.filter((r) => r.zoneId === zone.zoneId);
  return `<header class="pad"><button type="button" class="link" data-action="back">← 返回</button>
    <div class="t1">${esc(zone.name)} ${LIGHT[zone.light].emoji} ${zone.low}~${zone.high} 米</div>
    <div class="mut">${esc(dateLabel)} ・ 把握度 ${CONF_TEXT[zone.confidence]}</div></header>
  <section class="card"><div class="h">怎麼算出來的</div>
    <div>🛰️ 平常底分：<b>${Math.round(zone.base)} 米</b>${baseLine}</div>
    ${ORDER.map((k) => bar(k, zone.factors[k])).join('')}
    ${biasLine}
    <div class="res">= 約 <b>${Math.round(zone.meters)} 米</b>（黃條越長，扣越多）</div>
  </section>
  <section class="card"><div class="h">最近回報</div>
    ${list.length ? list.map(reportRow).join('') : '<div class="mut">還沒有人回報這一區</div>'}
  </section>
  <section class="card"><div class="h">這一區</div>
    <div>面向${bearingText(z.facing)} ・ ${SHELTER_TEXT[z.shelter]} ・ ${BOTTOM_TEXT[z.bottom]}</div>
  </section>`;
}
