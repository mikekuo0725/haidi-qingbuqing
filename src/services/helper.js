// The helper's answer is cached by the browser for 1 hour; `fresh` (pull to refresh) skips that copy.
export async function fetchHelper(baseUrl, spotId, fetchFn = fetch, { fresh = false } = {}) {
  try {
    const url = `${baseUrl}/v1/base?spot=${encodeURIComponent(spotId)}`;
    const res = await (fresh ? fetchFn(url, { cache: 'reload' }) : fetchFn(url));
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
