import { getDoc, setDoc, onSnapshot, type Firestore } from 'firebase/firestore';
import { userDoc } from './paths';
import type { UserSettings } from '../domain/types';

const EMPTY: UserSettings = { defaultMarketId: null, defaultMarketName: null };

export async function getUserSettings(db: Firestore, uid: string): Promise<UserSettings> {
  const snap = await getDoc(userDoc(db, uid));
  return { ...EMPTY, ...((snap.data() as any)?.settings ?? {}) };
}

export function subscribeUserSettings(db: Firestore, uid: string, cb: (s: UserSettings) => void): () => void {
  return onSnapshot(userDoc(db, uid), (snap) => cb({ ...EMPTY, ...((snap.data() as any)?.settings ?? {}) }));
}

export async function setDefaultMarket(db: Firestore, uid: string, marketId: string | null, marketName: string | null): Promise<void> {
  await setDoc(userDoc(db, uid), { settings: { defaultMarketId: marketId, defaultMarketName: marketName } }, { merge: true });
}
