import { distanceKm } from './math.js';

export function spotsByDistance(pos, spots) {
  const rows = spots.map((spot) => ({ spot, km: pos ? distanceKm(pos, spot.center) : null }));
  return pos ? rows.sort((a, b) => a.km - b.km) : rows;
}

export function nearbySpotId(pos, spots) {
  if (!pos || !spots.length) return null;
  const [nearest] = spotsByDistance(pos, spots);
  return nearest.km <= nearest.spot.locateMaxKm ? nearest.spot.id : null;
}

export function initialSpotId({ urlId, savedId, spots, defaultId }) {
  const known = (id) => id != null && spots.some((s) => s.id === id);
  if (known(urlId)) return urlId;
  if (known(savedId)) return savedId;
  return defaultId;
}

export function autoSwitchTarget({ pos, spots, currentId, locked }) {
  if (locked) return null;
  const id = nearbySpotId(pos, spots);
  return id && id !== currentId ? id : null;
}
