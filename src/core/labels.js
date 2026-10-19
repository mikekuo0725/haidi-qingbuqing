// Map names: each one takes the first free spot around its point, so no name covers another name or a dot.
// Box = [x0, y0, x1, y1] in map units. Names are Chinese, so one character is about one font size wide.

const area = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
const SITE_GAP = 6;
const LEADER_PENALTY = 50; // a line through someone else's dot reads as pointing at the wrong site

function candidates({ x, y, size, kind }, w, h) {
  if (kind === 'zone') { // no dot to dodge: start on the zone point, then step outward
    return [[0, 0], [0, -16], [0, 16], [-22, 0], [22, 0], [0, -32], [0, 32], [-40, 0]].map(([dx, dy]) => [x - w / 2 + dx, y - h / 2 + dy]);
  }
  const g = SITE_GAP;
  const d = g * 0.7;
  const near = [[x + g, y - h / 2], [x - g - w, y - h / 2], [x - w / 2, y - g - h], [x - w / 2, y + g],
    [x + d, y - d - h], [x + d, y + d], [x - d - w, y - d - h], [x - d - w, y + d]];
  // a crowded coast: the same directions two and three times as far out
  const far = [2, 3].flatMap((f) => near.map(([x0, y0]) => {
    const cx = x0 + w / 2 - x;
    const cy = y0 + h / 2 - y;
    return [x0 + cx * (f - 1), y0 + cy * (f - 1)];
  }));
  return [...near, ...far];
}

const leaderEnd = ([x0, y0, x1, y1], x, y) => [Math.min(Math.max(x, x0), x1), Math.min(Math.max(y, y0), y1)];

export function placeLabels(items, { width, height, obstacles }) {
  const taken = [...obstacles];
  return items.map((item) => {
    const w = item.size * item.text.length + 2;
    const h = item.size + 3;
    let best = null;
    for (const [i, [x0, y0]] of candidates(item, w, h).entries()) {
      const box = [x0, y0, x0 + w, y0 + h];
      if (box[0] < 1 || box[1] < 1 || box[2] > width - 1 || box[3] > height - 1) continue;
      const pushed = item.kind === 'site' && i >= 8;
      let cost = taken.reduce((s, t) => s + area(box, t), 0);
      if (pushed) {
        const [lx, ly] = leaderEnd(box, item.x, item.y);
        for (let t = 2; t <= 10; t++) {
          const px = item.x + ((lx - item.x) * t) / 10;
          const py = item.y + ((ly - item.y) * t) / 10;
          if (obstacles.some((o) => px >= o[0] && px <= o[2] && py >= o[1] && py <= o[3])) cost += LEADER_PENALTY;
        }
      }
      if (!best || cost < best.cost) best = { box, cost, pushed };
      if (cost === 0) break;
    }
    taken.push(best.box);
    const leader = best.pushed ? [item.x, item.y, ...leaderEnd(best.box, item.x, item.y)] : null;
    return { ...item, box: best.box, leader, overlap: best.cost };
  });
}
