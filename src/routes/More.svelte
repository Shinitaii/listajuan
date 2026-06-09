<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { Store, Settings as SettingsIcon, ChevronRight, Trash2, LogOut, UserPlus } from 'lucide-svelte';
  import { db } from '../lib/data/firebase';
  import { createInvite, removeMember, leaveList } from '../lib/data/lists';
  import { session } from '../lib/state/session.svelte';
  import { collab } from '../lib/state/collab.svelte';
  import ConfirmDialog from '../lib/ui/ConfirmDialog.svelte';

  let confirmRemove = $state<string | null>(null);  // uid to remove
  let confirmLeave = $state(false);
  let copyFeedback = $state(false);

  const isOwner = $derived(
    collab.members.find(m => m.uid === session.uid)?.role === 'owner'
  );

  async function handleInvite() {
    if (!session.listId || !session.uid) return;
    const invite = await createInvite(db, session.listId, session.uid);
    const url = `${window.location.origin}/#/join?token=${invite.id}`;
    await navigator.clipboard.writeText(url);
    copyFeedback = true;
    setTimeout(() => { copyFeedback = false; }, 2000);
  }

  async function handleRemove(targetUid: string) {
    if (!session.listId || !session.uid) return;
    await removeMember(db, session.listId, targetUid, session.uid);
    confirmRemove = null;
  }

  async function handleLeave() {
    if (!session.listId || !session.uid) return;
    await leaveList(db, session.uid, session.listId);
    confirmLeave = false;
    push('/');
  }
</script>

<section class="screen">
  <h1>Iba pa</h1>

  <!-- Household members -->
  <div class="section-header">Kasama sa bahay</div>
  <div class="list members">
    {#each collab.members as m (m.uid)}
      <div class="member-row">
        <div class="member-info">
          <span class="member-name">{m.displayName ?? 'Hindi kilala'}</span>
          <span class="role-chip">{m.role === 'owner' ? 'May-ari' : 'Kasapi'}</span>
        </div>
        {#if isOwner && m.uid !== session.uid}
          <button class="icon-btn" aria-label="Alisin" onclick={() => { confirmRemove = m.uid; }}>
            <Trash2 size={18} />
          </button>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Invite -->
  <button class="row invite-btn" onclick={handleInvite}>
    <UserPlus size={22} />
    <span class="label">Mag-imbita ng miyembro</span>
  </button>
  {#if copyFeedback}
    <p class="copy-feedback">Nakopya ang link!</p>
  {/if}

  <!-- Leave (non-owners only) -->
  {#if !isOwner}
    <button class="row leave-btn" onclick={() => { confirmLeave = true; }}>
      <LogOut size={22} />
      <span class="label">Umalis sa listahan</span>
    </button>
  {/if}

  <div class="divider"></div>

  <!-- Nav rows -->
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

{#if confirmRemove}
  <ConfirmDialog
    message="Aalisin ang miyembro sa listahan. Magpapatuloy?"
    onconfirm={() => handleRemove(confirmRemove!)}
    oncancel={() => { confirmRemove = null; }}
  />
{/if}

{#if confirmLeave}
  <ConfirmDialog
    message="Aalis ka sa listahan. Hindi mo na makikita ang mga biyahe at item ng grupo."
    onconfirm={handleLeave}
    oncancel={() => { confirmLeave = false; }}
  />
{/if}

<style>
  .screen { padding: var(--sp-screen); padding-bottom: 80px; }
  h1 { font-size: 22px; }
  .section-header { font-size: 13px; font-weight: 700; color: var(--c-ink-soft);
    text-transform: uppercase; letter-spacing: 0.04em; margin: 16px 0 4px; }
  .list { display: flex; flex-direction: column; }
  .members { margin-bottom: 4px; }
  .member-row { display: flex; align-items: center; gap: 12px; padding: 10px 4px;
    border-bottom: 1px solid var(--c-surface); min-height: 44px; }
  .member-info { flex: 1; display: flex; align-items: center; gap: 8px; }
  .member-name { font-size: var(--fs-body); color: var(--c-ink); }
  .role-chip { font-size: 12px; background: var(--c-surface); color: var(--c-ink-soft);
    border-radius: 4px; padding: 2px 6px; }
  .icon-btn { background: none; border: none; color: var(--c-ink-soft); padding: 8px;
    display: flex; align-items: center; cursor: pointer; }
  .row { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 56px;
    padding: 12px 4px; background: none; border: none; border-bottom: 1px solid var(--c-surface);
    text-align: left; color: var(--c-ink); }
  .label { flex: 1; font-weight: 700; font-size: var(--fs-body); }
  .invite-btn { margin-top: 8px; }
  .leave-btn { color: var(--c-danger, #c0392b); margin-top: 4px; }
  .copy-feedback { font-size: 13px; color: var(--c-brand); margin: 4px 0 0 4px; }
  .divider { height: 1px; background: var(--c-surface); margin: 20px 0 8px; }
</style>
