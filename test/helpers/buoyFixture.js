// A tiny 中央氣象署 O-B0075-001 answer. Values are strings, like the real API.
export const obs = ({ time, waveH = '0.3', waveT = '4.0', waveDir = '200.0', sst = '28.5', kn = '0.50', toDeg = '210' }) => ({
  DateTime: `${time}:00+08:00`,
  WeatherElements: {
    WaveHeight: waveH, WavePeriod: waveT, WaveDirection: waveDir, SeaTemperature: sst,
    SeaCurrents: { Layer: [{ LayerNumber: '1', CurrentDirection: toDeg, CurrentSpeedInKnots: kn }] },
  },
});

export const buoyFile = (stations) => ({
  Success: 'true',
  Records: {
    SeaSurfaceObs: {
      Location: Object.entries(stations).map(([id, list]) => ({ Station: { StationID: id }, StationObsTimes: { StationObsTime: list } })),
    },
  },
});

// Readings as the Worker stores them: hours 00.. of `date`, all with the same values.
export const dayReadings = (date, n = 24, over = {}) => Array.from({ length: n }, (_, h) => ({
  time: `${date}T${String(h).padStart(2, '0')}:00`,
  waveH: 0.3, waveT: 4, waveDir: 200, sst: 28.5, currentKn: 0.5, currentToDeg: 210, ...over,
}));
