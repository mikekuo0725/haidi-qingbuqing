// Open-Meteo answers for 2026-09-25 … 2026-09-30, every hour, flat values.
export function times() {
  const out = [];
  for (let d = 25; d <= 30; d++) for (let h = 0; h < 24; h++) out.push(`2026-09-${d}T${String(h).padStart(2, '0')}:00`);
  return out;
}
export const fill = (v) => times().map(() => v);

export function fakeRaw(over = {}) {
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

export function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}
