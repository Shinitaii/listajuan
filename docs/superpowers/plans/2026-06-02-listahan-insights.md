# Listahan Insights Implementation Plan (Plan 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the two Insights screens — Price History (per item) and Monthly Gastos — plus a minimal Items library list that links into price history, and a Playwright end-to-end smoke of the core logging loop.

**Architecture:** Continues Plan 2 (Svelte 5 runes + svelte-spa-router@5 + Firestore data layer behind `src/lib/data/`). Adds: `category` denormalized onto each `TripItem` (so monthly category spend is self-contained and historically accurate); a `monthlyByCategory` data fn; charts via `layerchart`; and a Playwright e2e harness that boots the built app against the Firestore emulator.

**Tech Stack:** Svelte 5, svelte-spa-router@5, layerchart@1.x, lucide-svelte, Firebase v12, Vitest + Firestore emulator, @playwright/test.

**Builds on:** Plan 1 + Plan 2 (both merged to `main`). Spec: `docs/superpowers/specs/2026-06-01-listahan-v1-design.md` (Screens 4 "Presyo History — B" and 6 "Buwanang Gastos — A"). Plan 2 carry-forward notes list the gaps this plan closes.

---

## Conventions (unchanged from Plan 2)

- No emoji; Lucide icons only. Filipino-first copy. Forgiving input; the only confirmation is delete-trip.
- Offline-first; no write spinners. Emulator tests serial (`npm run test:emulator`); kill stale java first: `powershell -Command "Get-Process java -ErrorAction SilentlyContinue | Stop-Process -Force"`.
- Charts: prefer layerchart components; the implementer MUST verify exact component names/props against the installed `node_modules/layerchart` types (1.x), adjusting the markup below if the API differs. Keep the accessibility-first look (large numbers, high contrast, no tiny axis text).

## File Structure

```
src/lib/domain/types.ts        (extend) TripItem gains `category: Category`
src/lib/data/trips.ts          (extend) addTripItem writes category; monthlyByCategory(year,month)
src/lib/data/items.ts          (already has subscribeItems)
src/lib/state/draft.svelte.ts  (verify) addToDraft passes category through
src/routes/LogTrip.svelte      (modify) pass picked.category into addToDraft
src/routes/ItemHistory.svelte  (new)  /item/:itemId — giant last price + sparkline + receipts
src/routes/Items.svelte        (replace stub) minimal library list → links to /item/:itemId
src/routes/Gastos.svelte       (replace stub) this-vs-last + 2-bar compare + category bars
src/App.svelte                 (modify) add route '/item/:itemId'
e2e/core-loop.spec.ts          (new) Playwright core-loop smoke + screenshots
playwright.config.ts           (new)
package.json                   (modify) add e2e scripts
```

---

## Task 1: Denormalize `category` onto TripItem (emulator TDD)

**Why:** Monthly category spend ("Saan napunta") must group by category. tripItems lack it; the item carries it. Denormalizing matches the existing `uid`/`tripDate` pattern, keeps the Gastos query self-contained, and records the category as it was at purchase time.

**Files:** Modify `src/lib/domain/types.ts`, `src/lib/data/trips.ts`; Test `src/lib/data/trips.emulator.test.ts`.

- [ ] **Step 1: Add `category` to `TripItem`** in `types.ts`:

```ts
  uid: string;        // owner uid, denormalized so collectionGroup queries can be scoped + secured
  addedAt: number;    // client ms timestamp; defines insertion order within a trip
  category: Category; // denormalized from the item at purchase time, for monthly category spend
}
```

(`Category` is already exported from this file — ensure the interface still compiles.)

- [ ] **Step 2: Thread `category` through `addTripItem`.** Add it to `NewTripItemInput` and write it on the doc. In `trips.ts`:

```ts
export interface NewTripItemInput {
  itemId: string;
  label: string;
  quantity: number | null;
  unit: Unit;
  pricePaid: number | null;
  vendor: string | null;
  category: Category;   // NEW
}
```

In `addTripItem`, add `category: input.category,` to the constructed `tripItem` object. Add `Category` to the type import from `'../domain/types'`.

- [ ] **Step 3: Update the existing emulator tests that call `addTripItem`** to pass a `category` (use `'karne'` for Liempo/Chicken, etc.). This is a compile-forced change across `trips.emulator.test.ts` and `subscriptions.emulator.test.ts`. Add `category: 'karne'` (or a sensible value) to every `addTripItem(...)` input literal.

