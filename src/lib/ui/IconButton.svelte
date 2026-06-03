<script lang="ts">
  let { onclick, label, variant = 'default', children } =
    $props<{ onclick: () => void; label: string; variant?: 'default' | 'danger'; children: any }>();
</script>
<button class="ib {variant}" aria-label={label} onclick={onclick}>{@render children()}</button>
<style>
  .ib { min-width: 44px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center;
    background: none; border: none; border-radius: 10px; color: var(--c-ink); }
  .danger { color: var(--c-danger); }
</style>
