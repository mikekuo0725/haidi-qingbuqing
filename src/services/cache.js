const key = (spotId) => `haidi:weather:${spotId}`;

export function saveWeather(storage, spotId, raw, now) {
  try { storage.setItem(key(spotId), JSON.stringify({ raw, savedAt: now })); } catch { /* storage full or blocked */ }
}

export function loadWeather(storage, spotId) {
  try {
    const v = storage.getItem(key(spotId));
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}
