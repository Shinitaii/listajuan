<script lang="ts">
  import { session } from '../lib/state/session.svelte';
  import { db } from '../lib/data/firebase';
  import { createItem, getItem, findItemByBarcode, attachBarcode } from '../lib/data/items';
  import { lookupProductName } from '../lib/scan/lookup';
  import { resolveScannedCode } from '../lib/scan/resolveScan';
  import { isScanAvailable, scanBarcode } from '../lib/scan/capture';
  import { isVoiceAvailable, captureTranscript } from '../lib/voice/capture';
  import { parseVoiceInput } from '../lib/voice/parse';
  import { getDialect, setDialect, DIALECT_OPTIONS } from '../lib/voice/lang';
  import { searchLibrary } from '../lib/state/library.svelte';
  import { ScanBarcode, Mic } from 'lucide-svelte';
  import { lastContextFor, type NewTripItemInput } from '../lib/data/trips';
  import { unitsFor, baseUnitFor, baseUnitLabel, pricePerBaseUnit, unitFactor, formForUnit } from '../lib/domain/units';
  import ItemPicker from './ItemPicker.svelte';
  import FormPicker from '../lib/ui/FormPicker.svelte';
  import CategoryPicker from '../lib/ui/CategoryPicker.svelte';
  import MarketPicker from '../lib/ui/MarketPicker.svelte';
  import QtyField from '../lib/ui/QtyField.svelte';
  import QuickAdjust from '../lib/ui/QuickAdjust.svelte';
  import AppButton from '../lib/ui/AppButton.svelte';
  import type { Item, Unit, Form, Category, Market, TripItem } from '../lib/domain/types';

  let { defaultMarketId = null, defaultMarketName = null, existing = null, onMarketChange, onSave } =
    $props<{
      defaultMarketId?: string | null;
      defaultMarketName?: string | null;
      existing?: TripItem | null;
      onMarketChange?: (id: string | null, name: string | null) => void;
      onSave: (i: NewTripItemInput) => void;
    }>();
  const listId = session.listId!;

  let item = $state<Item | null>(null);
  // new-item creation
  let newName = $state('');
  let newForm = $state<Form | null>(null);
  let newCategory = $state<Category | null>(null);
  // barcode scan: availability (native only) + the code awaiting attachment to the chosen item
  let scanAvailable = $state(false);
  let voiceAvailable = $state(false);
  let voiceLang = $state(getDialect());
  let pendingScanCode = $state<string | null>(null);
  isScanAvailable().then((v) => (scanAvailable = v));
  isVoiceAvailable().then((v) => (voiceAvailable = v));

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

  // Edit mode: load the fixed item + seed fields from `existing` once.
  let initialized = $state(false);
  $effect(() => {
    if (existing && !initialized) {
      initialized = true;
      marketId = existing.marketId;
      marketName = existing.marketName;
      qty = existing.quantity ?? 1;
      unit = existing.unit;
      variant = existing.variant ?? '';
      price = existing.pricePaid;
      priceTouched = true; // don't auto-prefill over the existing price
      // Edit mode needs the item only for its form/name. If the library item was
      // deleted, synthesize a fallback from the line itself so the editor never hangs.
      getItem(db, listId, existing.itemId).then((i) => {
        item = i ?? {
          id: existing!.itemId, canonicalName: existing!.label, nameLower: existing!.label.toLowerCase(),
          aliases: [], barcodes: [], category: existing!.category, form: formForUnit(existing!.unit),
          defaultUnit: existing!.unit, lastPricePerBaseUnit: null, lastUnit: null, lastBaseUnit: null,
          lastPriceDate: null, lastMarketId: null, lastMarketName: null, lastVariant: null, purchaseCount: 0,
        };
      });
    }
  });

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
    // A manual-resolved scan teaches the library: attach the code to the chosen item.
    if (pendingScanCode && !(r.barcodes ?? []).includes(pendingScanCode)) {
      await attachBarcode(db, listId, r.id, pendingScanCode);
    }
    pendingScanCode = null;
    const ctx = await lastContextFor(db, listId, r.id, marketId, variant || null);
    lastPpu = ctx?.pricePerBaseUnit ?? null; // the $effect seeds the estimate
  }

  // Scan → library-first match, else cold-start suggestion, else manual (code preserved).
  async function onScan() {
    const code = await scanBarcode();
    if (!code) return;
    const outcome = await resolveScannedCode(code, {
      findItemByBarcode: (c) => findItemByBarcode(db, listId, c),
      lookupProductName: (c) => lookupProductName(c),
      isOnline: () => navigator.onLine,
    });
    if (!outcome) return;
    if (outcome.kind === 'library') {
      await pick(outcome.item);
    } else {
      pendingScanCode = outcome.code; // attached when the user picks/creates the item
      if (outcome.kind === 'suggested') newName = outcome.name; // drops into the new-item form
    }
  }

  async function onVoice() {
    const transcript = await captureTranscript(voiceLang);
    if (!transcript) return;
    const result = parseVoiceInput(transcript, { searchLibrary });
    if (result.matchedItem) {
      await pick(result.matchedItem);
    } else if (result.itemName) {
      newName = result.itemName;
    }
    if (result.qty != null) qty = result.qty;
    if (result.unit != null) unit = result.unit;
    if (result.price != null) { price = result.price; priceTouched = true; }
  }

  async function confirmNewItem() {
    if (!newName.trim() || !newForm || !newCategory) return;
    const created = await createItem(db, listId, {
      canonicalName: newName.trim(), category: newCategory, form: newForm, defaultUnit: unitsFor(newForm)[0],
    });
    if (pendingScanCode) { await attachBarcode(db, listId, created.id, pendingScanCode); pendingScanCode = null; }
    item = created; unit = created.defaultUnit; newName = '';
    lastPpu = null; priceTouched = false; price = null; // brand-new item: no history to prefill
  }

  function pickMarket(m: Market) {
    marketId = m.id; marketName = m.name; pickingMarket = false;
    if (!existing) onMarketChange?.(m.id, m.name); // sticky trip-default only when adding, not editing a line
  }

  function save() {
    if (!item) return;
    onSave({
      itemId: item.id, label: item.canonicalName, quantity: qty, unit, pricePaid: price,
      marketId, marketName, variant: variant.trim() || null, category: item.category,
    });
  }
