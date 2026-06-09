<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { session } from '../lib/state/session.svelte';
  import { db } from '../lib/data/firebase';
  import { getTrip, subscribeTripItems, addTripItem, updateTripItem, removeTripItem, deleteTrip, saveTrip, setTripMarket, groupByMarket, toggleCartItem, type NewTripItemInput } from '../lib/data/trips';
  import { tripTotal } from '../lib/domain/calc';
  import { baseUnitLabel } from '../lib/domain/units';
  import AddItem from './AddItem.svelte';
  import MarketPicker from '../lib/ui/MarketPicker.svelte';
  import IconButton from '../lib/ui/IconButton.svelte';
  import ConfirmDialog from '../lib/ui/ConfirmDialog.svelte';
  import { Pencil, Trash2, ChevronLeft } from 'lucide-svelte';
  import type { Trip, TripItem } from '../lib/domain/types';

  let { params } = $props<{ params: { tripId: string } }>();
  const listId = session.listId!;
  const tripId = $derived(params.tripId);

  let trip = $state<Trip | null>(null);
  let items = $state<TripItem[]>([]);
  let mode = $state<'view' | 'add' | 'edit'>('view');
  let editing = $state<TripItem | null>(null);
  let confirmDelete = $state(false);
  let pickingMarket = $state(false);

  $effect(() => {
    getTrip(db, listId, tripId).then((t) => { trip = t; });
    const unsub = subscribeTripItems(db, listId, tripId, (i) => { items = i; });
    return () => unsub();
  });

  const total = $derived(tripTotal(items));
  const groups = $derived(groupByMarket(items));
  const peso = (n: number | null) => (n == null ? '—' : '₱' + Math.round(n).toLocaleString('en-PH'));

  const RECENTLY_ADDED_MS = 5 * 60 * 1000;
  const pending       = $derived(items.filter(i => !i.inCart));
  const inCartItems   = $derived(items.filter(i =>  i.inCart));
  const pendingGroups = $derived(groupByMarket(pending));
  const isNew = (ti: TripItem) => Date.now() - ti.addedAt < RECENTLY_ADDED_MS;

  async function onAdd(input: NewTripItemInput) { await addTripItem(db, listId, tripId, input); mode = 'view'; }
  async function onEditSave(input: NewTripItemInput) {
    if (editing) await updateTripItem(db, listId, tripId, editing.id, { quantity: input.quantity, pricePaid: input.pricePaid, unit: input.unit, variant: input.variant, marketId: input.marketId, marketName: input.marketName });
    editing = null; mode = 'view';
  }
  function onMarketChange(id: string | null, name: string | null) { setTripMarket(db, listId, tripId, id, name); }
  async function pickTripMarket(m: { id: string; name: string }) {
    await setTripMarket(db, listId, tripId, m.id, m.name);
    if (trip) trip = { ...trip, defaultMarketId: m.id, defaultMarketName: m.name };
    pickingMarket = false;
  }
  async function remove(ti: TripItem) { await removeTripItem(db, listId, tripId, ti.id); }
  function startEdit(ti: TripItem) { editing = ti; mode = 'edit'; }
  async function finish() { await saveTrip(db, listId, tripId); push('/'); }
  async function onToggleCart(ti: TripItem) { await toggleCartItem(db, listId, tripId, ti.id, !ti.inCart); }
</script>