- [ ] **Step 4: Add the failing `monthlyByCategory` test** (append to `trips.emulator.test.ts`):

```ts
import { monthlyByCategory } from './trips';

describe('monthlyByCategory', () => {
  it('sums saved-trip spend per category within the month, excluding drafts/other months', async () => {
    const karne = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', defaultUnit: 'kg' });
    const gulay = await createItem(ctx.db, ctx.uid, { canonicalName: 'Kamatis', category: 'gulay', defaultUnit: 'kg' });
    const t = await createDraftTrip(ctx.db, ctx.uid, { name: 'A', storeName: 'C', date: '2026-06-03' });
    await addTripItem(ctx.db, ctx.uid, t.id, { itemId: karne.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, vendor: null, category: 'karne' });
    await addTripItem(ctx.db, ctx.uid, t.id, { itemId: gulay.id, label: 'Kamatis', quantity: 1, unit: 'kg', pricePaid: 60, vendor: null, category: 'gulay' });
    await saveTrip(ctx.db, ctx.uid, t.id);
    // draft in-month: excluded
    const d = await createDraftTrip(ctx.db, ctx.uid, { name: 'D', storeName: 'C', date: '2026-06-10' });
    await addTripItem(ctx.db, ctx.uid, d.id, { itemId: karne.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 999, vendor: null, category: 'karne' });

    const byCat = await monthlyByCategory(ctx.db, ctx.uid, 2026, 6);
    expect(byCat.karne).toBe(320);
    expect(byCat.gulay).toBe(60);
    expect(byCat.condiments ?? 0).toBe(0);
  });
});
```

- [ ] **Step 5: Run `npm run test:emulator` — confirm FAIL** (monthlyByCategory missing; and confirm the category additions compile).

