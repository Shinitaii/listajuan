<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { library } from '../lib/state/library.svelte';
  import { session } from '../lib/state/session.svelte';
  import { db } from '../lib/data/firebase';
  import { updateItemMeta } from '../lib/data/items';
  import { categoryIcon } from '../lib/ui/categoryIcon';
  import { baseUnitLabel } from '../lib/domain/units';
  import FormPicker from '../lib/ui/FormPicker.svelte';
  import CategoryPicker from '../lib/ui/CategoryPicker.svelte';
  import AppButton from '../lib/ui/AppButton.svelte';
  import type { Form, Category } from '../lib/domain/types';

  const peso = (n: number | null) => (n == null ? '—' : '₱' + Math.round(n));
  const sorted = $derived([...library.items].sort((a, b) => a.canonicalName.localeCompare(b.canonicalName)));

  let editingId = $state<string | null>(null);
  let editForm = $state<Form | null>(null);
  let editCategory = $state<Category | null>(null);

  function startEdit(id: string, form: Form, category: Category) {
    editingId = id;
    editForm = form;
    editCategory = category;
  }

  async function save(id: string) {
    if (!editForm || !editCategory) return;
    await updateItemMeta(db, session.uid!, id, { form: editForm, category: editCategory });
    editingId = null;
  }
</script>

<section class="screen">
  <h1>Mga item</h1>
  <div class="list">
    {#each sorted as it (it.id)}
      {@const Icon = categoryIcon(it.category)}
      <div class="item">
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
        <button class="edit" onclick={() => startEdit(it.id, it.form, it.category)}>I-edit</button>

        {#if editingId === it.id}
          <div class="editor">
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

<style>
  .screen { padding: var(--sp-screen); padding-bottom: 80px; }
  h1 { font-size: 22px; }
  .list { display: flex; flex-direction: column; }
  .item { border-bottom: 1px solid var(--c-surface); }
  .row { display: flex; align-items: center; gap: 10px; padding: 11px 4px; background: none; border: none;
    text-align: left; width: 100%; }
  .grow { flex: 1; } .name { font-weight: 700; } .sub { color: var(--c-ink-soft); font-size: 13px; }
  .price { font-size: var(--fs-price); font-weight: 700; }
  .edit { background: none; border: none; color: var(--c-accent); font-weight: 700; font-size: 14px;
    padding: 6px 4px; min-height: 44px; text-align: left; }
  .editor { padding: 8px 4px 16px; display: flex; flex-direction: column; gap: 8px; }
  .lbl { color: var(--c-ink-soft); font-size: var(--fs-label); margin-top: 8px; }
  .actions { margin-top: 12px; }
  .empty { color: var(--c-ink-soft); }
</style>
