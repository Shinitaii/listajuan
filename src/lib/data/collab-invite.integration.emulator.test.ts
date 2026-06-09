import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupEmulator, teardownEmulator, clearFirestore, type TestCtx } from './testing/emulator';
import {
  resolveList, createInvite, joinViaInvite, subscribeMembers, removeMember,
} from './lists';

let owner: TestCtx;
let joiner: TestCtx;

beforeAll(async () => {
  owner = await setupEmulator();
  joiner = await setupEmulator();
});
afterAll(async () => {
  await teardownEmulator(owner);
  await teardownEmulator(joiner);
});
beforeEach(async () => { await clearFirestore(); });

describe('collab invite round-trip', () => {
  it('owner creates invite → joiner joins → both appear in subscribeMembers', async () => {
    const listId = await resolveList(owner.db, owner.uid, 'Ana');
    const invite = await createInvite(owner.db, listId, owner.uid);

    await joinViaInvite(joiner.db, joiner.uid, 'Ben', invite.id);

    const members = await new Promise<Awaited<ReturnType<typeof subscribeMembers extends (...args: any) => any ? never : never>>>((resolve) => {
      // Subscribe from owner's db and wait until both members appear.
      const unsub = subscribeMembers(owner.db, listId, (rows) => {
        if (rows.length >= 2) { unsub(); resolve(rows as any); }
      });
    });

    expect((members as any).find((m: any) => m.uid === owner.uid)?.role).toBe('owner');
    expect((members as any).find((m: any) => m.uid === joiner.uid)?.role).toBe('member');
    expect((members as any).find((m: any) => m.uid === joiner.uid)?.displayName).toBe('Ben');
  });

  it('owner removes member → member no longer appears in subscribeMembers', async () => {
    const listId = await resolveList(owner.db, owner.uid, 'Ana');
    const invite = await createInvite(owner.db, listId, owner.uid);
    await joinViaInvite(joiner.db, joiner.uid, 'Ben', invite.id);

    await removeMember(owner.db, listId, joiner.uid, owner.uid);

    const members = await new Promise<any[]>((resolve) => {
      const unsub = subscribeMembers(owner.db, listId, (rows) => {
        if (rows.every(r => r.uid !== joiner.uid)) { unsub(); resolve(rows); }
      });
    });

    expect(members.find(m => m.uid === joiner.uid)).toBeUndefined();
    expect(members.find(m => m.uid === owner.uid)).toBeDefined();
  });
});
