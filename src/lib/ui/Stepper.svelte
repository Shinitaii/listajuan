<script lang="ts">
  let { value = $bindable(1), step = 1, min = 0 } = $props<{ value?: number; step?: number; min?: number }>();
  const dec = () => { value = Math.max(min, +(value - step).toFixed(2)); };
  const inc = () => { value = +(value + step).toFixed(2); };
</script>

<div class="stepper">
  <button onclick={dec} aria-label="Bawasan">−</button>
  <span class="val">{value}</span>
  <button onclick={inc} aria-label="Dagdagan">＋</button>
</div>

<style>
  .stepper { display: flex; align-items: center; gap: 18px; justify-content: center; }
  button { width: var(--stepper-h); height: var(--stepper-h); border-radius: 50%;
    border: 2px solid var(--c-ink); background: var(--c-surface); font-size: 28px; }
  .val { font-size: var(--fs-hero); min-width: 80px; text-align: center; }
</style>
