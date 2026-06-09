<script lang="ts">
  import { session } from '../lib/state/session.svelte';
  import { db } from '../lib/data/firebase';
  import { monthlyTotal, monthlyByCategory, type CategoryTotals } from '../lib/data/trips';
  import { monthDelta } from '../lib/domain/calc';
  import { categoryIcon } from '../lib/ui/categoryIcon';
  import { CATEGORIES, type Category } from '../lib/domain/types';
  import { Chart, Svg, Bars } from 'layerchart';
  import { scaleBand, scaleLinear } from 'd3-scale';

  const listId = session.listId!;
  const now = new Date();
  const y = now.getFullYear(),
    m = now.getMonth() + 1;
  const prevY = m === 1 ? y - 1 : y,
    prevM = m === 1 ? 12 : m - 1;

  let thisMonth = $state(0),
    lastMonth = $state(0);
  let byCat = $state<CategoryTotals>({});

  $effect(() => {
    monthlyTotal(db, listId, y, m).then((v) => (thisMonth = v));
    monthlyTotal(db, listId, prevY, prevM).then((v) => (lastMonth = v));
    monthlyByCategory(db, listId, y, m).then((v) => (byCat = v));
  });

  const delta = $derived(monthDelta(thisMonth, lastMonth));
  const peso = (n: number) => '₱' + Math.round(n).toLocaleString('en-PH');
  const catLabel: Record<Category, string> = {
    karne: 'Karne',
    gulay: 'Gulay',
    condiments: 'Condiments',
    bigas: 'Bigas',
    iba_pa: 'Iba pa',
  };
  const catRows = $derived(
    CATEGORIES.map((c) => ({ c, total: byCat[c] ?? 0 }))
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total),
  );
  const maxCat = $derived(catRows.length ? catRows[0].total : 1);
  const compareMax = $derived(Math.max(thisMonth, lastMonth, 1));
  const compareData = $derived([
    { label: 'Nakaraan', value: lastMonth },
    { label: 'Ngayon', value: thisMonth },
  ]);
</script>

<section class="screen">
  <h1>Gastos</h1>

  <div class="card">
    <div class="lbl">Ngayong buwan</div>
    <div class="hero">{peso(thisMonth)}</div>
    {#if lastMonth > 0}
      <span class="chip">{delta >= 0 ? '▲' : '▼'} {peso(Math.abs(delta))} vs nakaraan</span>
    {/if}
  </div>

  <div class="compare">
    <div class="compare-chart">
      <Chart
        data={compareData}
        x="label"
        y="value"
        xScale={scaleBand().padding(0.3)}
        yScale={scaleLinear()}
        yDomain={[0, compareMax]}
        padding={{ top: 8, bottom: 4, left: 0, right: 0 }}
      >
        <Svg>
          <Bars radius={4} class="compare-bar" />
        </Svg>
      </Chart>
    </div>
    <div class="compare-labels">
      <div class="cl"><span class="cl-name">Nakaraan</span><span class="cl-amt">{peso(lastMonth)}</span></div>
      <div class="cl"><span class="cl-name">Ngayon</span><span class="cl-amt">{peso(thisMonth)}</span></div>
    </div>
  </div>

  <div class="lbl">Saan napunta</div>
  <div class="cats">
    {#each catRows as r (r.c)}
      {@const Icon = categoryIcon(r.c)}
      <div class="cat">
        <Icon size={20} />
        <div class="grow">
          <div class="cat-top"><span>{catLabel[r.c]}</span><span class="price">{peso(r.total)}</span></div>
          <div class="track"><div class="fill" style="width:{(r.total / maxCat) * 100}%"></div></div>
        </div>
      </div>
    {/each}
    {#if catRows.length === 0}<p class="empty">Wala pang gastos ngayong buwan.</p>{/if}
  </div>
</section>

<style>
  .screen {
    padding: var(--sp-screen);
    padding-bottom: 80px;
  }
  h1 {
    font-size: 22px;
  }
  .card {
    background: var(--c-surface);
    border-radius: var(--radius);
    padding: 16px;
    text-align: center;
  }
  .lbl {
    color: var(--c-ink-soft);
    font-size: var(--fs-label);
    margin: 18px 0 8px;
  }
  .card .lbl {
    margin: 0;
  }
  .hero {
    font-size: var(--fs-hero);
    font-weight: 800;
  }
  .chip {
    display: inline-block;
    background: var(--c-emphasis);
    border-radius: 999px;
    padding: 4px 10px;
    font-size: 13px;
    font-weight: 700;
    margin-top: 6px;
  }
  .compare {
    margin-top: 14px;
  }
  .compare-chart {
    height: 120px;
  }
  :global(.compare-bar) {
    fill: var(--c-accent);
  }
  .compare-labels {
    display: flex;
    margin-top: 6px;
  }
  .cl {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .cl-name {
    font-size: 12px;
    color: var(--c-ink-soft);
  }
  .cl-amt {
    font-size: 14px;
    font-weight: 700;
  }
  .cats {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .cat {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .grow {
    flex: 1;
  }
  .cat-top {
    display: flex;
    justify-content: space-between;
  }
  .price {
    font-weight: 700;
  }
  .track {
    height: 8px;
    background: var(--c-surface);
    border-radius: 4px;
    margin-top: 5px;
  }
  .fill {
    height: 100%;
    background: var(--c-accent);
    border-radius: 4px;
  }
  .empty {
    color: var(--c-ink-soft);
  }
</style>
