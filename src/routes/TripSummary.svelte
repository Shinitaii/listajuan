<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { session } from '../lib/state/session.svelte';
  import { db } from '../lib/data/firebase';
  import { getTrip, subscribeTripItems, updateTripItem, removeTripItem, deleteTrip } from '../lib/data/trips';
  import { tripTotal } from '../lib/domain/calc';
  import ConfirmDialog from '../lib/ui/ConfirmDialog.svelte';
  import { Trash2 } from 'lucide-svelte';
  import type { Trip, TripItem } from '../lib/domain/types';

  let { params } = $props<{ params: { tripId: string } }>();
  const uid = session.uid!;
  let trip = $state<Trip | null>(null);
  let items = $state<TripItem[]>([]);
  let editing = $state<string | null>(null);
  let confirmDelete = $state(false);

  $effect(() => {
    getTrip(db, uid, params.tripId).then((t) => (trip = t));
    const unsub = subscribeTripItems(db, uid, params.tripId, (i) => (items = i));
    return () => unsub();
  });

  const total = $derived(tripTotal(items));
  const peso = (n: number | null) => (n == null ? '—' : '₱' + Math.round(n).toLocaleString('en-PH'));

  async function saveEdit(ti: TripItem, quantity: number | null, pricePaid: number | null) {
    await updateTripItem(db, uid, params.tripId, ti.id, { quantity, pricePaid });
    editing = null;
  }
  async function doDelete() {
    await deleteTrip(db, uid, params.tripId);
    push('/');
  }
</script>

<section class="screen">
  <div class="card">
    <div class="lbl">Kabuuang gastos · {trip?.date ?? ''}</div>
    <div class="hero">{peso(total)}</div>
    <div class="chips"><span>{items.length} items</span>{#if trip?.storeName}<span>{trip.storeName}</span>{/if}</div>
  </div>

  <div class="list">
    {#each items as ti (ti.id)}
      {#if editing === ti.id}
        <div class="edit">
          <span class="name">{ti.label}</span>
          <input type="number" inputmode="decimal" value={ti.quantity} id="q-{ti.id}" />
          <input type="number" inputmode="decimal" value={ti.pricePaid} id="p-{ti.id}" />
          <button onclick={() => saveEdit(ti,
            Number((document.getElementById('q-' + ti.id) as HTMLInputElement).value),
            Number((document.getElementById('p-' + ti.id) as HTMLInputElement).value))}>Tapos</button>
        </div>
      {:else}
        <button class="row" onclick={() => (editing = ti.id)}>
          <div><div class="name">{ti.label}</div>
            <div class="sub">{ti.quantity ?? '?'} {ti.unit} × {peso(ti.pricePerUnit)}</div></div>
          <div class="price">{peso(ti.pricePaid)}</div>
        </button>
      {/if}
    {/each}
  </div>

  <button class="trash" onclick={() => (confirmDelete = true)}><Trash2 size={20} /> Burahin ang biyahe</button>
</section>

{#if confirmDelete}
  <ConfirmDialog title="Burahin ang biyahe?" message="Hindi na ito maibabalik."
    confirmLabel="Oo, burahin" onConfirm={doDelete} onCancel={() => (confirmDelete = false)} />
{/if}

<style>
  .screen { padding: var(--sp-screen); padding-bottom: 90px; }
  .card { background: var(--c-surface); border-radius: var(--radius); padding: 16px; }
  .lbl { color: var(--c-ink-soft); font-size: var(--fs-label); }
  .hero { font-size: var(--fs-hero); font-weight: 800; }
  .chips { display: flex; gap: 8px; margin-top: 6px; }
  .chips span { background: var(--c-bg); border-radius: 999px; padding: 3px 10px; font-size: 12px; }
  .list { margin-top: 10px; }
  .row, .edit { display: flex; justify-content: space-between; align-items: center; gap: 8px;
    width: 100%; padding: 11px 4px; border: none; border-bottom: 1px solid var(--c-surface); background: none; text-align: left; }
  .edit input { width: 70px; font-size: var(--fs-body); }
  .name { font-weight: 700; } .sub { color: var(--c-ink-soft); font-size: 13px; }
  .price { font-size: var(--fs-price); font-weight: 700; }
  .trash { margin-top: 20px; background: none; border: 2px solid var(--c-danger); color: var(--c-danger);
    border-radius: var(--radius); padding: 12px; width: 100%; font-weight: 700; display: flex;
    align-items: center; justify-content: center; gap: 8px; }
</style>
