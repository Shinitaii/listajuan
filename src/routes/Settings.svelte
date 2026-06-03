<script lang="ts">
  import { settings } from '../lib/state/settings.svelte';
  import { session } from '../lib/state/session.svelte';
  import { db } from '../lib/data/firebase';
  import { setDefaultMarket } from '../lib/data/settings';
  import MarketPicker from '../lib/ui/MarketPicker.svelte';
  import AppButton from '../lib/ui/AppButton.svelte';
  import type { Market } from '../lib/domain/types';

  async function pick(m: Market) {
    await setDefaultMarket(db, session.uid!, m.id, m.name);
  }

  async function clearDefault() {
    await setDefaultMarket(db, session.uid!, null, null);
  }
</script>

<section class="screen">
  <h1>Mga setting</h1>

  <div class="section">
    <h2>Default na tindahan</h2>
    <p class="current">{settings.value.defaultMarketName ?? 'Wala'}</p>
    <MarketPicker onPick={pick} />
    {#if settings.value.defaultMarketId}
      <div class="clear">
        <AppButton variant="ghost" onclick={clearDefault}>Alisin ang default</AppButton>
      </div>
    {/if}
  </div>
</section>

<style>
  .screen { padding: var(--sp-screen); padding-bottom: 80px; }
  h1 { font-size: 22px; }
  .section { margin-top: 16px; }
  h2 { font-size: 17px; margin: 0 0 4px; }
  .current { font-size: var(--fs-price); font-weight: 700; margin: 0 0 12px; }
  .clear { margin-top: 16px; }
</style>
