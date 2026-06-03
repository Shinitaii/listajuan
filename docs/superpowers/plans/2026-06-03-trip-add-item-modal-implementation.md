# Trip Add-Item Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the add-item flow into a step-by-step modal, move trip page controls to the top, and add price capture to item library creation.

**Architecture:** 
- Trip.svelte restructures its header (save button on top, delete in menu) and adds a modal backdrop CSS class
- AddItem.svelte gains step-tracking state and conditionally renders ItemPicker (step 1), QtyField (step 2), or Presyo (step 3) with navigation buttons
- Items.svelte adds a price input to the new item creation form and passes it to `createItem`
- Market picker logic moves from Trip to AddItem step 2 (stays inline, not separate route)

**Tech Stack:** Svelte 5, TypeScript, existing UI components (FormPicker, CategoryPicker, MarketPicker, QtyField, QuickAdjust)

---

## Task 1: Trip Page Header Restructure

**Files:**
- Modify: `src/routes/Trip.svelte:54-92`

**Summary:** Move the "Tapos — i-save ang biyahe" button to the top, add a three-dot menu for delete, remove the "Bumalik sa listahan" button, and add modal backdrop styling.

- [ ] **Step 1: Restructure the header**

Replace the current header section (lines 54-59) with:

```svelte
<section class="screen">
  <header>
    <IconButton label="Bumalik" onclick={() => push('/')}><ChevronLeft size={26} /></IconButton>
    <div class="h">{trip?.name ?? 'Biyahe'} · {trip?.date ?? ''}</div>
    <IconButton label="Higit pang opsyon" onclick={() => (showMenu = !showMenu)}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
      </svg>
    </IconButton>
  </header>

  {#if showMenu}
    <div class="menu">
      <button class="menu-item danger" onclick={() => { confirmDelete = true; showMenu = false; }}>
        <Trash2 size={18} /> Burahin ang biyahe
      </button>
    </div>
  {/if}

  {#if trip?.status === 'draft'}
    <button class="finish" onclick={finish}>Tapos — i-save ang biyahe</button>
  {/if}

  <button class="mktchip" onclick={() => (pickingMarket = !pickingMarket)}>Tindahan: {trip?.defaultMarketName ?? 'Pumili ng tindahan'} ▾</button>
```

In the script section (top), add the `showMenu` state:

```typescript
let showMenu = $state(false);
```

- [ ] **Step 2: Remove the "Bumalik sa listahan" button from add mode**

Find the line (currently around 68):
```svelte
{#if items.length}<button class="link" onclick={() => (mode = 'view')}>Bumalik sa listahan</button>{/if}
```

Delete it entirely.

- [ ] **Step 3: Add modal backdrop CSS**

Add these styles to the `<style>` block:

```css
.screen { position: relative; }
.modal-backdrop { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.3); z-index: 10; }
.modal { position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 11; display: flex; align-items: flex-start; padding-top: 20px; overflow-y: auto; }
.modal-content { background: var(--c-bg); border-radius: var(--radius) var(--radius) 0 0; padding: var(--sp-screen); width: 100%; max-width: 100%; margin: 0; }
header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.h { font-weight: 700; font-size: 17px; flex: 1; } 
.menu { background: var(--c-surface); border-radius: var(--radius); margin-bottom: 12px; overflow: hidden; border: 1px solid var(--c-ink-soft); }
.menu-item { width: 100%; padding: 12px 16px; text-align: left; border: none; background: none; font-weight: 700; display: flex; align-items: center; gap: 8px; cursor: pointer; }
.menu-item.danger { color: var(--c-danger); }
.menu-item:hover { background: var(--c-bg); }
.finish { width: 100%; padding: 14px; margin: 12px 0; border: none; border-radius: var(--radius); background: var(--c-accent); color: #fff; font-weight: 700; font-size: var(--fs-price); }
```

- [ ] **Step 4: Remove the old trash button at the bottom**

Find and delete the line:
```svelte
<button class="trash" onclick={() => (confirmDelete = true)}><Trash2 size={18} /> Burahin ang biyahe</button>
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/Trip.svelte
git commit -m "feat: Trip page header restructure - save button to top, delete in menu"
```

---

## Task 2: AddItem Step-by-Step Modal Flow

