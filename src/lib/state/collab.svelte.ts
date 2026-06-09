import { db } from '../data/firebase';
import { subscribeMembers, type MemberRow } from '../data/lists';

export type { MemberRow };

let _members = $state<MemberRow[]>([]);
let _listId = $state<string | null>(null);
let _accessRevoked = $state(false);
let unsub: (() => void) | null = null;

export const collab = {
  get members() { return _members; },
  get listId() { return _listId; },
  get accessRevoked() { return _accessRevoked; },
};

export function startCollab(listId: string): void {
  if (unsub) { unsub(); unsub = null; }
  _listId = listId;
  _accessRevoked = false;

  unsub = subscribeMembers(
    db,
    listId,
    (members) => { _members = members; },
    (err) => {
      // permission-denied fires when the user is removed from the list
      if ((err as any)?.code === 'permission-denied') {
        _accessRevoked = true;
      }
    },
  );
}
