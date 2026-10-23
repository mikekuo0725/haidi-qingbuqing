// The draggable Taiwan map (Leaflet). Only this file knows about Leaflet; what to draw comes from core/mapPins.js.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import coast from '../data/taiwan-coast.json';
import { layerFor } from '../core/mapPins.js';
import { K } from '../core/constants.js';
import { LIGHT, esc } from './format.js';

const TILES = 'https://wmts.nlsc.gov.tw/wmts/EMAP5/default/GoogleMapsCompatible/{z}/{y}/{x}';

function spotIcon(p) {
  const arrow = p.flowToDeg == null ? '' : `<b style="transform:rotate(${Math.round(p.flowToDeg)}deg)">↑</b>`;
  return L.divIcon({ className: 'tpin', html: `<i class="${LIGHT[p.light].cls}"></i><span>${esc(p.label)}</span>${arrow}`, iconSize: null, iconAnchor: [11, 11] });
}
const siteIcon = (p) => L.divIcon({ className: 'tsite', html: `<i class="${LIGHT[p.light].cls}"></i><span>${esc(p.name)}</span>`, iconSize: null, iconAnchor: [6, 6] });

// panelHeight(): pixels the bottom panel covers, so a flown-to spot lands in the visible part of the map.
export function createTaiwanMap(el, { onSpot, onSite, panelHeight = () => 0 }) {
  const map = L.map(el, { zoomSnap: 0.1, zoomDelta: 0.5, attributionControl: true, zoomControl: false })
    .setView(K.mapHome.center, K.mapHome.zoom);
  map.attributionControl.setPrefix(false);
  // Our own coastline sits under the tiles: online the tiles cover it, offline it still shows Taiwan.
  map.createPane('coast').style.zIndex = 150;
  L.geoJSON(coast, { pane: 'coast', interactive: false, style: { color: '#4d6a5c', weight: 1, fillColor: '#26404c', fillOpacity: 1 } }).addTo(map);
  L.tileLayer(TILES, { maxZoom: 18, attribution: '© 內政部國土測繪中心' }).addTo(map);
  map.attributionControl.addAttribution('潛點資料：BlueTrend 藍色脈動');

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
