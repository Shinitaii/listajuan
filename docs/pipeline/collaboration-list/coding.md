# Coding Design Spec: Collaboration List

## Tech Stack Decisions
- **Firestore client SDK only** — no Cloud Functions, no API server. Invite join uses a transient `pendingJoinToken` field on the list doc, validated via `get()` in security rules.
- **svelte-spa-router** — already in use. `/join` is a new hash route; token is read from `window.location.hash` (spa-router hash routes don't carry search params through `push()`; the join link uses `#/join?token=…` format).
- **`nanoid`** — invite token generation (random, URL-safe, 21 chars).
- **Clean break — no backward compat.** No deployed data exists. Old `/users/{uid}/items`, `/users/{uid}/trips` paths are deleted from the codebase entirely. `TripItem.uid` field removed. Old collectionGroup index removed. No lazy migration paths.

---

## Coding Patterns (shared — all modules follow these)

Derived from the existing codebase.

- **Async style:** Pure domain functions (types, calcs, unit maps) are sync. Everything touching Firestore or Capacitor is `async`. State stores expose sync getters backed by `$state` runes; subscriptions started imperatively via `startX(listId)`.
- **Error handling:** Data-layer functions throw `Error` with a machine-readable string message (e.g. `throw new Error('ALREADY_IN_LIST')`). No `{ ok, error }` result objects — the existing codebase throws. Error codes are UPPER_SNAKE_CASE strings. Callers catch at the UI boundary.
- **Naming:** camelCase functions, PascalCase types/interfaces, `*.test.ts` pure tests, `*.emulator.test.ts` Firestore emulator tests. Test files co-located with the module they test.
- **Data-layer access:** All Firebase access behind `src/lib/data/`. Components and state stores never import `firebase/firestore` directly.
- **Test/mock conventions:** Vitest. Pure tests use `vi.fn()` for injected deps. Emulator tests use `setupEmulator`/`teardownEmulator`/`clearFirestore` from `src/lib/data/testing/emulator.ts`; `clearFirestore` in `beforeEach`. `vi.mock` at top of file, before any `describe`.
- **Imports:** Relative only, no aliases, no barrels.
- **State stores:** Svelte 5 runes (`$state`). Single exported `const` object with `get` accessors. `startX()` is idempotent (guard at top).
- **Firestore writes:** `setDoc` for creates/full overwrites; `updateDoc` for partial patches. Writes are fire-and-forget from the UI (offline-first, IndexedDB-backed).

---

## New Dependencies (npm)

- `nanoid@5` — invite token generation. Installed ONCE in Phase B. Agents must NOT run `npm install`.

---

## Modules

### Batch 1 (parallel)

---

**1. domain-types**
- **Purpose:** Replace the single-user data model with the household model. Add `HouseholdList`, `ListInvite`, `ListRole`, `ListMemberInfo` types. Replace `TripItem.uid` with `TripItem.listId`. Remove all uid-scoped semantics from types.
- **Owns:** `src/lib/domain/types.ts`
- **Files:** `src/lib/domain/types.ts`
- **Dependencies:** none
- **Tech:** TypeScript
- **Complexity:** Low — type declarations only, no logic. One breaking deletion: `uid` field removed from `TripItem`.
- **Interface Contract:**
  ```ts
  // New types — add to types.ts:
  export type ListRole = 'owner' | 'member';

  export interface ListMemberInfo {
    role: ListRole;
    displayName: string | null;
  }

  export interface HouseholdList {
    id: string;
    name: string;
    ownerId: string;
    members: Record<string, ListMemberInfo>;  // uid → info; map for O(1) rules check
    createdAt: number;  // epoch ms
  }

  export interface ListInvite {
    id: string;         // the token (nanoid)
    listId: string;
    createdBy: string;  // uid
    expiresAt: number;  // epoch ms (Date.now() + 7 days)
  }

  // TripItem — breaking change:
  //   REMOVE: uid: string
  //   ADD:    listId: string   (required; denormalized for collectionGroup query)
  // All other TripItem fields unchanged.
  ```
  No test file — verified by `tsc --noEmit`.

---

**2. data-paths**
- **Purpose:** Rewrite `src/lib/data/paths.ts` to point all household collections at `/lists/{listId}/…`. Remove all `/users/{uid}/items|trips|markets` helpers. Keep `userDoc` for settings + `listId` pointer only. Add list and invite helpers.
- **Owns:** `src/lib/data/paths.ts`
- **Files:** `src/lib/data/paths.ts`
- **Dependencies:** none
- **Tech:** TypeScript, Firebase Firestore SDK
- **Complexity:** Low — pure path functions.
- **Interface Contract:**
  ```ts
  // REMOVED (old uid-scoped household paths — deleted entirely):
  //   itemsCol(db, uid), itemDoc(db, uid, itemId)
  //   tripsCol(db, uid), tripDoc(db, uid, tripId)
  //   tripItemsCol(db, uid, tripId)
  //   marketsCol(db, uid), marketDoc(db, uid, marketId)

  // KEPT (still uid-scoped — settings + listId pointer):
  export const userDoc = (db: Firestore, uid: string) =>
    doc(db, 'users', uid);

  // NEW (list-scoped household paths):
  export const listsCol     = (db: Firestore) =>
    collection(db, 'lists');
  export const listDoc      = (db: Firestore, listId: string) =>
    doc(db, 'lists', listId);
  export const itemsCol     = (db: Firestore, listId: string) =>
    collection(db, 'lists', listId, 'items');
  export const itemDoc      = (db: Firestore, listId: string, itemId: string) =>
    doc(db, 'lists', listId, 'items', itemId);
  export const tripsCol     = (db: Firestore, listId: string) =>
    collection(db, 'lists', listId, 'trips');
  export const tripDoc      = (db: Firestore, listId: string, tripId: string) =>
    doc(db, 'lists', listId, 'trips', tripId);
  export const tripItemsCol = (db: Firestore, listId: string, tripId: string) =>
    collection(db, 'lists', listId, 'trips', tripId, 'tripItems');
  export const marketsCol   = (db: Firestore, listId: string) =>
    collection(db, 'lists', listId, 'markets');
  export const marketDoc    = (db: Firestore, listId: string, marketId: string) =>
    doc(db, 'lists', listId, 'markets', marketId);
  export const invitesCol   = (db: Firestore) =>
    collection(db, 'invites');
  export const inviteDoc    = (db: Firestore, token: string) =>
    doc(db, 'invites', token);
  ```
  No test file — paths verified transitively by emulator tests in `data-layer` and `data-lists`.

---

**3. data-layer**
- **Purpose:** Replace `uid` with `listId` in all signatures across `items.ts`, `trips.ts`, `markets.ts`. Remove `TripItem.uid` from all writes; write `TripItem.listId` instead. Switch `priceHistory` collectionGroup query from `where('uid', '==', uid)` to `where('listId', '==', listId)`.
- **Owns:** `src/lib/data/items.ts`, `src/lib/data/trips.ts`, `src/lib/data/markets.ts`
- **Files:** same three files (in-place rewrite)
- **Dependencies:** `domain-types` (TripItem.listId), `data-paths` (new helpers)
- **Tech:** TypeScript, Firebase Firestore SDK
- **Complexity:** Medium — wide but mechanical. One non-trivial point: `addTripItem` embeds `listId` (not `uid`) on the TripItem doc.
- **Interface Contract:**
  ```ts
  // src/lib/data/items.ts — uid → listId everywhere, paths via new itemsCol/itemDoc:
  export async function createItem(db: Firestore, listId: string, input: NewItemInput): Promise<Item>
  export async function getItem(db: Firestore, listId: string, itemId: string): Promise<Item | null>
  export async function searchItems(db: Firestore, listId: string, query: string): Promise<Item[]>
  export async function findItemByBarcode(db: Firestore, listId: string, code: string): Promise<Item | null>
  export async function attachBarcode(db: Firestore, listId: string, itemId: string, code: string): Promise<void>
  export async function updateItemMeta(db: Firestore, listId: string, itemId: string, patch: { form?: Form; category?: Category; canonicalName?: string }): Promise<void>
  export async function deleteItem(db: Firestore, listId: string, itemId: string): Promise<void>
  export function subscribeItems(db: Firestore, listId: string, cb: (items: Item[]) => void): () => void

  // src/lib/data/trips.ts — uid → listId; TripItem.uid removed, TripItem.listId set by addTripItem:
  export async function createDraftTrip(db: Firestore, listId: string, input: NewTripInput): Promise<Trip>
  export async function addTripItem(db: Firestore, listId: string, tripId: string, input: NewTripItemInput): Promise<TripItem>
  export async function getTripItems(db: Firestore, listId: string, tripId: string): Promise<TripItem[]>
  export async function saveTrip(db: Firestore, listId: string, tripId: string): Promise<Trip>
  export async function getTrip(db: Firestore, listId: string, tripId: string): Promise<Trip | null>
  export async function updateTripItem(db: Firestore, listId: string, tripId: string, tripItemId: string, patch: TripItemPatch): Promise<void>
  export async function removeTripItem(db: Firestore, listId: string, tripId: string, tripItemId: string): Promise<void>
  export async function deleteTrip(db: Firestore, listId: string, tripId: string): Promise<void>
  export async function setTripMarket(db: Firestore, listId: string, tripId: string, marketId: string | null, marketName: string | null): Promise<void>
  export async function toggleCartItem(db: Firestore, listId: string, tripId: string, tripItemId: string, inCart: boolean): Promise<void>
  export async function priceHistory(db: Firestore, listId: string, itemId: string): Promise<TripItem[]>
  export async function lastContextFor(db: Firestore, listId: string, itemId: string, marketId: string | null, variant: string | null): Promise<TripItem | null>
  export async function monthlyTotal(db: Firestore, listId: string, year: number, month: number): Promise<number>
  export async function monthlyByCategory(db: Firestore, listId: string, year: number, month: number): Promise<CategoryTotals>
  export function subscribeRecentTrips(db: Firestore, listId: string, cb: (trips: Trip[]) => void, max?: number): () => void
  export function subscribeDraftTrips(db: Firestore, listId: string, cb: (trips: Trip[]) => void): () => void
  export function subscribeTripItems(db: Firestore, listId: string, tripId: string, cb: (items: TripItem[]) => void): () => void

  // src/lib/data/markets.ts — uid → listId:
  export async function createMarket(db: Firestore, listId: string, input: NewMarketInput): Promise<Market>
  export async function getMarket(db: Firestore, listId: string, marketId: string): Promise<Market | null>
  export async function updateMarket(db: Firestore, listId: string, marketId: string, patch: { name?: string; type?: MarketType }): Promise<void>
  export async function deleteMarket(db: Firestore, listId: string, marketId: string): Promise<void>
  export function subscribeMarkets(db: Firestore, listId: string, cb: (markets: Market[]) => void): () => void
  ```
  **Tests:** Update existing emulator test files in-place — change all `uid` fixture vars to `listId`, update TripItem assertions to use `listId` not `uid`. Files: `items.emulator.test.ts`, `items.barcode.emulator.test.ts`, `trips.emulator.test.ts`, `trips.cart.emulator.test.ts`, `cart-tracker.integration.emulator.test.ts`, `markets.emulator.test.ts`.

---

**4. data-lists**
- **Purpose:** New `src/lib/data/lists.ts` — household list lifecycle: create, resolve on login, invite, join (transient-token), leave, remove member, subscribe members.
- **Owns:** `src/lib/data/lists.ts`, `src/lib/data/lists.emulator.test.ts`
- **Files:** `src/lib/data/lists.ts`, `src/lib/data/lists.emulator.test.ts`
- **Dependencies:** `domain-types` (HouseholdList, ListInvite, ListRole, ListMemberInfo), `data-paths` (listDoc, inviteDoc, userDoc, listsCol, invitesCol)
- **Tech:** TypeScript, Firebase Firestore SDK, nanoid
- **Complexity:** High — new module; invite join is a two-step write (pendingJoinToken + cleanup) that must succeed atomically from the user's perspective; `resolveList` is the login critical path.
- **Interface Contract:**
  ```ts
  // Error codes (thrown as Error.message):
  // 'ALREADY_IN_LIST'      — joinViaInvite: /users/{uid}.listId is already set
  // 'INVITE_NOT_FOUND'     — joinViaInvite: token doc missing
  // 'INVITE_EXPIRED'       — joinViaInvite: expiresAt < Date.now()
  // 'OWNER_CANNOT_LEAVE'   — leaveList: caller is the list owner
  // 'NOT_OWNER'            — removeMember: requestor is not owner
  // 'CANNOT_REMOVE_OWNER'  — removeMember: targetUid == ownerId

  /**
   * Creates a fresh /lists/{id} with caller as owner.
   * Does NOT write /users/{uid}.listId — resolveList does that.
   */
  export async function createList(
    db: Firestore,
    uid: string,
    displayName: string | null,
    name?: string,
  ): Promise<HouseholdList>

  /**
   * Login entry point. Reads /users/{uid}.listId.
   * - If absent: calls createList, writes listId to /users/{uid}, returns listId.
   * - If present: returns it as-is (no membership check — clean slate, no stale data).
   */
  export async function resolveList(
    db: Firestore,
    uid: string,
    displayName: string | null,
  ): Promise<string>

  /**
   * Creates /invites/{token} with 7-day expiry.
   * token = nanoid() (21 chars).
   */
  export async function createInvite(
    db: Firestore,
    listId: string,
    createdBy: string,
  ): Promise<ListInvite>

  /**
   * Joins a household list via invite token.
   * 1. Read /users/{uid}.listId — throw 'ALREADY_IN_LIST' if set.
   * 2. Read /invites/{token} — throw 'INVITE_NOT_FOUND' if missing.
   * 3. Check invite.expiresAt — throw 'INVITE_EXPIRED' if past.
   * 4. updateDoc listDoc: { `members.${uid}`: {role:'member', displayName}, pendingJoinToken: token }
   *    (security rule validates token via get())
   * 5. updateDoc listDoc: { pendingJoinToken: deleteField() }
   * 6. deleteDoc inviteDoc  (single-use)
   * 7. updateDoc userDoc(uid): { listId: invite.listId }
   * Returns listId on success.
   */
  export async function joinViaInvite(
    db: Firestore,
    uid: string,
    displayName: string | null,
    token: string,
  ): Promise<string>

  /**
   * Removes caller from the list. Throws 'OWNER_CANNOT_LEAVE' if uid == list.ownerId.
   * 1. updateDoc listDoc: { `members.${uid}`: deleteField() }
   * 2. updateDoc userDoc(uid): { listId: deleteField() }
   */
  export async function leaveList(
    db: Firestore,
    uid: string,
    listId: string,
  ): Promise<void>

  /**
   * Owner removes another member.
   * Throws 'NOT_OWNER' if requestorUid is not ownerId.
   * Throws 'CANNOT_REMOVE_OWNER' if targetUid == ownerId.
   * NOTE: cannot clear /users/{targetUid}.listId — cross-user write is blocked by rules.
   *   If the removed member opens the app, resolveList sees their listId still set but
   *   they're no longer in members — their onSnapshot calls will permission-deny. The
   *   revocation guard in ui-collab detects this and prompts them to start fresh.
   * 1. Read list doc, validate requestorUid is owner.
   * 2. updateDoc listDoc: { `members.${targetUid}`: deleteField() }
   */
  export async function removeMember(
    db: Firestore,
    listId: string,
    targetUid: string,
    requestorUid: string,
  ): Promise<void>

  export interface MemberRow {
    uid: string;
    role: ListRole;
    displayName: string | null;
  }

  export async function getListMembers(db: Firestore, listId: string): Promise<MemberRow[]>

  export function subscribeMembers(
    db: Firestore,
    listId: string,
    cb: (members: MemberRow[]) => void,
  ): () => void

  export async function getList(db: Firestore, listId: string): Promise<HouseholdList | null>
  ```
  **Tests:** `src/lib/data/lists.emulator.test.ts` — covers: createList, resolveList (absent → creates + writes back, present → reuses), createInvite, joinViaInvite (success + ALREADY_IN_LIST + INVITE_EXPIRED + INVITE_NOT_FOUND), leaveList (success + OWNER_CANNOT_LEAVE), removeMember (success + NOT_OWNER + CANNOT_REMOVE_OWNER), subscribeMembers.

---

### Batch 2 (parallel — after Batch 1 is GREEN)

---

**5. infra**
- **Purpose:** Rewrite `firestore.rules` for membership-based guards on `/lists/{listId}/**`. Update `firestore.indexes.json`: remove old `(uid, itemId, tripDate)` index, add `(listId, itemId, tripDate)`. No backward-compat leftovers.
- **Owns:** `firestore.rules`, `firestore.indexes.json`
- **Files:** `firestore.rules`, `firestore.indexes.json`
- **Dependencies:** none
- **Tech:** Firestore Security Rules DSL
- **Complexity:** Medium — join-via-invite rule uses `get()` + `diff()` semantics; must be validated against the emulator.
- **Interface Contract (semantic):**
  ```
  Helper functions:
    isMember(listId)  = get(/databases/$(database)/documents/lists/$(listId))
                          .data.members[request.auth.uid] != null
    isOwner(listId)   = get(/databases/$(database)/documents/lists/$(listId))
                          .data.ownerId == request.auth.uid
    validToken(token, listId) =
      exists(/databases/$(database)/documents/invites/$(token))
      && get(/databases/$(database)/documents/invites/$(token)).data.listId == listId
      && get(/databases/$(database)/documents/invites/$(token)).data.expiresAt > request.time.toMillis()

  /lists/{listId}:
    read:   isMember(listId)
    create: request.auth != null
            && request.resource.data.ownerId == request.auth.uid
            && request.resource.data.members[request.auth.uid] != null
    update — normal (members map not touched):
            isMember(listId)
    update — owner removes a member:
            isOwner(listId)
            && affectedKeys == ['members']
    update — self-leave:
            isMember(listId)
            && affectedKeys ⊆ ['members']
            && request.auth.uid not in request.resource.data.members
    update — join via invite (non-member):
            request.auth != null && !isMember(listId)
            && affectedKeys == ['members', 'pendingJoinToken']
            && only adding request.auth.uid to members
            && validToken(request.resource.data.pendingJoinToken, listId)
    update — token cleanup (newly joined member):
            isMember(listId)
            && affectedKeys == ['pendingJoinToken']
            && 'pendingJoinToken' not in request.resource.data

  /lists/{listId}/{document=**}:
    read, write: isMember(listId)

  /invites/{token}:
    read:   request.auth != null
    create: request.auth != null
    delete: request.auth.uid == resource.data.createdBy

  /users/{uid}:
    read, write: request.auth.uid == uid   (settings + listId pointer only)

  collectionGroup tripItems:
    read: request.auth != null
          && isMember(resource.data.listId)

  OLD RULES REMOVED:
    /users/{uid}/items/**, /users/{uid}/trips/**, /users/{uid}/markets/**
    collectionGroup rule checking resource.data.uid
  ```
  **Index in `firestore.indexes.json`:**
  ```json
  {
    "collectionGroup": "tripItems",
    "queryScope": "COLLECTION_GROUP",
    "fields": [
      { "fieldPath": "listId",   "order": "ASCENDING" },
      { "fieldPath": "itemId",   "order": "ASCENDING" },
      { "fieldPath": "tripDate", "order": "DESCENDING" }
    ]
  }
  ```
  Remove the existing `(uid, itemId, tripDate)` entry — it's dead.
  **Verify:** All batch 1 emulator tests pass against the new rules (the test suite IS the rule verification).

---

**6. session-init**
- **Purpose:** Wire `listId` into the session on login. `startSession()` calls `resolveList` after sign-in and exposes `listId`. All state stores switch from `uid` to `listId`. `App.svelte` updated to pass `session.listId` to the list-scoped stores.
- **Owns:** `src/lib/state/session.svelte.ts`, `src/lib/state/trips.svelte.ts`, `src/lib/state/library.svelte.ts`, `src/lib/state/markets.svelte.ts`, `src/App.svelte`
- **Files:** same five files (in-place edits)
- **Dependencies:** `data-lists` (resolveList), `data-layer` (subscriptions now take listId)
- **Tech:** TypeScript, Svelte 5 runes
- **Complexity:** Low — mechanical wiring; `resolveList` handles the list-creation logic. No migration paths. `startSettings(uid)` stays uid-scoped (settings are per-user).
- **Interface Contract:**
  ```ts
  // src/lib/state/session.svelte.ts
  export const session: {
    readonly uid: string | null;
    readonly listId: string | null;   // NEW — null until startSession resolves
    readonly ready: boolean;
    readonly error: unknown;
  }
  export async function startSession(): Promise<void>
  // Internally: _uid = await ensureSignedIn(); _listId = await resolveList(db, _uid, displayName)
  // displayName = auth.currentUser?.displayName ?? null

  // NEW — called by JoinList after a successful joinViaInvite:
  export function setActiveList(listId: string): void
  // Sets _listId, then re-calls startLibrary(listId), startTrips(listId),
  // startMarkets(listId), startCollab(listId) so the new list data streams in.

  // src/lib/state/trips.svelte.ts
  export function startTrips(listId: string): void   // param renamed uid → listId

  // src/lib/state/library.svelte.ts
  export function startLibrary(listId: string): void

  // src/lib/state/markets.svelte.ts
  export function startMarkets(listId: string): void

  // src/App.svelte — onMount change:
  // BEFORE: startLibrary(session.uid!); startTrips(session.uid!); ...
  // AFTER:
  //   startLibrary(session.listId!);
  //   startTrips(session.listId!);
  //   startMarkets(session.listId!);
  //   startCollab(session.listId!);
  //   startSettings(session.uid!);  ← stays uid-scoped
  //
  // Add '/join': JoinList to routes map.
  ```
  **Tests:** `src/lib/data/session-init.emulator.test.ts` — covers: first login (no listId → creates list, writes back, session.listId is set), subsequent login (reads existing listId).

---

**7. ui-collab**
- **Purpose:** Member list + invite flow on More screen; new JoinList route; revocation guard for removed members; `collab.svelte.ts` reactive member state.
- **Owns:** `src/routes/More.svelte` (edit), `src/routes/JoinList.svelte` (new), `src/lib/state/collab.svelte.ts` (new)
- **Files:** `src/routes/More.svelte`, `src/routes/JoinList.svelte`, `src/lib/state/collab.svelte.ts`
- **Dependencies:** `data-lists` (createInvite, joinViaInvite, leaveList, removeMember, subscribeMembers), `session-init` (session.uid, session.listId, setActiveList)
- **Tech:** TypeScript, Svelte 5 runes, svelte-spa-router, lucide-svelte
- **Complexity:** Medium — three surfaces; the revocation guard must not loop; the join flow has the anonymous-user edge case.
- **Interface Contract:**

  **`src/lib/state/collab.svelte.ts`:**
  ```ts
  export interface MemberRow { uid: string; role: ListRole; displayName: string | null; }
  export const collab: {
    readonly members: MemberRow[];
    readonly listId: string | null;
    readonly accessRevoked: boolean;  // true when onSnapshot fires permission-denied
  }
  export function startCollab(listId: string): void
  // Sets up subscribeMembers; on permission-denied error, sets accessRevoked = true.
  ```

  **`src/routes/More.svelte` (additions):**
  ```
  New "Kasama sa bahay" section (above existing rows):
  - Renders collab.members rows: displayName (or "Hindi kilala") + role chip
  - Owner sees trash icon per non-owner row → ConfirmDialog → removeMember(db, listId, targetUid, uid)
  - Non-owner sees "Umalis sa listahan" button → ConfirmDialog → leaveList → push('/')
  - "Mag-imbita ng miyembro" button:
      → createInvite(db, listId, uid)
      → build URL: window.location.origin + '/#/join?token=' + invite.id
      → navigator.clipboard.writeText(url)
      → show inline "Nakopya ang link!" confirmation (not a toast — inline text, 2s)
  ```

  **`src/routes/JoinList.svelte` (new route `/join`):**
  ```
  On mount:
    1. Parse token from window.location.hash:
       const hash = window.location.hash;  // e.g. "#/join?token=abc123"
       const token = new URLSearchParams(hash.split('?')[1] ?? '').get('token');
    2. No token → push('/')
    3. session.listId already set → show:
       "May sarili ka nang listahan. Umalis muna bago sumali sa isa pa."
       + "Bumalik" button → push('/')
    4. auth.currentUser?.isAnonymous → show:
       "Mag-sign in gamit ang Google para sumali."
       + Google sign-in button (firebase/auth signInWithPopup + GoogleAuthProvider)
       On success → proceed to step 5
    5. Call joinViaInvite(db, uid, displayName, token)
       During call: show "Sumasali…" (text only, no spinner — offline-first UX)
       On success: setActiveList(listId) → push('/')
       On 'INVITE_EXPIRED': "Expired na ang link. Humingi ng bagong link sa may-ari."
       On 'INVITE_NOT_FOUND': "Hindi mahanap ang invite. Maaaring nagamit na."
       On 'ALREADY_IN_LIST': show step 3 message (defensive guard)
  ```

  **Revocation guard in `App.svelte`:**
  ```
  {#if session.ready && !session.error && collab.accessRevoked}
    <div class="boot">
      <p>Hindi ka na kasapi sa listahang ito.</p>
      <button onclick={handleRevoked}>Magsimula muli</button>
    </div>
  {/if}

  handleRevoked():
    // Cannot call leaveList — user has no write access anymore (removed from members).
    // Just clear their local listId pointer and reload.
    await updateDoc(userDoc(db, session.uid!), { listId: deleteField() });
    window.location.reload();  // startSession will call resolveList → create fresh list
  ```

  **Tests:** `src/lib/data/collab-invite.integration.emulator.test.ts` — covers: full round-trip (user A creates invite, user B joins, both appear in subscribeMembers); removeMember (A removes B, B's subscription emits empty or permission-denied). `src/routes/JoinList.test.ts` — pure unit tests for token parsing and error message rendering (mock joinViaInvite with vi.fn()).

---

## Module Dependencies

```
domain-types
     │
data-paths
     │
     ├──► data-layer (items, trips, markets)
     │
     └──► data-lists ──────────────────────► session-init ──► ui-collab
                                                    │
                                              infra (rules/indexes)
                                              [validated by batch-1 emulator tests]
```

Batch 1 (parallel): `domain-types`, `data-paths`, `data-layer`, `data-lists`
Batch 2 (parallel, after Batch 1 GREEN): `infra`, `session-init`, `ui-collab`

---

## Infra Steps (non-code — require manual deploy to production)

1. **`firestore.rules` deploy** — `firebase deploy --only firestore:rules`. Emulator handles dev/test; production needs this deploy before invite join works live.
2. **`firestore.indexes.json` deploy** — `firebase deploy --only firestore:indexes`. New `(listId, itemId, tripDate)` collectionGroup index takes 5–10 min to build in production. Deploy before shipping.
3. **Google Auth provider** — Verify Firebase Console has Google sign-in enabled (needed for anonymous joiners). If not enabled, JoinList must degrade gracefully.

---

## Integration Points

- `App.svelte` is the integration hub: `startSession()` → `(uid, listId)` → `startLibrary(listId)`, `startTrips(listId)`, `startMarkets(listId)`, `startCollab(listId)`, `startSettings(uid)`.
- `JoinList.svelte` calls `joinViaInvite` → on success calls `setActiveList(listId)` in session store → re-runs all list-scoped stores with new listId.
- `priceHistory` collectionGroup query now filters by `listId` — requires the new index.
- `collab.accessRevoked` flag in `App.svelte` gates the revocation full-screen UI.

---

## UI Integration

- **Components wired:** `More.svelte` (member section), `JoinList.svelte` (new `/join` route), `App.svelte` (route + revocation guard).
- **User-facing contract:**
  - **Invite:** Owner → "Iba pa" → "Mag-imbita" → link copied → share via any app.
  - **Join:** Tap link → JoinList → Google sign-in (if anonymous) → "Sumasali…" → Home (shared data).
  - **Remove member:** Owner → More → trash icon → ConfirmDialog → removed.
  - **Leave:** Member → More → "Umalis sa listahan" → ConfirmDialog → Home (fresh list on next load).
  - **Revocation:** Removed member opens app → "Hindi ka na kasapi" full-screen → "Magsimula muli" → clears listId → reloads → gets fresh personal list.

---

## Constraints & Rules

1. **No Cloud Functions, no API server** — transient `pendingJoinToken` + security rule `get()` is the only join mechanism.
2. **`TripItem.listId` mandatory** — every `addTripItem` call must embed `listId`. No `uid` field on TripItem.
3. **`members` is a map** — O(1) rules check; no array-in queries in Firestore rules.
4. **Offline-first** — writes optimistic, `persistentLocalCache` stays. Join requires network (acceptable).
5. **One list per user** — `joinViaInvite` throws `ALREADY_IN_LIST` if `/users/{uid}.listId` set.
6. **Owner cannot leave** — `leaveList` throws `OWNER_CANNOT_LEAVE`.
7. **Settings stay at `/users/{uid}`** — `settings.ts` untouched; `startSettings(uid)` stays uid-scoped.
8. **No backward compat** — old `/users/{uid}/items|trips|markets` paths, `TripItem.uid`, and the `(uid, itemId, tripDate)` index are all deleted.
9. **Git Bash for shell commands** — forward-slash paths only.

---

## Project Context

- **Framework:** Svelte 5 (runes) + Vite + TypeScript. Capacitor 8 for mobile.
- **Data layer pattern:** All Firebase access behind `src/lib/data/`. State stores call data-layer functions. Components never touch `firebase/firestore`.
- **Testing:** Vitest. Pure tests: `npm test`. Emulator tests: `npm run test:emulator` (needs Java + Firebase emulator). Emulator tests run serially (`--no-file-parallelism`), `clearFirestore` in `beforeEach`.
- **Router:** `svelte-spa-router` (hash-based). New routes added to `routes` object in `App.svelte`.
