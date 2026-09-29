import { esc, hhmm } from './format.js';
import { taipeiDate } from '../core/time.js';

const METERS = ['3', '5', '8', '10', '15', '20', '25', '30+'];
const DEPTHS = ['5', '10', '15', '20', '30+'];
// Same limits as firestore.rules — a report the rules would reject would sit in the outbox forever.
const MAX_METERS = 60;
const MAX_NICKNAME = 20;
const MAX_NOTE = 200;

const radios = (name, values, checked) => values.map((v) =>
  `<label class="opt"><input type="radio" name="${name}" value="${esc(v.value ?? v)}"${(v.value ?? v) === checked ? ' checked' : ''}><span>${esc(v.label ?? v)}</span></label>`).join('');

export function renderReportForm({ spot, defaultZoneId, nickname, now }) {
  const zones = spot.zones.map((z) => ({ value: z.id, label: z.name }));
  return `<header class="pad"><button type="button" class="link" data-action="back">← 返回</button>
    <div class="t1">回報能見度 · 📍 ${esc(spot.name)}</div><div class="mut">10 秒就好，謝謝你 🙏</div></header>
  <form id="report" class="form">
    <div class="q">哪一區？</div><div class="opts">${radios('zoneId', zones, defaultZoneId ?? spot.zones[0].id)}</div>
    <div class="q">看到幾米？</div><div class="opts">${radios('meters', METERS, null)}</div>
    <div class="q">大概幾米深？</div><div class="opts">${radios('depth', DEPTHS, '10')}</div>
    <div class="q">什麼時候下水？（今天）</div><input class="inp" type="time" name="time" value="${hhmm(now)}">
    <div class="q">暱稱</div><input class="inp" name="nickname" maxlength="${MAX_NICKNAME}" value="${esc(nickname ?? '')}">
    <div class="q">想說的話（可以不填）</div><input class="inp" name="note" maxlength="${MAX_NOTE}">
    <div class="err" id="report-error" role="alert"></div>
    <button class="btn" type="submit">送出</button>
    <div class="foot">只存「哪一區」，不存你的精準位置</div>
  </form>`;
}

const inRange = (v) => {
  const n = Number(String(v ?? '').replace('+', ''));
  return String(v ?? '').trim() !== '' && Number.isFinite(n) && n >= 0 && n <= MAX_METERS;
};

export function parseReportForm(v, now) {
  if (!String(v.zoneId ?? '').trim()) return { error: '請選哪一區' };
  if (!inRange(v.meters)) return { error: '請選看到幾米' };
  const depth = v.depth ?? '10';
  if (!inRange(depth)) return { error: '請選大概幾米深' };
  const nickname = String(v.nickname ?? '').trim();
  if (!nickname) return { error: '請輸入暱稱' };
  if (nickname.length > MAX_NICKNAME) return { error: `暱稱最多 ${MAX_NICKNAME} 個字` };
  const note = String(v.note ?? '').trim();
  if (note.length > MAX_NOTE) return { error: `想說的話最多 ${MAX_NOTE} 個字` };
  const date = taipeiDate(now);
  const diveTime = Date.parse(`${date}T${v.time}:00+08:00`);
  if (!Number.isFinite(diveTime)) return { error: '請輸入下水時間' };
  if (diveTime > now) return { error: '下水時間不能比現在晚' };
  return { zoneId: v.zoneId, meters: v.meters, depth, diveTime, nickname, note };
}
