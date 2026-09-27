import { test, expect } from 'vitest';
import { kdUrl, parseKdCsv } from '../../worker/src/erddap.js';

const CSV = `time,altitude,latitude,longitude,kd_490
UTC,m,degrees_north,degrees_east,m^-1
2026-08-12T12:00:00Z,0.0,22.36,120.30,0.0488
2026-08-12T12:00:00Z,0.0,22.36,120.32,NaN
2026-09-15T12:00:00Z,0.0,22.36,120.34,0.0576
`;

test('kdUrl asks for the last 30 days inside the box', () => {
  const u = kdUrl([[22.32, 120.31], [22.36, 120.34]]);
  expect(u).toContain('noaacwNPPN20S3AkdSCIDINEOF2kmDaily.csv');
  expect(decodeURIComponent(u)).toContain('kd_490[last-29:1:last][0][(22.32):1:(22.36)][(120.31):1:(120.34)]');
});

test('parseKdCsv skips headers and NaN, finds latest date', () => {
  expect(parseKdCsv(CSV)).toEqual({ values: [0.0488, 0.0576], latestDate: '2026-09-15' });
});
