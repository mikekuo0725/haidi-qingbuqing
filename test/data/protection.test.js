import { test, expect } from 'vitest';
import protection from '../../src/data/spots/protection.json';
import extra from '../../src/data/spots/extraSites.json';
import { SITE_LAYERS } from '../../src/data/spots/sites/index.js';

test('every protection entry names a real site', () => {
  for (const [spotId, bySite] of Object.entries(protection)) {
    const names = [...(SITE_LAYERS[spotId]?.sites ?? []), ...(extra.sites[spotId] ?? [])].map((s) => s.name);
    for (const [name, p] of Object.entries(bySite)) {
      expect(names, `${spotId}/${name}`).toContain(name);
      expect(['no-take', 'permit']).toContain(p.kind);
      expect(p.url).toMatch(/^https:\/\//);
      expect(p.text.length).toBeGreaterThan(5);
    }
  }
});
