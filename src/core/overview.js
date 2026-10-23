// One line per spot per day for the Taiwan map: the clearest zone, and the sea at the best dive hour.

export function summarizeDay(forecast) {
  if (!forecast) return null;
  const top = forecast.zones[0];
  const c = forecast.currents.find((x) => x.hour === forecast.best.start) ?? forecast.currents[0] ?? {};
  return {
    date: forecast.date,
    meters: top.meters,
    light: top.light,
    zoneId: top.zoneId,
    zoneName: top.name,
    flowKn: c.kn ?? null,
    flowToDeg: c.toDeg ?? null,
    windKmh: c.windKmh ?? null,
    windDir: c.windDir ?? null,
    sst: forecast.sst ?? null,
    zoneLights: Object.fromEntries(forecast.zones.map((z) => [z.zoneId, z.light])),
  };
}

export const summarizeSpot = (forecasts) => [0, 1, 2].map((i) => summarizeDay(forecasts?.[i] ?? null));

// Spot ids, clearest first; spots with no data that day go last.
export function rankSpots(summaries, dayIndex) {
  const m = (id) => summaries[id]?.[dayIndex]?.meters ?? -1;
  return Object.keys(summaries).sort((a, b) => m(b) - m(a));
}
