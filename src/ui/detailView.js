import { LIGHT, CONF_TEXT, FACTOR_LABEL, SHELTER_TEXT, BOTTOM_TEXT, hhmm, esc } from './format.js';
import { bearingText } from '../core/math.js';

const EXPLAIN = {
  wave: '今天的浪把底沙揚起來。浪小一點，能見度就會回升。',
  pastWave: '前幾天的大浪，沙還沒沉下去。多放幾天會好轉。',
  wind: '風把海面吹起浪。早上風通常比較小。',
  cloud: '陰天光線少，水看起來比較暗。',
  tide: '大潮時水流比較亂，平潮最清。',
  river: '下雨後河口的泥水會被海流帶過來。',
  currentDir: '海流從河口或岸邊吹向這一區，帶來混濁的水。',
  currentSpeed: '海流太強會攪起底沙。',
};
const ORDER = ['wave', 'pastWave', 'wind', 'cloud', 'tide', 'river', 'currentDir', 'currentSpeed'];

const MIN_SHOW = 0.05; // metres; a smaller change would print as "−0.0"

// Waterfall: start at the base, apply each factor in turn (biggest first), then the report correction.
// Each step is [label, multiplier note, change in metres]; positive = gained.
function waterfall(zone) {
  let cur = zone.base;
  const steps = [];
  for (const k of ORDER) {
    const next = cur * zone.factors[k];
    steps.push({ key: k, label: FACTOR_LABEL[k], note: `×${zone.factors[k].toFixed(2)}`, delta: next - cur, after: next });
    cur = next;
  }
  steps.sort((a, b) => a.delta - b.delta);
  let run = zone.base;
  for (const s of steps) { s.before = run; run += s.delta; s.after = run; }
  const biased = zone.base * ORDER.reduce((a, k) => a * zone.factors[k], 1) * zone.bias;
  const extra = [
    { label: '回報修正', note: `×${zone.bias.toFixed(2)}`, delta: biased - run },
    { label: '今天的回報', note: '', delta: zone.meters - biased },
  ];
  for (const e of extra) { e.before = run; run += e.delta; e.after = run; if (Math.abs(e.delta) >= MIN_SHOW) steps.push(e); }
  return steps;
}

function stepRow(s, scale, i) {
  const gain = s.delta > 0;
  const lo = Math.min(s.before, s.after);
  const cls = gain ? 'up' : i === 0 ? 'top' : i < 3 ? 'mid' : 'low';
  const sign = gain ? '+' : '−';
  return `<div class="wf-row"><div class="wf-l">${s.label}<small>${s.note}</small></div><div class="wf-b"><i class="${cls}" style="left:${(lo / scale * 100).toFixed(1)}%;width:${(Math.abs(s.delta) / scale * 100).toFixed(1)}%"></i></div><div class="wf-n ${cls}">${sign}${Math.abs(s.delta).toFixed(1)}</div></div>`;
}

function reportRow(r) {
  const note = r.note ? ` ・ ${esc(r.note)}` : '';
  return `<div class="rep">${r.meters}m ・ ${r.depth}m 深 ・ ${hhmm(r.diveTime)} ・ ${esc(r.nickname)}${note}</div>`;
}

export function renderDetail({ spot, zone, dateLabel, reports }) {
  const z = spot.zones.find((x) => x.id === zone.zoneId);
  const baseLine = zone.baseSource === 'sat' ? '（衛星最近 30 天）' : '（衛星資料暫缺，用保守數字）';
  const biasLine = zone.biasN >= 5 ? `<div>依過去 ${zone.biasN} 筆回報，這區 ×${zone.bias.toFixed(2)}</div>` : '';
  const steps = waterfall(zone);
  const shown = steps.filter((s) => Math.abs(s.delta) >= MIN_SHOW);
  const calm = steps.filter((s) => s.key && Math.abs(s.delta) < MIN_SHOW);
  const worst = shown.find((s) => s.key && s.delta < 0);
  const scale = Math.max(zone.base, zone.meters, ...steps.map((s) => s.after), 0.1);
  const list = reports.filter((r) => r.zoneId === zone.zoneId);
  return `<header class="pad"><button type="button" class="link" data-action="back">← 返回</button>
    <div class="t1">${esc(zone.name)} <span class="num acc">${zone.low}~${zone.high} m</span> ${LIGHT[zone.light].emoji}</div>
    <div class="mut">${esc(dateLabel)} ・ 把握度 ${CONF_TEXT[zone.confidence]}</div></header>
  <section class="card"><div class="h">從「平常」逐項扣到預測</div>
    <div class="wf-row base"><div class="wf-l">🛰️ 平常底分</div><div class="wf-b"><i class="base" style="left:0;width:${(zone.base / scale * 100).toFixed(1)}%"></i></div><div class="wf-n">${zone.base.toFixed(1)}</div></div>
    <div class="mut wf-src">平常底分：<b>${Math.round(zone.base)} 米</b>${baseLine}</div>
    ${shown.map((s, i) => stepRow(s, scale, i)).join('')}
    <div class="wf-row end"><div class="wf-l">預測</div><div class="wf-b"><i class="${LIGHT[zone.light].cls}" style="left:0;width:${(zone.meters / scale * 100).toFixed(1)}%"></i></div><div class="wf-n">${zone.meters.toFixed(1)}</div></div>
    ${biasLine}
  </section>
  ${worst ? `<section class="card wf-top"><b>最大扣分：${worst.label}</b><br>${EXPLAIN[worst.key] ?? ''}</section>` : ''}
  ${calm.length ? `<div class="mut wf-calm">沒影響：${calm.map((s) => s.label.replace(/^\S+\s/, '')).join('、')}</div>` : ''}
  <section class="card"><div class="h">最近回報</div>
    ${list.length ? list.map(reportRow).join('') : '<div class="mut">還沒有人回報這一區</div>'}
  </section>
  <section class="card"><div class="h">這一區</div>
    <div>面向${bearingText(z.facing)} ・ ${SHELTER_TEXT[z.shelter]} ・ ${BOTTOM_TEXT[z.bottom]}</div>
  </section>`;
}
