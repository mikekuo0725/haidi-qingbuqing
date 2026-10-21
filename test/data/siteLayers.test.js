import { test, expect } from 'vitest';
import { SPOTS } from '../../src/data/spots/index.js';
import { MAPS } from '../../src/data/spots/maps/index.js';
import { SITE_LAYERS } from '../../src/data/spots/sites/index.js';
import { zoneAt } from '../../src/core/mapRegions.js';
import { mapLayout } from '../../src/ui/seaMap.js';

const layers = Object.entries(SITE_LAYERS);

test('all 8 spots have dive sites and zone borders', () => {
  expect(Object.keys(SITE_LAYERS).sort()).toEqual(
    ['kenting', 'lanyu', 'ludao', 'northeast', 'penghu-north', 'penghu-south', 'qixing', 'xiaoliuqiu'],
  );
});

test('borders go clockwise by bearing and name every zone of the spot exactly once', () => {
  for (const [id, layer] of layers) {
    const bearings = layer.bounds.map((b) => b.bearing);
    expect(bearings, id).toEqual([...bearings].sort((a, b) => a - b));
    expect(bearings.every((b) => b >= 0 && b < 360), id).toBe(true);
    expect(layer.bounds.map((b) => b.next).sort(), id).toEqual(SPOTS[id].zones.map((z) => z.id).sort());
  }
});

test('every dive site is on the map and inside the zone it says it belongs to', () => {
  for (const [id, layer] of layers) {
    const [[s, w], [n, e]] = MAPS[id].bbox;
    for (const site of layer.sites) {
      const [lat, lon] = site.location;
      expect(lat > s && lat < n && lon > w && lon < e, `${id}/${site.name}`).toBe(true);
      expect(zoneAt(MAPS[id].bbox, layer, site.location), `${id}/${site.name}`).toBe(site.zoneId);
    }
  }
});

test('no name on the map covers another name or a dive-site dot', () => {
  for (const [id, layer] of layers) {
    const { labels } = mapLayout(SPOTS[id], MAPS[id], layer);
    for (const l of labels) expect(l.overlap, `${id}/${l.text}`).toBe(0);
  }
});

test('a site with the same name as its zone is not written twice', () => {
  const { labels } = mapLayout(SPOTS.ludao, MAPS.ludao, SITE_LAYERS.ludao);
  expect(labels.filter((l) => l.text === '石朗')).toHaveLength(1);
});
