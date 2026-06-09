<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { Pencil, Trash2, Plus } from 'lucide-svelte';
  import { library } from '../lib/state/library.svelte';
  import { session } from '../lib/state/session.svelte';
  import { db } from '../lib/data/firebase';
  import { createItem, updateItemMeta, deleteItem } from '../lib/data/items';
  import { categoryIcon } from '../lib/ui/categoryIcon';
  import { baseUnitLabel, unitsFor } from '../lib/domain/units';
  import FormPicker from '../lib/ui/FormPicker.svelte';
  import CategoryPicker from '../lib/ui/CategoryPicker.svelte';
  import AppButton from '../lib/ui/AppButton.svelte';
  import IconButton from '../lib/ui/IconButton.svelte';
  import ConfirmDialog from '../lib/ui/ConfirmDialog.svelte';
  import type { Form, Category } from '../lib/domain/types';

  const peso = (n: number | null) => (n == null ? '—' : '₱' + Math.round(n));
  const sorted = $derived([...library.items].sort((a, b) => a.canonicalName.localeCompare(b.canonicalName)));

  // Create panel
  let creating = $state(false);
  let newName = $state('');
  let newForm = $state<Form | null>(null);
  let newCategory = $state<Category | null>(null);
  const canCreate = $derived(newName.trim().length > 0 && newForm != null && newCategory != null);

  async function create() {
    if (!canCreate) return;
    await createItem(db, session.listId!, {
      canonicalName: newName.trim(),
      category: newCategory!,
      form: newForm!,
      defaultUnit: unitsFor(newForm!)[0],
    });
    newName = '';
    newForm = null;
    newCategory = null;
    creating = false;
  }

  // Inline editor
  let editingId = $state<string | null>(null);
  let editName = $state('');
  let editForm = $state<Form | null>(null);
  let editCategory = $state<Category | null>(null);

  function startEdit(id: string, name: string, form: Form, category: Category) {
    editingId = id;
    editName = name;
    editForm = form;
    editCategory = category;
  }

  async function save(id: string) {
    if (!editForm || !editCategory || !editName.trim()) return;
    await updateItemMeta(db, session.listId!, id, {
      canonicalName: editName.trim(),
      form: editForm,
      category: editCategory,
    });
    editingId = null;
  }

  // Delete confirm
  let deletingId = $state<string | null>(null);

  async function confirmDelete() {
    if (!deletingId) return;
    await deleteItem(db, session.listId!, deletingId);
    deletingId = null;
  }
</script>

<section class="screen">
  <h1>Mga item</h1>

  {#if creating}
    <div class="editor create">
      <div class="lbl">Pangalan</div>
      <input class="name-input" type="text" bind:value={newName} placeholder="Pangalan ng item" />
      <div class="lbl">Anyo</div>
      <FormPicker bind:value={newForm} />
      <div class="lbl">Kategorya</div>
      <CategoryPicker bind:value={newCategory} />
      <div class="actions">
        <AppButton onclick={create} disabled={!canCreate}>Gumawa</AppButton>
      </div>
    </div>
  {:else}
    <button class="add" onclick={() => (creating = true)}><Plus size={18} /> Bagong item</button>
  {/if}

  <div class="list">
    {#each sorted as it (it.id)}
      {@const Icon = categoryIcon(it.category)}
      <div class="item">
        <div class="head">
          <button class="row" onclick={() => push(`/item/${it.id}`)}>
            <Icon size={22} />
            <div class="grow"><div class="name">{it.canonicalName}</div>
              <div class="sub">{it.purchaseCount} biyahe</div></div>
            <div class="price">
              {#if it.lastPricePerBaseUnit != null && it.lastBaseUnit != null}
                {peso(it.lastPricePerBaseUnit)}/{baseUnitLabel(it.lastBaseUnit)}
              {:else}—{/if}
            </div>
          </button>
          <IconButton label="I-edit" onclick={() => startEdit(it.id, it.canonicalName, it.form, it.category)}><Pencil size={18} /></IconButton>
          <IconButton label="Burahin" variant="danger" onclick={() => (deletingId = it.id)}><Trash2 size={18} /></IconButton>
        </div>

        {#if editingId === it.id}
          <div class="editor">
            <div class="lbl">Pangalan</div>
            <input class="name-input" type="text" bind:value={editName} />
            <div class="lbl">Anyo</div>
            <FormPicker bind:value={editForm} />
            <div class="lbl">Kategorya</div>
            <CategoryPicker bind:value={editCategory} />
            <div class="actions">
              <AppButton onclick={() => save(it.id)}>I-save</AppButton>
            </div>
          </div>
        {/if}
      </div>
    {/each}
    {#if sorted.length === 0}<p class="empty">Wala pang item. Magsimula ng biyahe.</p>{/if}
  </div>
</section>

{#if deletingId}
  <ConfirmDialog
    title="Burahin ang item?"
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
  .row { display: flex; align-items: center; gap: 10px; padding: 11px 4px; background: none; border: none;
    text-align: left; flex: 1; }
  .grow { flex: 1; } .name { font-weight: 700; } .sub { color: var(--c-ink-soft); font-size: 13px; }
  .price { font-size: var(--fs-price); font-weight: 700; }
  .editor { padding: 8px 4px 16px; display: flex; flex-direction: column; gap: 8px; }
  .create { border-bottom: 1px solid var(--c-surface); }
  .lbl { color: var(--c-ink-soft); font-size: var(--fs-label); margin-top: 8px; }
  .name-input { font-size: var(--fs-body); padding: 10px; min-height: 44px;
    border: 2px solid var(--c-surface); border-radius: var(--radius); background: var(--c-bg); color: var(--c-ink); }
  .actions { margin-top: 12px; }
  .empty { color: var(--c-ink-soft); }
</style>
