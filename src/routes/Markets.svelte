<script lang="ts">
  import { Pencil, Trash2, Plus } from 'lucide-svelte';
  import { markets } from '../lib/state/markets.svelte';
  import { session } from '../lib/state/session.svelte';
  import { db } from '../lib/data/firebase';
  import { createMarket, updateMarket, deleteMarket } from '../lib/data/markets';
  import { MARKET_TYPES, type MarketType } from '../lib/domain/types';
  import IconButton from '../lib/ui/IconButton.svelte';
  import AppButton from '../lib/ui/AppButton.svelte';
  import ConfirmDialog from '../lib/ui/ConfirmDialog.svelte';

  // Create panel
  let creating = $state(false);
  let newName = $state('');
  let newType = $state<MarketType>('palengke');
  const canCreate = $derived(newName.trim().length > 0);

  async function create() {
    if (!canCreate) return;
    await createMarket(db, session.listId!, { name: newName.trim(), type: newType });
    newName = '';
    newType = 'palengke';
    creating = false;
  }

  // Inline editor
  let editingId = $state<string | null>(null);
  let editName = $state('');
  let editType = $state<MarketType>('palengke');

  function startEdit(id: string, name: string, type: MarketType) {
    editingId = id;
    editName = name;
    editType = type;
  }

  async function save(id: string) {
    if (!editName.trim()) return;
    await updateMarket(db, session.listId!, id, { name: editName.trim(), type: editType });
    editingId = null;
  }

  // Delete confirm
  let deletingId = $state<string | null>(null);

  async function confirmDelete() {
    if (!deletingId) return;
    await deleteMarket(db, session.listId!, deletingId);
    deletingId = null;
  }
</script>

<section class="screen">
  <h1>Mga tindahan</h1>

  {#if creating}
    <div class="editor create">
      <div class="lbl">Pangalan</div>
      <input class="name-input" type="text" bind:value={newName} placeholder="Pangalan ng tindahan" />
      <div class="lbl">Uri</div>
      <div class="types">
        {#each MARKET_TYPES as t}
          <button class="chip" class:on={newType === t} onclick={() => (newType = t)}>{t}</button>
        {/each}
      </div>
      <div class="actions">
        <AppButton onclick={create} disabled={!canCreate}>Gumawa</AppButton>
      </div>
    </div>
  {:else}
    <button class="add" onclick={() => (creating = true)}><Plus size={18} /> Bagong tindahan</button>
  {/if}

  <div class="list">
    {#each markets.all as m (m.id)}
      <div class="item">
        <div class="head">
          <div class="grow">
            <div class="name">{m.name}</div>
            <div class="sub">{m.type}</div>
          </div>
          <IconButton label="I-edit" onclick={() => startEdit(m.id, m.name, m.type)}><Pencil size={18} /></IconButton>
          <IconButton label="Burahin" variant="danger" onclick={() => (deletingId = m.id)}><Trash2 size={18} /></IconButton>
        </div>

        {#if editingId === m.id}
          <div class="editor">
            <div class="lbl">Pangalan</div>
            <input class="name-input" type="text" bind:value={editName} />
            <div class="lbl">Uri</div>
            <div class="types">
              {#each MARKET_TYPES as t}
                <button class="chip" class:on={editType === t} onclick={() => (editType = t)}>{t}</button>
              {/each}
            </div>
            <div class="actions">
              <AppButton onclick={() => save(m.id)}>I-save</AppButton>
            </div>
          </div>
        {/if}
      </div>
    {/each}
    {#if markets.all.length === 0}<p class="empty">Wala pang tindahan.</p>{/if}
  </div>
</section>

{#if deletingId}
  <ConfirmDialog
    title="Burahin ang tindahan?"
    message="Hindi na ito maibabalik."
    confirmLabel="Oo, burahin"
    onConfirm={confirmDelete}
    onCancel={() => (deletingId = null)}
  />
{/if}

<style>
  .screen { padding: var(--sp-screen); padding-bottom: 80px; }
  h1 { font-size: 22px; }
  .add { display: inline-flex; align-items: center; gap: 6px; background: none; border: none;
    color: var(--c-accent); font-weight: 700; font-size: var(--fs-body); padding: 8px 4px; min-height: 44px; }
  .list { display: flex; flex-direction: column; }
  .item { border-bottom: 1px solid var(--c-surface); }
  .head { display: flex; align-items: center; }
  .grow { flex: 1; padding: 11px 4px; } .name { font-weight: 700; } .sub { color: var(--c-ink-soft); font-size: 13px; }
  .editor { padding: 8px 4px 16px; display: flex; flex-direction: column; gap: 8px; }
  .create { border-bottom: 1px solid var(--c-surface); }
  .lbl { color: var(--c-ink-soft); font-size: var(--fs-label); margin-top: 8px; }
  .name-input { font-size: var(--fs-body); padding: 10px; min-height: 44px;
    border: 2px solid var(--c-surface); border-radius: var(--radius); background: var(--c-bg); color: var(--c-ink); }
  .types { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { border: 2px solid var(--c-ink); border-radius: 999px; padding: 8px 14px; background: var(--c-bg);
    font-weight: 700; min-height: 44px; }
  .chip.on { background: var(--c-accent); color: #fff; border-color: var(--c-accent); }
  .actions { margin-top: 12px; }
  .empty { color: var(--c-ink-soft); }
</style>
