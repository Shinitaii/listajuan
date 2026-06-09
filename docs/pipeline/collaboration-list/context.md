# Architecture Context: Collaboration List

## Classification
Brownfield + Infra-heavy — replaces the core `/users/{uid}/` path hierarchy with a top-level
`/lists/{listId}/` household model, rewrites all security rules, migrates the data layer, and
adds invite/membership machinery. Every data-layer function, all path helpers, all state stores,
and every Firestore rule change. The highest-impact architectural cut in the backlog.

---

## Existing Code (touched/relevant)

| File | What it does | How this feature touches it |
|---|---|---|
| `src/lib/data/paths.ts` | All Firestore collection/doc helpers (all take `uid`) | Full rewrite — replace `uid` params with `listId`; add `listDoc`, `invitesCol`, `inviteDoc` |
| `src/lib/data/items.ts` | CRUD + search for item library under `/users/{uid}/items/` | All functions change path from `uid` → `listId` |
| `src/lib/data/trips.ts` | Trips, tripItems, cart, price history, collectionGroup | Path change + `listId` denormalized on TripItem (replaces `uid` in collectionGroup query) |
| `src/lib/data/markets.ts` | Markets CRUD under `/users/{uid}/markets/` | Path change `uid` → `listId` (markets are household-shared) |
| `src/lib/data/settings.ts` | `UserSettings` on `/users/{uid}` doc | **No change** — settings (defaultMarketId) stay per-user under `/users/{uid}` |
| `src/lib/data/auth.ts` | Anonymous sign-in | No change |
| `src/lib/domain/types.ts` | All domain types | Add `HouseholdList`, `ListMember`, `ListInvite` types; add `listId` to `TripItem` |
| `src/lib/state/trips.svelte.ts` | Svelte 5 runes store for trips | Passes `listId` instead of `uid` to subscriptions |
| `src/lib/state/session.svelte.ts` | uid + ready state | Add `listId` state; `startSession` must also resolve/create the household list |
| `src/lib/state/library.svelte.ts` | Item library store | Passes `listId` instead of `uid` |
| `src/lib/state/markets.svelte.ts` | Markets store | Passes `listId` instead of `uid` |
| `src/lib/state/settings.svelte.ts` | Settings store | No change |
| `firestore.rules` | Single-owner rule `/users/{uid}/{document=**}` | Full replacement — membership-based rules on `/lists/{listId}` |
| `firestore.indexes.json` | Composite index for collectionGroup tripItems by `(uid, itemId, tripDate)` | Add index for `(listId, itemId, tripDate)`; old index can coexist during migration |
| `src/routes/More.svelte` | (likely) Share/invite UI entry point | Add "Mag-imbita ng miyembro" (Invite member) section |

---

## Tech Debt & Scalability

- **`(db, uid, ...)` signature pervasive across 60+ call sites** — items.ts, trips.ts, markets.ts all take uid as second param. Every call site in routes + state stores must change. This is mechanical but wide. Plan as a single sweep in one module (data-layer module), not piecemeal.
- **`TripItem.uid` is load-bearing for the collectionGroup security rule** — the existing rule `resource.data.uid == request.auth.uid` will break for shared lists. The migration adds `listId` to TripItem and changes the collectionGroup rule. Both fields must coexist on existing docs during lazy migration; new docs only need `listId`.
- **collectionGroup index** (`uid ASC, itemId ASC, tripDate DESC`) must be joined by a new `(listId ASC, itemId ASC, tripDate DESC)` index. Both can coexist. Old index is harmless after migration.
- **Offline-first + lazy migration**: existing users' `/users/{uid}/trips` data is NOT copied on first login. Instead, a migration script (run once, manually) or the lazy-migration flow creates their list and backfills. For v1 of collaboration, lazy migration on login is fine — single-user households migrate the moment they open the updated app.
- **Anonymous auth limitation**: inviting a second member requires both parties to be signed in with a stable identity (anonymous UIDs are per-device, not portable across devices). The invite UX should prompt the joiner to sign in with Google if they're anonymous, or warn that joining links their current anonymous session.

---

## Infra Needs

### New Firestore collections
```
/lists/{listId}
  ownerId: string
  name: string
  members: Record<string, 'owner' | 'member'>  // map for O(1) membership check in rules
  createdAt: Timestamp

/lists/{listId}/items/{itemId}           (household item library — same shape as current Item)
/lists/{listId}/trips/{tripId}           (same shape as current Trip)
/lists/{listId}/trips/{tripId}/tripItems/{tripItemId}   (TripItem + listId field replacing uid)
/lists/{listId}/markets/{marketId}       (same shape as current Market)

/invites/{token}                         (top-level — readable by any auth'd user)
  listId: string
  createdBy: string  (uid)
  expiresAt: Timestamp
  singleUse: boolean
```

