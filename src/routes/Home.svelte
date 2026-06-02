<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { Hand } from 'lucide-svelte';
  import { trips } from '../lib/state/trips.svelte';
  import { session } from '../lib/state/session.svelte';
  import { startNewTrip } from '../lib/state/draft.svelte';
  import { monthlyTotal } from '../lib/data/trips';
  import { db } from '../lib/data/firebase';
  import { monthDelta } from '../lib/domain/calc';
  import AppButton from '../lib/ui/AppButton.svelte';

  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + 1;
  const prevY = m === 1 ? y - 1 : y, prevM = m === 1 ? 12 : m - 1;

  let thisMonth = $state(0), lastMonth = $state(0);
  $effect(() => {
    const uid = session.uid; if (!uid) return;
    monthlyTotal(db, uid, y, m).then((v) => (thisMonth = v));
    monthlyTotal(db, uid, prevY, prevM).then((v) => (lastMonth = v));
  });
  const delta = $derived(monthDelta(thisMonth, lastMonth));
  const peso = (n: number) => '₱' + Math.round(n).toLocaleString('en-PH');

  async function newTrip() {
    const uid = session.uid!;
    const today = new Date().toISOString().slice(0, 10);
    const id = await startNewTrip(uid, { name: 'Biyahe', storeName: '', date: today });
    push(`/log/${id}`);
  }
</script>

<section class="screen">
  <div class="greet">Kumusta, Aling Rosa <Hand size={20} /></div>

  <div class="spend">
    <div class="lbl">Gastos ngayong buwan</div>
    <div class="hero">{peso(thisMonth)}</div>
    {#if lastMonth > 0}
      <span class="chip">{delta >= 0 ? '▲' : '▼'} {peso(Math.abs(delta))} vs nakaraan</span>
    {/if}
  </div>

  {#if trips.drafts.length}
    <button class="resume" onclick={() => push(`/log/${trips.drafts[0].id}`)}>
      Ipagpatuloy — {trips.drafts[0].name} ›
    </button>
  {/if}

  <div class="lbl">Mga huling biyahe</div>
  <div class="list">
    {#each trips.recent as t}
      <button class="row" onclick={() => push(`/trip/${t.id}`)}>
        <div><div class="name">{t.name}</div><div class="sub">{t.itemCount} item{t.itemCount === 1 ? '' : 's'} · {t.storeName}</div></div>
        <div class="price">{peso(t.total)}</div>
      </button>
    {/each}
  </div>

  <div class="cta"><AppButton onclick={newTrip}>＋ Bagong biyahe</AppButton></div>
</section>

<style>
  .screen { padding: var(--sp-screen); padding-bottom: 140px; }
  .greet { font-size: 19px; font-weight: 700; margin-bottom: 12px; display: inline-flex; align-items: center; gap: 6px; }
  .spend { background: var(--c-surface); border-radius: var(--radius); padding: 16px; }
  .lbl { color: var(--c-ink-soft); font-size: var(--fs-label); margin: 16px 0 6px; }
  .spend .lbl { margin: 0; }
  .hero { font-size: var(--fs-hero); font-weight: 800; }
  .chip { display: inline-block; background: var(--c-emphasis); border-radius: 999px; padding: 4px 10px; font-size: 13px; font-weight: 700; }
  .resume { width: 100%; text-align: left; margin-top: 14px; padding: 12px 14px; border-radius: var(--radius);
    border: 2px solid var(--c-ink); background: var(--c-bg); font-weight: 700; font-size: var(--fs-body); }
  .list { display: flex; flex-direction: column; }
  .row { display: flex; justify-content: space-between; align-items: center; padding: 11px 4px;
    background: none; border: none; border-bottom: 1px solid var(--c-surface); text-align: left; }
  .name { font-weight: 700; } .sub { color: var(--c-ink-soft); font-size: 13px; }
  .price { font-size: var(--fs-price); font-weight: 700; }
  .cta { position: fixed; left: var(--sp-screen); right: var(--sp-screen); bottom: 72px; }
</style>
