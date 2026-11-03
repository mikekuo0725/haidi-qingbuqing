// The draggable Taiwan map (Leaflet). Only this file knows about Leaflet; what to draw comes from core/mapPins.js.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import coast from '../data/taiwan-coast.json';
import { layerFor } from '../core/mapPins.js';
import { K } from '../core/constants.js';
import { typhoonHint, edgePoint, spreadPoints, typhoonStamp } from '../core/typhoon.js';
import { LIGHT, esc } from './format.js';

const TILES = 'https://wmts.nlsc.gov.tw/wmts/EMAP5/default/GoogleMapsCompatible/{z}/{y}/{x}';

function spotIcon(p) {
  const arrow = p.flowToDeg == null ? '' : `<b style="transform:rotate(${Math.round(p.flowToDeg)}deg)">↑</b>`;
  return L.divIcon({ className: 'tpin', html: `<i class="${LIGHT[p.light].cls}"></i><span>${esc(p.label)}</span>${arrow}`, iconSize: null, iconAnchor: [11, 11] });
}
const TY_ICON = '<svg viewBox="-13 -13 26 26" width="26" height="26"><circle r="12" fill="#e63946" stroke="#fff" stroke-width="2"/><path d="M-6 -2.5 Q0 -9 6 -2.5 M6 2.5 Q0 9 -6 2.5" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>';
const tyIcon = () => L.divIcon({ className: 'tty', html: TY_ICON, iconSize: [26, 26], iconAnchor: [13, 13] });
const siteIcon = (p) => L.divIcon({ className: 'tsite', html: `<i class="${LIGHT[p.light].cls}"></i><span>${esc(p.name)}</span>`, iconSize: null, iconAnchor: [6, 6] });

