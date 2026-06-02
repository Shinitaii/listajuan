<script lang="ts">
  import { applyStep, scaledSteps } from '../domain/quickadjust';

  let { value = $bindable(0), baseSteps, kind, min = 0, ontouch } =
    $props<{ value: number | null; baseSteps: [number, number, number]; kind: 'count' | 'weight' | 'volume' | 'price'; min?: number; ontouch?: () => void }>();

  let scale = $state(1);
  let activeIndex = $state(0);
  const steps = $derived(scaledSteps(baseSteps, scale));
  const activeStep = $derived(steps[activeIndex]);
  // ontouch fires on any user interaction — lets a parent (e.g. AddItem price)
  // know the user overrode an auto-prefilled value.
  const touch = () => ontouch?.();

  function label(n: number): string {
    if (kind === 'price') return '₱' + (Number.isInteger(n) ? n : n.toFixed(2));
    if (kind === 'count') return String(n);
    // weight (base kg) / volume (base L): show sub-unit below 1
    const sub = kind === 'weight' ? 'g' : 'ml';
    const base = kind === 'weight' ? 'kg' : 'L';
    return n < 1 ? `${Math.round(n * 1000)}${sub}` : `${+n.toFixed(2)}${base}`;
  }

  const add = () => { value = applyStep(value ?? min, activeStep, 'add', min); touch(); };
  const sub = () => { value = applyStep(value ?? min, activeStep, 'sub', min); touch(); };
  const selectChip = (i: number) => { activeIndex = i; touch(); };
</script>

<div class="qa">
  <input class="val" type="number" inputmode="decimal" bind:value
    onchange={() => { if (value == null || value < min || Number.isNaN(value)) value = min; touch(); }} />

  <div class="row">
    <div class="chips">
      {#each steps as s, i}
        <button class="chip" class:on={i === activeIndex} onclick={() => selectChip(i)}>{label(s)}</button>
      {/each}
    </div>
    <div class="scalecol">
      <button class="sc" aria-label="Doblehin" onclick={() => { scale *= 2; touch(); }}>×2</button>
      <button class="sc" aria-label="Hatiin" onclick={() => { scale /= 2; touch(); }}>÷2</button>
    </div>
    <div class="signcol">
      <button class="sign add" aria-label="Dagdag" onclick={add}>＋</button>
      <button class="sign sub" aria-label="Bawas" onclick={sub}>−</button>
    </div>
  </div>
</div>

<style>
  .qa { display: flex; flex-direction: column; gap: 10px; }
  .val { font-size: var(--fs-hero); text-align: center; width: 100%; border: none;
    border-bottom: 3px solid var(--c-ink); outline: none; }
  .row { display: flex; align-items: stretch; gap: 8px; }
  .chips { display: flex; flex-direction: column; gap: 6px; flex: 1; }
  .chip { min-height: 44px; border: 2px solid var(--c-ink); border-radius: var(--radius);
    background: var(--c-bg); font-weight: 700; font-size: var(--fs-body); }
  .chip.on { background: var(--c-accent); color: #fff; border-color: var(--c-accent); }
  .scalecol, .signcol { display: flex; flex-direction: column; gap: 6px; }
  .sc, .sign { min-width: 56px; min-height: 44px; border-radius: var(--radius); border: 2px solid var(--c-ink);
    background: var(--c-surface); font-weight: 800; font-size: 20px; }
  .sign.add { background: #2f8f4e; color: #fff; border-color: #2f8f4e; }   /* green = add */
  .sign.sub { background: var(--c-danger); color: #fff; border-color: var(--c-danger); } /* red = subtract */
</style>