<section class="screen">
  <header>
    <IconButton label="Bumalik" onclick={() => push('/')}><ChevronLeft size={26} /></IconButton>
    <div class="h">{trip?.name ?? 'Biyahe'} · {trip?.date ?? ''}</div>
    <div class="sp"></div>
  </header>

  <button class="mktchip" onclick={() => (pickingMarket = !pickingMarket)}>Tindahan: {trip?.defaultMarketName ?? 'Pumili ng tindahan'} ▾</button>
  {#if pickingMarket}
    <MarketPicker onPick={pickTripMarket} />
  {/if}

  {#if mode === 'add'}
    <AddItem defaultMarketId={trip?.defaultMarketId ?? null} defaultMarketName={trip?.defaultMarketName ?? null} onSave={onAdd} />
    {#if items.length}<button class="link" onclick={() => (mode = 'view')}>Bumalik sa listahan</button>{/if}
  {:else if mode === 'edit' && editing}
    <AddItem existing={editing} defaultMarketId={editing.marketId} defaultMarketName={editing.marketName} {onMarketChange} onSave={onEditSave} />
    <button class="link" onclick={() => { editing = null; mode = 'view'; }}>Kanselahin</button>
  {:else}
    <div class="card"><div class="lbl">Kabuuan</div><div class="hero">{peso(total)}</div>
      <div class="chips"><span>{items.length} item{items.length === 1 ? '' : 's'}</span></div></div>

    {#if trip?.status === 'draft'}
      <!-- Pending section -->
      <div class="section-hdr">Listahan ({pending.length})</div>
      {#each pendingGroups as g (g.marketId ?? '__none__')}
        <div class="mkt">{g.marketName ?? 'Walang tindahan'}</div>
        {#each g.items as ti (ti.id)}
          <button class="row row-pending" onclick={() => onToggleCart(ti)}>
            <div class="grow">
              <div class="name">{ti.label}{#if isNew(ti)}<span class="new-badge">Bagong dagdag</span>{/if}</div>
              <div class="sub">{ti.quantity ?? '?'} {ti.unit} × {peso(ti.pricePaid)}{#if ti.pricePerBaseUnit != null} · ₱{Math.round(ti.pricePerBaseUnit)}/{baseUnitLabel(ti.baseUnit)}{/if}</div>
            </div>
            <div class="price">{peso(ti.pricePaid)}</div>
            <div onclick={(e) => e.stopPropagation()}>
              <IconButton label="I-edit" onclick={() => startEdit(ti)}><Pencil size={18} /></IconButton>
              <IconButton label="Tanggalin" variant="danger" onclick={() => remove(ti)}><Trash2 size={18} /></IconButton>
            </div>
          </button>
        {/each}
        <div class="subtotal"><span>Subtotal</span><span>{peso(g.subtotal)}</span></div>
      {/each}

      <!-- Done section -->
      {#if inCartItems.length > 0}
        <div class="section-hdr done-hdr">Na sa cart na ({inCartItems.length})</div>
        {#each inCartItems as ti (ti.id)}
          <button class="row row-done" onclick={() => onToggleCart(ti)}>
            <div class="grow">
              <div class="name done-label">{ti.label}</div>
              <div class="sub">{ti.quantity ?? '?'} {ti.unit} × {peso(ti.pricePaid)}</div>
            </div>
            <div class="price">{peso(ti.pricePaid)}</div>
          </button>
        {/each}
      {/if}
    {:else}
      <!-- Saved trip: original view, no cart toggle -->
      {#each groups as g (g.marketId ?? '__none__')}
        <div class="mkt">{g.marketName ?? 'Walang tindahan'}</div>
        {#each g.items as ti (ti.id)}
          <div class="row">
            <div class="grow"><div class="name">{ti.label}</div>
              <div class="sub">{ti.quantity ?? '?'} {ti.unit} × {peso(ti.pricePaid)}{#if ti.pricePerBaseUnit != null} · ₱{Math.round(ti.pricePerBaseUnit)}/{baseUnitLabel(ti.baseUnit)}{/if}</div></div>
            <div class="price">{peso(ti.pricePaid)}</div>
            <IconButton label="I-edit" onclick={() => startEdit(ti)}><Pencil size={18} /></IconButton>
            <IconButton label="Tanggalin" variant="danger" onclick={() => remove(ti)}><Trash2 size={18} /></IconButton>
          </div>
        {/each}
        <div class="subtotal"><span>Subtotal</span><span>{peso(g.subtotal)}</span></div>
      {/each}
    {/if}

    <button class="addrow" onclick={() => (mode = 'add')}>＋ Magdagdag ng item</button>
    {#if trip?.status === 'draft'}<button class="finish" onclick={finish}>Tapos — i-save ang biyahe</button>{/if}
    <button class="trash" onclick={() => (confirmDelete = true)}><Trash2 size={18} /> Burahin ang biyahe</button>
  {/if}
</section>

{#if confirmDelete}
  <ConfirmDialog title="Burahin ang biyahe?" message="Hindi na ito maibabalik." confirmLabel="Oo, burahin"
    onConfirm={async () => { await deleteTrip(db, listId, tripId); push('/'); }} onCancel={() => (confirmDelete = false)} />
{/if}

<style>
  .screen { padding: var(--sp-screen); padding-bottom: 90px; }
  header { display: flex; align-items: center; gap: 8px; }
  .h { font-weight: 700; font-size: 17px; } .sp { flex: 1; }
  .mktchip { width: 100%; text-align: left; margin-top: 10px; border: 2px solid var(--c-ink); border-radius: var(--radius); padding: 12px; background: var(--c-bg); font-weight: 700; }
  .card { background: var(--c-surface); border-radius: var(--radius); padding: 16px; margin-top: 8px; }
  .lbl { color: var(--c-ink-soft); font-size: var(--fs-label); }
  .hero { font-size: var(--fs-hero); font-weight: 800; }
  .chips span { background: var(--c-bg); border-radius: 999px; padding: 3px 10px; font-size: 12px; }
  .section-hdr { font-weight: 700; margin-top: 16px; font-size: var(--fs-label); color: var(--c-ink-soft); text-transform: uppercase; letter-spacing: 0.04em; }
  .done-hdr { margin-top: 24px; }
  .mkt { font-weight: 700; margin-top: 12px; }
  .row { display: flex; align-items: center; gap: 6px; padding: 9px 0; border-bottom: 1px solid var(--c-surface); min-height: 44px; }
  .row-pending { width: 100%; background: none; border: none; border-bottom: 1px solid var(--c-surface); text-align: left; cursor: pointer; padding: 9px 0; min-height: 44px; display: flex; align-items: center; gap: 6px; }
  .row-done { width: 100%; background: none; border: none; border-bottom: 1px solid var(--c-surface); text-align: left; cursor: pointer; padding: 9px 0; min-height: 44px; display: flex; align-items: center; gap: 6px; opacity: 0.5; }
  .grow { flex: 1; } .name { font-weight: 700; } .sub { color: var(--c-ink-soft); font-size: 13px; }
  .done-label { text-decoration: line-through; }
  .new-badge { font-size: 11px; background: var(--c-accent); color: #fff; border-radius: 999px; padding: 1px 7px; margin-left: 6px; font-weight: 600; }
  .price { font-size: var(--fs-price); font-weight: 700; }
  .subtotal { display: flex; justify-content: space-between; padding: 8px 0; font-weight: 700; color: var(--c-ink-soft); }
  .addrow { width: 100%; padding: 14px; margin-top: 14px; border: 2px dashed var(--c-ink); border-radius: var(--radius); background: var(--c-bg); font-weight: 700; }
  .finish { width: 100%; padding: 14px; margin-top: 10px; border: none; border-radius: var(--radius); background: var(--c-accent); color: #fff; font-weight: 700; font-size: var(--fs-price); }
  .trash { width: 100%; padding: 12px; margin-top: 10px; border: 2px solid var(--c-danger); color: var(--c-danger); border-radius: var(--radius); background: none; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 8px; }
  .link { background: none; border: none; color: var(--c-accent); font-weight: 700; margin-top: 10px; }
</style>
