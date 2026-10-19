import { LIGHT, knots, esc, currentSummary } from './format.js';
import { bearingText, clamp } from '../core/math.js';
import { MAP_W, mapHeight, project } from '../core/mapProject.js';
import { zoneRegions, borderLines } from '../core/mapRegions.js';
import { placeLabels } from '../core/labels.js';

const ARROW = 'M0,-22 L10,-4 L3,-4 L3,20 L-3,20 L-3,-4 L-10,-4Z'; // points north before rotating
const hourText = (h) => `${String(h).padStart(2, '0')}:00`;

// nowHour is set only for today: start at the current hour when it is one of the day's dive hours.
export function defaultHourIndex(forecast, nowHour = null) {
  const now = forecast.currents.findIndex((c) => c.hour === nowHour);
  if (now >= 0) return now;
  const i = forecast.currents.findIndex((c) => c.hour === forecast.best.start);
  return i < 0 ? 0 : i;
}

// One arrow for the whole spot: the current data is a ~10 km grid, it cannot tell zones apart.
// It sits under the map, not on it, so it never covers a dive-site name.
export function currentStrip(c) {
  return `<div class="cmap-now"><svg viewBox="-27 -27 54 54" width="34" height="34" aria-hidden="true"><path class="cmap-arrow ${LIGHT[c.level].cls}" d="${ARROW}" transform="rotate(${Math.round(c.toDeg)})"/></svg><div><b>往${bearingText(c.toDeg)} ${knots(c.kn)}</b><br><span class="cmap-cap">整片海的大概流向</span></div></div>`;
}

const pts = (points) => points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
const SITE_DOT = 5; // half-size of the space a dive-site dot keeps free of names

export function mapLayout(spot, map, layer) {
  const zoneNames = new Set(spot.zones.map((z) => z.name));
  const sites = layer.sites.map((s) => ({ ...s, xy: project(map.bbox, s.location) }));
  const items = [
    // a site with its zone's name (柴口, 石朗…) is already labelled by the zone
    ...sites.filter((s) => !zoneNames.has(s.name)).map((s) => ({ text: s.name, x: s.xy[0], y: s.xy[1], size: 11, kind: 'site', zoneId: s.zoneId })),
    ...spot.zones.map((z) => {
      const [x, y] = project(map.bbox, z.location);
      return { text: z.name, x, y, size: 13, kind: 'zone', zoneId: z.id };
    }),
  ];
  const obstacles = sites.map(({ xy: [x, y] }) => [x - SITE_DOT, y - SITE_DOT, x + SITE_DOT, y + SITE_DOT]);
  return {
    regions: zoneRegions(map.bbox, layer),
    borders: borderLines(map.bbox, layer),
    sites,
    labels: placeLabels(items, { width: MAP_W, height: mapHeight(map.bbox), obstacles }),
  };
}

function layerSvg(spot, map, layer, lights) {
  const { regions, borders, sites, labels } = mapLayout(spot, map, layer);
  const fills = regions.map((r) => `<polygon class="cmap-region ${LIGHT[lights[r.zoneId] ?? 'gray'].cls}" data-mapzone="${esc(r.zoneId)}" points="${pts(r.points)}"/>`).join('');
  const lines = borders.map((b) => `<line class="cmap-border" x1="${b.from[0].toFixed(1)}" y1="${b.from[1].toFixed(1)}" x2="${b.to[0].toFixed(1)}" y2="${b.to[1].toFixed(1)}"/>`).join('');
  const land = map.land.map((d) => `<path class="cmap-land" d="${d}"/>`).join('');
  const dots = sites.map((s) => `<circle class="cmap-site" data-mapzone="${esc(s.zoneId)}" cx="${s.xy[0].toFixed(1)}" cy="${s.xy[1].toFixed(1)}" r="3.5"/>`).join('');
  const names = labels.map((l) => {
    const leader = l.leader ? `<line class="cmap-leader" x1="${l.leader[0].toFixed(1)}" y1="${l.leader[1].toFixed(1)}" x2="${l.leader[2].toFixed(1)}" y2="${l.leader[3].toFixed(1)}"/>` : '';
    return `${leader}<text class="cmap-${l.kind}-name" data-mapzone="${esc(l.zoneId)}" x="${(l.box[0] + 1).toFixed(1)}" y="${(l.box[3] - 3).toFixed(1)}">${esc(l.text)}</text>`;
  }).join('');
  return `${fills}${lines}${land}${dots}${names}`;
}

function zoneDot(bbox, zone, light) {
  const [x, y] = project(bbox, zone.location);
  const tx = clamp(x, 26, MAP_W - 26); // keep the name inside the map
  const ty = y < 24 ? y + 26 : y - 14; // name above the dot, or below it at the top edge
  return `<g class="cmap-zone" data-mapzone="${esc(zone.id)}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="10" class="${LIGHT[light].cls}"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="22" fill="transparent" class="cmap-hit"/><text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}">${esc(zone.name)}</text></g>`;
}

export function renderSeaMap({ spot, map, layer = null, forecast, hourIndex = null, nowHour = null }) {
  const n = forecast.currents.length;
  const i = hourIndex == null ? defaultHourIndex(forecast, nowHour) : clamp(hourIndex, 0, n - 1);
  const c = forecast.currents[i];
  const h = mapHeight(map.bbox).toFixed(1);
  const lights = Object.fromEntries(forecast.zones.map((z) => [z.zoneId, z.light]));
  const body = layer
    ? layerSvg(spot, map, layer, lights)
    : map.land.map((d) => `<path class="cmap-land" d="${d}"/>`).join('') + spot.zones.map((z) => zoneDot(map.bbox, z, lights[z.id] ?? 'gray')).join('');
  return `<div class="cmap">
    <div class="cmap-box">
      <svg viewBox="0 0 ${MAP_W} ${h}" role="img" aria-label="${esc(spot.name)}地圖：分區燈號和潛點"><rect class="cmap-sea" width="${MAP_W}" height="${h}"/>${body}</svg>
      ${map.note ? `<div class="cmap-note">${esc(map.note)}</div>` : ''}
    </div>
    ${currentStrip(c)}
    <label class="cmap-slider">⏰ <span class="cmap-time">${hourText(c.hour)}</span> 的海流
      <input type="range" min="0" max="${n - 1}" step="1" value="${i}" aria-valuetext="${c.hour} 點">
    </label>
    <div class="cmap-max">這天最強：<b>${currentSummary(forecast.safety)}</b></div>
    <div class="cmap-src">地圖 © OpenStreetMap 貢獻者</div>
  </div>`;
}

// Slider moved: swap only the current strip and the time, so the page does not jump or lose focus.
export function updateSeaMap(root, c) {
  root.querySelector('.cmap-now').outerHTML = currentStrip(c);
  root.querySelector('.cmap-time').textContent = hourText(c.hour);
  root.querySelector('.cmap input[type="range"]').setAttribute('aria-valuetext', `${c.hour} 點`);
}
