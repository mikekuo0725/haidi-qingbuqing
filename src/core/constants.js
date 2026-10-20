// Every tuning number lives here. Reports will tell us how to change them.
export const SHELTER_MUL = { open: 1, semi: 0.6, bay: 0.3 };
export const BOTTOM_MUL = { rock: 0.8, mixed: 1, sand: 1.3 };
export const STRONG_CURRENT_MUL = { rock: 1, mixed: 0.93, sand: 0.85 };

export const K = {
  kdToMeters: 1.5,          // base meters = kdToMeters / Kd490
  baseMin: 1,
  baseMax: 40,
  wave: 0.04,               // per unit of H²·T·exposure
  waveMin: 0.3,
  pastWave: 0.03,
  pastWaveMin: 0.4,
  pastWeights: [1, 0.5, 0.25], // day-1, day-2, day-3
  windStartKmh: 10,         // onshore wind below this does nothing
  wind: 0.006,              // per km/h above windStartKmh
  windMin: 0.6,
  windOffshoreBonus: 0.03,
  windOffshoreFullKmh: 15,
  cloud: 0.1,               // 100% cloud → ×0.9
  springTide: 0.92,
  springDays: 2,            // within 2 days of new/full moon
  riverFullMm: 200,         // 3-day rain at which river effect is full
  river: 0.6,
  riverMin: 0.3,
  riverCurrentHeavier: 0.5, // current flowing from river toward spot
  riverCurrentLighter: 0.3,
  offshoreCurrentBonus: 0.05,
  currentMidLoKn: 0.3,
  currentMidHiKn: 0.8,
  currentMidBonus: 1.05,
  currentStrongKn: 1.0,
  reasonThreshold: 0.97,    // a factor below this can be the reason
  compareUp: 1.15,
  compareDown: 0.85,
  range: { normal: [0.75, 1.15], low: [0.6, 1.3] },
  maxValid: { waveH: 20, windKmh: 250, currentKmh: 20 },
  upwellingDropC: 2,
  noonHour: 12,
  todayUntilHour: 15, // opened from this Taipei hour on, the app starts on tomorrow (today's dive hours are nearly over)
  autoRefreshMinutes: 30, // coming back to the app after this long reloads the data
  pullRefreshPx: 70,      // pulling down this far from the top of the page reloads the data
  noonWeight: 0.02,
  slackSeaLevelM: 0.05,
  recentReportDays: 7,

  // calibration
  nowcastN1: 0.3,
  nowcastN2: 0.5,
  nowcastN3Plus: 0.7,
  nowcastHalfLifeHours: 3,
  outlierMinGroup: 3,
  outlierThreshold: 0.5,
  outlierWeight: 0.3,
  biasWindowDays: 90,
  biasHalfLifeDays: 30,
  biasMinReports: 5,
  biasShrinkK: 10,
  biasClampMin: 0.5,
  biasClampMax: 1.5,

  // satellite
  satMinValues: 10,
  satMaxAgeDays: 45,

  // 氣象署 coastal forecast: older than this (by its "Sent" time) is not used
  coastalMaxAgeH: 12,

  // 氣象署 浮標
  buoyMaxAgeH: 3,    // newest reading older than this → no 「現在實測」 line; each item looks back this far
  buoyMinHours: 12,  // a finished past day needs this many full wave hours to replace Open-Meteo's 前幾天的浪
  buoyKeepDays: 4,   // the Worker keeps this many days of readings in KV
};
