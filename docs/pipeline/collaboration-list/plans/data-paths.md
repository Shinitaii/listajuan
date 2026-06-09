# Plan: data-paths

## Goal
Rewrite `src/lib/data/paths.ts`:
- Remove uid-scoped household helpers (old /users/{uid}/items|trips|markets paths)
- Keep userDoc (settings + listId pointer)
- Add listId-scoped helpers pointing at /lists/{listId}/...
- Add listsCol, listDoc, invitesCol, inviteDoc

## Steps
1. Keep userDoc unchanged.
2. Rewrite itemsCol, itemDoc, tripsCol, tripDoc, tripItemsCol, marketsCol, marketDoc to use listId and /lists/{listId}/... paths.
3. Add listsCol, listDoc, invitesCol, inviteDoc.

## Test strategy
No test file — verified transitively by data-layer and data-lists emulator tests.

## File owned
`src/lib/data/paths.ts`
