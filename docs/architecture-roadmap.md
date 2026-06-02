# Listahan — Architecture & Roadmap Assessment

**Date:** 2026-06-02
**Status:** Living document. Captures the post-v1 (Plans 1–3 merged) assessment of whether the current architecture naturally scales to the planned future features.

## Where we are

v1 core loop is built and merged: **log a grocery trip → items build price history → "magkano nung huli?" per-item history → monthly spend (Gastos)**. Stack: Svelte 5 (runes) + Capacitor + Firebase client SDK (no API server), offline-first (`persistentLocalCache`), anonymous auth, data isolated behind `src/lib/data/`. See `CLAUDE.md` and `docs/superpowers/specs/2026-06-01-listahan-v1-design.md`.

The first automation layer works: a logged price denormalizes onto the item (`lastPrice`) and **prefills/estimates** the next time that item is logged.

## Verdict

The architecture is **mostly natural and scalable** for the roadmap — by design. Most future features are *additive* and several *build on* existing foundations. Three things need real decisions; one of them flexes the "no API server" principle (gracefully, via serverless functions).

## Foundations that already scale (used by future features)

- **Live `onSnapshot` subscriptions** → real-time sync already exists; collaboration is a data-scoping + auth problem, not a realtime-plumbing problem.
- **`/users/{uid}/…` subtree scoping** → chosen so a move to `/households/{hid}/…` is a clean subtree migration.
- **Item library + denormalized price history + `searchLibrary`** → the matching layer that voice, barcode, OCR, and price-estimate all reuse (messy input → known item).
- **Data-layer isolation (`src/lib/data/`)** → new data sources (barcode API, DA prices, OCR) slot in as new functions without touching components.

## Per-feature fit

| Future feature | Fit | What it needs |
|---|---|---|
| "In cart" / recently-added tracker | Easy | A field on tripItem (`addedAt` already exists) |
| Voice → item entry | Natural | Capacitor speech plugin → existing `searchLibrary` |
| Barcode → product name | Additive | Capacitor barcode plugin + external product API (Open Food Facts); online-only, degrade gracefully |
| Nutritional facts | Additive | Same barcode/Open Food Facts lookup → new `Item` fields |
| English + Bisaya/Ilocano | Needs groundwork | An **i18n layer** (strings are currently hardcoded Tagalog) |
| Collaboration (family adds mid-trip) | Anticipated migration | `users→households` scoping + **real (linkable) auth** + rules |
| Receipt camera OCR | Hard, but foundation helps | OCR (ML Kit) + parsing; price history aids disambiguation |
| DA NCR wet-market price scraping | Breaks "no API server" | Server-side scheduled job (Firebase Cloud Functions) |

## The three decisions that need attention

1. **"No API server" survives everything except DA price scraping.** All user-generated data stays client-only. DA NCR daily data can't be scraped client-side (CORS, fragility, and it should be ONE shared dataset). Natural fix: a **Firebase Cloud Function** (scheduled) scrapes DA → writes a shared `/marketPrices/…` collection → clients read it. This is additive serverless compute in the same Firebase project, not a separate API server. Recommended principle update: *"no API server for user data; serverless functions allowed for shared/external data."* Limitation: NCR wet markets only.

2. **Anonymous-only auth must become linkable before collaboration.** Distinct family members can't share one anonymous device identity. Already anticipated ("anonymous now, linkable later"). Collaboration's prerequisite = finish the auth upgrade (link Google) + the `households` migration. Realtime sync is already in place.

3. **i18n is the gap to address proactively, soon.** Every screen currently hardcodes Tagalog strings; each new screen adds more. Retrofitting an i18n layer (e.g. Paraglide or svelte-i18n) later across many screens is far more painful than introducing it now while the surface is small. Doesn't block anything; the cost just grows with every screen.

## Scalability caveats (NOT near-term for a single household)

- `searchLibrary` loads the whole item library into memory and filters — fine for a household's few-hundred items; only needs server-side search at implausible scale.
- `monthlyByCategory` does N+1 reads (per trip in the month) — fine for a household; years-of-data dashboards would want aggregation.

## Recommended sequencing

1. **i18n layer** (cheap now, expensive later).
2. **Auth upgrade (link Google) + `households` migration** (unlocks collaboration; realtime already there).
3. **Additive lookups**: barcode → name, voice entry, nutrition, in-cart tracker (reuse the library/search layer).
4. **DA NCR price scraping** (introduces Firebase Cloud Functions; NCR wet markets only).
5. **Receipt OCR** (most effort; needs ML + parsing; price history aids disambiguation).
