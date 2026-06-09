import { db } from '../data/firebase';
import { ensureSignedIn } from '../data/auth';
import { resolveList } from '../data/lists';
import { getAuth } from 'firebase/auth';

let _uid = $state<string | null>(null);
let _listId = $state<string | null>(null);
let _ready = $state(false);
let _error = $state<unknown>(null);

export const session = {
  get uid() { return _uid; },
  get listId() { return _listId; },
  get ready() { return _ready; },
  get error() { return _error; },
};

let started = false;
export async function startSession(): Promise<void> {
  if (started) return;
  started = true;
  try {
    _uid = await ensureSignedIn();
    const displayName = getAuth().currentUser?.displayName ?? null;
    _listId = await resolveList(db, _uid, displayName);
  } catch (e) {
    _error = e;
  } finally {
    _ready = true;
  }
}

/**
 * Called after joinViaInvite succeeds. Updates the active listId so all
 * list-scoped stores can be restarted with the new household's data.
 */
export function setActiveList(listId: string): void {
  _listId = listId;
}