**Files:**
- Modify: `src/routes/AddItem.svelte` (entire component refactor)

**Summary:** Add step tracking state and refactor rendering to show ItemPicker (step 1), QtyField (step 2), or Presyo (step 3), with navigation buttons and variant in "More options" expander.

- [ ] **Step 1: Add step state and helper at the top of the script**

After the existing state declarations (around line 43), add:

```typescript
let step = $state<1 | 2 | 3>(1);

function nextStep() { if (step < 3) step++; }
function prevStep() { if (step > 1) step--; }
```

- [ ] **Step 2: Create a reusable "More options" expander component**

This can be inline in AddItem or extracted. For simplicity, add this to AddItem's conditional rendering logic. When needed in steps 2 & 3, render:

```svelte
<details class="more-options">
  <summary>Higit pang opsyon</summary>
  <p class="lbl">Uri (opsyonal) — hal. "3-pack", "225ml"</p>
  <input class="variant" bind:value={variant} placeholder="walang laman = ordinaryo" />
</details>
```

Add CSS for the expander:

```css
.more-options { margin-top: 16px; padding: 12px; border: 1px solid var(--c-surface); border-radius: var(--radius); }
.more-options summary { cursor: pointer; font-weight: 700; }
.more-options summary:hover { color: var(--c-accent); }
```

- [ ] **Step 3: Refactor the main render block to use step tracking**

Replace the entire conditional render block (lines 112-149) with:

```svelte
<div class="add">
  {#if existing && !item}
    <p class="lbl">Naglo-load…</p>
  {:else if step === 1}
    {#if !item && !newName}
      <ItemPicker onPick={pick} />
    {:else if !item}
      <h2>Bagong item: "{newName}"</h2>
      <p class="lbl">Anong klase?</p><FormPicker bind:value={newForm} />
      <p class="lbl">Kategorya?</p><CategoryPicker bind:value={newCategory} />
      <div class="actions">
        <AppButton onclick={confirmNewItem} disabled={!newForm || !newCategory}>Gumawa</AppButton>
        <button class="link" onclick={() => { newName = ''; newForm = null; newCategory = null; }}>Kanselahin</button>
      </div>
    {/if}
    
  {:else if step === 2 && item}
    <h3>{item.canonicalName}</h3>
    <p class="lbl">Dami</p>
    <QtyField form={item.form} bind:value={qty} />
    <div class="chips">
      {#each units as u}<button class="chip" class:on={unit === u} onclick={() => (unit = u)}>{u}</button>{/each}
    </div>

    {#if !existing}
      <p class="lbl">Saang tindahan?</p>
      {#if pickingMarket}
        <MarketPicker onPick={pickMarket} />
      {:else}
        <button class="market" onclick={() => (pickingMarket = true)}>{marketName ?? 'Pumili ng tindahan'} ▾</button>
      {/if}
    {/if}

    <details class="more-options">
      <summary>Higit pang opsyon</summary>
      <p class="lbl">Uri (opsyonal) — hal. "3-pack", "225ml"</p>
      <input class="variant" bind:value={variant} placeholder="walang laman = ordinaryo" />
    </details>

    <div class="actions">
      <button class="link" onclick={prevStep}>Bumalik</button>
      <AppButton onclick={nextStep}>Susunod</AppButton>
    </div>

  {:else if step === 3 && item}
    <h3>{item.canonicalName} · {qty} {unit}</h3>
    <p class="lbl">Presyo (kabuuan)</p>
    <QuickAdjust bind:value={price} baseSteps={[25, 50, 100]} kind="price" min={0} ontouch={() => (priceTouched = true)} />
    {#if ppu != null}<p class="readout">= ₱{Math.round(ppu).toLocaleString('en-PH')} / {baseUnitLabel(baseUnit)}</p>{/if}

    <details class="more-options">
      <summary>Higit pang opsyon</summary>
      <p class="lbl">Uri (opsyonal) — hal. "3-pack", "225ml"</p>
      <input class="variant" bind:value={variant} placeholder="walang laman = ordinaryo" />
    </details>

    <div class="actions">
      <button class="link" onclick={prevStep}>Bumalik</button>
      <AppButton onclick={save}>I-save ang item</AppButton>
    </div>
  {/if}
</div>
```

