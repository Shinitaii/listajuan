import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import {
  getAuth,
  connectAuthEmulator,
  signInAnonymously,
  type Auth,
} from 'firebase/auth';

const PROJECT_ID = 'listajuan-dev';

export interface TestCtx {
  app: FirebaseApp;
  db: Firestore;
  auth: Auth;
  uid: string;
}

export async function setupEmulator(): Promise<TestCtx> {
  const app = initializeApp({ projectId: PROJECT_ID, apiKey: 'fake-key' }, `t-${Date.now()}-${Math.random()}`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const cred = await signInAnonymously(auth);
  return { app, db, auth, uid: cred.user.uid };
}

export async function teardownEmulator(ctx: TestCtx): Promise<void> {
  await deleteApp(ctx.app);
}

export async function clearFirestore(): Promise<void> {
  await fetch(
    `http://127.0.0.1:8080/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
}
