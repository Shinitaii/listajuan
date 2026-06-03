<script lang="ts">
  import QuickAdjust from './QuickAdjust.svelte';
  import type { Form } from '../domain/types';
  let { form, value = $bindable(1) }: { form: Form; value: number } = $props();

  const config = {
    bilang: { baseSteps: [1, 2, 5] as [number, number, number], kind: 'count' as const },
    timbang: { baseSteps: [0.25, 0.5, 1] as [number, number, number], kind: 'weight' as const },
    sukat: { baseSteps: [0.25, 0.5, 1] as [number, number, number], kind: 'volume' as const },
  };
  const c = $derived(config[form]);
</script>

<QuickAdjust bind:value baseSteps={c.baseSteps} kind={c.kind} min={0} />