- [ ] **Step 4: Update the `pick` function to reset step**

Modify the existing `pick` function:

```typescript
async function pick(r: Item | { isNew: true; name: string }) {
  if ('isNew' in r) { newName = r.name; return; }
  item = r; unit = r.defaultUnit; variant = r.lastVariant ?? '';
  priceTouched = false; price = null;
  const ctx = await lastContextFor(db, uid, r.id, marketId, variant || null);
  lastPpu = ctx?.pricePerBaseUnit ?? null;
  step = 2; // advance to quantity step
}
```

- [ ] **Step 5: Update `confirmNewItem` to advance to step 2**

Modify the existing function:

```typescript
async function confirmNewItem() {
  if (!newName.trim() || !newForm || !newCategory) return;
  const created = await createItem(db, uid, {
    canonicalName: newName.trim(), category: newCategory, form: newForm, defaultUnit: unitsFor(newForm)[0],
  });
  item = created; unit = created.defaultUnit; newName = '';
  lastPpu = null; priceTouched = false; price = null;
  step = 2; // advance to quantity step
}
```

- [ ] **Step 6: Add CSS for the modal-like appearance and actions**

Add to the `<style>` block:

```css
.actions { display: flex; gap: 8px; margin-top: 16px; }
.actions .link { flex: 1; text-align: center; }
h3 { font-size: 18px; margin: 8px 0 12px; }
.more-options { margin: 12px 0; padding: 12px; border: 1px solid var(--c-surface); border-radius: var(--radius); }
.more-options summary { cursor: pointer; font-weight: 700; user-select: none; }
.more-options summary:hover { color: var(--c-accent); }
```

- [ ] **Step 7: Commit**

```bash
git add src/routes/AddItem.svelte
git commit -m "feat: AddItem step-by-step modal flow with variant in more-options"
```

---

## Task 3: Items Page Price Capture

**Files:**
- Modify: `src/routes/Items.svelte:27-39` (create function) and add price field to form

**Summary:** Add a price input field to the new item creation form, pass it to `createItem`, and handle optional price.

- [ ] **Step 1: Add price state to the Items page script**

After line 24 (after `newCategory` declaration), add:

```typescript
let newPrice = $state<number | null>(null);
```

- [ ] **Step 2: Update the `create` function to accept and pass price**

Replace the existing `create` function (lines 27-39):

```typescript
async function create() {
  if (!canCreate) return;
  await createItem(db, session.uid!, {
    canonicalName: newName.trim(),
    category: newCategory!,
    form: newForm!,
    defaultUnit: unitsFor(newForm!)[0],
    lastPricePerBaseUnit: newPrice ?? null,
  });
  newName = '';
  newForm = null;
  newCategory = null;
  newPrice = null;
  creating = false;
}
```

- [ ] **Step 3: Add price input field to the create panel**

In the template, after the CategoryPicker (around line 84), add:

```svelte
      <div class="lbl">Presyo ng 1 {#if newForm}{baseUnitLabel(baseUnitFor(newForm))}{:else}item{/if} (opsyonal)</div>
      <input class="price-input" type="number" bind:value={newPrice} placeholder="walang presyo" step="0.01" min="0" />
```

You'll need to import `baseUnitFor` at the top:

```typescript
import { baseUnitLabel, baseUnitFor, unitsFor } from '../lib/domain/units';
```

- [ ] **Step 4: Add CSS for the price input**

Add to the `<style>` block:

```css
.price-input { font-size: var(--fs-body); padding: 10px; min-height: 44px;
  border: 2px solid var(--c-surface); border-radius: var(--radius); background: var(--c-bg); color: var(--c-ink); }
```

- [ ] **Step 5: Update the type definition for `createItem` if needed**

Check `src/lib/data/items.ts` to ensure `createItem` accepts `lastPricePerBaseUnit` in its input. If not already present, add it as an optional field:

```typescript
export async function createItem(db: Firestore, uid: string, data: {
  canonicalName: string;
  category: Category;
  form: Form;
  defaultUnit: Unit;
  lastPricePerBaseUnit?: number | null;
}) {
  // ... existing implementation, set lastPricePerBaseUnit if provided
}
```

- [ ] **Step 6: Commit**

