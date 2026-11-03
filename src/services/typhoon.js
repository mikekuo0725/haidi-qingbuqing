// Typhoon warnings from the helper. null = could not ask (the page keeps what it had); [] = asked, no typhoon.
export async function fetchTyphoons(baseUrl, fetchFn = fetch) {
  try {
    const res = await fetchFn(`${baseUrl}/v1/typhoon`);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data?.typhoons) && !data.error ? data.typhoons : null;
  } catch {
    return null;
  }
}
