import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const env = (typeof import.meta !== 'undefined' && (import.meta as any).env)
  ? (import.meta as any).env
  : (typeof process !== 'undefined' ? (process.env as Record<string, string | undefined>) : {});

const resolvedConfig = {
  ...firebaseConfig,
  apiKey: env.VITE_FIREBASE_API_KEY || firebaseConfig.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfig.authDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfig.messagingSenderId,
  appId: env.VITE_FIREBASE_APP_ID || firebaseConfig.appId,
  firestoreDatabaseId: env.VITE_FIREBASE_DATABASE_ID || firebaseConfig.firestoreDatabaseId,
};

export const resolvedFirebaseConfig = resolvedConfig;
export const app = !getApps().length ? initializeApp(resolvedConfig) : getApp();
export const db = getFirestore(app, resolvedConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

export const SUPERADMIN_EMAIL = 'Martiligando@gmail.com';

// Connection test on boot per Firebase skill requirement
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client offline status:', error.message);
    }
    return false;
  }
}
