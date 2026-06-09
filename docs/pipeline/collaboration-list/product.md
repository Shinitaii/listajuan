# Collaboration List

## Problem
ListaJuan is single-user. A Filipino household has multiple shoppers — the primary manager AND a
spouse or older child who also goes to the market. Each person either uses the same device (friction)
or has no access at all (missed trips, duplicate buys, no shared price history). The app's value —
item library, last prices, trip totals — is locked to one person's phone.

## Stakeholders

| Role | Friction | Effort willing |
|---|---|---|
| Pangunahing gumagamit (primary manager) | Only she can log; others can't contribute | Set up once, share a link |
| Kasama sa pamimili (secondary shopper) | No access to the shared pantry/prices | Tap a link, that's it |
| Builder | Architecture-defining change — must not break existing users | Ship without regression |

## Core Feature
An existing ListaJuan user generates a sharable invite link. A family member taps it, opens the
app, and joins the same household list — seeing the same item library, trips, and markets, in real
time when both are online.

## Must-Have

### Household data model
- All trips, items, markets live under a shared `/lists/{listId}/` Firestore subtree (top-level,
  not under any user's path).
- `HouseholdList` doc at `/lists/{listId}` carries `ownerId`, `members` map
  (`{ uid: 'owner' | 'member' }`), and `name`.
- Every `TripItem` denormalizes `listId` (required for the collectionGroup price-history query).
- Settings (`defaultMarketId`) stay per-user — personal preference, not household-shared.

### Lazy migration (existing users)
- On first login after the update, `startSession()` checks `/users/{uid}` for a `listId` field.
- If absent: creates a new `/lists/{listId}` with the user as owner, writes `listId` to
  `/users/{uid}`. Fresh start — old data under `/users/{uid}/trips` is NOT copied. It is not
  deleted either; it just isn't shown in the new UI.
- If present: resume. No migration needed.

### Invite + join flow
- Owner taps "Mag-imbita ng miyembro" (More screen) → app writes an `/invites/{token}` doc
  (`listId`, `expiresAt` 7 days, `createdBy`) → app shows the shareable link / deep link.
- Joiner taps link → app reads the invite → if the joiner is anonymous, shows a one-tap Google
  sign-in prompt (anonymous UIDs are device-scoped and non-portable) → after sign-in, writes
  themselves into `lists/{listId}.members` using the transient-token join mechanism
  (see Architecture Notes) → deep-links into the shared list.
- Invite is single-use: deleted on successful join.
- If the joiner already has a `listId` (they own or belong to another list), show a warning:
  "May sarili ka nang listahan. Hindi ka maaaring sumali sa dalawang listahan." (v1 — one list per
  user).

### Real-time sync
- All existing `onSnapshot` subscriptions (`subscribeRecentTrips`, `subscribeDraftTrips`,
  `subscribeTripItems`, `subscribeItems`) continue to work — they just point at the new
  `/lists/{listId}/...` paths.
- No new sync mechanism needed; Firestore listeners already handle multi-writer.
- When offline: works normally (offline-first, `persistentLocalCache`). Changes sync when
  reconnected.

### Security rules
- `/lists/{listId}/**`: `isMember(listId)` guard (map-based O(1) check).
- `/invites/{token}`: readable by any authenticated user (token = secret), creatable by any
  authenticated user, deletable only by creator.
- `/users/{uid}/**`: kept for per-user settings (same as today).
- collectionGroup `tripItems`: `isMember(resource.data.listId)` (replaces old `uid` check).

### Member visibility + management (More screen)
- Show list of current members ("Mga kasama sa bahay") with display name or "Anonymous" for
  users who haven't linked a Google account.
- Owner can remove any member (except themselves). Removed member loses access immediately —
  their active `onSnapshot` listeners receive permission-denied errors, handled gracefully by
  redirecting to a "Hindi ka na kasapi" (You're no longer a member) screen.
- Any member can leave the list ("Umalis sa listahan"). Owner cannot leave — they must delete
  the list first (ownership transfer is v2).
- One list per user: a user who already has a `listId` on `/users/{uid}` cannot join a second
  list. They must leave their current list first. Enforced in the invite join guard.

## Should-Have

| Feature | Value | Effort | Priority |
|---|---|---|---|
| "Bagong miyembro sumali" toast in-app notification | High — real-time household awareness | Low | Should |
| Member name in trip item row ("Idinagdag ni ___") | Medium — accountability | Medium | Should |
| Regenerate/revoke invite link | Medium — security hygiene | Low | Should |

## Won't-Have (Scope Boundaries)

- **No data migration** — no deployed data exists; old `/users/{uid}/trips|items|markets` paths are deleted entirely from the codebase. Clean break.
- **No multiple lists per user** — one household, one list. Attempting to join a second list shows
  an error.
- **No viewer-only role** — all members can read and write. v2.
- **No push notifications** — OS-level push is out of scope; in-app real-time is sufficient.
- **No email invites** — no server to look up uid by email. Link sharing only.

## Success Metrics

1. **Join works first-try** — a secondary shopper can join via invite link without help, zero
   support needed.
2. **No regression for existing single-user installs** — existing user opens the updated app, data
   is accessible (even if old trips aren't shown, the app is usable and a new list is silently
   created).
3. **Real-time sync visible** — if both members are online, one member's new trip item appears on
   the other member's screen within 2 seconds (Firestore `onSnapshot` latency).

## Architecture Notes

- **No API server, no Cloud Functions.** All logic is Firestore client SDK + security rules.
- **Invite join (transient token field):** Joiner updates
  `lists/{listId}` with `{ members.{uid}: 'member', pendingJoinToken: token }`. Security rule
  validates the token via `get(/invites/$(token))` before allowing the write. Immediately after,
  joiner does a cleanup write to `deleteField()` the `pendingJoinToken`. One extra `get()` read
  per join — acceptable cost for a rare operation.
- **Offline-first guaranteed:** `persistentLocalCache` is unchanged. Writes are optimistic. The
  invite join itself requires a network round-trip (can't join offline — that's expected and
  acceptable).
- **`members` is a map, not an array** — security rules check `members[uid] != null` in O(1).
  Arrays are not supported for membership checks in Firestore rules.
- **New composite index:** `(listId ASC, itemId ASC, tripDate DESC)` on the `tripItems`
  collectionGroup — required for price history queries. Old `(uid, itemId, tripDate)` index
  coexists; both are in `firestore.indexes.json`.
- **Data-layer refactor scope:** All `(db, uid, ...)` signatures in items.ts, trips.ts, markets.ts
  change to `(db, listId, ...)`. Wide but mechanical. Treated as one module in the build plan.

## Timeline

**Effort estimate: ~3 weeks**

| Week | Work |
|---|---|
| 1 | Data-layer refactor (paths, items, trips, markets — `uid` → `listId`), types, lazy migration in session |
| 2 | Invite/join flow (create invite, join mechanic, security rules, Firestore index) |
| 3 | UI wiring (More screen member list + invite button, join deep-link handler, "already in a list" guard), integration tests |

**Blockers:**
- New Firestore composite index deploy requires `firebase deploy --only firestore:indexes` before
  price-history queries work in production.
- Google sign-in for joining requires the Firebase Auth console to have the Google provider
  enabled (it may already be configured for future upgrade — verify before coding the join prompt).
