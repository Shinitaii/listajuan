<script lang="ts">
  import { FORMS, type Form } from '../domain/types';
  let { value = $bindable() } = $props<{ value: Form | null }>();
  const labels: Record<Form, string> = { bilang: 'Bilang (piraso)', timbang: 'Timbang (kg)', sukat: 'Sukat (litro)' };
</script>
<div class="grid">
  {#each FORMS as f}
    <button class="tile" class:on={value === f} onclick={() => (value = f)}>{labels[f]}</button>
  {/each}
</div>
<style>
  .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
  .tile { min-height: 64px; border: 2px solid var(--c-ink); border-radius: var(--radius); background: var(--c-bg); font-weight: 700; }
  .tile.on { background: var(--c-accent); color: #fff; border-color: var(--c-accent); }
</style>
