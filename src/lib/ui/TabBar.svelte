<script lang="ts">
  import { router, push } from 'svelte-spa-router';
  import { House, ListChecks, Tag, ChartColumn, Menu } from 'lucide-svelte';
  const tabs = [
    { path: '/', label: 'Home', icon: House },
    { path: '/biyahe', label: 'Biyahe', icon: ListChecks },
    { path: '/items', label: 'Items', icon: Tag },
    { path: '/gastos', label: 'Gastos', icon: ChartColumn },
    { path: '/more', label: 'Iba pa', icon: Menu },
  ];
  const isActive = (p: string) => {
    const loc = router.location;
    if (p === '/') return loc === '/';
    if (p === '/more') return loc.startsWith('/more') || loc.startsWith('/markets') || loc.startsWith('/settings');
    return loc.startsWith(p);
  };
</script>

<nav class="tabbar">
  {#each tabs as t}
    {@const Icon = t.icon}
    <button class="tab" class:on={isActive(t.path)} onclick={() => push(t.path)}>
      <Icon size={24} />
      <span>{t.label}</span>
    </button>
  {/each}
</nav>

<style>
  .tabbar { position: fixed; bottom: 0; left: 0; right: 0; display: flex;
    border-top: 1px solid var(--c-surface); background: var(--c-bg); }
  .tab { flex: 1; min-height: 60px; background: none; border: none; display: flex;
    flex-direction: column; align-items: center; justify-content: center; gap: 2px;
    color: var(--c-ink-soft); font-size: 12px; }
  .tab.on { color: var(--c-accent); }
</style>
