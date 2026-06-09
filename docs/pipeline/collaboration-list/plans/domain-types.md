# Plan: domain-types

## Goal
Extend `src/lib/domain/types.ts` with household collaboration types. Break `TripItem.uid` (remove it, replace with `listId`).

## Steps
1. Add `ListRole = 'owner' | 'member'` union type.
2. Add `ListMemberInfo { role, displayName }` interface.
3. Add `HouseholdList { id, name, ownerId, members, createdAt }` interface.
4. Add `ListInvite { id, listId, createdBy, expiresAt }` interface.
5. On `TripItem`: remove `uid: string`, add `listId: string`.

## Test strategy
No test file — pure type declarations. Verified by `tsc --noEmit` during Phase B.

## File owned
`src/lib/domain/types.ts`
