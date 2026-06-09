<script lang="ts">
  import { session } from '../lib/state/session.svelte';
  import { db } from '../lib/data/firebase';
  import { priceHistory, groupHistoryStreams, type HistoryStream } from '../lib/data/trips';
  import { getItem } from '../lib/data/items';
  import { baseUnitLabel } from '../lib/domain/units';
  import type { Item } from '../lib/domain/types';

  let { params } = $props<{ params: { itemId: string } }>();
  const listId = session.listId!;
  let item = $state<Item | null>(null);
  let streams = $state<HistoryStream[]>([]);

  $effect(() => {
    getItem(db, listId, params.itemId).then((i) => (item = i));
    priceHistory(db, listId, params.itemId).then((h) => (streams = groupHistoryStreams(h)));
  });

  const peso = (n: number | null) => (n == null ? '—' : '₱' + Math.round(n).toLocaleString('en-PH'));

  // normalize a stream's pricePerBaseUnit values into a 0..100 x 0..30 viewBox.
  // points come newest-first; reverse so the line reads oldest→newest left→right.
  function sparkPoints(stream: HistoryStream): string {
    const series = [...stream.items].reverse().map((ti) => ti.pricePerBaseUnit ?? 0);
    const n = series.length;
    if (n < 2) return '';
    const min = Math.min(...series);
    const max = Math.max(...series);
    const span = max - min || 1;
    return series
      .map((p, i) => {
        const x = (i / (n - 1)) * 100;
        const y = 28 - ((p - min) / span) * 26;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }
</script>

<section class="screen">
  <h1>{item?.canonicalName ?? ''}</h1>

  {#each streams as stream (stream.key)}
    {@const latest = stream.items[0]}
    <div class="stream">
      <div class="head">{stream.marketName ?? '—'}{stream.variant ? ' · ' + stream.variant : ''}</div>

      <div class="callout">
        {#if latest?.pricePerBaseUnit != null}
          <div class="hero">{peso(latest.pricePerBaseUnit)}/{baseUnitLabel(latest.baseUnit)}</div>
        {:else}
          <div class="hero">—</div>
        {/if}
        <div class="sub">{peso(latest?.pricePaid ?? null)} · {latest?.tripDate ?? ''}</div>
      </div>

      {#if stream.items.length > 1}
        <div class="spark">
          <svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
            <polyline class="spark-line" points={sparkPoints(stream)} />
          </svg>
        </div>
      {/if}

      <div class="lbl">Mga resibo</div>
      <div class="list">
        {#each stream.items as h (h.id)}
          <div class="row">
            <div><div class="name">{h.tripDate}</div><div class="sub">{h.quantity ?? '?'} {h.unit}</div></div>
            <div class="price">{peso(h.pricePaid)}</div>
          </div>
        {/each}
      </div>
    </div>
  {/each}

  {#if streams.length === 0}
    <p class="empty">Wala pang presyo.</p>
  {/if}
</section>

<style>
  .screen { padding: var(--sp-screen); padding-bottom: 90px; }
  h1 { font-size: 22px; }
  .stream { margin-top: 18px; }
  .head { font-weight: 700; margin-bottom: 8px; }
  .callout { background: var(--c-surface); border-radius: var(--radius); padding: 18px; text-align: center; }
  .lbl { color: var(--c-ink-soft); font-size: var(--fs-label); margin: 16px 0 6px; }
  .hero { font-size: var(--fs-hero); font-weight: 800; }
  .sub { color: var(--c-ink-soft); font-size: 13px; }
  .spark { height: 60px; margin-top: 14px; }
  .spark svg { width: 100%; height: 100%; }
  .spark-line { fill: none; stroke: var(--c-accent); stroke-width: 2; vector-effect: non-scaling-stroke; stroke-linecap: round; stroke-linejoin: round; }
  .row { display: flex; justify-content: space-between; align-items: center; padding: 11px 4px; border-bottom: 1px solid var(--c-surface); }
  .name { font-weight: 700; } .price { font-size: var(--fs-price); font-weight: 700; }
  .empty { color: var(--c-ink-soft); }
</style>
