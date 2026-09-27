import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDoc, query, where, orderBy, getDocs, serverTimestamp, Timestamp } from 'firebase/firestore';
import { firebaseConfig } from '../config.js';

const SEND_TIMEOUT_MS = 8000;

let app;
const init = () => (app ??= initializeApp(firebaseConfig));

const num = (v) => Number(String(v).replace('+', ''));

export function buildReportDoc({ spotId, form, snapshot }) {
  return {
    id: crypto.randomUUID(),
    spotId,
    zoneId: form.zoneId,
    meters: num(form.meters),
    depth: num(form.depth),
    diveTime: form.diveTime,
    nickname: String(form.nickname ?? '').trim().slice(0, 20),
    note: String(form.note ?? '').trim().slice(0, 200),
    snapshot,
  };
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

export async function sendReport(doc_) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('offline');
  }
  init();
  const auth = getAuth();
  // Sign-in is under the same timeout so a send (and outbox.add) always finishes.
  const { user } = auth.currentUser ? { user: auth.currentUser } : await withTimeout(signInAnonymously(auth), SEND_TIMEOUT_MS);
  const { id, ...data } = doc_;
  const ref = doc(collection(getFirestore(), 'reports'), id);
  try {
    await withTimeout(
      setDoc(ref, {
        ...data,
        diveTime: Timestamp.fromMillis(data.diveTime),
        uid: user.uid,
        createdAt: serverTimestamp(),
      }),
      SEND_TIMEOUT_MS,
    );
  } catch (err) {
    if (err && err.code === 'permission-denied') {
      const snap = await withTimeout(getDoc(ref), SEND_TIMEOUT_MS);
      if (snap.exists()) return;
    }
    throw err;
  }
}

export async function fetchRecentReports(spotId, days = 7) {
  init();
  const since = Timestamp.fromMillis(Date.now() - days * 86400000);
  const q = query(collection(getFirestore(), 'reports'),
    where('spotId', '==', spotId), where('diveTime', '>=', since), orderBy('diveTime', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const x = d.data();
    return { id: d.id, ...x, diveTime: x.diveTime.toMillis(), rawMeters: x.snapshot?.rawMeters };
  });
}
