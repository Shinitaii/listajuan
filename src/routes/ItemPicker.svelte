<script lang="ts">
  import { library, searchLibrary } from '../lib/state/library.svelte';
  import { categoryIcon } from '../lib/ui/categoryIcon';
  import { Search } from 'lucide-svelte';
  import type { Item } from '../lib/domain/types';

  let { onPick } = $props<{ onPick: (r: Item | { isNew: true; name: string }) => void }>();
  let q = $state('');
  // Tiles: frequently bought (by purchaseCount) when not searching; results when searching.
  const tiles = $derived(
    q.trim()
      ? searchLibrary(q)
      : [...library.items].sort((a, b) => b.purchaseCount - a.purchaseCount).slice(0, 8),
  );
  const peso = (n: number | null) => (n == null ? '' : '₱' + Math.round(n));
</script>

<div class="picker">
  <div class="search">
    <Search size={18} />
    <input placeholder="Hanapin o pumili…" bind:value={q} />
  </div>

  <div class="grid">
    {#each tiles as it (it.id)}
      {@const Icon = categoryIcon(it.category)}
      <button class="tile" onclick={() => onPick(it)}>
        <Icon size={26} />
        <div class="t-name">{it.canonicalName}</div>
        <div class="t-price">{peso(it.lastPrice)}{it.lastPriceUnit ? '/' + it.lastPriceUnit : ''}</div>
      </button>
    {/each}
  </div>

  {#if q.trim() && !tiles.some((t) => t.nameLower === q.trim().toLowerCase())}
    <button class="newitem" onclick={() => onPick({ isNew: true, name: q.trim() })}>
      ＋ Bagong item: "{q.trim()}"
    </button>
  {/if}
</div>

<style>
  .picker { display: flex; flex-direction: column; gap: 12px; }
  .search { display: flex; align-items: center; gap: 8px; border: 2px solid var(--c-ink);
    border-radius: var(--radius); padding: 10px 12px; }
  .search input { border: none; outline: none; flex: 1; font-size: var(--fs-body); background: none; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .tile { display: flex; flex-direction: column; gap: 6px; align-items: flex-start;
    background: var(--c-surface); border: none; border-radius: var(--radius); padding: 12px; min-height: 84px; }
  .t-name { font-weight: 700; } .t-price { color: var(--c-accent); font-weight: 700; }
  .newitem { background: none; border: 2px dashed var(--c-ink); border-radius: var(--radius);
    padding: 12px; font-weight: 700; font-size: var(--fs-body); }
</style>
