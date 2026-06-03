import { db } from '../data/firebase';
import { subscribeUserSettings } from '../data/settings';
import type { UserSettings } from '../domain/types';

let _settings = $state<UserSettings>({ defaultMarketId: null, defaultMarketName: null });
let unsub: (() => void) | null = null;

export const settings = {
  get value() { return _settings; },
};

export function startSettings(uid: string) {
  if (unsub) return;
  unsub = subscribeUserSettings(db, uid, (s) => { _settings = s; });
}
