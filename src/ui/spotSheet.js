import { esc } from './format.js';

const kmText = (km) => (km < 1 ? '不到 1' : String(Math.round(km)));

function row({ spot, km }, currentId, nearId) {
  const on = spot.id === currentId;
  const here = km != null && spot.id === nearId;
  const dist = km == null ? '' : `${here ? '你在這裡 · ' : ''}${kmText(km)} 公里`;
  return `<button type="button" class="srow${on ? ' on' : ''}" data-spot="${esc(spot.id)}" aria-pressed="${on}"><span>${on ? '✓ ' : ''}${esc(spot.name)}</span><span class="${here ? 'here' : 'mut'}">${dist}</span></button>`;
}

export function renderSpotSheet({ rows, currentId, nearId = null }) {
  return `<div class="sheet-bg" data-action="close-sheet"></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-label="選潛點">
    <div class="sheet-h">選潛點</div>
    ${rows.map((r) => row(r, currentId, nearId)).join('')}
    <div class="mut sheet-f">更多潛點陸續加入</div>
  </div>`;
}
