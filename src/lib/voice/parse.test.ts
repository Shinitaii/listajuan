import { describe, it, expect, vi } from 'vitest';
import { parseVoiceInput } from './parse';
import type { Item } from '../domain/types';

const mockItem: Item = {
  id: 'item-1',
  canonicalName: 'Repolyo',
  nameLower: 'repolyo',
  aliases: [],
  barcodes: [],
  category: 'gulay',
  form: 'bilang',
  defaultUnit: 'piraso',
  lastPricePerBaseUnit: null,
  lastUnit: null,
  lastBaseUnit: null,
  lastPriceDate: null,
  lastMarketId: null,
  lastMarketName: null,
  lastVariant: null,
  purchaseCount: 0,
};

describe('parseVoiceInput', () => {
  describe('empty / blank input', () => {
    it('returns all-null result for empty string', () => {
      const result = parseVoiceInput('');
      expect(result).toEqual({ itemName: '', qty: null, unit: null, price: null, matchedItem: null });
    });

    it('returns all-null result for whitespace-only string', () => {
      const result = parseVoiceInput('   ');
      expect(result).toEqual({ itemName: '', qty: null, unit: null, price: null, matchedItem: null });
    });
  });

  describe('full phrase parsing', () => {
    it('parses "2 kilo repolyo 50 piso" correctly', () => {
      const result = parseVoiceInput('2 kilo repolyo 50 piso');
      expect(result.qty).toBe(2);
      expect(result.unit).toBe('kg');
      expect(result.price).toBe(50);
      expect(result.itemName).toBe('repolyo');
    });

    it('parses "1.5 kg sibuyas 80 pesos" with decimal qty', () => {
      const result = parseVoiceInput('1.5 kg sibuyas 80 pesos');
      expect(result.qty).toBe(1.5);
      expect(result.unit).toBe('kg');
      expect(result.price).toBe(80);
      expect(result.itemName).toBe('sibuyas');
    });

    it('parses "100 gramo luya 35 piso"', () => {
      const result = parseVoiceInput('100 gramo luya 35 piso');
      expect(result.qty).toBe(100);
      expect(result.unit).toBe('g');
      expect(result.price).toBe(35);
      expect(result.itemName).toBe('luya');
    });

    it('parses "3 piraso itlog 20 piso"', () => {
      const result = parseVoiceInput('3 piraso itlog 20 piso');
      expect(result.qty).toBe(3);
      expect(result.unit).toBe('piraso');
      expect(result.price).toBe(20);
      expect(result.itemName).toBe('itlog');
    });

    it('parses "1 dosena itlog" with no price', () => {
      const result = parseVoiceInput('1 dosena itlog');
      expect(result.qty).toBe(1);
      expect(result.unit).toBe('dosena');
      expect(result.price).toBeNull();
      expect(result.itemName).toBe('itlog');
    });
  });

  describe('phrase with no qty/unit', () => {
    it('returns qty=null and unit=null when no quantity token', () => {
      const result = parseVoiceInput('repolyo 50 piso');
      expect(result.qty).toBeNull();
      expect(result.unit).toBeNull();
      expect(result.price).toBe(50);
      expect(result.itemName).toBe('repolyo');
    });

    it('returns qty=null unit=null price=null for plain item name', () => {
      const result = parseVoiceInput('repolyo');
      expect(result.qty).toBeNull();
      expect(result.unit).toBeNull();
      expect(result.price).toBeNull();
      expect(result.itemName).toBe('repolyo');
    });
  });

  describe('phrase with no price', () => {
    it('returns price=null when no price marker and no trailing number', () => {
      const result = parseVoiceInput('2 kilos kamatis');
      expect(result.qty).toBe(2);
      expect(result.unit).toBe('kg');
      expect(result.price).toBeNull();
      expect(result.itemName).toBe('kamatis');
    });
  });

  describe('price marker variations', () => {
    it('parses "pesos" as price marker', () => {
      const result = parseVoiceInput('kamatis 80 pesos');
      expect(result.price).toBe(80);
      expect(result.itemName).toBe('kamatis');
    });

    it('parses "peso" as price marker', () => {
      const result = parseVoiceInput('kamatis 80 peso');
      expect(result.price).toBe(80);
      expect(result.itemName).toBe('kamatis');
    });

    it('parses "₱" prefix before number', () => {
      const result = parseVoiceInput('kamatis ₱80');
      expect(result.price).toBe(80);
      expect(result.itemName).toBe('kamatis');
    });

    it('parses "₱" with space before number', () => {
      const result = parseVoiceInput('kamatis ₱ 80');
      expect(result.price).toBe(80);
      expect(result.itemName).toBe('kamatis');
    });

    it('uses last standalone number as price when no marker present', () => {
      const result = parseVoiceInput('kamatis 80');
      expect(result.price).toBe(80);
      expect(result.itemName).toBe('kamatis');
    });
  });

  describe('unit word variations', () => {
    it('"kilos" maps to kg', () => {
      expect(parseVoiceInput('2 kilos kamatis').unit).toBe('kg');
    });

    it('"kg" maps to kg', () => {
      expect(parseVoiceInput('2 kg kamatis').unit).toBe('kg');
    });

    it('"gramo" maps to g', () => {
      expect(parseVoiceInput('50 gramo luya').unit).toBe('g');
    });

    it('"grams" maps to g', () => {
      expect(parseVoiceInput('50 grams luya').unit).toBe('g');
    });

    it('"g" maps to g', () => {
      expect(parseVoiceInput('50 g luya').unit).toBe('g');
    });

    it('"litro" maps to L', () => {
      expect(parseVoiceInput('1 litro gatas').unit).toBe('L');
    });

    it('"liter" maps to L', () => {
      expect(parseVoiceInput('1 liter gatas').unit).toBe('L');
    });

    it('"liters" maps to L', () => {
      expect(parseVoiceInput('2 liters gatas').unit).toBe('L');
    });

    it('"L" maps to L', () => {
      expect(parseVoiceInput('2 L gatas').unit).toBe('L');
    });

    it('"ml" maps to ml', () => {
      expect(parseVoiceInput('500 ml toyo').unit).toBe('ml');
    });

    it('"milliliter" maps to ml', () => {
      expect(parseVoiceInput('500 milliliter toyo').unit).toBe('ml');
    });

    it('"piraso" maps to piraso', () => {
      expect(parseVoiceInput('3 piraso itlog').unit).toBe('piraso');
    });

    it('"piece" maps to piraso', () => {
      expect(parseVoiceInput('3 piece itlog').unit).toBe('piraso');
    });

    it('"pieces" maps to piraso', () => {
      expect(parseVoiceInput('3 pieces itlog').unit).toBe('piraso');
    });

    it('"pcs" maps to piraso', () => {
      expect(parseVoiceInput('3 pcs itlog').unit).toBe('piraso');
    });

    it('"dosena" maps to dosena', () => {
      expect(parseVoiceInput('1 dosena itlog').unit).toBe('dosena');
    });

    it('"dozen" maps to dosena', () => {
      expect(parseVoiceInput('1 dozen itlog').unit).toBe('dosena');
    });
  });

  describe('matchedItem', () => {
    it('returns matchedItem when searchLibrary finds a match', () => {
      const searchLibrary = vi.fn().mockReturnValue([mockItem]);
      const result = parseVoiceInput('2 kilo repolyo 50 piso', { searchLibrary });
      expect(result.matchedItem).toBe(mockItem);
      expect(searchLibrary).toHaveBeenCalledWith('repolyo');
    });

    it('returns null matchedItem when searchLibrary returns empty array', () => {
      const searchLibrary = vi.fn().mockReturnValue([]);
      const result = parseVoiceInput('repolyo', { searchLibrary });
      expect(result.matchedItem).toBeNull();
    });

    it('returns null matchedItem when deps is not provided', () => {
      const result = parseVoiceInput('repolyo');
      expect(result.matchedItem).toBeNull();
    });

    it('returns null matchedItem when searchLibrary is not provided in deps', () => {
      const result = parseVoiceInput('repolyo', {});
      expect(result.matchedItem).toBeNull();
    });

    it('calls searchLibrary with trimmed itemName', () => {
      const searchLibrary = vi.fn().mockReturnValue([mockItem]);
      parseVoiceInput('2 kilo repolyo 50 piso', { searchLibrary });
      expect(searchLibrary).toHaveBeenCalledWith('repolyo');
    });
  });

  describe('edge cases', () => {
    it('trims leading/trailing whitespace from transcript before processing', () => {
      const result = parseVoiceInput('  repolyo  ');
      expect(result.itemName).toBe('repolyo');
    });

    it('handles mixed-case unit word "Kilo"', () => {
      expect(parseVoiceInput('2 Kilo kamatis').unit).toBe('kg');
    });

    it('handles mixed-case unit word "KG"', () => {
      expect(parseVoiceInput('2 KG kamatis').unit).toBe('kg');
    });
  });
});

