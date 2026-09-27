import { test, expect, vi, beforeEach, afterEach } from 'vitest';

const { setDocMock, getDocMock, signInMock } = vi.hoisted(() => ({
  setDocMock: vi.fn(async () => ({})),
  getDocMock: vi.fn(async () => ({ exists: () => false })),
  signInMock: vi.fn(async () => ({ user: { uid: 'u' } })),
}));

vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}), signInAnonymously: (auth) => signInMock(auth) }));
vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  collection: () => ({}),
  doc: (_col, id) => ({ id }),
  setDoc: (ref, data) => setDocMock(ref, data),
  getDoc: (ref) => getDocMock(ref),
  query: () => ({}),
  where: () => ({}),
  orderBy: () => ({}),
  getDocs: async () => ({ docs: [] }),
  serverTimestamp: () => ({}),
  Timestamp: { fromMillis: (ms) => ({ ms }) },
}));
const { buildReportDoc, sendReport } = await import('../../src/services/reports.js');

const sample = (overrides = {}) => ({
  id: 'x',
  spotId: 'xiaoliuqiu',
  zoneId: 'west',
  meters: 20,
  depth: 10,
  diveTime: 1790000000000,
  nickname: 'Michael',
  note: '',
  snapshot: {},
  ...overrides,
});

beforeEach(() => {
  setDocMock.mockReset().mockResolvedValue({});
  getDocMock.mockReset().mockResolvedValue({ exists: () => false });
  signInMock.mockReset().mockResolvedValue({ user: { uid: 'u' } });
});

afterEach(() => {
  navigator.onLine = true;
  vi.useRealTimers();
});

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

test('sendReport: offline throws without calling setDoc', async () => {
  navigator.onLine = false;
  await expect(sendReport(sample())).rejects.toThrow();
  expect(setDocMock).not.toHaveBeenCalled();
});

test('sendReport: payload passed to setDoc excludes id and the doc ref uses it', async () => {
  navigator.onLine = true;
  await sendReport(sample({ id: 'my-id' }));
  expect(setDocMock).toHaveBeenCalledTimes(1);
  const [ref, data] = setDocMock.mock.calls[0];
  expect(ref).toEqual({ id: 'my-id' });
  expect(data.id).toBeUndefined();
  expect(data.spotId).toBe('xiaoliuqiu');
  expect(data.uid).toBe('u');
});

test('sendReport: rejects when the write hangs past the timeout', async () => {
  vi.useFakeTimers();
  setDocMock.mockImplementationOnce(() => new Promise(() => {})); // never settles
  const promise = sendReport(sample());
  const assertion = expect(promise).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(8000);
  await assertion;
});

test('sendReport: rejects when anonymous sign-in hangs past the timeout', async () => {
  vi.useFakeTimers();
  signInMock.mockImplementationOnce(() => new Promise(() => {})); // never settles
  const promise = sendReport(sample());
  const assertion = expect(promise).rejects.toThrow('timeout');
  await vi.advanceTimersByTimeAsync(8000);
  await assertion;
  expect(setDocMock).not.toHaveBeenCalled();
});

test('sendReport: permission-denied + existing doc resolves (already sent)', async () => {
  const err = Object.assign(new Error('denied'), { code: 'permission-denied' });
  setDocMock.mockRejectedValueOnce(err);
  getDocMock.mockResolvedValueOnce({ exists: () => true });
  await expect(sendReport(sample())).resolves.toBeUndefined();
});

test('sendReport: permission-denied + missing doc rethrows', async () => {
  const err = Object.assign(new Error('denied'), { code: 'permission-denied' });
  setDocMock.mockRejectedValueOnce(err);
  getDocMock.mockResolvedValueOnce({ exists: () => false });
  await expect(sendReport(sample())).rejects.toThrow('denied');
});
