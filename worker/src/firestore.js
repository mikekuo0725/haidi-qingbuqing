function decodeValue(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return decodeFields(v.mapValue.fields ?? {});
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(decodeValue);
  return undefined;
}

const decodeFields = (fields) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decodeValue(v)]));

export const decodeDoc = (doc) => ({ id: doc.name.split('/').pop(), ...decodeFields(doc.fields ?? {}) });

export async function fetchReports(projectId, spotId, sinceMs, fetchFn = fetch) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const body = { structuredQuery: {
    from: [{ collectionId: 'reports' }],
    where: { compositeFilter: { op: 'AND', filters: [
      { fieldFilter: { field: { fieldPath: 'spotId' }, op: 'EQUAL', value: { stringValue: spotId } } },
      { fieldFilter: { field: { fieldPath: 'diveTime' }, op: 'GREATER_THAN_OR_EQUAL', value: { timestampValue: new Date(sinceMs).toISOString() } } },
    ] } },
    orderBy: [{ field: { fieldPath: 'diveTime' }, direction: 'DESCENDING' }],
    limit: 2000,
  } };
  const res = await fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Firestore ${res.status}`);
  const rows = await res.json();
  return rows.filter((r) => r.document).map((r) => {
    const d = decodeDoc(r.document);
    return { ...d, rawMeters: d.snapshot?.rawMeters };
  });
}
