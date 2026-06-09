import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, onSnapshot, type Firestore,
} from 'firebase/firestore';
import { nanoid } from 'nanoid';
import { listDoc, listsCol, inviteDoc, invitesCol, userDoc } from './paths';
import type { HouseholdList, ListInvite, ListRole, ListMemberInfo } from '../domain/types';

export interface MemberRow {
  uid: string;
  role: ListRole;
  displayName: string | null;
}

function membersToRows(members: Record<string, ListMemberInfo>): MemberRow[] {
  return Object.entries(members).map(([uid, info]) => ({
    uid,
    role: info.role,
    displayName: info.displayName,
  }));
}

/**
 * Creates a fresh /lists/{id} with caller as owner.
 * Does NOT write /users/{uid}.listId — resolveList does that.
 */
export async function createList(
  db: Firestore,
  uid: string,
  displayName: string | null,
  name = 'Aming listahan',
): Promise<HouseholdList> {
  const ref = doc(listsCol(db));
  const list: HouseholdList = {
    id: ref.id,
    name,
    ownerId: uid,
    members: { [uid]: { role: 'owner', displayName } },
    createdAt: Date.now(),
  };
  await setDoc(ref, list);
  return list;
}

/**
 * Login entry point. Reads /users/{uid}.listId.
 * - Absent: creates list, writes listId back, returns listId.
 * - Present: returns as-is.
 */
export async function resolveList(
  db: Firestore,
  uid: string,
  displayName: string | null,
): Promise<string> {
  const userSnap = await getDoc(userDoc(db, uid));
  const existing = (userSnap.data() as any)?.listId as string | undefined;
  if (existing) return existing;

  const list = await createList(db, uid, displayName);
  await updateDoc(userDoc(db, uid), { listId: list.id });
  return list.id;
}

/**
 * Creates /invites/{token} with 7-day expiry.
 */
export async function createInvite(
  db: Firestore,
  listId: string,
  createdBy: string,
): Promise<ListInvite> {
  const token = nanoid();
  const invite: ListInvite = {
    id: token,
    listId,
    createdBy,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  await setDoc(inviteDoc(db, token), invite);
  return invite;
}

/**
 * Joins a household list via a single-use invite token.
 * Uses a transient pendingJoinToken field for security-rule validation (no Cloud Functions).
 */
export async function joinViaInvite(
  db: Firestore,
  uid: string,
  displayName: string | null,
  token: string,
): Promise<string> {
  // 1. Check not already in a list
  const userSnap = await getDoc(userDoc(db, uid));
  if ((userSnap.data() as any)?.listId) throw new Error('ALREADY_IN_LIST');

  // 2. Read the invite
  const invSnap = await getDoc(inviteDoc(db, token));
  if (!invSnap.exists()) throw new Error('INVITE_NOT_FOUND');
  const invite = invSnap.data() as ListInvite;

  // 3. Check expiry
  if (invite.expiresAt < Date.now()) throw new Error('INVITE_EXPIRED');

  const ref = listDoc(db, invite.listId);

  // 4. Add self to members + transient token field (security rule validates via get())
  await updateDoc(ref, {
    [`members.${uid}`]: { role: 'member' as ListRole, displayName },
    pendingJoinToken: token,
  });

  // 5. Clean up transient field
  await updateDoc(ref, { pendingJoinToken: deleteField() });

  // 6. Delete invite (single-use)
  await deleteDoc(inviteDoc(db, token));

  // 7. Write listId to user doc
  await updateDoc(userDoc(db, uid), { listId: invite.listId });

  return invite.listId;
}

/**
 * Removes caller from the list. Throws OWNER_CANNOT_LEAVE if uid == ownerId.
 */
export async function leaveList(
  db: Firestore,
  uid: string,
  listId: string,
): Promise<void> {
  const snap = await getDoc(listDoc(db, listId));
  if (!snap.exists()) return;
  const list = snap.data() as HouseholdList;
  if (list.ownerId === uid) throw new Error('OWNER_CANNOT_LEAVE');

  await updateDoc(listDoc(db, listId), { [`members.${uid}`]: deleteField() });
  await updateDoc(userDoc(db, uid), { listId: deleteField() });
}

/**
 * Owner removes another member.
 * NOTE: cannot clear /users/{targetUid}.listId — cross-user write is blocked by rules.
 */
export async function removeMember(
  db: Firestore,
  listId: string,
  targetUid: string,
  requestorUid: string,
): Promise<void> {
  const snap = await getDoc(listDoc(db, listId));
  if (!snap.exists()) return;
  const list = snap.data() as HouseholdList;

  if (list.ownerId !== requestorUid) throw new Error('NOT_OWNER');
  if (targetUid === list.ownerId) throw new Error('CANNOT_REMOVE_OWNER');

  await updateDoc(listDoc(db, listId), { [`members.${targetUid}`]: deleteField() });
}

export async function getListMembers(db: Firestore, listId: string): Promise<MemberRow[]> {
  const snap = await getDoc(listDoc(db, listId));
  if (!snap.exists()) return [];
  return membersToRows((snap.data() as HouseholdList).members);
}

export function subscribeMembers(
  db: Firestore,
  listId: string,
  cb: (members: MemberRow[]) => void,
): () => void {
  return onSnapshot(listDoc(db, listId), (snap) => {
    if (!snap.exists()) { cb([]); return; }
    cb(membersToRows((snap.data() as HouseholdList).members));
  });
}

export async function getList(db: Firestore, listId: string): Promise<HouseholdList | null> {
  const snap = await getDoc(listDoc(db, listId));
  return snap.exists() ? (snap.data() as HouseholdList) : null;
}
