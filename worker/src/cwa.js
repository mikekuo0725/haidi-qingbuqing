import { extractArea, areaSeries, issuedAt } from '../../src/core/cwa.js';

const FILE_URL = 'https://opendata.cwa.gov.tw/fileapi/v1/opendataapi/F-D0047-095';
export const coastalUrl = (key) => `${FILE_URL}?Authorization=${encodeURIComponent(key)}&format=JSON`;

// One ~6 MB download for all spots; only the areas they use are parsed (free-plan CPU limit).
export async function fetchCoastal(spots, key, fetchFn = fetch) {
  const res = await fetchFn(coastalUrl(key));
  if (!res.ok) throw new Error(`CWA ${res.status}`); // never the URL: it holds the key
  const text = await res.text();
  const sent = issuedAt(text);
  const byArea = new Map();
  const out = {};
  for (const s of spots) {
    if (!s.cwaArea) continue;
    if (!byArea.has(s.cwaArea)) {
      const location = extractArea(text, s.cwaArea);
      byArea.set(s.cwaArea, location ? areaSeries(location) : null);
    }
    const series = byArea.get(s.cwaArea);
    if (series?.length) out[s.id] = { issuedAt: sent, series };
  }
  return out;
}

// A new issue (e.g. 12:55) starts at 12:00; keep the morning points of the same day from the
// previous copy, so today's 08..11 still come from 氣象署.
export function mergeSeries(old, fresh) {
  const first = fresh[0]?.time;
  if (!first || !old?.length) return fresh;
  const day = first.slice(0, 10);
  return [...old.filter((p) => p.time < first && p.time.startsWith(day)), ...fresh];
}
