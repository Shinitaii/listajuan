<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { session } from '../lib/state/session.svelte';
  import { draft, resumeTrip, addToDraft, removeDraftItem, commitDraft } from '../lib/state/draft.svelte';
  import { createItem } from '../lib/data/items';
  import { db } from '../lib/data/firebase';
  import ItemPicker from './ItemPicker.svelte';
  import Stepper from '../lib/ui/Stepper.svelte';
  import AppButton from '../lib/ui/AppButton.svelte';
  import { ChevronLeft, X, Trash2 } from 'lucide-svelte';
  import type { Item, Unit, TripItem } from '../lib/domain/types';

  let { params } = $props<{ params: { tripId: string } }>();
  const uid = session.uid!;

  // True once we've committed and are navigating away — stops the resume effect
  // from re-firing after commitDraft nulls the draft.
  let leaving = $state(false);

  // 'overview' = the trip so far (list + total + finish); 'adding' = the item stepper.
  let mode = $state<'overview' | 'adding'>('overview');
  let bootstrapped = $state(false);

  $effect(() => {
    if (leaving) return;
    if (draft.trip?.id !== params.tripId) {
      resumeTrip(uid, params.tripId).then((ok) => {
        if (!ok && !leaving) { push('/'); return; }
        // brand-new empty trip → jump straight to adding the first item
        if (!bootstrapped) {
          bootstrapped = true;
          mode = draft.items.length === 0 ? 'adding' : 'overview';
        }
      });
    } else if (!bootstrapped) {
      bootstrapped = true;
      mode = draft.items.length === 0 ? 'adding' : 'overview';
    }
  });

  let step = $state<1 | 2 | 3>(1);
  let picked = $state<Item | null>(null);
  let pickedLabel = $state('');
  let qty = $state(1);
  let unit = $state<Unit>('kg');
  let price = $state<number | null>(null);
  const units: Unit[] = ['kg', 'g', 'pcs', 'pack', 'dosena', 'ml'];
  const peso = (n: number | null) => (n == null ? '—' : '₱' + Math.round(n).toLocaleString('en-PH'));

  function resetItemEntry() {
    picked = null; pickedLabel = ''; qty = 1; unit = 'kg'; price = null; step = 1;
  }

  function startAdding() { resetItemEntry(); mode = 'adding'; }

  function cancelAdding() { resetItemEntry(); mode = 'overview'; }

  async function onPick(r: Item | { isNew: true; name: string }) {
    if ('isNew' in r) {
      const created = await createItem(db, uid, { canonicalName: r.name, category: 'iba_pa', defaultUnit: 'pcs' });
      picked = created; pickedLabel = created.canonicalName; unit = created.defaultUnit;
    } else {
      picked = r; pickedLabel = r.canonicalName; unit = r.defaultUnit;
      if (r.lastPrice != null) price = r.lastPrice;
    }
    step = 2;
  }

  async function saveItem() {
    await addToDraft(uid, {
      itemId: picked!.id, label: pickedLabel, quantity: qty, unit, pricePaid: price, vendor: null,
      category: picked!.category,
    });
    resetItemEntry();
    mode = 'overview'; // return to the trip so she sees the item she just added
  }

  async function removeItem(ti: TripItem) {
    await removeDraftItem(uid, ti.id);
  }

  function leaveAsDraft() {
    // The trip is already persisted as a draft; just exit. Resume later from Home/Biyahe.
    leaving = true;
    push('/');
  }

  async function finish() {
    leaving = true;
    const id = await commitDraft(uid);
    push(`/trip/${id}`);
  }
</script>

