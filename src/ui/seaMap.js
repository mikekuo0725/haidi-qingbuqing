import { LIGHT, knots, esc, currentSummary } from './format.js';
import { bearingText, clamp } from '../core/math.js';
import { MAP_W, mapHeight, project } from '../core/mapProject.js';

const ARROW = 'M0,-22 L10,-4 L3,-4 L3,20 L-3,20 L-3,-4 L-10,-4Z'; // points north before rotating
const hourText = (h) => `${String(h).padStart(2, '0')}:00`;

export function defaultHourIndex(forecast) {
  const i = forecast.currents.findIndex((c) => c.hour === forecast.best.start);
  return i < 0 ? 0 : i;
}

// One arrow for the whole spot: the current data is a ~10 km grid, it cannot tell zones apart.
export function currentBadge(c) {
  return `<div class="cmap-badge"><svg viewBox="-27 -27 54 54" width="48" height="48" aria-hidden="true"><path class="cmap-arrow ${LIGHT[c.level].cls}" d="${ARROW}" transform="rotate(${Math.round(c.toDeg)})"/></svg><div>往${bearingText(c.toDeg)}<br><b>${knots(c.kn)}</b></div><div class="cmap-cap">整片海的大概流向</div></div>`;
}

function zoneDot(bbox, zone, light) {
  const [x, y] = project(bbox, zone.location);
  const tx = clamp(x, 26, MAP_W - 26); // keep the name inside the map
  const ty = y < 24 ? y + 26 : y - 14; // name above the dot, or below it at the top edge
  return `<g class="cmap-zone" data-mapzone="${esc(zone.id)}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="10" class="${LIGHT[light].cls}"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="22" fill="transparent" class="cmap-hit"/><text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}">${esc(zone.name)}</text></g>`;
}

export function renderSeaMap({ spot, map, forecast, hourIndex = null }) {
  const n = forecast.currents.length;
  const i = hourIndex == null ? defaultHourIndex(forecast) : clamp(hourIndex, 0, n - 1);
  const c = forecast.currents[i];
  const h = mapHeight(map.bbox).toFixed(1);
  const lights = Object.fromEntries(forecast.zones.map((z) => [z.zoneId, z.light]));
  const land = map.land.map((d) => `<path class="cmap-land" d="${d}"/>`).join('');
  const dots = spot.zones.map((z) => zoneDot(map.bbox, z, lights[z.id] ?? 'gray')).join('');
  return `<div class="cmap">
    <div class="cmap-box">
      <svg viewBox="0 0 ${MAP_W} ${h}" role="img" aria-label="${esc(spot.name)}地圖：分區燈號和海流方向"><rect class="cmap-sea" width="${MAP_W}" height="${h}"/>${land}${dots}</svg>
      ${currentBadge(c)}
      ${map.note ? `<div class="cmap-note">${esc(map.note)}</div>` : ''}
    </div>
    <label class="cmap-slider">⏰ <span class="cmap-time">${hourText(c.hour)}</span> 的海流
      <input type="range" min="0" max="${n - 1}" step="1" value="${i}" aria-valuetext="${c.hour} 點">
    </label>
    <div class="cmap-max">這天最強：<b>${currentSummary(forecast.safety)}</b></div>
    <div class="cmap-src">地圖 © OpenStreetMap 貢獻者</div>
  </div>`;
}

// Slider moved: swap only the badge and the time, so the page does not jump or lose focus.
export function updateSeaMap(root, c) {
  root.querySelector('.cmap-badge').outerHTML = currentBadge(c);
  root.querySelector('.cmap-time').textContent = hourText(c.hour);
  root.querySelector('.cmap input[type="range"]').setAttribute('aria-valuetext', `${c.hour} 點`);
}