// panelHeight(): pixels the bottom panel covers, so a flown-to spot lands in the visible part of the map.
export function createTaiwanMap(el, { onSpot, onSite, onTyphoon = () => {}, panelHeight = () => 0 }) {
  const map = L.map(el, { zoomSnap: 0.1, zoomDelta: 0.5, attributionControl: true, zoomControl: false })
    .setView(K.mapHome.center, K.mapHome.zoom);
  map.attributionControl.setPrefix(false);
  // Our own coastline sits under the tiles: online the tiles cover it, offline it still shows Taiwan.
  map.createPane('coast').style.zIndex = 150;
  L.geoJSON(coast, { pane: 'coast', interactive: false, style: { color: '#4d6a5c', weight: 1, fillColor: '#26404c', fillOpacity: 1 } }).addTo(map);
  L.tileLayer(TILES, { maxZoom: 18, attribution: '© 內政部國土測繪中心' }).addTo(map);
  map.attributionControl.addAttribution('潛點資料：BlueTrend 藍色脈動');

  // Above the spot dots, below the tooltips. Leaflet gives a custom pane its own full-size <svg> for the ring and track:
  // without pointer-events:none it would swallow every tap meant for the spot dots (the icon and arrows are markers and still get theirs).
  const tyPane = map.createPane('typhoon');
  tyPane.style.zIndex = 640;
  tyPane.style.pointerEvents = 'none';
  const spots = L.layerGroup().addTo(map);
  const sites = L.layerGroup();
  let me = null;

  function applyZoom() {
    const show = layerFor(map.getZoom());
    if (show.spots) { spots.addTo(map); sites.remove(); } else { sites.addTo(map); spots.remove(); }
    el.classList.toggle('nolabel', !show.labels);
  }
  map.on('zoomend', applyZoom);
  applyZoom();

  // 氣象署 typhoons: icon, 7-level wind ring, dashed track; one still outside the view gets an arrow at the edge.
  const tyLayer = L.layerGroup().addTo(map);
  let typhoons = [];
  let tyCredit = false;
  function drawTyphoons() {
    tyLayer.clearLayers();
    const credit = typhoons.length > 0;
    if (credit !== tyCredit) {
      if (credit) map.attributionControl.addAttribution('颱風資料：中央氣象署');
      else map.attributionControl.removeAttribution('颱風資料：中央氣象署');
      tyCredit = credit;
    }
    const { x: w, y: fullH } = map.getSize();
    const h = Math.max(1, fullH - panelHeight()); // the part of the map above the bottom panel
    const mid = [w / 2, h / 2];
    const view = { center: map.containerPointToLatLng(mid), bounds: null };
    const sw = map.containerPointToLatLng([0, h]);
    const ne = map.containerPointToLatLng([w, 0]);
    view.bounds = [[sw.lat, sw.lng], [ne.lat, ne.lng]];
    view.center = [view.center.lat, view.center.lng];
    const hints = typhoons.map((t) => typhoonHint(t, view));
    const edge = spreadPoints(hints.map((hi) => (hi ? edgePoint(mid, [w, h], hi.dirDeg) : [0, 0])), [w, h]);
    typhoons.forEach((t, i) => {
      const at = [t.now.lat, t.now.lon];
      const hint = hints[i];
      if (hint) {
        const [x, y] = edge[i];
        const shift = x < w * 0.33 ? 0 : x > w * 0.67 ? -100 : -50;
        const html = `<div class="tty-chip" style="transform:translate(${shift}%,-50%)"><b style="transform:rotate(${Math.round(hint.dirDeg)}deg)">↑</b>${esc(t.name)} 在${hint.dirText}方 ${hint.km} 公里</div>`;
        L.marker(map.containerPointToLatLng([x, y]), { icon: L.divIcon({ className: 'tty-edge', html, iconSize: [0, 0] }), pane: 'typhoon', keyboard: false })
          .on('click', () => onTyphoon(t.id)).addTo(tyLayer);
      }
      if (t.now.radius7Km) L.circle(at, { radius: t.now.radius7Km * 1000, pane: 'typhoon', interactive: false, color: '#e63946', weight: 1.5, dashArray: '3 3', fillColor: '#e63946', fillOpacity: 0.18 }).addTo(tyLayer);
      if (t.track.length) L.polyline([at, ...t.track.map((p) => [p.lat, p.lon])], { pane: 'typhoon', interactive: false, color: '#ffd166', weight: 2.5, dashArray: '6 5' }).addTo(tyLayer);
      for (const p of t.track) {
        L.circleMarker([p.lat, p.lon], { pane: 'typhoon', interactive: false, radius: 4, color: '#ffd166', weight: 1, fillColor: '#ffd166', fillOpacity: 1 })
          .bindTooltip(typhoonStamp(p.time), { permanent: true, direction: 'right', offset: [6, 0], className: 'tty-tip' }).addTo(tyLayer);
      }
      L.marker(at, { icon: tyIcon(), pane: 'typhoon', keyboard: false }).on('click', () => onTyphoon(t.id)).addTo(tyLayer);
    });
  }
  map.on('moveend resize', drawTyphoons);

  // Centre `latlng` in the part of the map above the panel.
  function above(latlng, zoom) {
    const pt = map.project(latlng, zoom).add([0, panelHeight() / 2]);
    return map.unproject(pt, zoom);
  }

  return {
    el,
    show() { map.invalidateSize(); },
    setPins(spotPins, sitePins) {
      spots.clearLayers();
      sites.clearLayers();
      for (const p of spotPins) L.marker([p.lat, p.lon], { icon: spotIcon(p), keyboard: false }).on('click', () => onSpot(p.id)).addTo(spots);
      for (const p of sitePins) L.marker([p.lat, p.lon], { icon: siteIcon(p), keyboard: false }).on('click', () => onSite(p)).addTo(sites);
    },
    setTyphoons(list) {
      typhoons = list ?? [];
      drawTyphoons();
    },
    setMe(pos) {
      if (me) { me.remove(); me = null; }
      if (pos) me = L.circleMarker(pos, { radius: 7, color: '#fff', weight: 2, fillColor: '#2f8cff', fillOpacity: 1, interactive: false }).addTo(map);
    },
    flyHome() { map.flyTo(above(K.mapHome.center, K.mapHome.zoom), K.mapHome.zoom, { duration: 0.8 }); },
    flyToSpot(spot, zoom = K.mapSpotZoom[spot.id] ?? 11) { map.flyTo(above(spot.center, zoom), zoom, { duration: 0.8 }); },
    jumpToSpot(spot, zoom = K.mapSpotZoom[spot.id] ?? 11) { map.setView(above(spot.center, zoom), zoom, { animate: false }); },
    destroy() { map.remove(); },
  };
}
