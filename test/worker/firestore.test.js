import { test, expect } from 'vitest';
import { decodeDoc } from '../../worker/src/firestore.js';

test('decodeDoc turns Firestore REST values into plain JS', () => {
  const doc = { name: 'projects/p/databases/(default)/documents/reports/abc', fields: {
    zoneId: { stringValue: 'west' },
    meters: { integerValue: '20' },
    depth: { doubleValue: 10.5 },
    diveTime: { timestampValue: '2026-09-28T02:30:00Z' },
    snapshot: { mapValue: { fields: { rawMeters: { doubleValue: 18.2 } } } },
  } };
  expect(decodeDoc(doc)).toEqual({
    id: 'abc', zoneId: 'west', meters: 20, depth: 10.5,
    diveTime: Date.parse('2026-09-28T02:30:00Z'), snapshot: { rawMeters: 18.2 },
  });
});
