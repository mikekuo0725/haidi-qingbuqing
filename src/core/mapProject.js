// Flat projection for small maps (a few km across): x grows east, y grows south.
// The width is fixed; the height follows the box so the island keeps its real shape.
export const MAP_W = 300;

const cosMid = ([[s], [n]]) => Math.cos((((s + n) / 2) * Math.PI) / 180);
const scale = (bbox) => MAP_W / ((bbox[1][1] - bbox[0][1]) * cosMid(bbox));

export const mapHeight = (bbox) => (bbox[1][0] - bbox[0][0]) * scale(bbox);

export function project(bbox, [lat, lon]) {
  const k = scale(bbox);
  return [(lon - bbox[0][1]) * cosMid(bbox) * k, (bbox[1][0] - lat) * k];
}
