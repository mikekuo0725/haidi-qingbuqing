export async function fetchHelper(baseUrl, spotId, fetchFn = fetch) {
  try {
    const res = await fetchFn(`${baseUrl}/v1/base?spot=${encodeURIComponent(spotId)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
