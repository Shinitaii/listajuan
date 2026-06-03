# Barcode → Name Prefill

## Problem
Logging a packaged product means typing its name — slow and error-prone one-handed at the
market, and worse for long/abbreviated brand names. Most packaged goods carry a barcode that
uniquely identifies them. Scanning should prefill the name so the user confirms instead of types.

## Stakeholders
| Role | Friction | Effort they'll accept |
| User (household manager) | Typing packaged-product names is slow/awkward | Point camera, confirm a prefilled name |
| Builder (you) | Must respect offline-first + no-API-server rules | Library-first, API only as best-effort cold-start |

## Core Feature
Scan a product barcode → if it matches a library item, prefill that item's name; if not and
online, look it up externally and prefill a name for a new item; otherwise fall back to manual
entry. The user always confirms before saving — recognition over recall.

## Must-Have
- Scan a barcode via the device camera (Capacitor plugin), with a graceful no-camera path in dev/web.
- **Library-first match:** a scanned code already on a library item prefills its name, fully offline.
- Store scanned codes on the matched/created item (`barcodes: string[]`) so future scans match locally.
- **API fallback (cold-start only):** unmatched + online → fetch a name suggestion; user confirms.
- Offline or not-found → existing manual name entry, no error, no blocking.

## Should-Have
- Show where a prefilled name came from (library vs suggested) so the user trusts it.

## Won't-Have (scope boundaries)
- Nutrition facts / macros (separate later feature — though the API groundwork may enable it).
- Receipt OCR (separate, harder feature).
- Price/quantity from barcode (barcodes don't carry price; out of scope).
- Any self-hosted API server (explicitly forbidden by CLAUDE.md).
- Bulk/continuous scanning — one product at a time, matching the one-decision-per-screen flow.

## Success Metrics
- A scanned, previously-seen product prefills its name with **zero typing**, offline.
- First-time packaged products get a usable name suggestion when online ≥ most of the time.
- No regression to manual entry: scanning never blocks or errors the existing add-item flow.

## Architecture Notes (from context.md — binding)
- All Firestore access behind `src/lib/data/`; barcode match follows the `searchItems` client-side pattern.
- Offline-first: scan + library match work offline; only the API suggestion uses the network, best-effort.
- Stack: Svelte 5 + Capacitor 8 + Firestore; tests in **Vitest** (pure `*.test.ts` + `*.emulator.test.ts`).
- New dependency: a Capacitor barcode-scanning plugin (+ `cap sync`); web/dev capability guard.
