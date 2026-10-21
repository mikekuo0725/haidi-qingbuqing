// Ship positions for one spot (the helper keeps one shared answer for all spots). Any problem → null: the map just has no ships.
export async function fetchShips(baseUrl, spotId, fetchFn = fetch) {
  try {
    const res = await fetchFn(`${baseUrl}/v1/ships?spot=${encodeURIComponent(spotId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data?.ships) ? data : null;
  } catch {
    return null;
  }
}