- [ ] **Step 6: Implement `monthlyByCategory`** (append to `trips.ts`). Saved-only semantics require going trip-by-trip (tripItems don't carry trip status), which is correct and needs no new index:

```ts
export type CategoryTotals = Partial<Record<Category, number>>;

export async function monthlyByCategory(
  db: Firestore, uid: string, year: number, month: number,
): Promise<CategoryTotals> {
  const { startISO, endISO } = monthRange(year, month);
  const tripsQ = query(
    tripsCol(db, uid),
    where('status', '==', 'saved'),
    where('date', '>=', startISO),
    where('date', '<', endISO),
  );
  const tripsSnap = await getDocs(tripsQ);
  const totals: CategoryTotals = {};
  for (const tripSnap of tripsSnap.docs) {
    const items = await getTripItems(db, uid, tripSnap.id);
    for (const ti of items) {
      if (ti.pricePaid == null) continue;
      totals[ti.category] = (totals[ti.category] ?? 0) + ti.pricePaid;
    }
  }
  return totals;
}
```

(Ensure `Category` is imported in `trips.ts`.)

- [ ] **Step 7: Run `npm run test:emulator` — confirm ALL PASS.**

- [ ] **Step 8: Commit** `git add src/lib/domain/types.ts src/lib/data/trips.ts src/lib/data/*.emulator.test.ts && git -c commit.gpgsign=false commit -m "feat: denormalize category onto tripItems; add monthlyByCategory"`

---

## Task 2: Thread category through the draft/LogTrip caller

**Files:** Verify `src/lib/state/draft.svelte.ts` (its `addToDraft` forwards `NewTripItemInput` as-is, so it already passes `category` through once the type includes it — confirm it compiles). Modify `src/routes/LogTrip.svelte` to supply `category`.

- [ ] **Step 1: In `LogTrip.svelte` `saveItem()`**, pass the picked item's category:

```ts
  async function saveItem() {
    await addToDraft(uid, {
      itemId: picked!.id, label: pickedLabel, quantity: qty, unit, pricePaid: price, vendor: null,
      category: picked!.category,
    });
    picked = null; pickedLabel = ''; qty = 1; price = null; step = 1;
  }
```

(`picked` is an `Item`, which has `category`. New items created via `createItem(..., { category: 'iba_pa' })` already carry it.)

- [ ] **Step 2: Verify** `npm run check` (0 errors) and `npm run build` (clean).

- [ ] **Step 3: Commit** `git add src/routes/LogTrip.svelte src/lib/state/draft.svelte.ts && git -c commit.gpgsign=false commit -m "feat: record item category on each logged tripItem"`

---

## Task 3: Install layerchart

**Files:** `package.json`.

- [ ] **Step 1:** `npm install layerchart`

- [ ] **Step 2: Inspect the installed API** so later tasks use the correct component names/props. Read `node_modules/layerchart/dist/index.js` exports (or the package's `dist/*.d.ts`) and note the components for: a line/area sparkline, and a simple bar chart. Record the exact import path and component names (e.g. `Chart`, `Svg`, `Area`, `Spline`, `Bars`, `Axis`) as a comment in the first chart component you build. If layerchart's 1.x API differs from the markup in Tasks 4/6, ADAPT the markup to the installed API (the data-shaping code stays the same).

- [ ] **Step 3: Verify** `npm run build` (clean with the new dep).

- [ ] **Step 4: Commit** `git add package.json package-lock.json && git -c commit.gpgsign=false commit -m "chore: add layerchart for insights charts"`

---

## Task 4: Price History screen (`/item/:itemId`)

**Files:** Create `src/routes/ItemHistory.svelte`; modify `src/App.svelte` to add the route.

Spec Screen 4 — "B": giant last-price number answering "Magkano nung huli?", a quiet sparkline with low/high range, then a receipts list (each tripDate · vendor · qty · price).

- [ ] **Step 1: Add the route to `src/App.svelte`** routes map and import:

```ts
  import ItemHistory from './routes/ItemHistory.svelte';
  // ...
  const routes = {
    '/': Home,
    '/biyahe': Biyahe,
    '/items': Items,
    '/gastos': Gastos,
    '/log/:tripId': LogTrip,
    '/trip/:tripId': TripSummary,
    '/item/:itemId': ItemHistory,   // NEW
  };
```

- [ ] **Step 2: Implement `ItemHistory.svelte`.** Data: `priceHistory(db, uid, itemId)` (Plan 1) returns `TripItem[]` newest-first; the item doc gives `canonicalName`/`lastPriceUnit`. Adapt the layerchart markup to the installed API (Task 3).

```svelte
<script lang="ts">
  import { session } from '../lib/state/session.svelte';
  import { db } from '../lib/data/firebase';
  import { priceHistory } from '../lib/data/trips';
  import { getItem } from '../lib/data/items';
  import type { Item, TripItem } from '../lib/domain/types';
  // import { Chart, Svg, Spline, Points } from 'layerchart'; // VERIFY names against installed 1.x API

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
  const series = $derived([...history].reverse().map((h) => ({ date: h.tripDate, price: h.pricePaid ?? 0 })));
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
      <!-- layerchart sparkline. VERIFY component API against installed layerchart 1.x.
           x = date, y = price. Keep it minimal: a single line/spline, no heavy axes. -->
      <!--
      <Chart data={series} x="date" y="price" let:width let:height>
        <Svg><Spline class="stroke-accent" /></Svg>
      </Chart>
      -->
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
  .range { display: flex; justify-content: space-between; color: var(--c-ink-soft); font-size: 12px; }
  .row { display: flex; justify-content: space-between; align-items: center; padding: 11px 4px; border-bottom: 1px solid var(--c-surface); }
  .name { font-weight: 700; } .price { font-size: var(--fs-price); font-weight: 700; }
</style>
```

If wiring the layerchart Spline takes more than a reasonable attempt, render the sparkline as a minimal inline `<svg><polyline>` fallback computed from `series` (normalize prices to the viewbox) — the screen must still ship. Note in the commit if you fell back.

- [ ] **Step 3: Verify** `npm run check`, `npm run build`. Manual (emulator): create an item bought across ≥2 trips, open `/item/:id`, confirm the giant last price, low/high, sparkline, and receipts list render.

- [ ] **Step 4: Commit** `git add src/routes/ItemHistory.svelte src/App.svelte && git -c commit.gpgsign=false commit -m "feat: per-item price history screen (last price, sparkline, receipts)"`

---

## Task 5: Items library list (entry point to price history)

**Files:** Replace `src/routes/Items.svelte` (stub) with a minimal read-only list. (Full library management — rename, recategorize, merge aliases — stays deferred.)

Uses the already-running `library` rune (`library.items`). Each row shows the item name, category icon, and last price; tapping routes to `/item/:id`.

- [ ] **Step 1: Implement `Items.svelte`:**

```svelte
<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { library } from '../lib/state/library.svelte';
  import { categoryIcon } from '../lib/ui/categoryIcon';

  const peso = (n: number | null) => (n == null ? '—' : '₱' + Math.round(n));
  const sorted = $derived([...library.items].sort((a, b) => a.canonicalName.localeCompare(b.canonicalName)));
</script>

<section class="screen">
  <h1>Mga item</h1>
  <div class="list">
    {#each sorted as it (it.id)}
      {@const Icon = categoryIcon(it.category)}
      <button class="row" onclick={() => push(`/item/${it.id}`)}>
        <Icon size={22} />
        <div class="grow"><div class="name">{it.canonicalName}</div>
          <div class="sub">{it.purchaseCount} biyahe</div></div>
        <div class="price">{peso(it.lastPrice)}{it.lastPriceUnit ? '/' + it.lastPriceUnit : ''}</div>
      </button>
    {/each}
    {#if sorted.length === 0}<p class="empty">Wala pang item. Magsimula ng biyahe.</p>{/if}
  </div>
</section>

<style>
  .screen { padding: var(--sp-screen); padding-bottom: 80px; }
  h1 { font-size: 22px; }
  .list { display: flex; flex-direction: column; }
  .row { display: flex; align-items: center; gap: 10px; padding: 11px 4px; background: none; border: none;
    border-bottom: 1px solid var(--c-surface); text-align: left; width: 100%; }
  .grow { flex: 1; } .name { font-weight: 700; } .sub { color: var(--c-ink-soft); font-size: 13px; }
  .price { font-size: var(--fs-price); font-weight: 700; }
  .empty { color: var(--c-ink-soft); }
</style>
```

- [ ] **Step 2: Verify** `npm run check`, `npm run build`. Manual: Items tab lists library items; tap → price history.

- [ ] **Step 3: Commit** `git add src/routes/Items.svelte && git -c commit.gpgsign=false commit -m "feat: minimal items library list linking to price history"`

---

## Task 6: Monthly Gastos screen

**Files:** Replace `src/routes/Gastos.svelte` (stub).

Spec Screen 6 — "A": big this-month number, a single this-vs-last delta chip, a 2-bar compare, and "Saan napunta" category proportion bars (no pie, no percentages). Month picker top-right is OPTIONAL for v1 — default to the current month; a simple ‹ › month stepper is acceptable but not required.

- [ ] **Step 1: Implement `Gastos.svelte`:**

```svelte
<script lang="ts">
  import { session } from '../lib/state/session.svelte';
  import { db } from '../lib/data/firebase';
  import { monthlyTotal, monthlyByCategory, type CategoryTotals } from '../lib/data/trips';
  import { monthDelta } from '../lib/domain/calc';
  import { categoryIcon } from '../lib/ui/categoryIcon';
  import { CATEGORIES, type Category } from '../lib/domain/types';
  // import { Chart, Svg, Bars } from 'layerchart'; // VERIFY against installed layerchart 1.x

  const uid = session.uid!;
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + 1;
  const prevY = m === 1 ? y - 1 : y, prevM = m === 1 ? 12 : m - 1;

  let thisMonth = $state(0), lastMonth = $state(0);
  let byCat = $state<CategoryTotals>({});

  $effect(() => {
    monthlyTotal(db, uid, y, m).then((v) => (thisMonth = v));
    monthlyTotal(db, uid, prevY, prevM).then((v) => (lastMonth = v));
    monthlyByCategory(db, uid, y, m).then((v) => (byCat = v));
  });

  const delta = $derived(monthDelta(thisMonth, lastMonth));
  const peso = (n: number) => '₱' + Math.round(n).toLocaleString('en-PH');
  const catLabel: Record<Category, string> = {
    karne: 'Karne', gulay: 'Gulay', condiments: 'Condiments', bigas: 'Bigas', iba_pa: 'Iba pa',
  };
  // category rows sorted by spend desc, omitting zeros
  const catRows = $derived(
    CATEGORIES.map((c) => ({ c, total: byCat[c] ?? 0 }))
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total),
  );
  const maxCat = $derived(catRows.length ? catRows[0].total : 1);
  const compareMax = $derived(Math.max(thisMonth, lastMonth, 1));
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

  <!-- 2-bar compare (this vs last). Use layerchart Bars if wired; else the CSS bars below. -->
  <div class="compare">
    <div class="bar-col"><div class="bar" style="height:{(lastMonth / compareMax) * 100}%"></div><span>Nakaraan</span></div>
    <div class="bar-col"><div class="bar on" style="height:{(thisMonth / compareMax) * 100}%"></div><span>Ngayon</span></div>
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
  .screen { padding: var(--sp-screen); padding-bottom: 80px; }
  h1 { font-size: 22px; }
  .card { background: var(--c-surface); border-radius: var(--radius); padding: 16px; text-align: center; }
  .lbl { color: var(--c-ink-soft); font-size: var(--fs-label); margin: 18px 0 8px; }
  .card .lbl { margin: 0; }
  .hero { font-size: var(--fs-hero); font-weight: 800; }
  .chip { display: inline-block; background: var(--c-emphasis); border-radius: 999px; padding: 4px 10px; font-size: 13px; font-weight: 700; margin-top: 6px; }
  .compare { display: flex; gap: 24px; justify-content: center; align-items: flex-end; height: 110px; margin-top: 14px; }
  .bar-col { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; gap: 6px; }
  .bar { width: 56px; background: var(--c-ink-soft); border-radius: 8px 8px 0 0; min-height: 4px; }
  .bar.on { background: var(--c-accent); }
  .bar-col span { font-size: 12px; color: var(--c-ink-soft); }
  .cats { display: flex; flex-direction: column; gap: 12px; }
  .cat { display: flex; align-items: center; gap: 10px; }
  .grow { flex: 1; }
  .cat-top { display: flex; justify-content: space-between; }
  .price { font-weight: 700; }
  .track { height: 8px; background: var(--c-surface); border-radius: 4px; margin-top: 5px; }
  .fill { height: 100%; background: var(--c-accent); border-radius: 4px; }
  .empty { color: var(--c-ink-soft); }
</style>
```

NOTE: This screen ships working CSS proportion bars (spec says "simple proportion bars — no pie charts, no percentages", which these satisfy). The layerchart import is OPTIONAL here — if the 2-bar compare reads better via layerchart, swap it in, but the CSS version is acceptable and dependency-free. Use layerchart where it clearly improves on CSS; don't force it.

- [ ] **Step 2: Verify** `npm run check`, `npm run build`. Manual (emulator): with saved trips this and last month across categories, Gastos shows the totals, delta chip, 2-bar compare, and category bars; drafts excluded.

- [ ] **Step 3: Commit** `git add src/routes/Gastos.svelte && git -c commit.gpgsign=false commit -m "feat: monthly Gastos screen (this-vs-last, compare bars, category breakdown)"`

---

## Task 7: Playwright e2e — core-loop smoke

**Files:** Create `playwright.config.ts`, `e2e/core-loop.spec.ts`; modify `package.json`. This boots the built app against the Firestore emulator and drives the core loop, capturing screenshots. Web layer only (NOT the Capacitor native shell).

- [ ] **Step 1: Install** `npm install -D @playwright/test` then `npx playwright install chromium` (downloads the browser).

- [ ] **Step 2: Add `playwright.config.ts`.** It serves the built app via `vite preview` and assumes the emulator is started by the npm script (Step 5). The app must run in emulator mode, so the e2e script sets `VITE_USE_EMULATOR=true` at build time (the `.env` already has it for local dev; the config relies on a build produced with that env).

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: { baseURL: 'http://localhost:4173', screenshot: 'only-on-failure' },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
```

- [ ] **Step 3: Add e2e scripts to `package.json`.** The emulator must wrap the Playwright run so Firestore/Auth are available:

```json
"e2e": "firebase emulators:exec --only auth,firestore \"playwright test\"",
"e2e:headed": "firebase emulators:exec --only auth,firestore \"playwright test --headed\""
```

- [ ] **Step 4: Write `e2e/core-loop.spec.ts`.** Drive the loop with accessible/text selectors (Filipino copy). Because writes are optimistic + offline-cached, prefer waiting on visible text over network.

```ts
import { test, expect } from '@playwright/test';

test('core logging loop: start trip → log an item → finish → summary', async ({ page }) => {
  await page.goto('/');
  // Anonymous sign-in + Home render
  await expect(page.getByText('Gastos ngayong buwan')).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: 'e2e/__screens__/home.png' });

  // Start a trip
  await page.getByRole('button', { name: /Bagong biyahe/ }).click();

  // Step 1: create a brand-new item by typing then tapping "Bagong item"
  await expect(page.getByText('Anong idadagdag?')).toBeVisible();
  await page.getByPlaceholder('Hanapin o pumili…').fill('Liempo');
  await page.getByRole('button', { name: /Bagong item/ }).click();

  // Step 2: dami — bump the stepper, pick a unit
  await expect(page.getByText(/Ilang/)).toBeVisible();
  await page.getByRole('button', { name: 'Dagdagan' }).click();
  await page.getByRole('button', { name: 'Susunod' }).click();

  // Step 3: presyo
  await expect(page.getByText(/Magkano/)).toBeVisible();
  await page.getByRole('spinbutton').fill('320');
  await page.screenshot({ path: 'e2e/__screens__/log-presyo.png' });
  await page.getByRole('button', { name: /I-save ang item/ }).click();

  // Back at step 1; running total should reflect 320
  await expect(page.getByText('₱320')).toBeVisible();

  // Finish → summary
  await page.getByRole('button', { name: 'Tapos' }).click();
  await expect(page.getByText('Kabuuang gastos')).toBeVisible();
  await expect(page.getByText('₱320')).toBeVisible();
  await page.screenshot({ path: 'e2e/__screens__/summary.png' });
});

