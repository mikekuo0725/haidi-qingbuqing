export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

const norm360 = (d) => ((d % 360) + 360) % 360;

export function angleDiff(a, b) {
  const d = norm360(a - b);
  return d > 180 ? 360 - d : d;
}

export const alignment = (a, b) => Math.cos((angleDiff(a, b) * Math.PI) / 180);

export const exposure = (fromDeg, facingDeg) => Math.max(0, alignment(fromDeg, facingDeg));

export function distanceKm([lat1, lon1], [lat2, lon2]) {
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r;
  const dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

const NAMES = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'];
export const bearingText = (deg) => NAMES[Math.round(norm360(deg) / 45) % 8];

export const kmhToKnots = (kmh) => kmh / 1.852;

export function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
