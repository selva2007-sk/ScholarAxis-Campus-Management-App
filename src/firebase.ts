import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { firebaseConfig, firebaseFunctionsRegion } from './config';

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  throw new Error('Missing Firebase configuration. Set VITE_FIREBASE_* variables in .env.local.');
}

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const firestore = initializeFirestore(firebaseApp, {
  ignoreUndefinedProperties: true
});
export const functions = getFunctions(firebaseApp, firebaseFunctionsRegion);