describe('dialect synonym parsing — Bisaya', () => {
  it('"usa" maps to piraso and extracts itemName', () => {
    const result = parseVoiceInput('1 usa isda 50 piso');
    expect(result.unit).toBe('piraso');
    expect(result.itemName).toBe('isda');
    expect(result.price).toBe(50);
  });

  it('"gatosan" maps to g with qty and itemName', () => {
    const result = parseVoiceInput('100 gatosan luya 30 piso');
    expect(result.unit).toBe('g');
    expect(result.qty).toBe(100);
    expect(result.itemName).toBe('luya');
    expect(result.price).toBe(30);
  });

  it('"duha" maps to piraso', () => {
    expect(parseVoiceInput('2 duha itlog').unit).toBe('piraso');
  });
});

describe('dialect synonym parsing — Ilocano', () => {
  it('"kilon" maps to kg with itemName and price', () => {
    const result = parseVoiceInput('2 kilon baboy 200 piso');
    expect(result.unit).toBe('kg');
    expect(result.qty).toBe(2);
    expect(result.itemName).toBe('baboy');
    expect(result.price).toBe(200);
  });

  it('"maysa" maps to piraso and extracts itemName', () => {
    const result = parseVoiceInput('1 maysa kamatis 20 piso');
    expect(result.unit).toBe('piraso');
    expect(result.itemName).toBe('kamatis');
    expect(result.price).toBe(20);
  });

  it('"dua" maps to piraso', () => {
    expect(parseVoiceInput('2 dua itlog').unit).toBe('piraso');
  });
});
