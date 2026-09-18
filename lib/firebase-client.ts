import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';

export function getFirebaseClientApp(): FirebaseApp {
  const existing = getApps()[0];
  if (existing) return existing;

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const config = {
    apiKey: apiKey || 'fake-api-key-for-prerendering',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'placeholder-project',
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  return initializeApp(config);
}

let _auth: Auth | null = null;
export function getFirebaseAuth(): Auth {
  if (!_auth) {
    _auth = getAuth(getFirebaseClientApp());
  }
  return _auth;
}

let _db: Database | null = null;
export function getFirebaseDatabase(): Database {
  if (!_db) {
    _db = getDatabase(getFirebaseClientApp());
  }
  return _db;
}

// In the browser, export the real initialized instances directly to avoid Proxy interference with signInWithPopup
export const firebaseApp: FirebaseApp =
  typeof window !== 'undefined'
    ? getFirebaseClientApp()
    : (new Proxy({} as FirebaseApp, {
      get(_target, prop) {
        const app = getFirebaseClientApp();
        const val = (app as any)[prop];
        return typeof val === 'function' ? val.bind(app) : val;
      },
    }));

export const auth: Auth =
  typeof window !== 'undefined'
    ? getFirebaseAuth()
    : (new Proxy({} as Auth, {
      get(_target, prop) {
        const authInstance = getFirebaseAuth();
        const val = (authInstance as any)[prop];
        return typeof val === 'function' ? val.bind(authInstance) : val;
      },
    }));

export const database: Database =
  typeof window !== 'undefined'
    ? getFirebaseDatabase()
    : (new Proxy({} as Database, {
      get(_target, prop) {
        const dbInstance = getFirebaseDatabase();
        const val = (dbInstance as any)[prop];
        return typeof val === 'function' ? val.bind(dbInstance) : val;
      },
    }));
