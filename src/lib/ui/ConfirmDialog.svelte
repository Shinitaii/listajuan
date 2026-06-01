<script lang="ts">
  let { title, message, confirmLabel, onConfirm, onCancel } =
    $props<{ title: string; message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }>();
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onCancel(); }} />
<!-- Backdrop click dismisses (mouse affordance); keyboard users dismiss with Escape, handled above. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="scrim" onclick={(e) => { if (e.target === e.currentTarget) onCancel(); }} role="presentation">
  <div class="dialog" role="dialog" aria-modal="true" tabindex="-1">
    <h2>{title}</h2>
    <p>{message}</p>
    <button class="confirm" onclick={onConfirm}>{confirmLabel}</button>
    <button class="cancel" onclick={onCancel}>Huwag na</button>
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; background: rgba(43,42,39,.35);
    display: flex; align-items: center; justify-content: center; padding: 22px; z-index: 100; }
  .dialog { background: var(--c-bg); border-radius: var(--radius); padding: 20px; width: 100%; max-width: 360px; }
  h2 { font-size: 19px; margin: 0 0 8px; }
  p { color: var(--c-ink-soft); margin: 0 0 16px; }
  button { width: 100%; min-height: var(--btn-h); border-radius: var(--radius); border: none;
    font-size: var(--fs-body); font-weight: 700; margin-top: 8px; }
  .confirm { background: var(--c-danger); color: #fff; }
  .cancel { background: transparent; border: 2px solid var(--c-ink); }
</style>
