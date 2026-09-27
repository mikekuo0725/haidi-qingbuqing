import { test, expect } from 'vitest';
import { SPOTS, DEFAULT_SPOT_ID } from '../../src/data/spots/index.js';

test('every spot has the fields the code needs', () => {
  for (const spot of Object.values(SPOTS)) {
    expect(spot.thresholds.purple).toBeGreaterThan(spot.thresholds.green);
    expect(spot.thresholds.green).toBeGreaterThan(spot.thresholds.yellow);
    expect(spot.rainPoints.length).toBeGreaterThan(0);
    expect(spot.zones.length).toBeGreaterThan(0);
    for (const z of spot.zones) {
      expect(['open', 'semi', 'bay']).toContain(z.shelter);
      expect(['sand', 'mixed', 'rock']).toContain(z.bottom);
      expect(z.riverImpact).toBeGreaterThanOrEqual(0);
      expect(z.riverImpact).toBeLessThanOrEqual(1);
      expect(z.satBox[0][0]).toBeLessThan(z.satBox[1][0]);
      expect(z.satBox[0][1]).toBeLessThan(z.satBox[1][1]);
    }
  }
  expect(SPOTS[DEFAULT_SPOT_ID]).toBeDefined();
});
