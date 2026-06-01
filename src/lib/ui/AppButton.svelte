<script lang="ts">
  let { variant = 'primary', onclick, children, disabled = false } =
    $props<{ variant?: 'primary' | 'ghost' | 'danger'; onclick?: () => void; children: any; disabled?: boolean }>();
</script>

<button class="btn {variant}" {disabled} onclick={onclick}>{@render children()}</button>

<style>
  .btn { width: 100%; min-height: var(--btn-h); border: none; border-radius: var(--radius);
    font-size: var(--fs-price); font-weight: 700; cursor: pointer; }
  .primary { background: var(--c-accent); color: var(--c-accent-ink); }
  .ghost { background: transparent; color: var(--c-ink); border: 2px solid var(--c-ink); }
  .danger { background: var(--c-danger); color: #fff; }
  .btn:disabled { opacity: .5; }
</style>
