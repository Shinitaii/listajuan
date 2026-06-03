import { describe, it, expect, vi } from 'vitest';
import { resolveScannedCode } from './resolveScan';
import type { Item } from '../domain/types';

const fakeItem = (id: string): Item => ({
  id, canonicalName: 'Century Tuna', nameLower: 'century tuna', aliases: [], barcodes: ['x'],
  category: 'iba_pa', form: 'bilang', defaultUnit: 'piraso', lastPricePerBaseUnit: null,
  lastUnit: null, lastBaseUnit: null, lastPriceDate: null, lastMarketId: null,
  lastMarketName: null, lastVariant: null, purchaseCount: 0,
});

function deps(over: Partial<Parameters<typeof resolveScannedCode>[1]> = {}) {
  return {
    findItemByBarcode: vi.fn(async () => null as Item | null),
    lookupProductName: vi.fn(async () => null as string | null),
    isOnline: () => true,
    ...over,
  };
}

describe('resolveScannedCode', () => {
  it('library-first: returns the matched item and never calls the API', async () => {
    const item = fakeItem('a1');
    const d = deps({ findItemByBarcode: vi.fn(async () => item) });
    expect(await resolveScannedCode('123', d)).toEqual({ kind: 'library', item });
    expect(d.lookupProductName).not.toHaveBeenCalled();
  });

  it('cold-start: miss + online + name → suggested', async () => {
    const d = deps({ lookupProductName: vi.fn(async () => 'Century Tuna 180g') });
    expect(await resolveScannedCode('123', d)).toEqual({ kind: 'suggested', name: 'Century Tuna 180g', code: '123' });
  });

  it('miss + online + no name → manual', async () => {
    expect(await resolveScannedCode('123', deps())).toEqual({ kind: 'manual', code: '123' });
  });

  it('offline: miss → manual, API not called', async () => {
    const d = deps({ isOnline: () => false, lookupProductName: vi.fn(async () => 'X') });
    expect(await resolveScannedCode('123', d)).toEqual({ kind: 'manual', code: '123' });
    expect(d.lookupProductName).not.toHaveBeenCalled();
  });

  it('empty/whitespace code → null', async () => {
    expect(await resolveScannedCode('   ', deps())).toBeNull();
  });
});
