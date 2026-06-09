import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getDoc, updateDoc } from 'firebase/firestore';
import { setupEmulator, teardownEmulator, clearFirestore, type TestCtx } from './testing/emulator';
import {
  createList, resolveList, createInvite, joinViaInvite,
  leaveList, removeMember, getListMembers, subscribeMembers, getList,
} from './lists';
import { userDoc } from './paths';

// Two contexts: owner (ctx) and joiner (ctx2)
let ctx: TestCtx;
let ctx2: TestCtx;

beforeAll(async () => {
  ctx = await setupEmulator();
  ctx2 = await setupEmulator();
});
afterAll(async () => {
  await teardownEmulator(ctx);
  await teardownEmulator(ctx2);
});
beforeEach(async () => { await clearFirestore(); });

describe('createList', () => {
  it('creates a list with owner in members map', async () => {
    const list = await createList(ctx.db, ctx.uid, 'Ana');
    expect(list.ownerId).toBe(ctx.uid);
    expect(list.members[ctx.uid].role).toBe('owner');
    expect(list.members[ctx.uid].displayName).toBe('Ana');
    expect(list.createdAt).toBeGreaterThan(0);
  });

  it('does not write /users/{uid}.listId', async () => {
    await createList(ctx.db, ctx.uid, null);
    const userSnap = await getDoc(userDoc(ctx.db, ctx.uid));
    expect((userSnap.data() as any)?.listId).toBeUndefined();
  });
});

describe('resolveList', () => {
  it('creates a new list and writes listId to /users/{uid} when absent', async () => {
    const listId = await resolveList(ctx.db, ctx.uid, 'Ana');
    expect(listId).toBeTruthy();
    const userSnap = await getDoc(userDoc(ctx.db, ctx.uid));
    expect((userSnap.data() as any)?.listId).toBe(listId);
  });

  it('returns the existing listId without re-creating on subsequent calls', async () => {
    const id1 = await resolveList(ctx.db, ctx.uid, 'Ana');
    const id2 = await resolveList(ctx.db, ctx.uid, 'Ana');
    expect(id1).toBe(id2);
  });
});

describe('createInvite', () => {
  it('creates an invite doc with 7-day expiry', async () => {
    const listId = await resolveList(ctx.db, ctx.uid, null);
    const invite = await createInvite(ctx.db, listId, ctx.uid);
    expect(invite.id).toBeTruthy();
    expect(invite.listId).toBe(listId);
    expect(invite.expiresAt).toBeGreaterThan(Date.now());
  });
});

describe('joinViaInvite', () => {
  it('joins successfully: joiner appears in members, listId written to joiner user doc', async () => {
    const listId = await resolveList(ctx.db, ctx.uid, 'Ana');
    const invite = await createInvite(ctx.db, listId, ctx.uid);

    const joined = await joinViaInvite(ctx2.db, ctx2.uid, 'Ben', invite.id);
    expect(joined).toBe(listId);

    const members = await getListMembers(ctx.db, listId);
    const joinerRow = members.find(m => m.uid === ctx2.uid);
    expect(joinerRow?.role).toBe('member');
    expect(joinerRow?.displayName).toBe('Ben');

    const userSnap = await getDoc(userDoc(ctx2.db, ctx2.uid));
    expect((userSnap.data() as any)?.listId).toBe(listId);
  });

  it('deletes the invite doc after successful join (single-use)', async () => {
    const listId = await resolveList(ctx.db, ctx.uid, null);
    const invite = await createInvite(ctx.db, listId, ctx.uid);
    await joinViaInvite(ctx2.db, ctx2.uid, null, invite.id);

    const invSnap = await getDoc((await import('./paths')).inviteDoc(ctx.db, invite.id));
    expect(invSnap.exists()).toBe(false);
  });

  it('throws ALREADY_IN_LIST when joiner already has a listId', async () => {
    const listId = await resolveList(ctx.db, ctx.uid, null);
    // Give ctx2 a listId first
    await updateDoc(userDoc(ctx2.db, ctx2.uid), { listId: 'some-other-list' });
    const invite = await createInvite(ctx.db, listId, ctx.uid);
    await expect(joinViaInvite(ctx2.db, ctx2.uid, null, invite.id)).rejects.toThrow('ALREADY_IN_LIST');
  });

  it('throws INVITE_NOT_FOUND for unknown token', async () => {
    await expect(joinViaInvite(ctx2.db, ctx2.uid, null, 'nonexistent-token')).rejects.toThrow('INVITE_NOT_FOUND');
  });

  it('throws INVITE_EXPIRED for an expired invite', async () => {
    const listId = await resolveList(ctx.db, ctx.uid, null);
    // Write an invite with expiresAt in the past
    const token = 'expired-token';
    const { inviteDoc, listDoc } = await import('./paths');
    const { setDoc } = await import('firebase/firestore');
    await setDoc(inviteDoc(ctx.db, token), {
      id: token, listId, createdBy: ctx.uid, expiresAt: Date.now() - 1000,
    });
    await expect(joinViaInvite(ctx2.db, ctx2.uid, null, token)).rejects.toThrow('INVITE_EXPIRED');
  });
});

