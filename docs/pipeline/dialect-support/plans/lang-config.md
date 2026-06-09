# lang-config Module Plan

## Files

- `src/lib/voice/lang.ts` — implementation
- `src/lib/voice/lang.test.ts` — Vitest tests

## Exports

### `interface DialectOption`
```ts
interface DialectOption { label: string; lang: string }
```

### `DIALECT_OPTIONS: DialectOption[]`
Four entries in order:
| index | label    | lang    |
|-------|----------|---------|
| 0     | Tagalog  | fil-PH  |
| 1     | Bisaya   | fil-PH  |
| 2     | Ilocano  | fil-PH  |
| 3     | Ingles   | en-PH   |

### `getDialect(): string`
- Reads `localStorage.getItem('voice_dialect')`.
- Returns `'fil-PH'` if the value is absent (null/empty) or if localStorage throws.
- Returns the stored string otherwise.

### `setDialect(lang: string): void`
- Writes `localStorage.setItem('voice_dialect', lang)`.
- Silently swallows any error (no throw, no console output required).

## Safeguards
- Both localStorage calls are wrapped in try/catch.
- No external dependencies; pure TypeScript with no side effects at module load time.

## Review
All exports are correctly typed with explicit return types matching the interface. `getDialect` defaults safely via try/catch and a null-check, never throws to callers. `setDialect` is a single try/catch with no observable side effects on failure — clean and minimal.
