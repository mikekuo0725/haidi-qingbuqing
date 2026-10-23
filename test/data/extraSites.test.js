import { test, expect } from 'vitest';
import extra from '../../src/data/spots/extraSites.json';
import { MAPS } from '../../src/data/spots/maps/index.js';
import { SITE_LAYERS } from '../../src/data/spots/sites/index.js';
import { zoneAt } from '../../src/core/mapRegions.js';
import { distanceKm } from '../../src/core/math.js';

const all = Object.values(extra.sites).flat();

test('every extra site lies inside its spot\'s map box and has a zone', () => {
  for (const [id, sites] of Object.entries(extra.sites)) {
    for (const s of sites) {
      if (id === 'other') { expect(s.zoneId).toBeNull(); continue; }
      const [[a, b], [c, d]] = MAPS[id].bbox;
      expect(s.location[0] >= a && s.location[0] <= c && s.location[1] >= b && s.location[1] <= d, s.name).toBe(true);
      expect(zoneAt(MAPS[id].bbox, SITE_LAYERS[id], s.location), s.name).toBe(s.zoneId);
    }
  }
  expect(all.length).toBeGreaterThan(40);
});

test('no extra site duplicates one of ours', () => {
  const ours = Object.values(SITE_LAYERS).flatMap((l) => l.sites);
  for (const s of all) for (const o of ours) {
    expect(distanceKm(s.location, o.location) > 0.5 && s.name !== o.name, `${s.name} / ${o.name}`).toBe(true);
  }
});

test('known bad BlueTrend coordinates are not used', () => {
  expect(all.some((s) => s.name.startsWith('玉女岩'))).toBe(false);
});

test('every extra site has its BlueTrend facts and link', () => {
  for (const s of all) {
    expect(['初級', '中級', '高級']).toContain(s.level);
    expect(s.url).toMatch(/^https:\/\/bluetrend\.media\//);
  }
  for (const byName of Object.values(extra.details)) for (const d of Object.values(byName)) expect(d.url).toMatch(/^https:\/\/bluetrend\.media\//);
});
