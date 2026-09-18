import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getDatabase, type Database } from 'firebase-admin/database';
import { getAuth, type Auth } from 'firebase-admin/auth';

let appInstance: App | null = null;

export function getAdminApp(): App {
  if (appInstance) return appInstance;

  const existing = getApps()[0];
  if (existing) {
    appInstance = existing;
    return appInstance;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Missing Firebase Admin credentials. Please define FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in .env.local.'
    );
  }

  appInstance = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  });

  return appInstance;
}

export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const database = getDatabase(getAdminApp());
    const val = (database as any)[prop];
    return typeof val === 'function' ? val.bind(database) : val;
  },
});

export const adminAuth: Auth = new Proxy({} as Auth, {
  get(_target, prop) {
    const auth = getAuth(getAdminApp());
    const val = (auth as any)[prop];
    return typeof val === 'function' ? val.bind(auth) : val;
  },
});

/**
 * Strips all `undefined` fields from an object so Firebase Realtime Database does not reject it.
 */
export function cleanForRtdb<T extends Record<string, any>>(obj: T): T {
  const cleaned: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        cleaned[key] = cleanForRtdb(value);
      } else {
        cleaned[key] = value;
      }
    }
  }
  return cleaned;
}


