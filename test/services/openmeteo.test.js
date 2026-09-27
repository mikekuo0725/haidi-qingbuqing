import { test, expect } from 'vitest';
import { marineUrl, rainUrl, parseDay } from '../../src/services/openmeteo.js';
import { SPOTS } from '../../src/data/spots/index.js';

const spot = SPOTS.xiaoliuqiu;

function times() {
  const out = [];
  for (let d = 25; d <= 30; d++) for (let h = 0; h < 24; h++) out.push(`2026-09-${d}T${String(h).padStart(2, '0')}:00`);
  return out;
}
const fill = (v) => times().map(() => v);

function fakeRaw(over = {}) {
  const t = times();
  return {
    marine: { hourly: {
      time: t, wave_height: fill(0.4), wave_direction: fill(200), wave_period: fill(5),
      ocean_current_velocity: fill(1.0), ocean_current_direction: fill(90),
      sea_surface_temperature: fill(28), sea_level_height_msl: fill(0.1), ...over.marine } },
    weather: { hourly: { time: t, wind_speed_10m: fill(8), wind_direction_10m: fill(45), cloud_cover: fill(30), ...over.weather } },
    rain: [0, 1, 2].map(() => ({ hourly: { time: t, precipitation: fill(1) } })),
  };
}

test('urls ask for the right variables and 3 past days', () => {
  expect(marineUrl(spot)).toContain('ocean_current_velocity');
  expect(marineUrl(spot)).toContain('past_days=3');
  expect(rainUrl(spot)).toContain('latitude=22.888,22.998,22.715');
});

test('parseDay builds 9 daytime hours and 3 past days', () => {
  const day = parseDay(fakeRaw(), '2026-09-28');
  expect(day.date).toBe('2026-09-28');
  expect(day.hours.map((h) => h.hour)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16]);
  expect(day.hours[0]).toMatchObject({ waveH: 0.4, waveT: 5, waveDir: 200, windKmh: 8, windDir: 45, cloud: 30, currentKmh: 1, currentDir: 90, sst: 28, seaLevel: 0.1 });
  expect(day.pastWaves).toHaveLength(3);
  expect(day.pastWaves[0]).toHaveLength(24);
  expect(day.sstPrev3).toBe(28);
});

test('rain3dMm = mean over rain points of the 72 hours before 08:00', () => {
  expect(parseDay(fakeRaw(), '2026-09-28').rain3dMm).toBe(72);
});

test('an impossible value makes the day invalid', () => {
  const raw = fakeRaw();
  raw.marine.hourly.wave_height[raw.marine.hourly.time.indexOf('2026-09-28T10:00')] = 50;
  expect(parseDay(raw, '2026-09-28')).toBeNull();
});

test('a missing daytime value makes the day invalid', () => {
  const raw = fakeRaw();
  raw.weather.hourly.cloud_cover[raw.weather.hourly.time.indexOf('2026-09-28T12:00')] = null;
  expect(parseDay(raw, '2026-09-28')).toBeNull();
});
