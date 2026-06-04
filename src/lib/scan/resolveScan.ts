import type { Item } from '../domain/types';

export type ScanOutcome =
  | { kind: 'library'; item: Item }
  | { kind: 'suggested'; name: string; code: string }
  | { kind: 'manual'; code: string };

export interface ResolveScanDeps {
  findItemByBarcode: (code: string) => Promise<Item | null>;
  lookupProductName: (code: string) => Promise<string | null>;
  isOnline: () => boolean;
}

/**
 * The scan decision brain — pure orchestration, no I/O of its own (deps are injected).
 * Library-first: a known code resolves to its item offline and never touches the API.
 * Cold-start: an unknown code, only when online, gets a best-effort name suggestion.
 * Otherwise (offline or not found) → manual entry, with the code preserved so it can be
 * attached to whatever item the user ends up choosing/creating (teaching the library).
 */
export async function resolveScannedCode(code: string, deps: ResolveScanDeps): Promise<ScanOutcome | null> {
  const c = code.trim();
  if (!c) return null;

  const item = await deps.findItemByBarcode(c);
  if (item) return { kind: 'library', item };

  if (deps.isOnline()) {
    const name = await deps.lookupProductName(c);
    if (name) return { kind: 'suggested', name, code: c };
  }

  return { kind: 'manual', code: c };
}
