<script lang="ts">
  import { session } from '../lib/state/session.svelte';
  import { db } from '../lib/data/firebase';
  import { priceHistory } from '../lib/data/trips';
  import { getItem } from '../lib/data/items';
  import type { Item, TripItem } from '../lib/domain/types';

  let { params } = $props<{ params: { itemId: string } }>();
  const uid = session.uid!;
  let item = $state<Item | null>(null);
  let history = $state<TripItem[]>([]);

  $effect(() => {
    getItem(db, uid, params.itemId).then((i) => (item = i));
    priceHistory(db, uid, params.itemId).then((h) => (history = h));
  });

  const peso = (n: number | null) => (n == null ? '—' : '₱' + Math.round(n).toLocaleString('en-PH'));
  const prices = $derived(history.map((h) => h.pricePaid).filter((p): p is number => p != null));
  const low = $derived(prices.length ? Math.min(...prices) : null);
  const high = $derived(prices.length ? Math.max(...prices) : null);
  const last = $derived(history[0] ?? null);
  // chart data oldest→newest so the line reads left→right
  const series = $derived([...history].reverse().map((h) => h.pricePaid ?? 0));

  // normalize the series to a 100x30 viewBox; flat lines sit on the mid-line
  const sparkPoints = $derived.by(() => {
    const n = series.length;
    if (n < 2) return '';
    const min = Math.min(...series);
    const max = Math.max(...series);
    const span = max - min || 1;
    return series
      .map((p, i) => {
        const x = (i / (n - 1)) * 100;
        const y = 28 - ((p - min) / span) * 26; // 2px top/bottom padding
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  });
</script>

<section class="screen">
  <h1>{item?.canonicalName ?? ''}</h1>

  <div class="callout">
    <div class="lbl">Magkano nung huli?</div>
    <div class="hero">{peso(last?.pricePaid ?? null)}</div>
    {#if last}<div class="sub">/{last.unit} · {last.tripDate}{last.vendor ? ' · ' + last.vendor : ''}</div>{/if}
  </div>

  {#if series.length > 1}
    <div class="spark">
      <svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
        <polyline class="spark-line" points={sparkPoints} />
      </svg>
    </div>
    <div class="range">
      <span>{peso(low)} mababa</span><span>{peso(high)} mataas</span>
    </div>
  {/if}

  <div class="lbl">Mga resibo</div>
  <div class="list">
    {#each history as h (h.id)}
      <div class="row">
        <div><div class="name">{h.tripDate}</div><div class="sub">{h.vendor ?? ''} · {h.quantity ?? '?'} {h.unit}</div></div>
        <div class="price">{peso(h.pricePaid)}</div>
      </div>
    {/each}
  </div>
</section>

<style>
  .screen { padding: var(--sp-screen); padding-bottom: 90px; }
  h1 { font-size: 22px; }
  .callout { background: var(--c-surface); border-radius: var(--radius); padding: 18px; text-align: center; }
  .lbl { color: var(--c-ink-soft); font-size: var(--fs-label); margin: 16px 0 6px; }
  .callout .lbl { margin: 0; }
  .hero { font-size: var(--fs-hero); font-weight: 800; }
  .sub { color: var(--c-ink-soft); font-size: 13px; }
  .spark { height: 60px; margin-top: 14px; }
  .spark svg { width: 100%; height: 100%; }
  .spark-line { fill: none; stroke: var(--c-accent); stroke-width: 2; vector-effect: non-scaling-stroke; stroke-linecap: round; stroke-linejoin: round; }
  .range { display: flex; justify-content: space-between; color: var(--c-ink-soft); font-size: 12px; }
  .row { display: flex; justify-content: space-between; align-items: center; padding: 11px 4px; border-bottom: 1px solid var(--c-surface); }
  .name { font-weight: 700; } .price { font-size: var(--fs-price); font-weight: 700; }
</style>
