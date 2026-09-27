import { test, expect, vi } from 'vitest';
vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}), signInAnonymously: async () => ({ user: { uid: 'u' } }) }));
vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}), collection: () => ({}), doc: () => ({}), setDoc: async () => ({}), getDoc: async () => ({ exists: () => false }),
  query: () => ({}), where: () => ({}),
  orderBy: () => ({}), getDocs: async () => ({ docs: [] }), serverTimestamp: () => ({}), Timestamp: { fromMillis: (ms) => ({ ms }) },
}));
const { buildReportDoc } = await import('../../src/services/reports.js');

test('buildReportDoc: 30+ becomes 30, trims text, keeps snapshot', () => {
  const doc = buildReportDoc({
    spotId: 'xiaoliuqiu',
    form: { zoneId: 'west', meters: '30+', depth: '10', diveTime: 1790000000000, nickname: '  Michael  ', note: 'x'.repeat(250) },
    snapshot: { rawMeters: 18.2, meters: 17, base: 20, bias: 1, factors: {}, date: '2026-09-28' },
  });
  expect(doc).toMatchObject({ spotId: 'xiaoliuqiu', zoneId: 'west', meters: 30, depth: 10, diveTime: 1790000000000, nickname: 'Michael' });
  expect(doc.note).toHaveLength(200);
  expect(doc.snapshot.rawMeters).toBe(18.2);
});

test('buildReportDoc: generates a string id, differs between calls', () => {
  const args = {
    spotId: 'xiaoliuqiu',
    form: { zoneId: 'west', meters: '20', depth: '10', diveTime: 1790000000000, nickname: 'Michael', note: '' },
    snapshot: { rawMeters: 18.2, meters: 17, base: 20, bias: 1, factors: {}, date: '2026-09-28' },
  };
  const a = buildReportDoc(args);
  const b = buildReportDoc(args);
  expect(typeof a.id).toBe('string');
  expect(a.id.length).toBeGreaterThan(0);
  expect(a.id).not.toBe(b.id);
});
