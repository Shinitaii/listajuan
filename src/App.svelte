<script lang="ts">
  import Router from 'svelte-spa-router';
  import { onMount } from 'svelte';
  import { session, startSession } from './lib/state/session.svelte';
  import { startLibrary } from './lib/state/library.svelte';
  import { startTrips } from './lib/state/trips.svelte';
  import { startMarkets } from './lib/state/markets.svelte';
  import { startSettings } from './lib/state/settings.svelte';
  import TabBar from './lib/ui/TabBar.svelte';
  import Home from './routes/Home.svelte';
  import Biyahe from './routes/Biyahe.svelte';
  import Items from './routes/Items.svelte';
  import Gastos from './routes/Gastos.svelte';
  import Trip from './routes/Trip.svelte';
  import ItemHistory from './routes/ItemHistory.svelte';
  import More from './routes/More.svelte';
  import Markets from './routes/Markets.svelte';
  import Settings from './routes/Settings.svelte';

  const routes = {
    '/': Home,
    '/biyahe': Biyahe,
    '/items': Items,
    '/gastos': Gastos,
    '/more': More,
    '/markets': Markets,
    '/settings': Settings,
    '/trip/:tripId': Trip,
    '/item/:itemId': ItemHistory,
  };

  onMount(async () => {
    await startSession();
    if (session.uid) { startLibrary(session.uid); startTrips(session.uid); startMarkets(session.uid); startSettings(session.uid); }
  });

  // tabs are visible everywhere now (the /log full-screen stepper is gone)
  const showTabs = true;
</script>

{#if !session.ready}
  <div class="boot">Naglo-load…</div>
{:else if session.error}
  <div class="boot">May problema sa pag-load. Subukan ulit.</div>
{:else}
  <main><Router {routes} /></main>
  {#if showTabs}<TabBar />{/if}
{/if}

<style>
  .boot { display: flex; height: 100%; align-items: center; justify-content: center; color: var(--c-ink-soft); }
  main { min-height: 100%; }
</style>
