import { project } from '../src/core/mapProject.js';

const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

// OpenStreetMap splits one coastline into many ways; join the ones that share an end point.
export function chainWays(ways) {
  const rest = ways.map((w) => [...w]);
  const chains = [];
  while (rest.length) {
    let c = rest.shift();
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < rest.length; i++) {
        const w = rest[i];
        if (same(w[0], c[c.length - 1])) { c = c.concat(w.slice(1)); rest.splice(i, 1); grew = true; break; }
        if (same(w[w.length - 1], c[0])) { c = w.concat(c.slice(1)); rest.splice(i, 1); grew = true; break; }
      }
    }
    chains.push(c);
  }
  return chains;
}

// A coastline that leaves the map box (a peninsula) is an open line. Close it through
// points outside the box on the land side, so it fills as land; the map crops the rest.
export function closeRing(chain, close) {
  if (same(chain[0], chain[chain.length - 1])) return chain;
  if (!close?.length) return null;
  const last = chain[chain.length - 1];
  const via = d2(last, close[0]) <= d2(last, close[close.length - 1]) ? close : [...close].reverse();
  return [...chain, ...via, chain[0]];
}

export function toPath(bbox, ring, minStepPx = 1.5) {
  const pts = [];
  for (const p of ring) {
    const xy = project(bbox, p);
    const prev = pts[pts.length - 1];
    if (!prev || Math.hypot(xy[0] - prev[0], xy[1] - prev[1]) >= minStepPx) pts.push(xy);
  }
  if (pts.length < 3) return null;
  return `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')}Z`;
}