```bash
git add src/routes/Items.svelte
git commit -m "feat: Items page price capture for new items"
```

---

## Task 4: Manual Testing & Integration

**Files:**
- No files created; testing only

**Summary:** Test the full flow end-to-end to ensure all three changes work together.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Navigate to the app in your browser.

- [ ] **Step 2: Test Trip page header**

1. Create or open an existing draft trip (go to Biyahe, tap a draft or create one)
2. Verify the "Tapos — i-save ang biyahe" button appears at the top, below the market chip
3. Verify the three-dot menu appears in the header
4. Tap the three-dot menu → verify "Burahin ang biyahe" appears
5. Close the menu (tap elsewhere) → menu should close
6. Verify the old red trash button at the bottom is gone

- [ ] **Step 3: Test add-item modal flow**

1. On a trip, tap "＋ Magdagdag ng item"
2. Verify ItemPicker appears (with tiles and search)
3. Pick an existing item
4. Verify screen advances to Step 2 (Dami section with QtyField and unit chips)
5. Verify market chip shows trip's default market
6. Tap the market chip → verify MarketPicker appears inline
7. Change to a different market, confirm selection
8. Verify "Higit pang opsyon" expander is collapsed
9. Tap "Higit pang opsyon" → verify variant input appears
10. Enter a variant value (e.g., "3-pack"), close expander
11. Tap "Susunod" → advance to Step 3
12. Verify Step 3 shows "Presyo" section with QuickAdjust
13. Verify per-base-unit readout appears (e.g., "= ₱8 / piraso")
14. Change price, verify readout updates
15. Verify "Higit pang opsyon" still shows the variant you entered in Step 2
16. Tap "I-save ang item" → item appears in the trip list under its market
17. Modal closes, trip overview is visible

- [ ] **Step 4: Test "Bumalik" navigation**

1. Add an item again, get to Step 2 (Dami)
2. Tap "Bumalik" → return to Step 1 (ItemPicker)
3. Advance again to Step 2, then to Step 3 (Presyo)
4. Tap "Bumalik" → return to Step 2
5. Tap "Bumalik" again → return to Step 1

- [ ] **Step 5: Test new item creation in the modal**

1. In the add-item flow, search for a non-existent item (e.g., "Walang Kuwento")
2. "Bagong item: Walang Kuwento" button appears
3. Tap it
4. Verify inline Form + Category pickers appear
5. Select a form and category
6. Tap "Gumawa"
7. Verify item is created and you advance to Step 2 (Dami)
8. Complete the flow as in Step 3 above

- [ ] **Step 6: Test Items page price capture**

1. Navigate to Mga item (Items page)
2. Tap "+ Bagong item" (or verify it's visible if not already in create mode)
3. Fill in Pangalan, select Anyo (e.g., bilang), select Kategorya
4. Verify a new "Presyo ng 1 {baseUnitLabel} (opsyonal)" field appears
5. Enter a price (e.g., 15)
6. Tap "Gumawa"
7. Item appears in the list
8. Go to a trip and add this new item
9. Verify the price from Step 3 (Presyo) is prefilled with the price you set in Items page

- [ ] **Step 7: Test modal dismiss**

1. In a trip, tap "＋ Magdagdag ng item"
2. ItemPicker appears
3. Tap outside the modal (on the dimmed area) → modal should close (if you implemented dismiss-on-click-outside; otherwise test via Bumalik chain)
4. Trip overview should be visible

- [ ] **Step 8: Commit test results**

```bash
git add -A
git commit -m "test: manual testing of modal flow, header, and price capture complete"
```

---

## Notes

- **State management:** AddItem's `step` state is local to the component; no global state needed.
- **Modal backdrop:** The Trip.svelte modal backdrop (dimmed overlay) is CSS-based; the actual modal content is the AddItem component shown inline when `mode === 'add'`.
- **Market picker in Step 2:** Market picker is only shown in edit mode (when `existing` is set); in add mode, the trip's default market is used, and the chip shows it. The user can still tap to change it inline.
- **Price is optional:** If a user creates an item in Items page without setting a price, `lastPricePerBaseUnit` is `null`, and the next time they add it to a trip, price won't prefill (but they can still enter it in Step 3).