describe('leaveList', () => {
  it('removes the member from members map and clears their listId', async () => {
    const listId = await resolveList(ctx.db, ctx.uid, null);
    const invite = await createInvite(ctx.db, listId, ctx.uid);
    await joinViaInvite(ctx2.db, ctx2.uid, null, invite.id);

    await leaveList(ctx2.db, ctx2.uid, listId);

    const members = await getListMembers(ctx.db, listId);
    expect(members.find(m => m.uid === ctx2.uid)).toBeUndefined();

    const userSnap = await getDoc(userDoc(ctx2.db, ctx2.uid));
    expect((userSnap.data() as any)?.listId).toBeUndefined();
  });

  it('throws OWNER_CANNOT_LEAVE', async () => {
    const listId = await resolveList(ctx.db, ctx.uid, null);
    await expect(leaveList(ctx.db, ctx.uid, listId)).rejects.toThrow('OWNER_CANNOT_LEAVE');
  });
});

describe('removeMember', () => {
  it('removes the target from the members map (owner action)', async () => {
    const listId = await resolveList(ctx.db, ctx.uid, null);
    const invite = await createInvite(ctx.db, listId, ctx.uid);
    await joinViaInvite(ctx2.db, ctx2.uid, null, invite.id);

    await removeMember(ctx.db, listId, ctx2.uid, ctx.uid);

    const members = await getListMembers(ctx.db, listId);
    expect(members.find(m => m.uid === ctx2.uid)).toBeUndefined();
  });

  it('throws NOT_OWNER if requestor is not owner', async () => {
    const listId = await resolveList(ctx.db, ctx.uid, null);
    const invite = await createInvite(ctx.db, listId, ctx.uid);
    await joinViaInvite(ctx2.db, ctx2.uid, null, invite.id);

    await expect(removeMember(ctx2.db, listId, ctx.uid, ctx2.uid)).rejects.toThrow('NOT_OWNER');
  });

  it('throws CANNOT_REMOVE_OWNER', async () => {
    const listId = await resolveList(ctx.db, ctx.uid, null);
    await expect(removeMember(ctx.db, listId, ctx.uid, ctx.uid)).rejects.toThrow('CANNOT_REMOVE_OWNER');
  });
});

describe('subscribeMembers', () => {
  it('emits current members and updates when a new member joins', async () => {
    const listId = await resolveList(ctx.db, ctx.uid, 'Ana');

    // Wait for initial emission (owner only)
    const initial = await new Promise<ReturnType<typeof getListMembers> extends Promise<infer T> ? T : never>((resolve) => {
      const unsub = subscribeMembers(ctx.db, listId, (members) => {
        if (members.length >= 1) { unsub(); resolve(members); }
      });
    });
    expect(initial.find(m => m.uid === ctx.uid)?.role).toBe('owner');

    // Join and wait for update
    const invite = await createInvite(ctx.db, listId, ctx.uid);
    await joinViaInvite(ctx2.db, ctx2.uid, 'Ben', invite.id);

    const updated = await new Promise<ReturnType<typeof getListMembers> extends Promise<infer T> ? T : never>((resolve) => {
      const unsub = subscribeMembers(ctx.db, listId, (members) => {
        if (members.length >= 2) { unsub(); resolve(members); }
      });
    });
    expect(updated.find(m => m.uid === ctx2.uid)?.displayName).toBe('Ben');
  });
});
