// Builds src/data/taiwan-coast.json: the land of Taiwan, Penghu, 小琉球, 綠島 and 蘭嶼 for the Taiwan map,
// drawn under the map tiles so the map still shows Taiwan with no network.
// Source: Natural Earth 10m land + minor islands (public domain). Run: node scripts/taiwan-coast.mjs
import { writeFileSync } from 'node:fs';

const BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
const FILES = ['ne_10m_land.geojson', 'ne_10m_minor_islands.geojson'];
const BOX = { minLon: 118.9, maxLon: 122.3, minLat: 21.6, maxLat: 25.5 };
const SOURCE = 'Natural Earth 10m land (public domain)';

const outerRings = (g) => (g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map((p) => p[0]) : []);

function keep(ring) {
  const lons = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
  if (x0 < BOX.minLon || x1 > BOX.maxLon || y0 < BOX.minLat || y1 > BOX.maxLat) return false;
  return !(y0 > 24.9 && x0 < 120); // 馬祖 and the Fujian coast islands: not on our map
}

const round = (v) => Math.round(v * 1e4) / 1e4;
const features = [];
for (const file of FILES) {
  const res = await fetch(BASE + file);
  if (!res.ok) throw new Error(`${file}: ${res.status}`);
  const geo = await res.json();
  for (const f of geo.features) for (const ring of outerRings(f.geometry)) {
    if (!keep(ring)) continue;
    features.push({ type: 'Feature', properties: { source: SOURCE }, geometry: { type: 'Polygon', coordinates: [ring.map(([x, y]) => [round(x), round(y)])] } });
  }
}
writeFileSync(new URL('../src/data/taiwan-coast.json', import.meta.url), JSON.stringify({ type: 'FeatureCollection', features }));
console.log(`${features.length} polygons`);
