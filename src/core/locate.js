import { distanceKm } from './math.js';

export function locate(pos, spot) {
  if (!pos) return { status: 'none' };
  const km = distanceKm(pos, spot.center);
  if (km > spot.locateMaxKm) return { status: 'far', km };
  const nearest = spot.zones
    .map((z) => ({ zoneId: z.id, d: distanceKm(pos, z.location) }))
    .reduce((a, b) => (b.d < a.d ? b : a));
  return { status: 'near', zoneId: nearest.zoneId, km };
}
