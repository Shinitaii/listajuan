<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { session } from '../lib/state/session.svelte';
  import { draft, resumeTrip, addToDraft, commitDraft } from '../lib/state/draft.svelte';
  import { createItem } from '../lib/data/items';
  import { db } from '../lib/data/firebase';
  import ItemPicker from './ItemPicker.svelte';
  import Stepper from '../lib/ui/Stepper.svelte';
  import AppButton from '../lib/ui/AppButton.svelte';
  import { X } from 'lucide-svelte';
  import type { Item, Unit } from '../lib/domain/types';

  let { params } = $props<{ params: { tripId: string } }>();
  const uid = session.uid!;

  // True once we've committed and are navigating away. Stops the resume effect
  // from re-firing after commitDraft nulls the draft (which would otherwise
  // re-open the just-saved trip and attempt a second commit).
  let leaving = $state(false);

  // Ensure the draft store points at this trip (e.g. on resume/deeplink).
  $effect(() => {
    if (leaving) return;
    if (draft.trip?.id !== params.tripId) {
      resumeTrip(uid, params.tripId).then((ok) => {
        if (!ok && !leaving) push('/'); // missing or already-saved trip → bail home
      });
    }
  });

  let step = $state<1 | 2 | 3>(1);
  let picked = $state<Item | null>(null);
  let pickedLabel = $state('');
  let qty = $state(1);
  let unit = $state<Unit>('kg');
  let price = $state<number | null>(null);
  const units: Unit[] = ['kg', 'g', 'pcs', 'pack', 'dosena', 'ml'];
  const peso = (n: number) => '₱' + Math.round(n);

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
    // reset for the next item
    picked = null; pickedLabel = ''; qty = 1; price = null; step = 1;
  }

  async function finish() {
    leaving = true;
    const id = await commitDraft(uid);
    push(`/trip/${id}`);
  }
</script>

<section class="flow">
  <header>
    <button class="x" onclick={finish} aria-label="Tapos"><X size={24} /></button>
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

<style>
  .flow { display: flex; flex-direction: column; min-height: 100vh; padding: var(--sp-screen); }
  header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .x { background: none; border: none; }
  .steps { display: flex; gap: 6px; }
  .steps span { font-size: 12px; color: var(--c-ink-soft); }
  .steps .on { color: var(--c-accent); font-weight: 700; }
  .total { font-size: var(--fs-price); font-weight: 800; }
  h1 { font-size: 26px; margin: 18px 0; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 18px; }
  .chip { border: 2px solid var(--c-ink); border-radius: 999px; padding: 8px 14px; background: var(--c-bg); }
  .chip.on { background: var(--c-accent); color: #fff; border-color: var(--c-accent); }
  .price { font-size: var(--fs-hero); text-align: center; width: 100%; border: none;
    border-bottom: 3px solid var(--c-ink); outline: none; }
  .spacer { flex: 1; }
</style>
