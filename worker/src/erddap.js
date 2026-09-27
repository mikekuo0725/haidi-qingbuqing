const BASE = 'https://coastwatch.noaa.gov/erddap/griddap/noaacwNPPN20S3AkdSCIDINEOF2kmDaily.csv';

export function kdUrl([[latMin, lonMin], [latMax, lonMax]]) {
  const q = `kd_490[last-29:1:last][0][(${latMin}):1:(${latMax})][(${lonMin}):1:(${lonMax})]`;
  return `${BASE}?${encodeURIComponent(q)}`;
}

export function parseKdCsv(text) {
  const values = [];
  let latestDate = null;
  for (const line of text.trim().split('\n').slice(2)) {
    const cols = line.split(',');
    const kd = Number(cols[4]);
    if (!Number.isFinite(kd) || kd <= 0) continue;
    values.push(kd);
    const d = cols[0].slice(0, 10);
    if (!latestDate || d > latestDate) latestDate = d;
  }
  return { values, latestDate };
}