test('delete trip shows the single confirmation and returns home', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Gastos ngayong buwan')).toBeVisible({ timeout: 15000 });
  // open the most recent trip from Home
  const firstTrip = page.locator('button', { hasText: 'items' }).first();
  await firstTrip.click();
  await page.getByRole('button', { name: /Burahin ang biyahe/ }).click();
  await expect(page.getByText('Hindi na ito maibabalik.')).toBeVisible();
  await page.getByRole('button', { name: 'Oo, burahin' }).click();
  await expect(page.getByText('Gastos ngayong buwan')).toBeVisible();
});
```

Create `e2e/__screens__/.gitkeep` and gitignore the generated PNGs (add `e2e/__screens__/*.png` to `.gitignore`).

- [ ] **Step 5: Run `npm run e2e`.** Expected: both tests pass. NOTE: selectors above are best-effort against the Plan 2 markup — if a selector misses (e.g. the stepper's aria-label, the "Tapos" button is the X icon button with `aria-label="Tapos"`), FIX the selector to match the actual rendered DOM (inspect via `--headed` or the trace), not by weakening assertions. The X/finish button in LogTrip has `aria-label="Tapos"`. Adjust selectors as needed; the test intent (drive the real loop, assert visible Filipino text + total) must hold.

- [ ] **Step 6: Commit** `git add playwright.config.ts e2e package.json package-lock.json .gitignore && git -c commit.gpgsign=false commit -m "test: Playwright e2e smoke of the core logging loop"`

---

## Task 8: Full sweep

- [ ] **Step 1:** `npm test` — unit green.
- [ ] **Step 2:** kill java, `npm run test:emulator` — all data-layer tests green.
- [ ] **Step 3:** `npm run check` — 0 errors/0 warnings.
- [ ] **Step 4:** `npm run build` — clean.
- [ ] **Step 5:** `npm run e2e` — core-loop e2e green (screenshots written to `e2e/__screens__/`).
- [ ] **Step 6:** Review the screenshots: confirm NO emoji render, Filipino copy throughout, large prices/targets. Note anything off.
- [ ] **Step 7:** Commit any incidental fixes.

---

## Notes / carry-forward to a later plan (polish)

- **Full library management** (rename item, correct category after the fact, merge aliases, edit `defaultUnit`) — Items is read-only in this plan. Note: if a user recategorizes an item later, past tripItems keep their at-purchase category by design (Task 1).
- **Biyahe tab** (all-trips list, beyond Home's recent 20) is still a stub.
- **Swipe-to-remove a line item** (spec: item-level removal = swipe/undo) — `removeTripItem` exists in the data layer but no UI yet.
- **Month picker** on Gastos (browse past months) — current month only in v1.
- **Capacitor native shell** still unverified on a device (Playwright covers web only); do a manual `npx cap run android` pass before any release.
- If layerchart proved heavier than its value for these simple charts, consider dropping it for the inline-SVG/CSS approach already present as the fallback. (As built: layerchart IS used for the Gastos compare bars; the price-history sparkline uses inline SVG. Bundle is ~815 kB / ~264 kB gzip, mostly d3 — fine for a single-user offline app, but revisit if size matters.)
- **Copy nit:** TripSummary shows "1 items" — add singular/plural handling ("1 item" / "N items").
- **Emulator test flakiness:** `subscribeTripItems` still occasionally times out under emulator load and passes on re-run, even after raising timeouts. If it keeps recurring, consider awaiting a settle between the two `addTripItem` writes in that test, or a retry wrapper.
