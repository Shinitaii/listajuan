# Contributing to ListaJuan

Thanks for working on ListaJuan. This guide covers how we build here. The short version: **accessibility-first product, TDD, and all Firebase access behind the data layer.**

## Before you start

Read these in order:

1. [`CLAUDE.md`](CLAUDE.md) — the load-bearing rules (also the working agreement for AI assistants).
2. The design spec: [`docs/superpowers/specs/2026-06-01-listahan-v1-design.md`](docs/superpowers/specs/2026-06-01-listahan-v1-design.md) — it records resolved product/UX choices. Read it before making product decisions.
3. [`docs/architecture-roadmap.md`](docs/architecture-roadmap.md) — where the architecture is headed.

## Setup

Requires **Node 20+**, **npm**, and a **Java runtime** (the Firestore emulator needs it — if emulator tests won't start, check Java).

```bash
npm install
npm run dev              # boots the Firebase emulators + Vite together (needs Java)
```

`.env.development` (committed, emulator config) drives `npm run dev` — no copying needed. For a build against real Firebase, `cp .env.example .env.production`, fill it in, then `npm run build` (or `npm run dev:prod` to run the dev server against real Firebase).

## How we work

### Test-driven development

This project uses TDD. Write the failing test, see it fail, implement the minimum to pass, see it pass, commit. The implementation plans in `docs/superpowers/plans/` are written this way — follow them step-by-step.

- `*.test.ts` — **pure** unit tests, no Firebase. Run with `npm test`. Domain calculations live in `src/lib/domain/` and must stay Firebase-free.
- `*.emulator.test.ts` — exercise the **data layer** against the Firestore emulator. Run with `npm run test:emulator`. Use the helper in `src/lib/data/testing/emulator.ts` (`setupEmulator`/`teardownEmulator`/`clearFirestore`); clear Firestore in `beforeEach`.
- Emulator tests run **serially** (`--no-file-parallelism`): they share one emulator and each clears the whole DB, so parallel files would wipe each other.
- End-to-end smoke lives in `e2e/` and runs with `npm run e2e` (boots the emulator + a preview build via Playwright).

Run a single test:

```bash
npx vitest run path/to/file.test.ts
npx vitest run -t "test name substring"
```

### Architecture rules (do not break these)

1. **Never import `firebase/firestore` in a component.** All Firebase access goes through `src/lib/data/`. Components import functions/stores (`saveTrip`, `searchItems`, `priceHistory`, …).
2. **Keep `src/lib/domain/` pure** — no Firebase imports; plain unit tests.
3. **Offline-first**: writes resolve optimistically from the local cache. Never block the UI on the network, never show a spinner on a write.
4. **Reactive state** belongs in `src/lib/state/*.svelte.ts` (Svelte 5 runes) wrapping the data layer's `onSnapshot` subscriptions — not ad hoc in components.
5. **No new API server.** Persistence is the Firebase client SDK. Shared/external data may use Firebase Cloud Functions; user data stays client-only.

### UI conventions

- **Filipino-first** copy (Tagalog). English only as a code comment / translation reference — never shipped. (A real i18n layer is a planned next step; until then, keep user-facing strings together and easy to extract.)
- **No emoji** in the shipped UI. Use `lucide-svelte` icons.
- **Accessibility-first sizing**: body ≥16px, prices/quantities ≥20px, tap targets ≥44×44pt. Tokens live in `src/lib/ui/tokens.css`.
- **One confirmation dialog only** (delete trip). Everything else is inline edit or undo-friendly. Don't add confirmations.
- Prefer recognition over recall (tiles, last-price prefill) over typing.

## Commits & branches

- **Branch off `main`** for any change; don't commit feature work directly to `main`.
- Keep commits focused; write clear messages (we use Conventional Commit prefixes: `feat:`, `fix:`, `chore:`, `test:`, `docs:`).
- Don't bypass hooks or signing.

## Definition of done

Before opening a PR / merging, all of these must pass:

```bash
npm test               # pure unit tests green
npm run test:emulator  # data-layer tests green (needs Java)
npm run check          # 0 errors, 0 warnings
npm run build          # clean build
```

For UI changes, also run `npm run e2e` (or manually drive `npm run dev` against the emulator) and confirm: no emoji rendered, Filipino copy throughout, large tap targets, and the change works **offline**.

## Larger changes

For anything beyond a small fix, follow the spec → plan → implement flow already used in `docs/superpowers/`: agree on the design (spec), write a step-by-step plan, then implement it TDD-style. This keeps the accessibility-first intent and the architecture rules intact.
