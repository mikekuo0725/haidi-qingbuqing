export const hour = (over = {}) => ({
  hour: 12, waveH: 0.3, waveT: 4, waveDir: 200, windKmh: 5, windDir: 0,
  cloud: 20, currentKmh: 0.5, currentDir: 90, sst: 28, seaLevel: 0, ...over,
});

export const calmWaves = () => Array.from({ length: 24 }, () => ({ waveH: 0.3, waveT: 4, waveDir: 200 }));

export function makeDay({ hour: h = {}, date = '2026-09-28', pastWaves, rain3dMm = 0, sstPrev3 = 28 } = {}) {
  return {
    date,
    hours: Array.from({ length: 9 }, (_, i) => hour({ ...h, hour: 8 + i })),
    pastWaves: pastWaves ?? [calmWaves(), calmWaves(), calmWaves()],
    rain3dMm,
    sstPrev3,
  };
}
