import { signInAnonymously, onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from './firebase';

/** Ensures a signed-in user (anonymous if none) and resolves with the uid. */
export function ensureSignedIn(): Promise<string> {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, async (user: User | null) => {
      unsub();
      if (user) {
        resolve(user.uid);
        return;
      }
      try {
        const cred = await signInAnonymously(auth);
        resolve(cred.user.uid);
      } catch (err) {
        reject(err);
      }
    });
  });
}

export function currentUid(): string | null {
  return auth.currentUser?.uid ?? null;
}
