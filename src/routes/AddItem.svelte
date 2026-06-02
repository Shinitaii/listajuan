<script lang="ts">
  import { session } from '../lib/state/session.svelte';
  import { db } from '../lib/data/firebase';
  import { createItem } from '../lib/data/items';
  import { lastContextFor, type NewTripItemInput } from '../lib/data/trips';
  import { unitsFor, baseUnitFor, baseUnitLabel, pricePerBaseUnit, unitFactor } from '../lib/domain/units';
  import ItemPicker from './ItemPicker.svelte';
  import FormPicker from '../lib/ui/FormPicker.svelte';
  import CategoryPicker from '../lib/ui/CategoryPicker.svelte';
  import MarketPicker from '../lib/ui/MarketPicker.svelte';
  import QtyField from '../lib/ui/QtyField.svelte';
  import AppButton from '../lib/ui/AppButton.svelte';
  import type { Item, Unit, Form, Category, Market } from '../lib/domain/types';

  let { defaultMarketId = null, defaultMarketName = null, onSave } =
    $props<{ defaultMarketId?: string | null; defaultMarketName?: string | null; onSave: (i: NewTripItemInput) => void }>();
  const uid = session.uid!;

  let item = $state<Item | null>(null);
  // new-item creation
  let newName = $state('');
  let newForm = $state<Form | null>(null);
  let newCategory = $state<Category | null>(null);

  let marketId = $state<string | null>(defaultMarketId);
  let marketName = $state<string | null>(defaultMarketName);
  let pickingMarket = $state(false);
  let qty = $state(1);
  let unit = $state<Unit>('piraso');
  let variant = $state('');
  let price = $state<number | null>(null);
  // Historical per-base-unit for the picked stream + whether the user typed a price.
  // The prefilled total tracks qty/unit (so it stays consistent with the readout)
  // until the user edits the price field, after which we leave it alone.
  let lastPpu = $state<number | null>(null);
  let priceTouched = $state(false);

  const units = $derived(item ? unitsFor(item.form) : []);
  const baseUnit = $derived(item ? baseUnitFor(item.form) : 'piece');
  const ppu = $derived(pricePerBaseUnit(price, qty, unit));

  // Keep the prefilled total proportional to qty/unit until the user overrides it.
  $effect(() => {
    if (lastPpu != null && !priceTouched && qty != null) {
      price = Math.round(lastPpu * qty * unitFactor(unit));
    }
  });

  async function pick(r: Item | { isNew: true; name: string }) {
    if ('isNew' in r) { newName = r.name; return; } // show the form/category pickers
    item = r; unit = r.defaultUnit; variant = r.lastVariant ?? '';
    priceTouched = false; price = null;
    const ctx = await lastContextFor(db, uid, r.id, marketId, variant || null);
    lastPpu = ctx?.pricePerBaseUnit ?? null; // the $effect seeds the estimate
  }

  async function confirmNewItem() {
    if (!newName.trim() || !newForm || !newCategory) return;
    const created = await createItem(db, uid, {
      canonicalName: newName.trim(), category: newCategory, form: newForm, defaultUnit: unitsFor(newForm)[0],
    });
    item = created; unit = created.defaultUnit; newName = '';
    lastPpu = null; priceTouched = false; price = null; // brand-new item: no history to prefill
  }

  function pickMarket(m: Market) { marketId = m.id; marketName = m.name; pickingMarket = false; }

  function save() {
    if (!item) return;
    onSave({
      itemId: item.id, label: item.canonicalName, quantity: qty, unit, pricePaid: price,
      marketId, marketName, variant: variant.trim() || null, category: item.category,
    });
  }
</script>

<div class="add">
  {#if !item && !newName}
    <ItemPicker onPick={pick} />
  {:else if !item}
    <h2>Bagong item: "{newName}"</h2>
    <p class="lbl">Anong klase?</p><FormPicker bind:value={newForm} />
    <p class="lbl">Kategorya?</p><CategoryPicker bind:value={newCategory} />
    <AppButton onclick={confirmNewItem} disabled={!newForm || !newCategory}>Gumawa</AppButton>
  {:else}
    <h2>{item.canonicalName}</h2>

    <p class="lbl">Saang tindahan?</p>
    {#if pickingMarket}
      <MarketPicker onPick={pickMarket} />
    {:else}
      <button class="market" onclick={() => (pickingMarket = true)}>{marketName ?? 'Pumili ng tindahan'} ▾</button>
    {/if}

    <p class="lbl">Dami</p>
    <QtyField form={item.form} bind:value={qty} />
    <div class="chips">
      {#each units as u}<button class="chip" class:on={unit === u} onclick={() => (unit = u)}>{u}</button>{/each}
    </div>

    <p class="lbl">Uri (opsyonal) — hal. "3-pack", "225ml"</p>
    <input class="variant" bind:value={variant} placeholder="walang laman = ordinaryo" />

    <p class="lbl">Presyo (kabuuan)</p>
    <input class="price" type="number" inputmode="decimal" bind:value={price} oninput={() => (priceTouched = true)} placeholder="₱" />
    {#if ppu != null}<p class="readout">= ₱{Math.round(ppu).toLocaleString('en-PH')} / {baseUnitLabel(baseUnit)}</p>{/if}

    <AppButton onclick={save}>I-save ang item</AppButton>
  {/if}
</div>

<style>
  .add { display: flex; flex-direction: column; gap: 8px; }
  h2 { font-size: 22px; margin: 4px 0; }
  .lbl { color: var(--c-ink-soft); font-size: var(--fs-label); margin: 12px 0 2px; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .chip { border: 2px solid var(--c-ink); border-radius: 999px; padding: 8px 14px; background: var(--c-bg); }
  .chip.on { background: var(--c-accent); color: #fff; border-color: var(--c-accent); }
  .market { text-align: left; border: 2px solid var(--c-ink); border-radius: var(--radius); padding: 12px; background: var(--c-bg); font-weight: 700; }
  .variant { border: 2px solid var(--c-ink); border-radius: var(--radius); padding: 10px; font-size: var(--fs-body); }
  .price { font-size: var(--fs-hero); text-align: center; border: none; border-bottom: 3px solid var(--c-ink); outline: none; }
  .readout { font-size: var(--fs-price); font-weight: 700; color: var(--c-accent); text-align: center; }
</style>
