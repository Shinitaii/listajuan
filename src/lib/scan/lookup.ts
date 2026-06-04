export interface LookupDeps {
  fetch?: typeof globalThis.fetch;
}

const endpoint = (code: string) =>
  `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name`;

/**
 * Best-effort external name suggestion for a barcode (cold-start only).
 * Never throws and never blocks meaningfully: offline / not-found / error all return null
 * so the caller falls back to manual entry. `fetch` is injectable for testing.
 */
export async function lookupProductName(code: string, deps: LookupDeps = {}): Promise<string | null> {
  const c = code.trim();
  if (!c) return null;
  const doFetch = deps.fetch ?? globalThis.fetch;
  try {
    const res = await doFetch(endpoint(c));
    if (!res.ok) return null;
    const data = (await res.json()) as { status?: number; product?: { product_name?: unknown } };
    if (data?.status !== 1) return null;
    const name = data.product?.product_name;
    if (typeof name !== 'string' || !name.trim()) return null;
    return name.trim();
  } catch {
    return null;
  }
}
