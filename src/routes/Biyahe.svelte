<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { trips } from '../lib/state/trips.svelte';
  import { RotateCcw } from 'lucide-svelte';
  import type { Trip } from '../lib/domain/types';

  const peso = (n: number) => '₱' + Math.round(n).toLocaleString('en-PH');
  const marketLabel = (t: Trip) =>
    t.marketNames.length
      ? t.marketNames.length <= 2
        ? t.marketNames.join(' + ')
        : t.marketNames.length + ' tindahan'
      : '—';
</script>

<section class="screen">
  <h1>Mga biyahe</h1>

  {#if trips.drafts.length}
    <div class="lbl">Hindi tapos</div>
    <div class="list">
      {#each trips.drafts as t (t.id)}
        <button class="row draft" onclick={() => push(`/trip/${t.id}`)}>
          <RotateCcw size={20} />
          <div class="grow"><div class="name">{t.name}</div>
            <div class="sub">Ipagpatuloy</div></div>
          <div class="go">›</div>
        </button>
      {/each}
    </div>
  {/if}

  <div class="lbl">Mga naitalang biyahe</div>
  <div class="list">
    {#each trips.recent as t (t.id)}
      <button class="row" onclick={() => push(`/trip/${t.id}`)}>
        <div class="grow"><div class="name">{t.name}</div>
          <div class="sub">{t.date} · {marketLabel(t)} · {t.itemCount} item{t.itemCount === 1 ? '' : 's'}</div></div>
        <div class="price">{peso(t.total)}</div>
      </button>
    {/each}
    {#if trips.recent.length === 0}
      <p class="empty">Wala pang naitalang biyahe.</p>
    {/if}
  </div>
</section>

<style>
  .screen { padding: var(--sp-screen); padding-bottom: 80px; }
  h1 { font-size: 22px; }
  .lbl { color: var(--c-ink-soft); font-size: var(--fs-label); margin: 18px 0 6px; }
  .list { display: flex; flex-direction: column; }
  .row { display: flex; align-items: center; gap: 10px; padding: 12px 4px; background: none; border: none;
    border-bottom: 1px solid var(--c-surface); text-align: left; width: 100%; }
  .row.draft { color: var(--c-accent); }
  .grow { flex: 1; }
  .name { font-weight: 700; color: var(--c-ink); }
  .sub { color: var(--c-ink-soft); font-size: 13px; }
  .price { font-size: var(--fs-price); font-weight: 700; }
  .go { font-size: 20px; color: var(--c-ink-soft); }
  .empty { color: var(--c-ink-soft); }
</style>
