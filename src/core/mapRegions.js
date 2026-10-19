import { project } from './mapProject.js';

const FAR = 3000; // map units: well past any edge, the SVG view box crops it

const out = ([x, y], bearing) => {
  const r = (bearing * Math.PI) / 180;
  return [x + FAR * Math.sin(r), y - FAR * Math.cos(r)];
};

// Zone i is the sea from border i clockwise to border i+1: cape, out to sea, round the far side, back in.
export function zoneRegions(bbox, layer) {
  const c = project(bbox, layer.center);
  const n = layer.bounds.length;
  return layer.bounds.map((b, i) => {
    const next = layer.bounds[(i + 1) % n];
    const end = next.bearing > b.bearing ? next.bearing : next.bearing + 360;
    const arc = Array.from({ length: 23 }, (_, t) => out(c, b.bearing + ((end - b.bearing) * (t + 1)) / 24));
    const p0 = project(bbox, b.from);
    const p1 = project(bbox, next.from);
    return { zoneId: b.next, points: [c, p0, out(p0, b.bearing), ...arc, out(p1, next.bearing), p1] };
  });
}

export function borderLines(bbox, layer) {
  return layer.bounds.filter((b) => !b.hidden).map((b) => {
    const from = project(bbox, b.from);
    return { name: b.name, from, to: out(from, b.bearing) };
  });
}

function inside([x, y], points) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

export function zoneAt(bbox, layer, latLon) {
  const p = project(bbox, latLon);
  return zoneRegions(bbox, layer).find((r) => inside(p, r.points))?.zoneId ?? null;
}
