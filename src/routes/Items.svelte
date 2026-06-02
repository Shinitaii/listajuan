<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { library } from '../lib/state/library.svelte';
  import { categoryIcon } from '../lib/ui/categoryIcon';

  const peso = (n: number | null) => (n == null ? '—' : '₱' + Math.round(n));
  const sorted = $derived([...library.items].sort((a, b) => a.canonicalName.localeCompare(b.canonicalName)));
</script>

<section class="screen">
  <h1>Mga item</h1>
  <div class="list">
    {#each sorted as it (it.id)}
      {@const Icon = categoryIcon(it.category)}
      <button class="row" onclick={() => push(`/item/${it.id}`)}>
        <Icon size={22} />
        <div class="grow"><div class="name">{it.canonicalName}</div>
          <div class="sub">{it.purchaseCount} biyahe</div></div>
        <div class="price">{peso(it.lastPrice)}{it.lastPriceUnit ? '/' + it.lastPriceUnit : ''}</div>
      </button>
    {/each}
    {#if sorted.length === 0}<p class="empty">Wala pang item. Magsimula ng biyahe.</p>{/if}
  </div>
</section>

<style>
  .screen { padding: var(--sp-screen); padding-bottom: 80px; }
  h1 { font-size: 22px; }
  .list { display: flex; flex-direction: column; }
  .row { display: flex; align-items: center; gap: 10px; padding: 11px 4px; background: none; border: none;
    border-bottom: 1px solid var(--c-surface); text-align: left; width: 100%; }
  .grow { flex: 1; } .name { font-weight: 700; } .sub { color: var(--c-ink-soft); font-size: 13px; }
  .price { font-size: var(--fs-price); font-weight: 700; }
  .empty { color: var(--c-ink-soft); }
</style>
