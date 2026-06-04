# Module Plan: cart-ui

## Purpose
Wire cart-tracker into Trip.svelte: split the item list into pending/done sections, tap-to-toggle, recently-added badge.

## Owned Files
- `src/routes/Trip.svelte`

## Steps

### 1. Import toggleCartItem
Add to the existing trips import line:
```ts
import { ..., toggleCartItem } from '../lib/data/trips';
```

### 2. Add derived state + helpers
In the script block, after the existing `const groups` line:
```ts
const RECENTLY_ADDED_MS = 5 * 60 * 1000
const pending      = $derived(items.filter(i => !i.inCart))
const inCartItems  = $derived(items.filter(i =>  i.inCart))
const pendingGroups = $derived(groupByMarket(pending))
const isNew = (ti: TripItem) => Date.now() - ti.addedAt < RECENTLY_ADDED_MS
```

### 3. Add onToggleCart handler
```ts
async function onToggleCart(ti: TripItem) {
  await toggleCartItem(db, uid, tripId, ti.id, !ti.inCart);
}
```

### 4. Restructure the list template (draft-trip view only)
Replace the existing `{#each groups ...}` block with:
- **Pending section**: header `"Listahan ({pending.length})"`, market groups using `pendingGroups`, each row has `onclick={()=> onToggleCart(ti)}` on the whole row div, badge `{#if isNew(ti)}<span class="new-badge">Bagong dagdag</span>{/if}`
- **Done section**: only when `inCartItems.length > 0`, header `"Na sa cart na ({inCartItems.length})"`, flat `{#each inCartItems}`, row label struck-through + muted, `onclick={()=> onToggleCart(ti)}`

Saved trips (`trip?.status === 'saved'`): render the original `{#each groups}` loop unchanged — no toggle, no split, no badge.

### 5. Styles
Add:
```css
.row-pending { cursor: pointer; }   /* inherits existing .row */
.row-done    { cursor: pointer; opacity: 0.55; }
.done-label  { text-decoration: line-through; }
.new-badge   { font-size: 11px; background: var(--c-accent); color: #fff;
               border-radius: 999px; padding: 1px 7px; margin-left: 6px; }
.section-hdr { font-weight: 700; margin-top: 16px; font-size: var(--fs-label); color: var(--c-ink-soft); }
```

## Interface Contract
- `RECENTLY_ADDED_MS = 5 * 60 * 1000` — named constant, not inline magic number
- `pending`, `inCartItems`, `pendingGroups` — `$derived` (Svelte 5 runes)
- `onToggleCart(ti)` — `async`, calls `toggleCartItem`
- Full row tap target (min-height 44px via existing `.row` style)
- Draft trips only: split view + toggle. Saved trips: no change.
