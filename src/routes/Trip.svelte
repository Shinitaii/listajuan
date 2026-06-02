<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { session } from '../lib/state/session.svelte';
  import { db } from '../lib/data/firebase';
  import { getTrip, subscribeTripItems, addTripItem, updateTripItem, removeTripItem, deleteTrip, saveTrip, setTripMarket, groupByMarket, type NewTripItemInput } from '../lib/data/trips';
  import { tripTotal } from '../lib/domain/calc';
  import { baseUnitLabel } from '../lib/domain/units';
  import AddItem from './AddItem.svelte';
  import IconButton from '../lib/ui/IconButton.svelte';
  import ConfirmDialog from '../lib/ui/ConfirmDialog.svelte';
  import { Pencil, Trash2, ChevronLeft } from 'lucide-svelte';
  import type { Trip, TripItem } from '../lib/domain/types';

  let { params } = $props<{ params: { tripId: string } }>();
  const uid = session.uid!;
  const tripId = $derived(params.tripId); // reactive so the effect re-subscribes if the route id changes

  let trip = $state<Trip | null>(null);
  let items = $state<TripItem[]>([]);
  let mode = $state<'view' | 'add' | 'edit'>('view');
  let editing = $state<TripItem | null>(null);
  let confirmDelete = $state(false);

  $effect(() => {
    getTrip(db, uid, tripId).then((t) => {
      trip = t;
      if (t && items.length === 0) mode = 'add'; // brand-new/empty → start adding
    });
    const unsub = subscribeTripItems(db, uid, tripId, (i) => { items = i; });
    return () => unsub();
  });

  const total = $derived(tripTotal(items));
  const groups = $derived(groupByMarket(items));
  const peso = (n: number | null) => (n == null ? '—' : '₱' + Math.round(n).toLocaleString('en-PH'));

  async function onAdd(input: NewTripItemInput) { await addTripItem(db, uid, tripId, input); mode = 'view'; }
  async function onEditSave(input: NewTripItemInput) {
    if (editing) await updateTripItem(db, uid, tripId, editing.id, { quantity: input.quantity, pricePaid: input.pricePaid, unit: input.unit, variant: input.variant, marketId: input.marketId, marketName: input.marketName });
    editing = null; mode = 'view';
  }
  function onMarketChange(id: string | null, name: string | null) { setTripMarket(db, uid, tripId, id, name); }
  async function remove(ti: TripItem) { await removeTripItem(db, uid, tripId, ti.id); }
  function startEdit(ti: TripItem) { editing = ti; mode = 'edit'; }
  async function finish() { await saveTrip(db, uid, tripId); push('/'); }
</script>

<section class="screen">
  <header>
    <IconButton label="Bumalik" onclick={() => push('/')}><ChevronLeft size={26} /></IconButton>
    <div class="h">{trip?.name ?? 'Biyahe'} · {trip?.date ?? ''}</div>
    <div class="sp"></div>
  </header>

  {#if mode === 'add'}
    <AddItem defaultMarketId={trip?.defaultMarketId ?? null} defaultMarketName={trip?.defaultMarketName ?? null} {onMarketChange} onSave={onAdd} />
    {#if items.length}<button class="link" onclick={() => (mode = 'view')}>Bumalik sa listahan</button>{/if}
  {:else if mode === 'edit' && editing}
    <AddItem existing={editing} defaultMarketId={editing.marketId} defaultMarketName={editing.marketName} {onMarketChange} onSave={onEditSave} />
    <button class="link" onclick={() => { editing = null; mode = 'view'; }}>Kanselahin</button>
  {:else}
    <div class="card"><div class="lbl">Kabuuan</div><div class="hero">{peso(total)}</div>
      <div class="chips"><span>{items.length} item{items.length === 1 ? '' : 's'}</span></div></div>

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

    <button class="addrow" onclick={() => (mode = 'add')}>＋ Magdagdag ng item</button>
    {#if trip?.status === 'draft'}<button class="finish" onclick={finish}>Tapos — i-save ang biyahe</button>{/if}
    <button class="trash" onclick={() => (confirmDelete = true)}><Trash2 size={18} /> Burahin ang biyahe</button>
  {/if}
</section>

{#if confirmDelete}
  <ConfirmDialog title="Burahin ang biyahe?" message="Hindi na ito maibabalik." confirmLabel="Oo, burahin"
    onConfirm={async () => { await deleteTrip(db, uid, tripId); push('/'); }} onCancel={() => (confirmDelete = false)} />
{/if}

<style>
  .screen { padding: var(--sp-screen); padding-bottom: 90px; }
  header { display: flex; align-items: center; gap: 8px; }
  .h { font-weight: 700; font-size: 17px; } .sp { flex: 1; }
  .card { background: var(--c-surface); border-radius: var(--radius); padding: 16px; margin-top: 8px; }
  .lbl { color: var(--c-ink-soft); font-size: var(--fs-label); }
  .hero { font-size: var(--fs-hero); font-weight: 800; }
  .chips span { background: var(--c-bg); border-radius: 999px; padding: 3px 10px; font-size: 12px; }
  .mkt { font-weight: 700; margin-top: 16px; }
  .row { display: flex; align-items: center; gap: 6px; padding: 9px 0; border-bottom: 1px solid var(--c-surface); }
  .grow { flex: 1; } .name { font-weight: 700; } .sub { color: var(--c-ink-soft); font-size: 13px; }
  .price { font-size: var(--fs-price); font-weight: 700; }
  .subtotal { display: flex; justify-content: space-between; padding: 8px 0; font-weight: 700; color: var(--c-ink-soft); }
  .addrow { width: 100%; padding: 14px; margin-top: 14px; border: 2px dashed var(--c-ink); border-radius: var(--radius); background: var(--c-bg); font-weight: 700; }
  .finish { width: 100%; padding: 14px; margin-top: 10px; border: none; border-radius: var(--radius); background: var(--c-accent); color: #fff; font-weight: 700; font-size: var(--fs-price); }
  .trash { width: 100%; padding: 12px; margin-top: 10px; border: 2px solid var(--c-danger); color: var(--c-danger); border-radius: var(--radius); background: none; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 8px; }
  .link { background: none; border: none; color: var(--c-accent); font-weight: 700; margin-top: 10px; }
</style>
