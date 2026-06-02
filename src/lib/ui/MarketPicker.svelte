<script lang="ts">
  import { markets } from '../state/markets.svelte';
  import { createMarket } from '../data/markets';
  import { db } from '../data/firebase';
  import { session } from '../state/session.svelte';
  import { MARKET_TYPES, type Market, type MarketType } from '../domain/types';
  let { onPick } = $props<{ onPick: (m: Market) => void }>();
  let creating = $state(false);
  let name = $state('');
  let type = $state<MarketType>('palengke');
  async function create() {
    const m = await createMarket(db, session.uid!, { name: name.trim(), type });
    creating = false; name = ''; onPick(m);
  }
</script>
<div class="wrap">
  {#each markets.all as m (m.id)}
    <button class="chip" onclick={() => onPick(m)}>{m.name}</button>
  {/each}
  {#if !creating}
    <button class="chip add" onclick={() => (creating = true)}>＋ Bagong tindahan</button>
  {:else}
    <div class="new">
      <input placeholder="Pangalan ng tindahan" bind:value={name} />
      <div class="types">{#each MARKET_TYPES as t}<button class="chip" class:on={type === t} onclick={() => (type = t)}>{t}</button>{/each}</div>
      <button class="chip save" disabled={!name.trim()} onclick={create}>I-save</button>
    </div>
  {/if}
</div>
<style>
  .wrap { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { border: 2px solid var(--c-ink); border-radius: 999px; padding: 8px 14px; background: var(--c-bg); font-weight: 700; }
  .chip.on, .chip.save { background: var(--c-accent); color: #fff; border-color: var(--c-accent); }
  .new { display: flex; flex-direction: column; gap: 8px; width: 100%; }
  .new input { border: 2px solid var(--c-ink); border-radius: var(--radius); padding: 10px; font-size: var(--fs-body); }
  .types { display: flex; flex-wrap: wrap; gap: 6px; }
</style>
