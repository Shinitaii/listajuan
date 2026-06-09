import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getDoc } from 'firebase/firestore';
import { setupEmulator, teardownEmulator, clearFirestore, type TestCtx } from './testing/emulator';
import { resolveList } from './lists';
import { userDoc } from './paths';

let ctx: TestCtx;

beforeAll(async () => { ctx = await setupEmulator(); });
afterAll(async () => { await teardownEmulator(ctx); });
beforeEach(async () => { await clearFirestore(); });

describe('resolveList (session-init integration)', () => {
  it('first login: creates list and writes listId back to /users/{uid}', async () => {
    const listId = await resolveList(ctx.db, ctx.uid, 'Ana');

    expect(listId).toBeTruthy();

    const userSnap = await getDoc(userDoc(ctx.db, ctx.uid));
    expect(userSnap.exists()).toBe(true);
    expect((userSnap.data() as any).listId).toBe(listId);
  });

  it('subsequent login: returns same listId without creating a new list', async () => {
    const id1 = await resolveList(ctx.db, ctx.uid, 'Ana');
    const id2 = await resolveList(ctx.db, ctx.uid, 'Ana');
    expect(id1).toBe(id2);
  });

  it('fresh user with no prior user doc: setDoc+merge creates the doc instead of throwing', async () => {
    // Emulator starts clean — no /users/{uid} doc exists before this call.
    const listId = await resolveList(ctx.db, ctx.uid, null);
    const snap = await getDoc(userDoc(ctx.db, ctx.uid));
    expect(snap.exists()).toBe(true);
    expect((snap.data() as any).listId).toBe(listId);
  });
});
