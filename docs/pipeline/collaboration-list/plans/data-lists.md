# Plan: data-lists

## Goal
New `src/lib/data/lists.ts` — full household list lifecycle: create, resolve on login, invite, join (transient-token), leave, remove member, subscribe members.

## Steps

### createList(db, uid, displayName, name?)
- Generate new doc ref from listsCol
- Write HouseholdList with ownerId=uid, members={uid: {role:'owner', displayName}}, createdAt=Date.now()
- Return the HouseholdList

### resolveList(db, uid, displayName)
- Read userDoc(db, uid) for .listId field
- If absent: createList → updateDoc userDoc { listId } → return listId
- If present: return it

### createInvite(db, listId, createdBy)
- Generate token = nanoid()
- Write /invites/{token} with listId, createdBy, expiresAt=Date.now()+7days
- Return ListInvite

### joinViaInvite(db, uid, displayName, token)
1. Read userDoc → throw ALREADY_IN_LIST if listId set
2. Read inviteDoc → throw INVITE_NOT_FOUND if missing
3. Check expiresAt → throw INVITE_EXPIRED if past
4. updateDoc listDoc: { `members.${uid}`: {role:'member', displayName}, pendingJoinToken: token }
5. updateDoc listDoc: { pendingJoinToken: deleteField() }
6. deleteDoc inviteDoc
7. updateDoc userDoc: { listId: invite.listId }
Returns listId

### leaveList(db, uid, listId)
- Read listDoc → throw OWNER_CANNOT_LEAVE if uid==ownerId
- updateDoc listDoc: { `members.${uid}`: deleteField() }
- updateDoc userDoc: { listId: deleteField() }

### removeMember(db, listId, targetUid, requestorUid)
- Read listDoc → throw NOT_OWNER if requestorUid != ownerId
- throw CANNOT_REMOVE_OWNER if targetUid == ownerId
- updateDoc listDoc: { `members.${targetUid}`: deleteField() }

### getListMembers(db, listId)
- getDoc listDoc → map members Record to MemberRow[]

### subscribeMembers(db, listId, cb)
- onSnapshot listDoc → map members to MemberRow[] → cb

### getList(db, listId)
- getDoc listDoc → return HouseholdList or null

## Test strategy
Emulator tests in lists.emulator.test.ts covering all functions and error codes.
Uses clearFirestore in beforeEach.

## Files owned
`src/lib/data/lists.ts`, `src/lib/data/lists.emulator.test.ts`