{#if mode === 'overview'}
  <section class="screen">
    <header>
      <button class="icon" onclick={leaveAsDraft} aria-label="Bumalik"><ChevronLeft size={26} /></button>
      <div class="h">{draft.trip?.name ?? 'Biyahe'}</div>
      <div class="sp"></div>
    </header>

    {#if draft.items.length === 0}
      <p class="empty">Wala pang item. Magdagdag para magsimula.</p>
    {:else}
      <div class="list">
        {#each draft.items as ti (ti.id)}
          <div class="row">
            <div class="grow">
              <div class="name">{ti.label}</div>
              <div class="sub">{ti.quantity ?? '?'} {ti.unit} × {peso(ti.pricePaid)}</div>
            </div>
            <div class="price">{peso(ti.pricePaid)}</div>
            <button class="trash" onclick={() => removeItem(ti)} aria-label="Tanggalin"><Trash2 size={18} /></button>
          </div>
        {/each}
      </div>

      <div class="totalband">
        <span>Kabuuan</span><span class="total">{peso(draft.total)}</span>
      </div>
    {/if}

    <div class="spacer"></div>

    <button class="addrow" onclick={startAdding}>＋ Magdagdag ng item</button>
    <AppButton onclick={finish} disabled={draft.items.length === 0}>Tapos — i-save ang biyahe</AppButton>
  </section>
{:else}
  <section class="flow">
    <header>
      <button class="icon" onclick={cancelAdding} aria-label="Kanselahin"><X size={24} /></button>
      <div class="steps">
        <span class:on={step === 1}>1 Item</span>
        <span class:on={step === 2}>2 Dami</span>
        <span class:on={step === 3}>3 Presyo</span>
      </div>
      <div class="total">{peso(draft.total)}</div>
    </header>

    {#if step === 1}
      <h1>Anong idadagdag?</h1>
      <ItemPicker {onPick} />
    {:else if step === 2}
      <h1>Ilang <u>{pickedLabel}</u>?</h1>
      <Stepper bind:value={qty} />
      <div class="chips">
        {#each units as u}
          <button class="chip" class:on={unit === u} onclick={() => (unit = u)}>{u}</button>
        {/each}
      </div>
      <div class="spacer"></div>
      <AppButton onclick={() => (step = 3)}>Susunod ›</AppButton>
    {:else}
      <h1>Magkano ang {pickedLabel}?</h1>
      <input class="price" type="number" inputmode="decimal" placeholder="₱" bind:value={price} />
      <div class="spacer"></div>
      <AppButton onclick={saveItem}>I-save ang item</AppButton>
    {/if}
  </section>
{/if}

<style>
  .screen, .flow { display: flex; flex-direction: column; min-height: 100vh; padding: var(--sp-screen); padding-bottom: 24px; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .icon { background: none; border: none; padding: 4px; }
  .h { font-weight: 700; font-size: 18px; }
  .sp { width: 34px; }
  .steps { display: flex; gap: 6px; }
  .steps span { font-size: 12px; color: var(--c-ink-soft); }
  .steps .on { color: var(--c-accent); font-weight: 700; }
  .total { font-size: var(--fs-price); font-weight: 800; }
  h1 { font-size: 26px; margin: 18px 0; }
  .empty { color: var(--c-ink-soft); margin: 24px 0; }
  .list { margin-top: 12px; }
  .row { display: flex; align-items: center; gap: 8px; padding: 11px 0; border-bottom: 1px solid var(--c-surface); }
  .grow { flex: 1; }
  .name { font-weight: 700; }
  .sub { color: var(--c-ink-soft); font-size: 13px; }
  .price { font-size: var(--fs-price); font-weight: 700; }
  .trash { background: none; border: none; color: var(--c-danger); padding: 4px; }
  .totalband { display: flex; justify-content: space-between; align-items: center; margin-top: 14px;
    padding: 10px 12px; background: var(--c-emphasis); border-radius: var(--radius); font-weight: 700; }
  .totalband .total { font-size: var(--fs-price); }
  .addrow { width: 100%; padding: 14px; margin-bottom: 10px; border: 2px dashed var(--c-ink);
    border-radius: var(--radius); background: var(--c-bg); font-weight: 700; font-size: var(--fs-body); }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 18px; }
  .chip { border: 2px solid var(--c-ink); border-radius: 999px; padding: 8px 14px; background: var(--c-bg); }
  .chip.on { background: var(--c-accent); color: #fff; border-color: var(--c-accent); }
  input.price { font-size: var(--fs-hero); text-align: center; width: 100%; border: none;
    border-bottom: 3px solid var(--c-ink); outline: none; }
  .spacer { flex: 1; }
</style>
