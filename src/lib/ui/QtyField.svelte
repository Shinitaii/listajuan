<script lang="ts">
  import Stepper from './Stepper.svelte';
  import type { Form } from '../domain/types';
  let { form, value = $bindable(1) } = $props<{ form: Form; value: number }>();
</script>
{#if form === 'bilang'}
  <Stepper bind:value step={1} min={0} />
{:else}
  <input class="num" type="number" inputmode="decimal" step="0.01" min="0" bind:value placeholder="Dami" />
{/if}
<style>
  .num { width: 100%; font-size: var(--fs-hero); text-align: center; border: none; border-bottom: 3px solid var(--c-ink); outline: none; }
</style>
