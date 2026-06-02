<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { Store, Settings as SettingsIcon, ChevronRight } from 'lucide-svelte';
</script>

<section class="screen">
  <h1>Iba pa</h1>
  <div class="list">
    <button class="row" onclick={() => push('/markets')}>
      <Store size={22} />
      <span class="label">Mga tindahan</span>
      <ChevronRight size={20} />
    </button>
    <button class="row" onclick={() => push('/settings')}>
      <SettingsIcon size={22} />
      <span class="label">Mga setting</span>
      <ChevronRight size={20} />
    </button>
  </div>
</section>

<style>
  .screen { padding: var(--sp-screen); padding-bottom: 80px; }
  h1 { font-size: 22px; }
  .list { display: flex; flex-direction: column; }
  .row { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 56px;
    padding: 12px 4px; background: none; border: none; border-bottom: 1px solid var(--c-surface);
    text-align: left; color: var(--c-ink); }
  .label { flex: 1; font-weight: 700; font-size: var(--fs-body); }
</style>
