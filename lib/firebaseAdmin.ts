import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let cachedDb: Firestore | null = null;
let initAttempted = false;

export function getAdminDb(): Firestore | null {
  if (cachedDb) return cachedDb;
  if (initAttempted) return null;
  initAttempted = true;

  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw || !raw.trim()) {
      return null;
    }

    const serviceAccount = JSON.parse(raw);
    if (typeof serviceAccount.private_key === 'string') {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }

    if (!getApps().length) {
      initializeApp({
        credential: cert(serviceAccount),
      });
    }
    cachedDb = getFirestore();
    return cachedDb;
  } catch (err) {
    console.warn('[Firebase Admin] Could not initialize Firestore Admin:', err);
    return null;
  }
}
