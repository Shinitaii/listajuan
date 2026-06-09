<script lang="ts">
  import Router from 'svelte-spa-router';
  import { onMount } from 'svelte';
  import { updateDoc, deleteField } from 'firebase/firestore';
  import { db } from './lib/data/firebase';
  import { userDoc } from './lib/data/paths';
  import { session, startSession } from './lib/state/session.svelte';
  import { startLibrary } from './lib/state/library.svelte';
  import { startTrips } from './lib/state/trips.svelte';
  import { startMarkets } from './lib/state/markets.svelte';
  import { startSettings } from './lib/state/settings.svelte';
  import { collab, startCollab } from './lib/state/collab.svelte';
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
  import JoinList from './routes/JoinList.svelte';

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
    '/join': JoinList,
  };

  onMount(async () => {
    await startSession();
    if (session.uid && session.listId) {
      startLibrary(session.listId);
      startTrips(session.listId);
      startMarkets(session.listId);
      startCollab(session.listId);
      startSettings(session.uid);
    }
  });

  async function handleRevoked() {
    if (!session.uid) return;
    await updateDoc(userDoc(db, session.uid), { listId: deleteField() });
    window.location.reload();
  }

  const showTabs = true;
</script>

{#if !session.ready}
  <div class="boot">Naglo-load…</div>
{:else if session.error}
  <div class="boot">May problema sa pag-load. Subukan ulit.</div>
{:else if collab.accessRevoked}
  <div class="boot revoked">
    <p>Hindi ka na kasapi sa listahang ito.</p>
    <button onclick={handleRevoked}>Magsimula muli</button>
  </div>
{:else}
  <main><Router {routes} /></main>
  {#if showTabs}<TabBar />{/if}
{/if}

<style>
  .boot { display: flex; flex-direction: column; height: 100%; align-items: center; justify-content: center; color: var(--c-ink-soft); gap: 16px; }
  .boot button { padding: 12px 24px; background: var(--c-brand); color: #fff; border: none; border-radius: 8px; font-size: var(--fs-body); font-weight: 700; }
  main { min-height: 100%; }
</style>