</script>

<div class="add">
  {#if existing && !item}
    <p class="lbl">Naglo-load…</p>
  {:else if !item && !newName}
    <div class="capture-row">
      {#if scanAvailable}
        <button class="scan" onclick={onScan}><ScanBarcode size={20} /> I-scan</button>
      {/if}
      {#if voiceAvailable}
        <div class="dialect-row">
          <label class="lbl" for="dialect-select">Wika</label>
          <select
            id="dialect-select"
            class="dialect-select"
            value={voiceLang}
            onchange={(e) => { voiceLang = e.currentTarget.value; setDialect(voiceLang); }}
          >
            {#each DIALECT_OPTIONS as opt}
              <option value={opt.lang}>{opt.label}</option>
            {/each}
          </select>
        </div>
        <button class="scan" onclick={onVoice}><Mic size={20} /> Magsalita</button>
      {/if}
    </div>
    <ItemPicker onPick={pick} />
  {:else if !item}
    <h2>Bagong item: "{newName}"</h2>
    <p class="lbl">Anong klase?</p><FormPicker bind:value={newForm} />
    <p class="lbl">Kategorya?</p><CategoryPicker bind:value={newCategory} />
    <AppButton onclick={confirmNewItem} disabled={!newForm || !newCategory}>Gumawa</AppButton>
  {:else}
    <h2>{item.canonicalName}</h2>

    {#if existing}
      <p class="lbl">Saang tindahan?</p>
      {#if pickingMarket}
        <MarketPicker onPick={pickMarket} />
      {:else}
        <button class="market" onclick={() => (pickingMarket = true)}>{marketName ?? 'Pumili ng tindahan'} ▾</button>
      {/if}
    {/if}

    <p class="lbl">Dami</p>
    <QtyField form={item.form} bind:value={qty} />
    <div class="chips">
      {#each units as u}<button class="chip" class:on={unit === u} onclick={() => (unit = u)}>{u}</button>{/each}
    </div>

    <p class="lbl">Uri (opsyonal) — hal. "3-pack", "225ml"</p>
    <input class="variant" bind:value={variant} placeholder="walang laman = ordinaryo" />

    <p class="lbl">Presyo (kabuuan)</p>
    <QuickAdjust bind:value={price} baseSteps={[25, 50, 100]} kind="price" min={0} ontouch={() => (priceTouched = true)} />
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
  .readout { font-size: var(--fs-price); font-weight: 700; color: var(--c-accent); text-align: center; }
  .capture-row { display: flex; gap: 8px; }
  .capture-row .scan { flex: 1; }
  .scan { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px;
    border: 2px solid var(--c-accent); color: var(--c-accent); border-radius: var(--radius);
    padding: 10px; background: var(--c-bg); font-weight: 700; font-size: var(--fs-body); }
  .dialect-row { display: flex; flex-direction: column; gap: 2px; }
  .dialect-select { min-height: 44px; border: 2px solid var(--c-ink); border-radius: var(--radius); padding: 8px 12px; font-size: var(--fs-body); background: var(--c-bg); }
</style>