### Security rules (new shape)
```
/lists/{listId}
  read: isMember(listId)
  update (normal): isMember(listId)
  update (join via invite): onlyAddingMyself() && validInvite(request.resource.data.pendingJoinToken, listId)
  /**: isMember(listId)

/invites/{token}
  read: request.auth != null
  create: request.auth != null
  delete: request.auth.uid == resource.data.createdBy

/users/{uid}/**  (settings only — kept for per-user prefs)
  read/write: request.auth.uid == uid
  
collectionGroup tripItems
  read: isMember(resource.data.listId)   [replaces uid check]
```

`isMember(listId)` = `get(/lists/$(listId)).data.members[request.auth.uid] != null`

### Invite join mechanism (no Cloud Function required)
The join flow uses a **transient token field** on the list update:
1. Joiner reads `/invites/{token}` → gets `listId`
2. Joiner calls `updateDoc(listRef, { members.{uid}: 'member', pendingJoinToken: token })`
3. Rule validates: `onlyAddingMyself() && validInvite(pendingJoinToken, listId)` (uses `get()` in rules)
4. Joiner immediately does a cleanup `updateDoc(listRef, { pendingJoinToken: deleteField() })` (now a member, so allowed by normal member rule)

This avoids Cloud Functions entirely. The `get()` in rules costs 1 extra Firestore read per join — acceptable for a rare operation.

### Composite indexes needed
```json
{ "collectionGroup": "tripItems", "fields": [
    { "fieldPath": "listId",   "order": "ASCENDING" },
    { "fieldPath": "itemId",   "order": "ASCENDING" },
    { "fieldPath": "tripDate", "order": "DESCENDING" }
]}
```
Keep the existing `(uid, itemId, tripDate)` index — it will serve migrated docs that still have `uid` field during the transition period.

### Lazy migration on login
On `startSession()`, after resolving uid:
1. Check `/users/{uid}/listId` (a single field on the user doc).
2. If present → use that `listId`.
3. If absent → create a new `/lists/{listId}` with `ownerId=uid, members={uid: 'owner'}`, write `listId` back to `/users/{uid}`.
4. No data copy from old paths — old trips/items under `/users/{uid}/` stay but become inaccessible to the new UI. For a fresh install (new user) this is a no-op.

> **Note for spec:** The migration from old `/users/{uid}/trips` data to the new list is a separate one-time utility, not part of the collaboration feature itself. The spec should note this boundary explicitly — existing data is not lost but is not automatically migrated in v1.

---

## Architectural Decisions (confirmed with human)

| Decision | Choice | Rationale |
|---|---|---|
| Data topology | Top-level `/lists/{listId}` | Clean membership model, correct long-term shape, enables future multi-list support |
| Item library | Shared household library under `/lists/{listId}/items/` | One pantry, one family — barcodes, prices, purchase history pooled |
| Permission model | owner / member (2 roles) | Household of 2-5 — everyone shops, simpler rules |
| Invite mechanism | Link sharing with `/invites/{token}` + transient token field join | Fits no-server constraint; one `get()` in rules is the only cost |
| Migration | Lazy on login (create list, write listId to user doc) | Safe for offline-first; no batch migration script needed |

---

## Constraints for Spec

1. **No API server, no Cloud Functions** — all logic is client-side Firestore SDK + security rules.
2. **Offline-first mandatory** — `persistentLocalCache` stays. Writes must be optimistic; no spinners on writes. Collaboration real-time sync is a bonus when online, not a hard requirement.
3. **TripItem.listId must be denormalized** — required for the collectionGroup price-history query. Every write to `tripItems` must include `listId`.
4. **Anonymous auth is acceptable for the list owner** — but a joiner must have a stable identity. The invite UX must handle the anonymous-joiner edge case (prompt to sign in with Google or warn about session portability).
5. **Existing `/users/{uid}/trips` data is NOT migrated in v1** — the spec must scope this as out-of-scope and note the data boundary clearly.
6. **Settings stay per-user** — `defaultMarketId`, `defaultMarketName` stay under `/users/{uid}` (these are personal preferences, not household-shared).
7. **`members` field is a map, not an array** — Firestore security rules can check `resource.data.members[uid] != null` in O(1); array `in` is not supported in rules.
8. **All data-layer function signatures change from `(db, uid, ...)` to `(db, listId, ...)`** — this is a wide but mechanical refactor; the spec should group it as one module (`data-layer`) not scatter it across modules.
