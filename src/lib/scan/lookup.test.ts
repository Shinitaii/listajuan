import { describe, it, expect } from 'vitest';
import { lookupProductName } from './lookup';

function fakeFetch(response: unknown, opts: { ok?: boolean; throws?: boolean } = {}) {
  const { ok = true, throws = false } = opts;
  return (async () => {
    if (throws) throw new Error('network down');
    return { ok, json: async () => response } as Response;
  }) as typeof globalThis.fetch;
}

describe('lookupProductName', () => {
  it('returns the product name when found', async () => {
    const fetch = fakeFetch({ status: 1, product: { product_name: 'Century Tuna 180g' } });
    expect(await lookupProductName('4800024847857', { fetch })).toBe('Century Tuna 180g');
  });

  it('returns null when the product is not found (status 0)', async () => {
    const fetch = fakeFetch({ status: 0 });
    expect(await lookupProductName('0000000000000', { fetch })).toBeNull();
  });

  it('returns null on network error (offline)', async () => {
    const fetch = fakeFetch(null, { throws: true });
    expect(await lookupProductName('4800024847857', { fetch })).toBeNull();
  });

  it('returns null when the name is missing or blank', async () => {
    const fetch = fakeFetch({ status: 1, product: { product_name: '   ' } });
    expect(await lookupProductName('4800024847857', { fetch })).toBeNull();
  });

  it('returns null on a non-ok HTTP response', async () => {
    const fetch = fakeFetch({ status: 1, product: { product_name: 'x' } }, { ok: false });
    expect(await lookupProductName('4800024847857', { fetch })).toBeNull();
  });

  it('returns null for an empty code without calling fetch', async () => {
    let called = false;
    const fetch = (async () => { called = true; return {} as Response; }) as typeof globalThis.fetch;
    expect(await lookupProductName('   ', { fetch })).toBeNull();
    expect(called).toBe(false);
  });
});
