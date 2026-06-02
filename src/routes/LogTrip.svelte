<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { session } from '../lib/state/session.svelte';
  import { draft, resumeTrip, addToDraft, removeDraftItem, commitDraft } from '../lib/state/draft.svelte';
  import { baseUnitLabel } from '../lib/domain/units';
  import AppButton from '../lib/ui/AppButton.svelte';
  import AddItem from './AddItem.svelte';
  import { ChevronLeft, X, Trash2 } from 'lucide-svelte';
  import type { NewTripItemInput } from '../lib/data/trips';
  import type { TripItem } from '../lib/domain/types';

  let { params } = $props<{ params: { tripId: string } }>();
  const uid = session.uid!;

  // True once we've committed and are navigating away — stops the resume effect
  // from re-firing after commitDraft nulls the draft.
  let leaving = $state(false);

  // 'overview' = the trip so far (grouped list + total + finish); 'adding' = the AddItem form.
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

  const peso = (n: number | null) => (n == null ? '—' : '₱' + Math.round(n).toLocaleString('en-PH'));

  // Group items by market name (null → "Walang tindahan"), preserving insertion order.
  const groups = $derived.by(() => {
    const map = new Map<string | null, TripItem[]>();
    for (const ti of draft.items) {
      const key = ti.marketName;
      const arr = map.get(key);
      if (arr) arr.push(ti);
      else map.set(key, [ti]);
    }
    return Array.from(map.entries()).map(([name, items]) => ({
      name,
      items,
      subtotal: items.reduce((s, ti) => s + (ti.pricePaid ?? 0), 0),
    }));
  });

  async function onAddSave(input: NewTripItemInput) {
    await addToDraft(uid, input);
    mode = 'overview';
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
      {#each groups as g (g.name)}
        <div class="group">
          <div class="ghead">{g.name ?? 'Walang tindahan'}</div>
          <div class="list">
            {#each g.items as ti (ti.id)}
              <div class="row">
                <div class="grow">
                  <div class="name">{ti.label}</div>
                  <div class="sub">
                    {ti.quantity ?? '?'} {ti.unit} × {peso(ti.pricePaid)}
                    {#if ti.pricePerBaseUnit != null}
                      · ₱{Math.round(ti.pricePerBaseUnit).toLocaleString('en-PH')}/{baseUnitLabel(ti.baseUnit)}
                    {/if}
                  </div>
                </div>
                <div class="price">{peso(ti.pricePaid)}</div>
                <button class="trash" onclick={() => removeItem(ti)} aria-label="Tanggalin"><Trash2 size={18} /></button>
              </div>
            {/each}
          </div>
          <div class="subtotal"><span>Subtotal</span><span>{peso(g.subtotal)}</span></div>
        </div>
      {/each}

      <div class="totalband">
        <span>Kabuuan</span><span class="total">{peso(draft.total)}</span>
      </div>
    {/if}

    <div class="spacer"></div>

    <button class="addrow" onclick={() => (mode = 'adding')}>＋ Magdagdag ng item</button>
    <AppButton onclick={finish} disabled={draft.items.length === 0}>Tapos — i-save ang biyahe</AppButton>
  </section>
{:else}
  <section class="flow">
    <header>
      <button class="icon" onclick={() => (mode = 'overview')} aria-label="Kanselahin"><X size={24} /></button>
      <div class="h">Magdagdag</div>
      <div class="total">{peso(draft.total)}</div>
    </header>

    <AddItem defaultMarketId={draft.trip?.defaultMarketId ?? null} defaultMarketName={null} onSave={onAddSave} />
  </section>
{/if}

<style>
  .screen, .flow { display: flex; flex-direction: column; min-height: 100vh; padding: var(--sp-screen); padding-bottom: 24px; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .icon { background: none; border: none; padding: 4px; }
  .h { font-weight: 700; font-size: 18px; }
  .sp { width: 34px; }
  .total { font-size: var(--fs-price); font-weight: 800; }
  .empty { color: var(--c-ink-soft); margin: 24px 0; }
  .group { margin-top: 14px; }
  .ghead { font-weight: 700; font-size: var(--fs-label); color: var(--c-ink-soft); margin-bottom: 2px; }
  .list { margin-top: 2px; }
  .row { display: flex; align-items: center; gap: 8px; padding: 11px 0; border-bottom: 1px solid var(--c-surface); }
  .grow { flex: 1; }
  .name { font-weight: 700; }
  .sub { color: var(--c-ink-soft); font-size: 13px; }
  .price { font-size: var(--fs-price); font-weight: 700; }
  .trash { background: none; border: none; color: var(--c-danger); padding: 4px; }
  .subtotal { display: flex; justify-content: space-between; padding: 8px 0 0; font-weight: 700; }
  .totalband { display: flex; justify-content: space-between; align-items: center; margin-top: 14px;
    padding: 10px 12px; background: var(--c-emphasis); border-radius: var(--radius); font-weight: 700; }
  .totalband .total { font-size: var(--fs-price); }
  .addrow { width: 100%; padding: 14px; margin-bottom: 10px; border: 2px dashed var(--c-ink);
    border-radius: var(--radius); background: var(--c-bg); font-weight: 700; font-size: var(--fs-body); }
  .spacer { flex: 1; }
</style>
