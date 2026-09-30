// Tiny 鄉鎮沿海預報 (F-D0047-095) files in the real shape (checked against the 2026-09-30 download).
// In the real file LocationName is the first key of every Location, and the JSON is pretty-printed.
const el = (name, key, values, times) => ({
  ElementName: name,
  Time: times.map((t, i) => ({ DataTime: t, ElementValue: { [key]: values[i] } })),
});

export function cwaLocation(name, times, v = {}) {
  const fill = (x) => times.map((_, i) => (Array.isArray(x) ? x[i] : x));
  return {
    LocationName: name,
    Geocode: '10013220',
    Latitude: '22.29',
    Longitude: '120.36',
    WeatherElement: [
      el('風速', 'WindSpeedKph', fill(v.wind ?? '9.3'), times),
      el('風向', 'WindDirection', fill(v.windDir ?? '偏西風'), times),
      el('雲量', 'SkyCover', fill(v.cloud ?? '40.0'), times),
      el('天氣現象', 'Weather', fill('多雲'), times),
      el('浪高', 'WaveHeight', fill(v.wave ?? '0.6'), times),
      el('浪向', 'WaveDirection', fill(v.waveDir ?? '東北'), times),
      el('浪週期', 'WavePeriod', fill(v.period ?? '8.5'), times),
      el('流速', 'OceanCurrentSpeedKph', fill(v.cur ?? '1.1'), times),
      el('流向', 'OceanCurrentDirection', fill(v.curDir ?? '偏北'), times),
    ],
  };
}

export const cwaFile = (sent, locations) =>
  JSON.stringify({ cwaopendata: { Sent: sent, Dataset: { Locations: { Location: locations } } } }, null, 1);

// The 5 points of one day that the page needs: 06, 09, 12, 15, 18 (Taiwan time).
export const dayTimes = (date) => ['06', '09', '12', '15', '18'].map((h) => `${date}T${h}:00:00+08:00`);
