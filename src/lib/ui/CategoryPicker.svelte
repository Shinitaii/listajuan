<script lang="ts">
  import { CATEGORIES, type Category } from '../domain/types';
  let { value = $bindable() } = $props<{ value: Category | null }>();
  const labels: Record<Category, string> = { karne: 'Karne', gulay: 'Gulay', condiments: 'Condiments', bigas: 'Bigas', iba_pa: 'Iba pa' };
</script>
<div class="grid">
  {#each CATEGORIES as c}
    <button class="tile" class:on={value === c} onclick={() => (value = c)}>{labels[c]}</button>
  {/each}
</div>
<style>
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .tile { min-height: 64px; border: 2px solid var(--c-ink); border-radius: var(--radius); background: var(--c-bg); font-weight: 700; }
  .tile.on { background: var(--c-accent); color: #fff; border-color: var(--c-accent); }
</style>
