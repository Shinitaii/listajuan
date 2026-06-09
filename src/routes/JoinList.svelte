<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { GoogleAuthProvider, signInWithPopup, getAuth } from 'firebase/auth';
  import { db } from '../lib/data/firebase';
  import { joinViaInvite } from '../lib/data/lists';
  import { session, setActiveList } from '../lib/state/session.svelte';
  import { startLibrary } from '../lib/state/library.svelte';
  import { startTrips } from '../lib/state/trips.svelte';
  import { startMarkets } from '../lib/state/markets.svelte';
  import { startCollab } from '../lib/state/collab.svelte';
  import { startSettings } from '../lib/state/settings.svelte';

  type Status = 'loading' | 'needs-google' | 'already-in-list' | 'joining' | 'error';

  let token = $state<string | null>(null);
  let status = $state<Status>('loading');
  let errorMsg = $state('');

  onMount(async () => {
    const hash = window.location.hash;
    const qs = hash.split('?')[1] ?? '';
    const parsed = new URLSearchParams(qs).get('token');
    if (!parsed) { push('/'); return; }
    token = parsed;

    if (session.listId) { status = 'already-in-list'; return; }

    const auth = getAuth();
    if (auth.currentUser?.isAnonymous) { status = 'needs-google'; return; }

    await doJoin(token);
  });

  async function handleGoogleSignIn() {
    const prevStatus = status;
    status = 'joining';
    try {
      await signInWithPopup(getAuth(), new GoogleAuthProvider());
    } catch {
      errorMsg = 'Hindi natapos ang pag-sign in. Subukan ulit.';
      status = 'error';
      return;
    }
    if (token) await doJoin(token);
  }

  async function doJoin(tok: string) {
    status = 'joining';
    try {
      const auth = getAuth();
      const listId = await joinViaInvite(db, session.uid!, auth.currentUser?.displayName ?? null, tok);
      setActiveList(listId);
      startLibrary(listId);
      startTrips(listId);
      startMarkets(listId);
      startCollab(listId);
      if (session.uid) startSettings(session.uid);
      push('/');
    } catch (e: any) {
      if (e.message === 'ALREADY_IN_LIST') {
        status = 'already-in-list';
      } else if (e.message === 'INVITE_EXPIRED') {
        errorMsg = 'Expired na ang link. Humingi ng bagong link sa may-ari.';
        status = 'error';
      } else if (e.message === 'INVITE_NOT_FOUND') {
        errorMsg = 'Hindi mahanap ang invite. Maaaring nagamit na.';
        status = 'error';
      } else {
        errorMsg = 'May problema sa pagsali. Subukan ulit.';
        status = 'error';
      }
    }
  }
</script>

<section class="screen">
  {#if status === 'loading'}
    <p class="msg">Naglo-load…</p>

  {:else if status === 'already-in-list'}
    <p class="msg">May sarili ka nang listahan. Umalis muna bago sumali sa isa pa.</p>
    <button class="btn-back" onclick={() => push('/')}>Bumalik</button>

  {:else if status === 'needs-google'}
    <p class="msg">Mag-sign in gamit ang Google para sumali sa listahan.</p>
    <button class="btn-primary" onclick={handleGoogleSignIn}>Mag-sign in sa Google</button>

  {:else if status === 'joining'}
    <p class="msg">Sumasali…</p>

  {:else if status === 'error'}
    <p class="msg error">{errorMsg}</p>
    <button class="btn-back" onclick={() => push('/')}>Bumalik</button>
  {/if}
</section>

<style>
  .screen { display: flex; flex-direction: column; align-items: center; justify-content: center;
    height: 100%; padding: 32px; gap: 24px; }
  .msg { font-size: var(--fs-body); text-align: center; color: var(--c-ink); max-width: 280px; }
  .error { color: var(--c-danger, #c0392b); }
  .btn-primary { padding: 14px 28px; background: var(--c-brand); color: #fff; border: none;
    border-radius: 8px; font-size: var(--fs-body); font-weight: 700; min-height: 44px; }
  .btn-back { padding: 12px 24px; background: none; border: 1px solid var(--c-ink-soft);
    border-radius: 8px; font-size: var(--fs-body); color: var(--c-ink); min-height: 44px; }
</style>
